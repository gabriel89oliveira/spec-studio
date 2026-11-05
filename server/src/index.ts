import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Registro da última inicialização: server/startup.log (fora do Git). */
const LOG_FILE = path.resolve(here, "../startup.log");
try {
  fs.writeFileSync(LOG_FILE, "");
} catch {
  /* sem permissão de escrita: segue só com o console */
}

function log(msg: string): void {
  console.log(`[spec-studio] ${msg}`);
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignora */
  }
}

const errText = (err: unknown) => (err instanceof Error ? (err.stack ?? err.message) : String(err));
const portFromEnv = () => Number(process.env.PORT) || 3001;

process.on("uncaughtException", (err) => {
  log(`Erro não tratado: ${errText(err)}`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => log(`Promessa rejeitada sem tratamento: ${errText(err)}`));

/**
 * Quando a inicialização falha, responde a toda chamada com o motivo,
 * para que a tela mostre o erro em vez de só "Erro 500".
 */
function serveError(port: number, message: string): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message, startup: true }));
  });
  server.on("error", (err: NodeJS.ErrnoException) => log(`Não foi possível abrir a porta ${port}: ${err.code ?? err.message}`));
  server.listen(port, "127.0.0.1", () => log(`Servidor em modo de erro na porta ${port}: a tela mostra o motivo. Corrija e reinicie com npm run dev.`));
}

/** Carrega o Agent SDK logo após a inicialização, para o primeiro pedido ao Claude não esperar. */
async function warmUpClaude(): Promise<void> {
  const t0 = Date.now();
  try {
    const { loadSdk } = await import("./claude.js");
    await loadSdk();
    log(`Agent SDK do Claude carregado (${Date.now() - t0} ms)`);
  } catch (err) {
    log(`Falha ao carregar o Agent SDK do Claude: ${errText(err)}`);
  }
}

async function main(): Promise<void> {
  log(`Iniciando (Node ${process.version}, ${process.platform} ${process.arch})`);

  const { config: loadEnv } = await import("dotenv");
  const envPath = path.resolve(here, "../../.env");
  log(`Lendo ${envPath} (${fs.existsSync(envPath) ? "encontrado" : "NÃO encontrado"})`);
  loadEnv({ path: envPath, quiet: true });

  const { ConfigError, hasCredentials, loadBaseConfig } = await import("./config.js");
  let config;
  try {
    config = loadBaseConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      log(err.message);
      serveError(portFromEnv(), err.message);
      return;
    }
    throw err;
  }

  log("Carregando módulos do servidor…");
  const { startServer } = await import("./start.js");
  const { envProjectDir, ...base } = config;
  const here2 = here;
  const webDir = path.resolve(here2, "../../web/dist");

  log("Abrindo o repositório Git do projeto…");
  let started;
  try {
    started = await startServer({ base, envProjectDir, port: config.port, webDir: process.env.SERVE_WEB === "true" ? webDir : undefined, log });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    log(
      e.code === "EADDRINUSE"
        ? `A porta ${config.port} já está em uso por outro programa. Troque PORT no .env (ex.: PORT=3101) e reinicie.`
        : `Falha ao abrir a porta ${config.port}: ${errText(err)}`,
    );
    process.exit(1);
  }
  log(`Servidor em http://127.0.0.1:${config.port}`);
  log(
    `Claude: ${
      config.mock
        ? "MODO SIMULADO (sem custo; tire CLAUDE_MOCK=true do .env para usar o Claude de verdade)"
        : hasCredentials(config)
          ? `ativado (${config.model}${config.baseUrl ? `, via ${config.baseUrl}` : ""}${config.authToken && !config.apiKey ? ", token de gateway" : ""})`
          : "desativado (defina ANTHROPIC_API_KEY ou ANTHROPIC_AUTH_TOKEN no .env, ou configure pela tela)"
    }`,
  );
  log("Pronto. Abra http://localhost:5173 no navegador");
  if (hasCredentials(config) && !config.mock) void warmUpClaude();
  const ws = started.workspace;

  const shutdown = async () => {
    await ws.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log(`Falha ao iniciar: ${errText(err)}`);
  serveError(portFromEnv(), `Falha ao iniciar o servidor: ${err instanceof Error ? err.message : String(err)}`);
});
