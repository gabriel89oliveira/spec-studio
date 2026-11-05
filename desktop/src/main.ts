import { app, BrowserWindow, dialog, safeStorage, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type UpdateState = { state: "idle" | "checking" | "downloading" | "ready" | "error"; version?: string; percent?: number; error?: string };

const PREFERRED_PORT = 47821; // porta fixa para o navegador embutido manter o armazenamento local entre execuções
const root = app.getAppPath(); // .../resources/app.asar (empacotado) ou desktop/stage
const unpacked = root.replace("app.asar", "app.asar.unpacked");
let win: BrowserWindow | null = null;
let closeServer: (() => Promise<void>) | null = null;
let update: UpdateState = { state: "idle" };

function logFile(msg: string): void {
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "app.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignora */
  }
}

/** O Agent SDK traz o executável do Claude num pacote por plataforma; dentro do .asar ele não roda, então usamos a cópia desempacotada. */
function findClaudeBinary(): string | undefined {
  const dir = path.join(unpacked, "node_modules", "@anthropic-ai");
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith("claude-agent-sdk-")) continue;
      for (const exe of ["claude.exe", "claude"]) {
        const p = path.join(dir, name, exe);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* sem pacote desempacotado (modo dev) */
  }
  return undefined;
}

type Proxy = { enabled: boolean; mode: "manual" | "pac"; host: string; port: number | null; pacUrl: string; user: string; password: string };
let proxyNow: Proxy | null = null;

/** Lê o script de proxy (PAC) como o Windows faz: uma sessão do Chromium só para isso. */
const pacSessions = new Map<string, Electron.Session>();
async function resolvePac(pacUrl: string, target: string): Promise<string> {
  let ses = pacSessions.get(pacUrl);
  if (!ses) {
    ses = session.fromPartition(`pac-${pacSessions.size}-${Date.now()}`, { cache: false });
    await ses.setProxy({ mode: "pac_script", pacScript: pacUrl });
    pacSessions.set(pacUrl, ses);
  }
  return ses.resolveProxy(target);
}

/** Aplica o proxy escolhido nas conexões do próprio app (atualizações). O Claude recebe o proxy por variáveis de ambiente. */
async function applyProxy(p: Proxy): Promise<void> {
  proxyNow = p;
  try {
    if (!p.enabled) await session.defaultSession.setProxy({ mode: "system" });
    else if (p.mode === "pac") await session.defaultSession.setProxy({ mode: "pac_script", pacScript: p.pacUrl });
    else await session.defaultSession.setProxy({ proxyRules: `http://${p.host}:${p.port}`, proxyBypassRules: "<local>" });
  } catch (e) {
    logFile(`proxy: ${e}`);
  }
}

function hasGit(): Promise<boolean> {
  return new Promise((resolve) => execFile("git", ["--version"], { windowsHide: true }, (err) => resolve(!err)));
}

async function warnIfNoGit(): Promise<void> {
  if (await hasGit()) return;
  const r = await dialog.showMessageBox({
    type: "warning",
    title: "Git não encontrado",
    message: "O Spec Studio usa o Git para guardar o histórico dos seus documentos.",
    detail: "Instale o Git para Windows e abra o Spec Studio de novo. Sem ele, criar projetos e salvar versões não vai funcionar.",
    buttons: ["Baixar o Git", "Continuar assim mesmo"],
    defaultId: 0,
  });
  if (r.response === 0) await shell.openExternal("https://git-scm.com/download/win");
}

function setupUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => (update = { state: "checking" }));
  autoUpdater.on("update-not-available", () => (update = { state: "idle" }));
  autoUpdater.on("update-available", (i) => (update = { state: "downloading", version: i.version, percent: 0 }));
  autoUpdater.on("download-progress", (p) => (update = { state: "downloading", version: update.version, percent: p.percent }));
  autoUpdater.on("update-downloaded", (i) => (update = { state: "ready", version: i.version }));
  autoUpdater.on("error", (e) => {
    logFile(`updater: ${e?.message ?? e}`);
    update = { state: "error", error: String(e?.message ?? e) };
  });
  const check = () => void autoUpdater.checkForUpdates().catch((e) => logFile(`check: ${e}`));
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

async function boot(): Promise<void> {
  const claudeBin = findClaudeBinary();
  if (claudeBin) process.env.SPEC_STUDIO_CLAUDE_BIN = claudeBin;
  process.env.SPEC_STUDIO_KIT = path.join(unpacked.includes("app.asar.unpacked") && fs.existsSync(path.join(unpacked, "kit")) ? unpacked : root, "kit");

  // import() dinâmico de verdade: o tsc (CommonJS) o trocaria por require, que não carrega o servidor (ESM).
  const esmImport = new Function("u", "return import(u)") as (u: string) => Promise<any>;
  const load = (rel: string) => esmImport(pathToFileURL(path.join(root, "server", "dist", rel)).href);
  const [{ loadBaseConfig }, { startServer }] = await Promise.all([load("config.js"), load("start.js")]);

  const codec = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s: string) => safeStorage.encryptString(s).toString("base64"),
    decrypt: (s: string) => safeStorage.decryptString(Buffer.from(s, "base64")),
  };
  const picker = async ({ title, initial }: { title: string; initial?: string }) => {
    const r = await dialog.showOpenDialog(win ?? undefined!, {
      title,
      defaultPath: initial && fs.existsSync(initial) ? initial : undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  };

  const base = loadBaseConfig({ ...process.env, CLAUDE_MOCK: process.env.CLAUDE_MOCK ?? "false" });
  const { envProjectDir: _ignored, ...cfg } = base;
  const opts = {
    base: cfg,
    dataDir: path.join(app.getPath("userData"), "data"),
    webDir: path.join(root, "web", "dist"),
    codec,
    picker,
    pacResolver: resolvePac,
    log: logFile,
    app: {
      version: app.getVersion(),
      desktop: true,
      update: () => update,
      check: () => void autoUpdater.checkForUpdates().catch((e) => logFile(`check: ${e}`)),
      install: () => autoUpdater.quitAndInstall(),
    },
  };
  let started;
  try {
    started = await startServer({ ...opts, port: PREFERRED_PORT });
  } catch {
    started = await startServer({ ...opts, port: 0 });
  }
  closeServer = started.close;
  void applyProxy(started.settings.proxy());
  started.settings.onChange(() => void applyProxy(started.settings.proxy()));
  logFile(`Servidor em ${started.url}`);

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Spec Studio",
    backgroundColor: "#f6f4ef",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(started.url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  await win.loadURL(started.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      setupUpdater();
      await boot();
      void warnIfNoGit();
    } catch (err) {
      logFile(`Falha ao iniciar: ${err instanceof Error ? (err.stack ?? err.message) : err}`);
      dialog.showErrorBox("Spec Studio não iniciou", String(err instanceof Error ? err.message : err));
      app.quit();
    }
  });
  // Proxy que pede usuário e senha: responde com o que foi salvo nas configurações.
  app.on("login", (event, _wc, _req, info, callback) => {
    if (!info.isProxy || !proxyNow?.enabled || !proxyNow.user) return;
    event.preventDefault();
    callback(proxyNow.user, proxyNow.password);
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    void closeServer?.();
  });
}
