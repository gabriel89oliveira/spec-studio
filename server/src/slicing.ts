/**
 * Fatiamento determinístico de uma fonte grande em "peças" endereçáveis.
 * Nenhuma IA aqui: o resultado depende só da estrutura do texto, então é repetível e conferível.
 */

export type PieceKind = "bloco" | "linha" | "secao" | "janela";

export type Piece = {
  id: string;
  title: string;
  group: string;
  /** Peso informado pela própria fonte ("Peso: 20/20"), se houver. */
  weight: number | null;
  /** Linhas (1-based, inclusive) no texto original. */
  start: number;
  end: number;
  chars: number;
  kind: PieceKind;
};

export type Slice = {
  strategy: "ids" | "secoes" | "janelas";
  lines: number;
  chars: number;
  /** Texto introdutório (como ler, glossário, visão geral), herdado por toda peça enviada a um agente. */
  preamble: { start: number; end: number };
  pieces: Piece[];
  groups: { name: string; ids: string[] }[];
};

/** Fontes com menos texto que isso seguem o fluxo normal (uma leitura só). */
export const BIG_SOURCE_CHARS = 60_000;
export const WINDOW_LINES = 120;
const PREAMBLE_MAX_CHARS = 8_000;
const BIG_TABLE_ROWS = 20;

/** Forma de um ID de peça: RN-ORC-01, RN-INT-DAVI-03, RN-SR-M01, US-01.1. */
export const ID_SRC = String.raw`[A-Z]{1,6}(?:-[A-Z][A-Z0-9]*)*-[A-Z]?\d+(?:\.\d+)*`;
const ID_RE = new RegExp(`^${ID_SRC}$`);
const HEAD_ID_RE = new RegExp(String.raw`^(#{2,5})\s+(?:\d+\.\s+)?(${ID_SRC})\s*(?:[—–:]|-)\s*(.+?)\s*$`);
const HEAD_RE = /^(#{1,6})\s+(.*?)\s*$/;
const GROUP_KEYS = /^(dom[ií]nio|grupo|m[óo]dulo|[áa]rea)$/i;

const clean = (s: string) => s.replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isTableLine = (l: string) => /^\s*\|/.test(l);
const isSepRow = (l: string) => /^\s*\|?\s*:?-{2,}/.test(l);

export function slugGroup(s: string): string {
  return clean(s) || "Geral";
}

export function sliceText(text: string): Slice {
  const lines = text.split("\n");
  const n = lines.length;
  const fences = new Array<boolean>(n).fill(false);
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    fences[i] = fence;
  });

  // Títulos fora de blocos de código.
  const heads: { i: number; level: number; text: string }[] = [];
  lines.forEach((l, i) => {
    if (fences[i]) return;
    const m = HEAD_RE.exec(l);
    if (m) heads.push({ i, level: m[1].length, text: clean(m[2]) });
  });
  const endOfBlock = (i: number, level: number): number => {
    for (const h of heads) if (h.i > i && h.level <= level) return h.i; // exclusivo
    return n;
  };

  const lastHeadBefore = (i: number, maxLevel = 3): string | null => {
    let found: string | null = null;
    for (const h of heads) {
      if (h.i >= i) break;
      if (h.level <= maxLevel && h.level >= 2 && !HEAD_ID_RE.test(lines[h.i])) found = h.text;
    }
    return found;
  };

  const pieces: Piece[] = [];
  const seen = new Set<string>();
  const add = (p: Piece) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    pieces.push(p);
  };
  const sizeOf = (a: number, b: number) => {
    let c = 0;
    for (let i = a; i < b; i++) c += lines[i].length + 1;
    return c;
  };

  // 1) Blocos cujo título começa por um ID.
  for (const h of heads) {
    const m = HEAD_ID_RE.exec(lines[h.i]);
    if (!m || fences[h.i]) continue;
    const end = endOfBlock(h.i, h.level);
    let group: string | null = null;
    let weight: number | null = null;
    for (let i = h.i + 1; i < end; i++) {
      const kv = /^\s*[-*]\s+\*\*([^:*]+):\*\*\s*(.+)$/.exec(lines[i]);
      if (!kv) continue;
      if (group === null && GROUP_KEYS.test(kv[1].trim())) group = slugGroup(kv[2]);
      if (weight === null && /^peso$/i.test(kv[1].trim())) weight = Number(/(\d+(?:[.,]\d+)?)/.exec(kv[2])?.[1].replace(",", ".")) || null;
    }
    add({ id: m[2], title: clean(m[3]), group: group ?? slugGroup(lastHeadBefore(h.i, 2) ?? "Geral"), weight, start: h.i + 1, end, chars: sizeOf(h.i, end), kind: "bloco" });
  }

  // 2) Linhas de tabelas com coluna "ID" (regras menores, anexos). Só entram IDs sem bloco próprio.
  for (let i = 0; i < n; i++) {
    if (fences[i] || !isTableLine(lines[i]) || !isTableLine(lines[i + 1] ?? "") || !isSepRow(lines[i + 1])) continue;
    const header = cells(lines[i]).map(clean);
    const idCol = header.findIndex((h) => /^id$/i.test(h));
    if (idCol < 0) continue;
    const titleCol = header.findIndex((h, k) => k !== idCol && !/^#$/.test(h));
    const group = slugGroup(lastHeadBefore(i, 3) ?? "Geral");
    let j = i + 2;
    for (; j < n && isTableLine(lines[j]); j++) {
      const row = cells(lines[j]);
      const id = clean(row[idCol] ?? "");
      if (!ID_RE.test(id)) continue;
      add({ id, title: clean(row[titleCol < 0 ? idCol : titleCol] ?? id), group, weight: null, start: j + 1, end: j + 1, chars: lines[j].length + 1, kind: "linha" });
    }
    i = j - 1;
  }

  // Introdução herdada: do início até a primeira tabela longa ou o primeiro bloco.
  const firstPiece = Math.min(...pieces.filter((p) => p.kind === "bloco").map((p) => p.start - 1), n);
  let preEnd = Math.min(firstPiece, n);
  for (let i = 0; i < preEnd; i++) {
    if (!isTableLine(lines[i]) || fences[i]) continue;
    let j = i;
    while (j < n && isTableLine(lines[j])) j++;
    if (j - i >= BIG_TABLE_ROWS) {
      preEnd = i;
      while (preEnd > 0 && (HEAD_RE.test(lines[preEnd - 1]) || lines[preEnd - 1].trim() === "")) preEnd--;
      break;
    }
    i = j - 1;
  }
  while (preEnd > 1 && sizeOf(0, preEnd) > PREAMBLE_MAX_CHARS) preEnd--;
  const preamble = { start: 1, end: Math.max(preEnd, 0) };

  let strategy: Slice["strategy"] = "ids";
  if (pieces.length < 3) {
    pieces.length = 0;
    seen.clear();
    const secs = heads.filter((h) => h.level === 2 || h.level === 3);
    if (secs.length >= 3) {
      strategy = "secoes";
      secs.forEach((h, k) => {
        const end = endOfBlock(h.i, h.level);
        const parent = [...heads].reverse().find((p) => p.i < h.i && p.level === 2);
        add({ id: `SEC-${String(k + 1).padStart(3, "0")}`, title: h.text, group: h.level === 2 ? h.text : (parent?.text ?? "Geral"), weight: null, start: h.i + 1, end, chars: sizeOf(h.i, end), kind: "secao" });
      });
      preamble.end = Math.min(secs[0].i, PREAMBLE_MAX_CHARS ? secs[0].i : 0);
    } else {
      strategy = "janelas";
      for (let a = 0, k = 1; a < n; a += WINDOW_LINES, k++) {
        const end = Math.min(a + WINDOW_LINES, n);
        const first = lines.slice(a, end).find((l) => l.trim()) ?? "";
        add({ id: `LIN-${String(k).padStart(4, "0")}`, title: clean(first).slice(0, 80) || `Linhas ${a + 1}–${end}`, group: "Texto", weight: null, start: a + 1, end, chars: sizeOf(a, end), kind: "janela" });
      }
      preamble.end = 0;
    }
  }

  pieces.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const gmap = new Map<string, string[]>();
  for (const p of pieces) gmap.set(p.group, [...(gmap.get(p.group) ?? []), p.id]);
  return { strategy, lines: n, chars: text.length, preamble, pieces, groups: [...gmap].map(([name, ids]) => ({ name, ids })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) };
}

export function linesOf(text: string, start: number, end: number): string {
  return text.split("\n").slice(Math.max(start - 1, 0), end).join("\n");
}

export const isBigText = (text: string) => text.length >= BIG_SOURCE_CHARS;
