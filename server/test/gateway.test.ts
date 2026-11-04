import { describe, expect, it } from "vitest";
import { agentEnv } from "../src/claude.js";
import { ConfigError, hasCredentials, loadBaseConfig } from "../src/config.js";

describe("gateway de LLM", () => {
  it("lê token, URL e cabeçalhos do .env", () => {
    const c = loadBaseConfig({ ANTHROPIC_AUTH_TOKEN: " tok ", ANTHROPIC_BASE_URL: "https://gw.exemplo.com/anthropic", ANTHROPIC_CUSTOM_HEADERS: "X-Time: dev" });
    expect(c).toMatchObject({ authToken: "tok", baseUrl: "https://gw.exemplo.com/anthropic", customHeaders: "X-Time: dev" });
    expect(hasCredentials(c)).toBe(true);
    expect(hasCredentials(loadBaseConfig({}))).toBe(false);
  });

  it("recusa URL inválida", () => {
    expect(() => loadBaseConfig({ ANTHROPIC_BASE_URL: "gateway sem protocolo" })).toThrow(ConfigError);
  });

  it("entrega ao agente o token, a URL e os cabeçalhos, sem herdar os do terminal", () => {
    const env = agentEnv(
      { authToken: "tok-gw", baseUrl: "https://gw.exemplo.com" },
      { ANTHROPIC_API_KEY: "velha", ANTHROPIC_AUTH_TOKEN: "outra", ANTHROPIC_BASE_URL: "https://velho.com", ANTHROPIC_CUSTOM_HEADERS: "A: b", CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1", PATH: "/bin" },
    );
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("tok-gw");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://gw.exemplo.com");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
    expect(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS).toBe("1");
    expect(env.PATH).toBe("/bin");
  });

  it("com chave da API só, mantém o comportamento anterior", () => {
    const env = agentEnv("sk-ant-x", { ANTHROPIC_AUTH_TOKEN: "t" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-x");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });
});
