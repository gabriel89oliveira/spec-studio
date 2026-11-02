import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { QueryFn } from "../src/claude.js";
import type { Config } from "../src/config.js";

export function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-studio-test-"));
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Instruções\n\nSiga a spec.\n");
  fs.mkdirSync(path.join(dir, "docs", "features"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs", "modulos"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "docs", "CONCEITO.md"),
    "# Conceito\n\n## 1. Resumo\nPlataforma de manutenção de frotas.\n\n| Perfil | Quem é |\n|---|---|\n| Gestor | Empresa |\n\n- [ ] item pendente\n",
  );
  fs.writeFileSync(
    path.join(dir, "docs", "features", "F01-agendamento.md"),
    "# F01 — Agendamento\n\n## Objetivo\nPermitir agendar a manutenção.\n",
  );
  return fs.realpathSync.native(dir);
}

export function makeConfig(projectDir: string, over: Partial<Config> = {}): Config {
  return {
    projectDir,
    apiKey: "sk-ant-test",
    model: "sonnet",
    userName: "Gabriel",
    port: 0,
    autoCommit: true,
    mock: false,
    ...over,
  };
}

const m = (x: unknown) => x as SDKMessage;

export const msg = {
  init: (sid: string) => m({ type: "system", subtype: "init", session_id: sid }),
  blockStart: (sid: string) =>
    m({ type: "stream_event", parent_tool_use_id: null, session_id: sid, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } }),
  text: (sid: string, text: string) =>
    m({ type: "stream_event", parent_tool_use_id: null, session_id: sid, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } }),
  tool: (sid: string, name: string, input: Record<string, unknown>) =>
    m({ type: "assistant", parent_tool_use_id: null, session_id: sid, message: { content: [{ type: "tool_use", id: "t1", name, input }] } }),
  result: (sid: string, text: string, cost = 0.04) =>
    m({ type: "result", subtype: "success", is_error: false, result: text, total_cost_usd: cost, session_id: sid }),
};

export type Call = { prompt: string; options: Options };

/** query() simulado: cada chamada executa `script`, que pode alterar arquivos e gerar mensagens. */
export function fakeQuery(script: (call: Call, n: number) => AsyncGenerator<SDKMessage>): { fn: QueryFn; calls: Call[] } {
  const calls: Call[] = [];
  const fn: QueryFn = (params) => {
    calls.push(params);
    return script(params, calls.length);
  };
  return { fn, calls };
}

/** Espera até o abortController do pedido ser acionado e então falha, como o SDK faz. */
export function waitForAbort(options: Options): Promise<never> {
  return new Promise((_, reject) => {
    const signal = options.abortController!.signal;
    if (signal.aborted) reject(new Error("aborted"));
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
}
