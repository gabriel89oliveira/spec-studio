import fs from "node:fs";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { QueryFn } from "./claude.js";
import { analyzeDoc, norm, sectionsOf, type Guide, type Missing } from "./guide.js";
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
  | { kind: "interview"; rel: string; content?: string; summary: string }
  | { kind: "answer"; summary: string };

/** Sessões de entrevista: o arquivo que cada uma conduz. */
const interviews = new Map<string, string>();

/** Insere `text` no fim da seção `title` (cria a seção se não existir). */
function appendToSection(content: string, title: string, text: string): string {
  const ls = content.split("\n");
  const at = ls.findIndex((l) => /^##\s/.test(l) && norm(l.replace(/^##\s+/, "")) === norm(title));
  if (at < 0) return `${content.replace(/\n+$/, "")}\n\n## ${title}\n\n${text}\n`;
  let end = ls.findIndex((l, i) => i > at && /^##\s/.test(l));
  if (end < 0) end = ls.length;
  while (end - 1 > at && ls[end - 1].trim() === "") end--;
  const block = at === end - 1 ? ["", text] : [text];
  ls.splice(end, 0, ...block);
  return ls.join("\n").replace(/\n*$/, "\n");
}

/** Grava a resposta do usuário no lugar certo, como o Claude de verdade faria. */
function applyAnswer(content: string, item: Missing, answer: string): string {
  const a = answer.trim();
  switch (item.id) {
    case "objetivo":
    case "responsabilidade":
    case "ciclo":
    case "relacao":
      return appendToSection(content, item.section!, a);
    case "modulo":
      return content.replace(/^(\|\s*M[óo]dulo\s*\|)[^\n]*$/im, `$1 ${a} |`);
    case "revisao":
      return content.replace(/^(\|\s*Etapa\s*\|)[^\n]*$/im, "$1 Pronta para dev |");
    case "historias": {
      const n = content.match(/^#\s+F(\d+)/m)?.[1] ?? "00";
      const k = (sectionsOf(content).get("historias de usuario")?.match(/^###\s/gm) ?? []).length + 1;
      return appendToSection(content, item.section!, `### US-${n}.${k} — ${a.length > 60 ? `${a.slice(0, 57)}…` : a}\n${a}`);
    }
    case "criterios": {
      const ls = content.split("\n");
      const head = ls.findIndex((l) => /^##\s/.test(l) && norm(l.replace(/^##\s+/, "")) === "historias de usuario");
      let end = ls.findIndex((l, i) => i > head && /^##\s/.test(l));
      if (end < 0) end = ls.length;
      const starts = ls.map((l, i) => (i > head && i < end && /^###\s/.test(l) ? i : -1)).filter((i) => i >= 0);
      for (let i = 0; i < starts.length; i++) {
        const stop = starts[i + 1] ?? end;
        const body = ls.slice(starts[i] + 1, stop).join("\n");
        if (/crit[ée]rios de aceite\**\s*\n\s*[-*]\s+\S/i.test(body)) continue;
        let at = stop;
        while (at - 1 > starts[i] && ls[at - 1].trim() === "") at--;
        ls.splice(at, 0, "", "**Critérios de aceite**", `- ${a}`);
        break;
      }
      return ls.join("\n");
    }
    case "duvidas": {
      let done = false;
      return content
        .split("\n")
        .map((l) => {
          if (!done && /^[-*]\s+(?!\[x\]|~~)\S/i.test(l.trim()) && sectionsOf(content).get("duvidas em aberto")?.includes(l)) {
            done = true;
            return l.replace(/^([-*]\s+)/, "$1[x] ") + ` — ${a}`;
          }
          return l;
        })
        .join("\n");
    }
    default:
      return appendToSection(content, item.section ?? item.label, `- ${a}`);
  }
}

function questionAfter(g: Guide | null): string {
  if (!g || !g.current) return "";
  return g.missing[0] ? ` Próxima pergunta: **${g.missing[0].ask}**` : "";
}

/** Decide o que fazer a partir do pedido, com regras simples. */
function plan(root: string, prompt: string, resume?: string): Plan {
  const feature = prompt.match(/feature "([^"]+)"(?: no módulo (\S+))?/);
  if (feature) {
    const dir = path.join(root, "docs", "features");
    const id = nextId(dir, "F");
    const rel = `docs/features/${id}-${slugify(feature[1])}.md`;
    const template = "docs/_templates/feature.md";
    const tpl = readOr(path.join(root, ...template.split("/")), "# F00 — [Nome da feature]\n\n| Campo | Valor |\n|---|---|\n| Módulo | [M00] |\n| Etapa | Ideia |\n\n## Objetivo\n\n## Quem usa\n");
    const content = tpl
      .replace(/^# F00 — .*$/m, `# ${id} — ${feature[1]}`)
      .replace(/\| Módulo \| \[M00\] \|/, `| Módulo | ${feature[2] ?? "[M00]"} |`);
    const first = analyzeDoc(rel, content)?.missing[0];
    return {
      kind: "create",
      rel,
      content,
      template,
      summary: `criei o esqueleto \`${rel}\` a partir do template.${first ? ` Primeira pergunta: **${first.ask}**` : ""}`,
    };
  }

  const module = prompt.match(/módulo "([^"]+)"/);
  if (module) {
    const dir = path.join(root, "docs", "modulos");
    const id = nextId(dir, "M");
    const rel = `docs/modulos/${id}-${slugify(module[1])}.md`;
    const template = "docs/_templates/modulo.md";
    const tpl = readOr(path.join(root, ...template.split("/")), "# M00 — [Nome do módulo]\n\n## Responsabilidade\n\n## Perfis envolvidos\n");
    const content = tpl.replace(/^# M00 — .*$/m, `# ${id} — ${module[1]}`);
    const first = analyzeDoc(rel, content)?.missing[0];
    return {
      kind: "create",
      rel,
      content,
      template,
      summary: `criei o esqueleto \`${rel}\` a partir do template.${first ? ` Primeira pergunta: **${first.ask}**` : ""}`,
    };
  }

  // Entrevista guiada: o Claude pergunta; a resposta seguinte do usuário é gravada no arquivo.
  const start = prompt.match(/^Entrevista guiada: etapa "[^"]+" de (\S+?)\.?$/m);
  if (start) {
    const rel = start[1];
    const abs = checkAgentPath(root, rel);
    const g = abs.ok && fs.existsSync(abs.abs) ? analyzeDoc(rel, fs.readFileSync(abs.abs, "utf8")) : null;
    return { kind: "interview", rel, summary: g?.missing[0] ? `primeira pergunta: **${g.missing[0].ask}**` : "esta etapa já está completa" };
  }
  const fileRel = interviews.get(resume ?? "");
  if (fileRel) {
    const abs = checkAgentPath(root, fileRel);
    const answer = prompt.replace(/^Arquivo aberto na tela: .*\n\n/, "").trim();
    if (abs.ok && fs.existsSync(abs.abs) && answer) {
      const before = fs.readFileSync(abs.abs, "utf8");
      const g0 = analyzeDoc(fileRel, before);
      const item = g0?.missing[0];
      if (g0 && item) {
        const content = applyAnswer(before, item, answer);
        const g1 = analyzeDoc(fileRel, content);
        const closed = g1 && g1.reached > g0.reached ? `etapa **${g0.steps[g0.reached]}** completa. ` : "";
        const tail = g1?.current ? questionAfter(g1) : " Todas as etapas estão completas.";
        return { kind: "interview", rel: fileRel, content, summary: `anotei a resposta em \`${fileRel}\`. ${closed}${tail}`.trim() };
      }
    }
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

  const p = plan(root, prompt, options.resume);
  if (p.kind === "create" || (p.kind === "interview" && p.content === undefined)) interviews.set(sid, p.rel);
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
  } else if (p.kind === "interview") {
    const allowed = checkAgentPath(root, p.rel);
    if (allowed.ok && fs.existsSync(allowed.abs)) {
      yield tool("Read", p.rel);
      await sleep(300);
      check();
      if (p.content !== undefined) {
        yield tool("Edit", p.rel);
        fs.writeFileSync(allowed.abs, p.content, "utf8");
      }
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
  const result = `**Modo simulado:** ${p.summary.replace(/\.$/, "")}. Para respostas reais, tire \`CLAUDE_MOCK=true\` do \`.env\`.`;
  for (const w of result.split(/(?<= )/)) {
    check();
    yield text(w);
    await sleep(25);
  }
  yield m({ type: "result", subtype: "success", is_error: false, result, total_cost_usd: 0, session_id: sid });
};
