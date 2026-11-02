import fs from "node:fs";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { QueryFn } from "./claude.js";
import { checkAgentPath } from "./paths.js";
import { randomId } from "./util.js";

/**
 * Modo simulado (CLAUDE_MOCK=true): um Claude de mentira, sem custo, para testar a interface.
 * Mostra texto em tempo real, registra ferramentas, altera arquivos de verdade (sempre com
 * conteúdo marcado como simulado) e passa pelo mesmo fluxo de commit e histórico.
 */

const m = (x: unknown) => x as SDKMessage;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextId(dir: string, prefix: "F" | "M"): string {
  let max = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const n = name.match(new RegExp(`^${prefix}(\\d+)`, "i"));
      if (n) max = Math.max(max, Number(n[1]));
    }
  } catch {
    /* pasta ainda não existe */
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

function stamp(): string {
  return new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Plan =
  | { kind: "create"; rel: string; content: string; template: string; summary: string }
  | { kind: "edit"; rel: string; summary: string }
  | { kind: "answer"; summary: string };

/** Decide o que fazer a partir do pedido, com regras simples. */
function plan(root: string, prompt: string): Plan {
  const feature = prompt.match(/feature "([^"]+)"(?: no módulo (\S+))?/);
  if (feature) {
    const dir = path.join(root, "docs", "features");
    const id = nextId(dir, "F");
    const rel = `docs/features/${id}-${slugify(feature[1])}.md`;
    const template = "docs/_templates/feature.md";
    const tpl = readOr(path.join(root, ...template.split("/")), "# F00 — [Nome da feature]\n");
    const content = tpl
      .replace(/^# F00 — .*$/m, `# ${id} — ${feature[1]}`)
      .replace(/\| Módulo \| \[M00\] \|/, `| Módulo | ${feature[2] ?? "[M00]"} |`)
      .replace(/^(## Objetivo\n)/m, `$1> Rascunho criado pelo modo simulado em ${stamp()}.\n`);
    return { kind: "create", rel, content, template, summary: `criei o rascunho \`${rel}\` a partir do template` };
  }

  const module = prompt.match(/módulo "([^"]+)"/);
  if (module) {
    const dir = path.join(root, "docs", "modulos");
    const id = nextId(dir, "M");
    const rel = `docs/modulos/${id}-${slugify(module[1])}.md`;
    const template = "docs/_templates/modulo.md";
    const tpl = readOr(path.join(root, ...template.split("/")), "# M00 — [Nome do módulo]\n");
    const content = tpl
      .replace(/^# M00 — .*$/m, `# ${id} — ${module[1]}`)
      .replace(/^(## Responsabilidade\n)/m, `$1> Rascunho criado pelo modo simulado em ${stamp()}.\n`);
    return { kind: "create", rel, content, template, summary: `criei o rascunho \`${rel}\` a partir do template` };
  }

  const fromComment = prompt.match(/^Comentário sobre o arquivo (.+)\.$/m)?.[1];
  const commentBody = prompt.match(/^Comentário de [^:\n]+:\n([\s\S]*?)\n(?:\nRespostas anteriores|\nFaça o que)/m)?.[1]?.trim();
  const question = (commentBody ?? prompt).trim().endsWith("?");
  const target = fromComment ?? prompt.match(/^Arquivo aberto na tela: (.+)$/m)?.[1];

  if (!target || question) {
    return { kind: "answer", summary: "esta seria a resposta do Claude. Nenhum arquivo foi alterado" };
  }
  return { kind: "edit", rel: target.trim(), summary: `adicionei uma nota de exemplo no fim de \`${target.trim()}\`` };
}

function readOr(abs: string, fallback: string): string {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return fallback;
  }
}

export const mockQuery: QueryFn = async function* ({ prompt, options }) {
  const root = options.cwd ?? process.cwd();
  const sid = options.resume ?? `mock-${randomId("s", 4)}`;
  const signal = options.abortController?.signal;
  const check = () => {
    if (signal?.aborted) throw new Error("aborted");
  };
  const text = (t: string) =>
    m({ type: "stream_event", parent_tool_use_id: null, session_id: sid, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } } });
  const tool = (name: string, rel: string) =>
    m({
      type: "assistant",
      parent_tool_use_id: null,
      session_id: sid,
      message: { content: [{ type: "tool_use", id: randomId("t"), name, input: { file_path: path.join(root, ...rel.split("/")) } }] },
    });

  yield m({ type: "system", subtype: "init", session_id: sid });
  yield m({ type: "stream_event", parent_tool_use_id: null, session_id: sid, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });

  for (const w of "Modo simulado: analisando o pedido… ".split(/(?<= )/)) {
    check();
    yield text(w);
    await sleep(60);
  }

  const p = plan(root, prompt);
  if (p.kind === "create") {
    yield tool("Read", p.template);
    await sleep(400);
    check();
    const allowed = checkAgentPath(root, p.rel);
    if (allowed.ok) {
      yield tool("Write", p.rel);
      fs.mkdirSync(path.dirname(allowed.abs), { recursive: true });
      fs.writeFileSync(allowed.abs, p.content, "utf8");
    }
  } else if (p.kind === "edit") {
    const allowed = checkAgentPath(root, p.rel);
    if (allowed.ok && fs.existsSync(allowed.abs)) {
      yield tool("Read", p.rel);
      await sleep(400);
      check();
      yield tool("Edit", p.rel);
      fs.appendFileSync(
        allowed.abs,
        `\n## Nota do modo simulado\n\n> Texto de exemplo inserido pelo modo simulado do Spec Studio em ${stamp()}. ` +
          "Nenhum Claude real foi chamado. Desfaça pelo Histórico quando quiser.\n",
        "utf8",
      );
    }
  } else {
    await sleep(400);
  }

  check();
  const result = `**Modo simulado:** ${p.summary}. Para respostas reais, tire \`CLAUDE_MOCK=true\` do \`.env\`.`;
  for (const w of result.split(/(?<= )/)) {
    check();
    yield text(w);
    await sleep(25);
  }
  yield m({ type: "result", subtype: "success", is_error: false, result, total_cost_usd: 0, session_id: sid });
};
