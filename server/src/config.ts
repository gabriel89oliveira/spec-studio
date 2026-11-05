import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProxySettings } from "./proxy.js";
import { z } from "zod";

export type Config = {
  /** Caminho real e absoluto da pasta do projeto. */
  projectDir: string;
  apiKey?: string;
  /** Token de um gateway de LLM (enviado como Bearer). Alternativa à chave da API. */
  authToken?: string;
  /** URL do gateway de LLM, no lugar de api.anthropic.com. */
  baseUrl?: string;
  /** Cabeçalhos extras exigidos pelo gateway, um "Nome: valor" por linha. */
  customHeaders?: string;
  /** Executável do Claude empacotado com o app instalado. */
  claudeExecutable?: string;
  /** Proxy da rede, definido pela tela de configurações. */
  proxy?: ProxySettings;
  model: string;
  userName: string;
  port: number;
  autoCommit: boolean;
  /** Modo simulado: um Claude de mentira, sem custo, para testar a interface. */
  mock: boolean;
};

export class ConfigError extends Error {}

/** Há credencial para falar com o modelo (chave da API ou token de gateway). */
export const hasCredentials = (c: { apiKey?: string; authToken?: string }) => Boolean(c.apiKey || c.authToken);

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const schema = z.object({
  PROJECT_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_BASE_URL: z.preprocess(emptyToUndefined, z.url({ error: "ANTHROPIC_BASE_URL deve ser uma URL completa, como https://gateway.suaempresa.com" }).optional()),
  ANTHROPIC_CUSTOM_HEADERS: z.preprocess(emptyToUndefined, z.string().optional()),
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
  SPEC_STUDIO_CLAUDE_BIN: z.preprocess(emptyToUndefined, z.string().optional()),
  CLAUDE_MOCK: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false"], { error: "CLAUDE_MOCK deve ser true ou false" }).default("false"),
  ),
});

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Confere uma pasta de projeto e devolve o caminho real. */
export function checkProjectDir(input: string): string {
  const dir = path.resolve(expandHome(input.trim()));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new ConfigError(`A pasta não existe ou não é uma pasta: ${dir}`);
  }
  if (!fs.existsSync(path.join(dir, "CLAUDE.md"))) {
    throw new ConfigError(`A pasta não tem CLAUDE.md na raiz (não parece um projeto do Spec Studio): ${dir}`);
  }
  return fs.realpathSync.native(dir);
}

/** Configuração sem a pasta do projeto, que pode ser escolhida na tela. */
export function loadBaseConfig(env: NodeJS.ProcessEnv = process.env): Omit<Config, "projectDir"> & { envProjectDir?: string } {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Configuração inválida no .env:\n${lines.join("\n")}`);
  }
  const v = parsed.data;
  return {
    envProjectDir: v.PROJECT_DIR?.trim() || undefined,
    apiKey: v.ANTHROPIC_API_KEY?.trim() || undefined,
    authToken: v.ANTHROPIC_AUTH_TOKEN?.trim() || undefined,
    baseUrl: v.ANTHROPIC_BASE_URL?.trim() || undefined,
    customHeaders: v.ANTHROPIC_CUSTOM_HEADERS?.trim() || undefined,
    claudeExecutable: v.SPEC_STUDIO_CLAUDE_BIN?.trim() || undefined,
    model: v.CLAUDE_MODEL,
    userName: v.USER_NAME,
    port: v.PORT,
    autoCommit: v.AUTO_COMMIT === "true",
    mock: v.CLAUDE_MOCK === "true",
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const { envProjectDir, ...base } = loadBaseConfig(env);
  if (!envProjectDir) throw new ConfigError("PROJECT_DIR não definido: informe a pasta do projeto no .env");
  let projectDir: string;
  try {
    projectDir = checkProjectDir(envProjectDir);
  } catch (e) {
    throw new ConfigError((e as Error).message.replace("A pasta", "PROJECT_DIR"));
  }
  return { ...base, projectDir };
}
