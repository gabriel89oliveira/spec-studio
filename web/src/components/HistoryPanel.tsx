import { useEffect, useState } from "react";
import { api } from "../api";
import type { HistoryEntry } from "../types";
import { btn, btnDanger, formatDate } from "../ui";
import { DiffView } from "./DiffView";
import { Sheet } from "./DocView";

type Props = {
  path: string;
  /** Muda quando o arquivo muda, para recarregar a lista. */
  refreshKey: string;
  disabled: boolean;
  onError: (msg: string) => void;
};

const ORIGIN: Record<HistoryEntry["origin"], { label: string; dot: string }> = {
  claude: { label: "Claude", dot: "bg-claude" },
  manual: { label: "Edição manual", dot: "bg-accent" },
  revert: { label: "Desfeito", dot: "bg-mark" },
  comments: { label: "Comentários", dot: "bg-ink-3" },
  other: { label: "Outro", dot: "bg-line-strong" },
};

export function HistoryPanel({ path, refreshKey, disabled, onError }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [diff, setDiff] = useState<{ before: string; after: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .history(path)
      .then((h) => alive && setEntries(h))
      .catch((e) => onError(e.message));
    return () => {
      alive = false;
    };
  }, [path, refreshKey, onError]);

  useEffect(() => {
    setConfirm(false);
    setDiff(null);
    if (!selected) return;
    let alive = true;
    api
      .diff(selected.hash, path)
      .then((d) => alive && setDiff(d))
      .catch((e) => onError(e.message));
    return () => {
      alive = false;
    };
  }, [selected, path, onError]);

  const revert = async () => {
    if (!selected) return;
    setWorking(true);
    try {
      await api.revert(selected.hash);
      setSelected(null);
      setConfirm(false);
      setEntries(await api.history(path));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet wide flush>
      <div className="flex min-h-[70vh]">
        <div className="w-80 shrink-0 border-r border-line">
          <div className="border-b border-line px-5 py-3.5">
            <div className="text-[17px] font-semibold text-ink">Histórico</div>
            <div className="text-xs text-ink-3">
              {entries ? `${entries.length} ${entries.length === 1 ? "alteração" : "alterações"} neste arquivo` : "Carregando…"}
            </div>
          </div>
          <ol className="py-1" data-testid="history-list">
            {entries?.length === 0 && <li className="px-5 py-4 text-sm text-ink-3">Este arquivo ainda não tem alterações registradas.</li>}
            {entries?.map((e, i) => {
              const o = ORIGIN[e.origin];
              const isSel = selected?.hash === e.hash;
              return (
                <li key={e.hash} className="relative">
                  {/* linha do tempo */}
                  <span
                    className={`absolute left-[25px] w-px bg-line ${i === 0 ? "top-5" : "top-0"} ${i === entries.length - 1 ? "h-5" : "bottom-0"}`}
                    aria-hidden="true"
                  />
                  <button
                    className={`relative flex w-full gap-3 py-2.5 pl-5 pr-4 text-left ${isSel ? "bg-accent-soft" : "hover:bg-wash"}`}
                    onClick={() => setSelected(e)}
                    aria-current={isSel ? "true" : undefined}
                  >
                    <span className={`mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full ring-[3px] ring-sheet ${o.dot}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13.5px] leading-snug text-ink">{e.message}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {o.label}, {formatDate(e.date)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-w-0 flex-1 p-6">
          {!selected && (
            <div className="flex h-full items-center justify-center text-center text-sm text-ink-3">
              Escolha uma alteração à esquerda para ver o que mudou.
            </div>
          )}
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[19px] font-semibold leading-tight text-ink">{selected.message}</div>
                  <div className="mt-1 text-xs text-ink-3">
                    {ORIGIN[selected.origin].label}, {formatDate(selected.date)}, por {selected.author}{" "}
                    <span className="font-mono">{selected.shortHash}</span>
                  </div>
                </div>
                {confirm ? (
                  <div className="flex items-center gap-2 rounded-md border border-line bg-wash px-3 py-2">
                    <span className="text-xs text-ink-2">Criar um commit que desfaz esta alteração?</span>
                    <button className={btn} onClick={() => setConfirm(false)}>
                      Cancelar
                    </button>
                    <button className={btnDanger} disabled={working || disabled} onClick={() => void revert()}>
                      Confirmar
                    </button>
                  </div>
                ) : (
                  <button className={btn} disabled={disabled} onClick={() => setConfirm(true)}>
                    Desfazer esta alteração
                  </button>
                )}
              </div>
              {diff ? <DiffView before={diff.before} after={diff.after} /> : <p className="text-sm text-ink-3">Carregando…</p>}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
