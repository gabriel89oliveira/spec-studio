import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { noCodec, SettingsStore, type SecretCodec } from "./settings.js";
import type { FolderPicker } from "./folderDialog.js";
import type { PacResolver } from "./proxy.js";
import { Workspace, type AppInfo, type BaseConfig } from "./workspace.js";

export type StartOptions = {
  base: BaseConfig;
  /** Projeto inicial (PROJECT_DIR do .env), usado se não houver um aberto pela tela. */
  envProjectDir?: string;
  /** 0 = qualquer porta livre. */
  port: number;
  /** Pasta da interface compilada (web/dist), servida na mesma porta da API. */
  webDir?: string;
  /** Pasta para configurações e lista de recentes. Padrão: ~/.spec-studio */
  dataDir?: string;
  codec?: SecretCodec;
  picker?: FolderPicker;
  app?: AppInfo;
  /** Lê scripts de proxy (PAC). Só o aplicativo sabe; no navegador o modo "script automático" fica indisponível. */
  pacResolver?: PacResolver;
  log?: (msg: string) => void;
};

export type Started = { settings: SettingsStore; port: number; url: string; workspace: Workspace; startError: string | null; close: () => Promise<void> };

/** Sobe o servidor do Spec Studio: o mesmo código no `npm run dev` e dentro do aplicativo instalado. */
export async function startServer(o: StartOptions): Promise<Started> {
  const log = o.log ?? (() => {});
  const dataDir = o.dataDir ?? process.env.SPEC_STUDIO_HOME ?? path.join(os.homedir(), ".spec-studio");
  const settings = new SettingsStore(path.join(dataDir, "settings.json"), o.codec ?? noCodec);
  const ws = new Workspace(o.base, {
    stateFile: path.join(dataDir, "state.json"),
    settings,
    webDir: o.webDir,
    picker: o.picker,
    app: o.app,
    pacResolver: o.pacResolver,
  });

  const startError = await ws.start(o.envProjectDir);
  if (startError) log(`${startError.replace("A pasta", "PROJECT_DIR")}. Escolha o projeto na tela.`);
  log(ws.currentDir ? `Projeto: ${ws.currentDir}` : "Nenhum projeto aberto: escolha ou crie um na tela");

  const http = await new Promise<Server>((resolve, reject) => {
    const s = ws.app().listen(o.port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
  const port = (http.address() as { port: number }).port;
  return {
    settings,
    port,
    url: `http://127.0.0.1:${port}`,
    workspace: ws,
    startError,
    close: async () => {
      await new Promise<void>((r) => http.close(() => r()));
      await ws.close();
    },
  };
}
