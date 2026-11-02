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
  add: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  del: "bg-red-50 text-red-900 line-through decoration-red-300/60 dark:bg-red-950/60 dark:text-red-200",
  same: "text-zinc-600 dark:text-zinc-400",
};
const SIGN: Record<Line["kind"], string> = { add: "+", del: "−", same: " " };

function Fold({ lines }: { lines: Line[] }) {
  const [open, setOpen] = useState(false);
  if (open) return <Lines lines={lines} />;
  return (
    <button className="w-full bg-zinc-50 py-0.5 text-center text-[11px] text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800" onClick={() => setOpen(true)}>
      … {lines.length} linhas sem mudança …
    </button>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={`flex whitespace-pre-wrap break-words px-2 ${STYLE[l.kind]}`}>
          <span className="w-4 shrink-0 select-none opacity-60">{SIGN[l.kind]}</span>
          <span>{l.text || " "}</span>
        </div>
      ))}
    </>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const blocks = useMemo(() => toBlocks(toLines(before, after)), [before, after]);
  const changed = blocks.some((b) => b.kind === "lines" && b.lines.some((l) => l.kind !== "same"));
  if (!changed) return <p className="p-4 text-sm text-zinc-500">Nenhuma diferença neste arquivo.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 font-mono text-xs leading-5 dark:border-zinc-800" data-testid="diff">
      {blocks.map((b, i) => (b.kind === "fold" ? <Fold key={i} lines={b.lines} /> : <Lines key={i} lines={b.lines} />))}
    </div>
  );
}
