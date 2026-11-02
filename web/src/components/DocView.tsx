import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  anchorFromRange,
  buildTextMap,
  caretFromPoint,
  clearHighlights,
  findAnchor,
  normalize,
  paintHighlights,
  rangeFor,
  type TextMap,
} from "../anchors";
import type { Anchor, Comment } from "../types";

type Props = {
  content: string;
  comments: Comment[];
  activeId: string | null;
  onComment: (anchor: Anchor) => void;
  onFocusComment: (id: string) => void;
  /** Ids dos comentários cujo trecho foi encontrado no texto atual. */
  onAnchorsResolved: (found: Set<string>) => void;
};

const Markdown = memo(function Markdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
});

export function DocView({ content, comments, activeId, onComment, onFocusComment, onAnchorsResolved }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tmRef = useRef<TextMap | null>(null);
  const rangesRef = useRef<{ id: string; range: Range }[]>([]);
  const [pending, setPending] = useState<{ anchor: Anchor; top: number; left: number } | null>(null);

  // Localiza os trechos comentados no texto renderizado e pinta os destaques.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const tm = buildTextMap(el);
    tmRef.current = tm;
    const ranges: { id: string; range: Range }[] = [];
    const found = new Set<string>();
    for (const c of comments) {
      const idx = findAnchor(tm, c.anchor);
      if (idx < 0) continue;
      found.add(c.id);
      if (c.status === "resolved") continue;
      const r = rangeFor(tm, idx, normalize(c.anchor.quote).length);
      if (r) ranges.push({ id: c.id, range: r });
    }
    rangesRef.current = ranges;
    paintHighlights(
      ranges.filter((r) => r.id !== activeId).map((r) => r.range),
      ranges.filter((r) => r.id === activeId).map((r) => r.range),
    );
    onAnchorsResolved(found);
  }, [content, comments, activeId, onAnchorsResolved]);

  useEffect(() => () => clearHighlights(), []);

  // Leva o trecho do comentário ativo para a área visível.
  useEffect(() => {
    if (!activeId) return;
    const r = rangesRef.current.find((x) => x.id === activeId);
    r?.range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId]);

  useEffect(() => setPending(null), [content]);

  const onMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const body = bodyRef.current;
    const wrap = wrapRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body || !wrap || !tmRef.current) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const anchor = anchorFromRange(tmRef.current, range);
    if (!anchor) {
      setPending(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    setPending({ anchor, top: rect.bottom - box.top + 6, left: Math.max(8, rect.left - box.left + rect.width / 2 - 45) });
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const caret = caretFromPoint(e.clientX, e.clientY);
      if (!caret) return;
      for (const { id, range } of rangesRef.current) {
        try {
          if (range.isPointInRange(caret.node, caret.offset)) {
            onFocusComment(id);
            return;
          }
        } catch {
          /* ponto fora do documento */
        }
      }
    },
    [onFocusComment],
  );

  return (
    <div ref={wrapRef} className="relative mx-auto max-w-3xl px-8 py-6">
      <div
        ref={bodyRef}
        onMouseUp={onMouseUp}
        onClick={onClick}
        data-testid="doc-body"
        className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-table:text-sm prose-pre:bg-zinc-100 prose-pre:text-zinc-800 dark:prose-pre:bg-zinc-900 dark:prose-pre:text-zinc-200"
      >
        <Markdown content={content} />
      </div>
      {pending && (
        <button
          className="absolute z-10 rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-lg hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ top: pending.top, left: pending.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onComment(pending.anchor);
            setPending(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Comentar
        </button>
      )}
    </div>
  );
}
