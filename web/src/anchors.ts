import type { Anchor } from "./types";

/**
 * Texto visível do documento renderizado, com espaços normalizados,
 * e o mapa de cada caractere para o nó de texto e a posição de origem.
 */
export type TextMap = { text: string; map: { node: Text; offset: number }[] };

const BLOCKS = "p,li,td,th,h1,h2,h3,h4,h5,h6,pre,blockquote,dt,dd,tr,div";
const CONTEXT = 30;

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function buildTextMap(root: HTMLElement): TextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  const map: TextMap["map"] = [];
  let lastSpace = true;
  let prevBlock: Element | null = null;

  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const block = n.parentElement?.closest(BLOCKS) ?? null;
    // Fronteira entre blocos (parágrafos, células) conta como espaço.
    if (block !== prevBlock && !lastSpace && text.length > 0) {
      text += " ";
      map.push({ node: n, offset: 0 });
      lastSpace = true;
    }
    prevBlock = block;
    const s = n.data;
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i])) {
        if (lastSpace) continue;
        text += " ";
        map.push({ node: n, offset: i });
        lastSpace = true;
      } else {
        text += s[i];
        map.push({ node: n, offset: i });
        lastSpace = false;
      }
    }
  }
  return { text, map };
}

function occurrences(text: string, quote: string): number[] {
  const out: number[] = [];
  if (!quote) return out;
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) out.push(i);
  return out;
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Âncora (trecho + contexto) a partir de uma seleção no documento renderizado. */
export function anchorFromRange(tm: TextMap, range: Range): Anchor | null {
  const quote = normalize(range.toString());
  if (!quote) return null;

  let start = -1;
  for (let i = 0; i < tm.map.length; i++) {
    try {
      if (range.comparePoint(tm.map[i].node, tm.map[i].offset) === 0) {
        start = i;
        break;
      }
    } catch {
      /* nó fora do documento */
    }
  }
  const occ = occurrences(tm.text, quote);
  if (occ.length === 0) return null;
  if (start === -1 || tm.text.slice(start, start + quote.length) !== quote) {
    const ref = start === -1 ? 0 : start;
    start = occ.reduce((best, i) => (Math.abs(i - ref) < Math.abs(best - ref) ? i : best), occ[0]);
  }
  return {
    quote,
    prefix: tm.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: tm.text.slice(start + quote.length, start + quote.length + CONTEXT),
  };
}

/** Posição do trecho no texto atual, desempatando por prefixo e sufixo; -1 se o trecho sumiu. */
export function findAnchor(tm: TextMap, anchor: Anchor): number {
  const quote = normalize(anchor.quote);
  const occ = occurrences(tm.text, quote);
  if (occ.length <= 1) return occ[0] ?? -1;
  let best = occ[0];
  let bestScore = -1;
  for (const i of occ) {
    const score =
      commonSuffix(tm.text.slice(Math.max(0, i - CONTEXT * 2), i), anchor.prefix) +
      commonPrefix(tm.text.slice(i + quote.length), anchor.suffix);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export function rangeFor(tm: TextMap, start: number, length: number): Range | null {
  const a = tm.map[start];
  const b = tm.map[start + length - 1];
  if (!a || !b) return null;
  const r = document.createRange();
  try {
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, Math.min(b.offset + 1, b.node.length));
  } catch {
    return null;
  }
  return r;
}

/** Nó e posição do cursor sob o ponto (x, y), em qualquer navegador. */
export function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };

function registry(): { reg: HighlightRegistry; Ctor: new (...r: Range[]) => unknown } | null {
  const reg = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const Ctor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  return reg && Ctor ? { reg, Ctor } : null;
}

/** Destaca trechos com a CSS Custom Highlight API (sem mexer no DOM do React). */
export function paintHighlights(normal: Range[], active: Range[]): void {
  const r = registry();
  if (!r) return;
  r.reg.set("spec-comment", new r.Ctor(...normal));
  r.reg.set("spec-comment-active", new r.Ctor(...active));
}

export function clearHighlights(): void {
  const r = registry();
  if (!r) return;
  r.reg.delete("spec-comment");
  r.reg.delete("spec-comment-active");
}
