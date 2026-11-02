import type { HookCallback, Options, SDKMessage, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { Comment } from "./comments.js";
import { checkAgentPath, checkAgentPattern, toPosix } from "./paths.js";
import path from "node:path";

/** Única lista de ferramentas que o agente recebe. Sem terminal. */
export const TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"];

export const APPEND = `Você está no Spec Studio, editando a especificação deste projeto.
Siga o CLAUDE.md, em especial a seção "Ao escrever ou revisar specs".
Altere apenas o necessário para atender ao pedido.
Não crie nem edite arquivos fora de docs/ e do CLAUDE.md sem pedido explícito.
Se faltar informação, não invente: responda com as perguntas.
Ao terminar, responda em português com um resumo de uma a três linhas do que mudou e em quais arquivos.`;

/** Assinatura mínima de query() usada aqui; permite injetar uma versão simulada nos testes. */
export type QueryFn = (params: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>;

type Sdk = typeof import("@anthropic-ai/claude-agent-sdk");
let sdkLoading: Promise<Sdk> | null = null;

/**
 * Carrega o Agent SDK sob demanda. No Windows a primeira carga pode demorar
 * (o SDK traz o executável do Claude Code, com mais de 300 MB), então ela não
 * bloqueia a inicialização do servidor.
 */
export function loadSdk(): Promise<Sdk> {
  sdkLoading ??= import("@anthropic-ai/claude-agent-sdk").catch((err) => {
    sdkLoading = null;
    throw err;
  });
  return sdkLoading;
}

export const realQuery: QueryFn = async function* (params) {
  const signal = params.options.abortController?.signal;
  const aborted = new Promise<never>((_, reject) => {
    if (signal?.aborted) reject(new Error("aborted"));
    signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const { query } = await Promise.race([loadSdk(), aborted]);
  yield* query(params);
};

export type ClaudeConfig = { projectDir: string; model: string; apiKey?: string };

// ---------------------------------------------------------------------------
// Guarda de caminhos
// ---------------------------------------------------------------------------

/** Motivo da negação, ou null se a chamada da ferramenta é permitida. */
export function checkToolCall(root: string, toolName: string, input: unknown, p: path.PlatformPath = path): string | null {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "Read":
    case "Edit":
    case "Write": {
      const c = checkAgentPath(root, i.file_path, p);
      return c.ok ? null : c.reason;
    }
    case "Glob":
    case "Grep": {
      if (i.path !== undefined && i.path !== null && i.path !== "") {
        const c = checkAgentPath(root, i.path, p);
        if (!c.ok) return c.reason;
      }
      return checkAgentPattern(toolName === "Glob" ? i.pattern : i.glob);
    }
    default:
      return "ferramenta não permitida no Spec Studio";
  }
}

export function makeGuardPaths(root: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const reason = checkToolCall(root, input.tool_name, input.tool_input);
    if (!reason) return {};
    const out: SyncHookJSONOutput = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Caminho fora da área permitida do projeto (${reason})`,
      },
    };
    return out;
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function commentPrompt(c: Comment): string {
  const thread = c.replies.length
    ? `\nRespostas anteriores do fio:\n${c.replies.map((r) => `${r.author}: ${r.body}`).join("\n")}\n`
    : "";
  return `Comentário sobre o arquivo ${c.file}.

Trecho comentado:
"""
${c.anchor.quote}
"""

Comentário de ${c.author}:
${c.body}
${thread}
Faça o que o comentário pede. Se for só uma pergunta, responda sem alterar arquivos.`;
}

export function chatPrompt(message: string, openFile?: string): string {
  return openFile ? `Arquivo aberto na tela: ${openFile}\n\n${message}` : message;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export type AgentCallbacks = {
  onText: (delta: string) => void;
  onTool: (tool: string, path?: string) => void;
};

export type AgentResult = {
  status: "done" | "error" | "cancelled";
  text: string;
  sessionId?: string;
  costUsd?: number;
  error?: string;
};

function toolPath(root: string, input: unknown): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  const raw = (i.file_path ?? i.path ?? i.pattern) as unknown;
  if (typeof raw !== "string" || !raw) return undefined;
  if (!path.isAbsolute(raw)) return toPosix(raw);
  const rel = path.relative(root, raw);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? toPosix(rel) : raw;
}

/** Variáveis CLAUDE* que podem continuar passando para o agente. */
const KEEP_ENV = new Set(["CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CONFIG_DIR"]);

/**
 * Ambiente do agente. Remove variáveis de uma sessão do Claude Code em que o servidor
 * possa ter sido iniciado (ex.: terminal do Claude Code) e credenciais alternativas,
 * para que a chave do .env seja a usada e cada conversa tenha sua própria sessão.
 */
export function agentEnv(apiKey: string | undefined, base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(base)) {
    const upper = k.toUpperCase();
    if (upper.startsWith("CLAUDE") && !KEEP_ENV.has(upper)) continue;
    if (upper === "ANTHROPIC_AUTH_TOKEN" || upper === "ANTHROPIC_API_KEY") continue;
    env[k] = v;
  }
  env.ANTHROPIC_API_KEY = apiKey;
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "spec-studio/0.1.0";
  return env;
}

export function buildOptions(cfg: ClaudeConfig, controller: AbortController, resume?: string, onStderr?: (d: string) => void): Options {
  return {
    cwd: cfg.projectDir,
    settingSources: ["project"],
    tools: TOOLS,
    allowedTools: TOOLS,
    permissionMode: "default",
    model: cfg.model,
    systemPrompt: { type: "preset", preset: "claude_code", append: APPEND },
    includePartialMessages: true,
    resume,
    abortController: controller,
    maxTurns: 30,
    hooks: {
      PreToolUse: [{ matcher: "Read|Edit|Write|Glob|Grep", hooks: [makeGuardPaths(cfg.projectDir)] }],
    },
    env: agentEnv(cfg.apiKey),
    stderr: onStderr,
  };
}

export async function runAgent(
  cfg: ClaudeConfig,
  prompt: string,
  controller: AbortController,
  cb: AgentCallbacks,
  queryFn: QueryFn = realQuery,
  resume?: string,
): Promise<AgentResult> {
  let stderr = "";
  const options = buildOptions(cfg, controller, resume, (d) => {
    stderr = (stderr + d).slice(-4000);
  });

  let sessionId: string | undefined;
  let costUsd: number | undefined;
  let finalText: string | undefined;
  let streamedText = "";
  let sawStream = false;
  let resultError: string | undefined;
  let pendingBreak = false;

  const emitText = (t: string) => {
    if (!t) return;
    if (pendingBreak && streamedText) {
      cb.onText("\n\n");
      streamedText += "\n\n";
    }
    pendingBreak = false;
    streamedText += t;
    cb.onText(t);
  };

  try {
    for await (const msg of queryFn({ prompt, options })) {
      const sid = (msg as { session_id?: string }).session_id;
      if (sid) sessionId = sid;

      if (msg.type === "stream_event") {
        if (msg.parent_tool_use_id) continue;
        sawStream = true;
        const ev = msg.event;
        if (ev.type === "content_block_start" && ev.content_block.type === "text") pendingBreak = true;
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") emitText(ev.delta.text);
      } else if (msg.type === "assistant") {
        if (msg.parent_tool_use_id) continue;
        for (const block of msg.message.content) {
          if (block.type === "tool_use") cb.onTool(block.name, toolPath(cfg.projectDir, block.input));
          else if (block.type === "text" && !sawStream) {
            pendingBreak = true;
            emitText(block.text);
          }
        }
      } else if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype === "success" && !msg.is_error) finalText = msg.result;
        else if (msg.subtype === "success") resultError = msg.result || "O Claude retornou um erro";
        else resultError = `Execução interrompida (${msg.subtype})`;
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      return { status: "cancelled", text: streamedText, sessionId, costUsd, error: "Cancelado" };
    }
    const base = err instanceof Error ? err.message : String(err);
    const tail = stderr.trim().split("\n").slice(-3).join("\n");
    return { status: "error", text: streamedText, sessionId, costUsd, error: tail ? `${base}\n${tail}` : base };
  }

  if (controller.signal.aborted) return { status: "cancelled", text: streamedText, sessionId, costUsd, error: "Cancelado" };
  if (resultError) return { status: "error", text: streamedText, sessionId, costUsd, error: resultError };
  return { status: "done", text: (finalText ?? streamedText).trim(), sessionId, costUsd };
}
