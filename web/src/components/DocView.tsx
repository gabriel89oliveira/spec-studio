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
import { btnPrimary } from "../ui";
import { IconComment } from "./Icons";

type Props = {
  content: string;
  comments: Comment[];
  activeId: string | null;
  onComment: (anchor: Anchor) => void;
  onFocusComment: (id: string) => void;
  /** Ids dos comentários cujo trecho foi encontrado no texto atual. */
  onAnchorsResolved: (found: Set<string>) => void;
};

/** A folha branca onde o documento é exibido. */
export function Sheet({ children, wide, flush }: { children: React.ReactNode; wide?: boolean; flush?: boolean }) {
  return (
    <div className={`mx-auto px-4 py-6 xl:px-8 xl:py-8 2xl:px-12 2xl:py-10 ${wide ? "max-w-[1120px]" : "max-w-[800px]"}`}>
      <article className={`relative rounded-[3px] bg-sheet shadow-sheet ${flush ? "" : "px-8 py-10 xl:px-12 xl:py-12 2xl:px-16 2xl:py-14"}`}>
        {children}
      </article>
    </div>
  );
}

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
    setPending({ anchor, top: rect.bottom - box.top + 8, left: Math.max(0, rect.left - box.left + rect.width / 2 - 52) });
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
    <Sheet>
      <div ref={wrapRef} className="relative">
        <div ref={bodyRef} onMouseUp={onMouseUp} onClick={onClick} data-testid="doc-body" className="md">
          <Markdown content={content} />
        </div>
        {pending && (
          <button
            className={`${btnPrimary} absolute z-10 shadow-lift`}
            style={{ top: pending.top, left: pending.left }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onComment(pending.anchor);
              setPending(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <IconComment className="h-3.5 w-3.5" />
            Comentar
          </button>
        )}
      </div>
    </Sheet>
  );
}
