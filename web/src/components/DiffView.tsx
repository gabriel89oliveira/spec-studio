import { useMemo, useState } from "react";
import { diffLines } from "diff";

type Line = { kind: "add" | "del" | "same"; text: string };
type Block = { kind: "lines"; lines: Line[] } | { kind: "fold"; lines: Line[] };

const CONTEXT = 3;

function toLines(before: string, after: string): Line[] {
  const out: Line[] = [];
  for (const part of diffLines(before, after)) {
    const kind = part.added ? "add" : part.removed ? "del" : "same";
    const ls = part.value.replace(/\n$/, "").split("\n");
    for (const text of ls) out.push({ kind, text });
  }
  return out;
}

/** Agrupa trechos longos sem mudança em blocos recolhidos. */
function toBlocks(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "same") {
      const start = i;
      while (i < lines.length && lines[i].kind !== "same") i++;
      blocks.push({ kind: "lines", lines: lines.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].kind === "same") i++;
    const run = lines.slice(start, i);
    const head = start === 0 ? 0 : CONTEXT;
    const tail = i === lines.length ? 0 : CONTEXT;
    if (run.length > head + tail + 2) {
      if (head) blocks.push({ kind: "lines", lines: run.slice(0, head) });
      blocks.push({ kind: "fold", lines: run.slice(head, run.length - tail) });
      if (tail) blocks.push({ kind: "lines", lines: run.slice(run.length - tail) });
    } else {
      blocks.push({ kind: "lines", lines: run });
    }
  }
  return blocks;
}

const STYLE: Record<Line["kind"], string> = {
  add: "bg-add-soft text-add",
  del: "bg-del-soft text-del line-through decoration-del/40",
  same: "text-ink-2",
};
const SIGN: Record<Line["kind"], string> = { add: "+", del: "−", same: " " };

function Fold({ lines }: { lines: Line[] }) {
  const [open, setOpen] = useState(false);
  if (open) return <Lines lines={lines} />;
  return (
    <button className="w-full border-y border-dashed border-line bg-desk/60 py-1 text-center font-sans text-2xs text-ink-3 hover:text-ink" onClick={() => setOpen(true)}>
      {lines.length} linhas sem mudança (mostrar)
    </button>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={`flex whitespace-pre-wrap break-words px-3 ${STYLE[l.kind]}`}>
          <span className="w-5 shrink-0 select-none opacity-60">{SIGN[l.kind]}</span>
          <span>{l.text || " "}</span>
        </div>
      ))}
    </>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const blocks = useMemo(() => toBlocks(toLines(before, after)), [before, after]);
  const changed = blocks.some((b) => b.kind === "lines" && b.lines.some((l) => l.kind !== "same"));
  if (!changed) return <p className="text-sm text-ink-3">Nenhuma diferença neste arquivo.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-line bg-sheet py-1 font-mono text-[12.5px] leading-[1.7]" data-testid="diff">
      {blocks.map((b, i) => (b.kind === "fold" ? <Fold key={i} lines={b.lines} /> : <Lines key={i} lines={b.lines} />))}
    </div>
  );
}
