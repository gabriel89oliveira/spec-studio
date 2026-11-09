import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { SourceIndex, SourcePiece } from "../types";
import { btn, btnClaude, btnGhost, input } from "../ui";

type Big = Extract<SourceIndex, { big: true }>;
const MAX_APPLY = 15;
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

const CHIP: Record<SourcePiece["status"], string> = {
  usada: "border-add/40 bg-add-soft text-ink",
  descartada: "border-line bg-sheet text-ink-3",
  pendente: "border-mark/40 bg-mark-soft text-mark-ink",
};

function Bar({ used, discarded, total }: { used: number; discarded: number; total: number }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line/60" role="img" aria-label={`${used} com destino, ${discarded} descartadas, de ${total}`}>
      <div className="bg-add" style={{ width: `${pct(used, total)}%` }} />
      <div className="bg-ink-3/50" style={{ width: `${pct(discarded, total)}%` }} />
    </div>
  );
}

type Props = {
  sourceId: string;
  refreshKey: string;
  busy: boolean;
  claudeEnabled: boolean;
  onAsk: (prompt: string, file?: string | null) => void;
  onChanged: () => void;
};

export function SourceIndexPanel({ sourceId, refreshKey, busy, claudeEnabled, onAsk, onChanged }: Props) {
  const [idx, setIdx] = useState<SourceIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    api.sourceIndex(sourceId).then(
      (d) => alive && (setIdx(d), setError(null)),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [sourceId, refreshKey]);

  const big = idx && idx.big ? (idx as Big) : null;
  const byGroup = useMemo(() => {
    const m = new Map<string, SourcePiece[]>();
    for (const p of big?.pieces ?? []) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return m;
  }, [big]);

  if (error) return <p className="mx-auto max-w-3xl px-6 py-2 text-xs text-danger">{error}</p>;
  if (!big) return null;

  const toggle = (id: string) => setSel((s) => (new Set(s).has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));
  const ask = async (body: { mode: "summarize" | "apply"; group?: string; ids?: string[] }) => {
    try {
      const r = await api.sourcePrompt(sourceId, body);
      setError(null);
      onAsk(r.prompt, big.ficha);
      if (body.mode === "apply") setSel(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const discard = async () => {
    try {
      await api.discardPieces(sourceId, [...sel], reason);
      setSel(new Set());
      setReason("");
      setDiscarding(false);
      setError(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const view = async (p: SourcePiece) => {
    if (shown[p.id] !== undefined) return setShown(({ [p.id]: _, ...rest }) => rest);
    try {
      const r = await api.sourcePiece(sourceId, p.id);
      setShown((s) => ({ ...s, [p.id]: r.text }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const selectPending = (g: string) => {
    const ids = (byGroup.get(g) ?? []).filter((p) => p.status === "pendente").slice(0, MAX_APPLY).map((p) => p.id);
    setSel(new Set(ids));
  };

  return (
    <section className="mx-auto mb-4 w-full max-w-3xl px-6" data-testid="source-index" aria-label="Peças da fonte">
      <div className="rounded-xl border border-line bg-sheet p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Peças da fonte</h2>
          <span className="text-xs text-ink-3">
            {big.total} peças · {big.lines.toLocaleString("pt-BR")} linhas · ~{Math.round(big.tokens / 1000)} mil tokens
          </span>
        </div>
        <p className="mb-2 text-xs text-ink-2" data-testid="source-totals">
          {big.used} com destino · {big.discarded} descartadas · <strong>{big.pending} pendentes</strong>
        </p>
        <Bar used={big.used} discarded={big.discarded} total={big.total} />
        <p className="mt-2 text-xs text-ink-3">
          Uma peça tem destino quando uma spec a cita como <code>[fonte: {big.id}, ID]</code>. O que não vai para a spec é descartado com motivo.
        </p>

        <ul className="mt-3 divide-y divide-line/60">
          {big.groups.map((g) => {
            const isOpen = open === g.name;
            const pieces = (byGroup.get(g.name) ?? []).filter((p) => !onlyPending || p.status === "pendente");
            return (
              <li key={g.name} className="py-2" data-testid="source-group">
                <div className="flex items-center gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : g.name)} aria-expanded={isOpen}>
                    <span className="block truncate text-[13.5px] font-medium text-ink">{g.name}</span>
                    <span className="mb-1 block text-xs text-ink-3">
                      {g.used + g.discarded} de {g.total} resolvidas{g.summarized ? "" : " · sem resumo"}
                    </span>
                    <Bar used={g.used} discarded={g.discarded} total={g.total} />
                  </button>
                  {!g.summarized && (
                    <button className={`${btnClaude} shrink-0`} disabled={busy || !claudeEnabled} onClick={() => void ask({ mode: "summarize", group: g.name })} title="O Claude lê o início de cada peça do grupo e escreve um resumo de até 6 linhas na ficha">
                      Resumir
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="mt-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> só pendentes
                      </label>
                      <button className={btnGhost} onClick={() => selectPending(g.name)}>
                        Selecionar até {MAX_APPLY} pendentes
                      </button>
                    </div>
                    {pieces.length === 0 && <p className="py-2 text-xs text-ink-3">Nenhuma peça neste filtro.</p>}
                    {pieces.map((p) => (
                      <div key={p.id} className="rounded-lg border border-line/60 px-2.5 py-1.5" data-testid="source-piece">
                        <div className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Selecionar ${p.id}`} />
                          <button className="min-w-0 flex-1 text-left" onClick={() => void view(p)} title="Ver o texto da peça">
                            <span className="font-mono text-xs text-ink-3">{p.id}</span>
                            <span className="ml-2 text-[13px] text-ink">{p.title}</span>
                          </button>
                          {p.weight != null && <span className="shrink-0 text-xs tabular-nums text-ink-3">peso {p.weight}</span>}
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${CHIP[p.status]}`} title={p.reason ?? p.usedIn.join(", ")}>
                            {p.status}
                          </span>
                        </div>
                        {shown[p.id] !== undefined && <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-wash p-2 text-xs text-ink-2">{shown[p.id]}</pre>}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {sel.size > 0 && (
          <div className="sticky bottom-0 mt-3 space-y-2 rounded-lg border border-line bg-wash p-3" data-testid="source-actions">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-2">
                {sel.size} {sel.size === 1 ? "selecionada" : "selecionadas"}
              </span>
              <button className={btnClaude} disabled={busy || !claudeEnabled || sel.size > MAX_APPLY} onClick={() => void ask({ mode: "apply", ids: [...sel] })} title={sel.size > MAX_APPLY ? `No máximo ${MAX_APPLY} por vez` : "O Claude aplica as peças nas specs e cita cada uma"}>
                Aplicar com o Claude
              </button>
              <button className={btn} disabled={busy} onClick={() => setDiscarding((v) => !v)}>
                Descartar…
              </button>
              <button className={btnGhost} onClick={() => setSel(new Set())}>
                Limpar
              </button>
            </div>
            {discarding && (
              <div className="flex gap-2">
                <input className={`${input} flex-1`} placeholder="Motivo do descarte (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo do descarte" />
                <button className={btn} disabled={busy || !reason.trim()} onClick={() => void discard()}>
                  Confirmar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
