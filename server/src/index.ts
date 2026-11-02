import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createServer } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env"), quiet: true });

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n[spec-studio] ${err.message}\n\nCopie .env.example para .env e preencha os valores.\n`);
      process.exit(1);
    }
    throw err;
  }

  const server = await createServer(config);
  server.app.listen(config.port, "127.0.0.1", () => {
    console.log(`\n[spec-studio] Projeto: ${config.projectDir}`);
    console.log(`[spec-studio] Servidor em http://127.0.0.1:${config.port}`);
    console.log(`[spec-studio] Claude: ${config.apiKey ? `ativado (${config.model})` : "desativado (defina ANTHROPIC_API_KEY no .env)"}`);
    console.log("[spec-studio] Abra http://localhost:5173 no navegador\n");
  });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[spec-studio] Falha ao iniciar:", err);
  process.exit(1);
});
