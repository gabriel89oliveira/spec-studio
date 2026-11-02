import { useEffect, useState } from "react";
import { api } from "../api";
import type { HistoryEntry } from "../types";
import { btn, btnDanger, formatDate } from "../ui";
import { DiffView } from "./DiffView";

type Props = {
  path: string;
  /** Muda quando o arquivo muda, para recarregar a lista. */
  refreshKey: string;
  disabled: boolean;
  onError: (msg: string) => void;
};

const ORIGIN: Record<HistoryEntry["origin"], { label: string; cls: string }> = {
  claude: { label: "Claude", cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200" },
  manual: { label: "Manual", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200" },
  revert: { label: "Desfeito", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  comments: { label: "Comentários", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  other: { label: "Outro", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
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
    <div className="flex h-full min-h-0">
      <ul className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800" data-testid="history-list">
        {entries === null && <li className="p-4 text-sm text-zinc-500">Carregando…</li>}
        {entries?.length === 0 && <li className="p-4 text-sm text-zinc-500">Sem histórico para este arquivo.</li>}
        {entries?.map((e) => (
          <li key={e.hash}>
            <button
              className={`w-full border-b border-zinc-100 px-3 py-2 text-left dark:border-zinc-900 ${
                selected?.hash === e.hash ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
              onClick={() => setSelected(e)}
            >
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`rounded px-1.5 py-0.5 font-medium ${ORIGIN[e.origin].cls}`}>{ORIGIN[e.origin].label}</span>
                <span>{formatDate(e.date)}</span>
                <span className="font-mono">{e.shortHash}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-zinc-800 dark:text-zinc-200">{e.message}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {!selected && <p className="text-sm text-zinc-500">Escolha uma alteração para ver o que mudou.</p>}
        {selected && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{selected.message}</div>
              {confirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Criar um commit que desfaz esta alteração?</span>
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
            {diff ? <DiffView before={diff.before} after={diff.after} /> : <p className="text-sm text-zinc-500">Carregando…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
