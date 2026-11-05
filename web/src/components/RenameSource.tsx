import { useEffect, useState } from "react";
import { btn, btnPrimary, input } from "../ui";
import { IconClose } from "./Icons";

type Props = {
  /** Nome atual (título da ficha, sem o ID). */
  current: string;
  id: string;
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
};

/** Pedir o novo nome de uma fonte. O ID (S01…) não muda. */
export function RenameSource({ current, id, onSubmit, onClose }: Props) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, busy]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(await onSubmit(name));
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" role="dialog" aria-modal="true" aria-label="Renomear fonte" data-testid="rename-source">
      <div className="w-full max-w-[460px] space-y-3 rounded-2xl border border-line bg-sheet p-5 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold text-ink">Renomear fonte</h1>
            <p className="mt-0.5 text-xs text-ink-2">
              O código <b className="font-semibold">{id}</b> continua o mesmo. Mudam o título, os nomes dos arquivos e as menções ao nome antigo nos documentos.
            </p>
          </div>
          <button className="rounded-md p-1 text-ink-2 hover:bg-wash" onClick={onClose} aria-label="Fechar" disabled={busy}>
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-ink-2">Novo nome</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus maxLength={120} aria-label="Novo nome da fonte" />
        </label>
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => void submit()} disabled={busy || !name.trim() || name.trim() === current}>
            Renomear
          </button>
        </div>
      </div>
    </div>
  );
}
