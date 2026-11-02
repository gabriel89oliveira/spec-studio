import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export type Config = {
  /** Caminho real e absoluto da pasta do projeto. */
  projectDir: string;
  apiKey?: string;
  model: string;
  userName: string;
  port: number;
  autoCommit: boolean;
};

export class ConfigError extends Error {}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const schema = z.object({
  PROJECT_DIR: z.preprocess(
    emptyToUndefined,
    z.string({ error: "PROJECT_DIR não definido: informe a pasta do projeto no .env" }),
  ),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  CLAUDE_MODEL: z.preprocess(emptyToUndefined, z.string().default("sonnet")),
  USER_NAME: z.preprocess(emptyToUndefined, z.string().default("Usuário")),
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: "PORT deve ser um número" }).int().min(1).max(65535).default(3001),
  ),
  AUTO_COMMIT: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"], { error: "AUTO_COMMIT deve ser true ou false" }).default("true"),
  ),
});

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Configuração inválida no .env:\n${lines.join("\n")}`);
  }
  const v = parsed.data;

  const dir = path.resolve(expandHome(v.PROJECT_DIR.trim()));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new ConfigError(`PROJECT_DIR não existe ou não é uma pasta: ${dir}`);
  }
  if (!fs.existsSync(path.join(dir, "CLAUDE.md"))) {
    throw new ConfigError(`PROJECT_DIR não tem CLAUDE.md na raiz: ${dir}`);
  }

  return {
    projectDir: fs.realpathSync.native(dir),
    apiKey: v.ANTHROPIC_API_KEY?.trim() || undefined,
    model: v.CLAUDE_MODEL,
    userName: v.USER_NAME,
    port: v.PORT,
    autoCommit: v.AUTO_COMMIT === "true",
  };
}
