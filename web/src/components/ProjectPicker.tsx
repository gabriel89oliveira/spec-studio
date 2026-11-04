import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Browse, WorkspaceInfo } from "../types";
import { btn, btnClaude, input } from "../ui";
import { IconChevron, IconClose } from "./Icons";

type Props = {
  /** Sem `onClose`, é a tela inicial (nenhum projeto aberto). */
  onClose?: () => void;
  info: WorkspaceInfo;
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Escolher a pasta de um projeto existente ou criar um novo a partir do kit. */
export function ProjectPicker({ onClose, info }: Props) {
  const [b, setB] = useState<Browse | null>(null);
  const [typed, setTyped] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(async (p?: string) => {
    try {
      const r = await api.browse(p);
      setB(r);
      setTyped(r.path);
      setError(null);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    if (!info.current) void go(info.home);
    else api.browse().then((r) => go(r.parent ?? r.path), (e) => setError(errText(e)));
  }, [go, info.current, info.home]);

  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const finish = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      window.location.reload();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };

  const body = (
    <div className="flex max-h-full w-full max-w-[720px] flex-col rounded-2xl border border-line bg-sheet shadow-lift" data-testid="project-picker">
      <div className="flex items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{onClose ? "Trocar de projeto" : "Escolha o projeto"}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Abra a pasta de um projeto existente (com CLAUDE.md) ou crie um novo a partir do kit.</p>
        </div>
        {onClose && (
          <button className="rounded-md p-1 text-ink-2 hover:bg-wash" onClick={onClose} aria-label="Fechar">
            <IconClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {info.recent.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Recentes</h2>
            <ul className="space-y-0.5">
              {info.recent.map((r) => (
                <li key={r.path}>
                  <button
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-wash disabled:opacity-50"
                    disabled={busy || r.path === info.current}
                    onClick={() => void finish(() => api.openProject(r.path))}
                  >
                    <span className="text-[13.5px] font-medium text-ink">
                      {r.name}
                      {r.path === info.current && <span className="ml-2 text-xs font-normal text-ink-3">aberto agora</span>}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-3">{r.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Procurar pasta</h2>
          <div className="flex gap-2">
            <input
              className={`${input} font-mono !text-[12.5px]`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void go(typed)}
              aria-label="Caminho da pasta"
              placeholder="Cole ou digite o caminho da pasta"
            />
            <button className={btn} onClick={() => void go(typed)}>
              Ir
            </button>
          </div>
          <div className="mt-2 overflow-hidden rounded-xl border border-line/70">
            <div className="flex items-center justify-between gap-2 border-b border-line/60 bg-wash/50 px-3 py-1.5">
              <button className="text-xs font-medium text-accent disabled:text-ink-3" disabled={!b?.parent} onClick={() => b?.parent && void go(b.parent)}>
                ↑ Pasta acima
              </button>
              {b?.isProject && <span className="rounded-full bg-claude-soft px-2 py-0.5 text-[11px] font-medium text-claude">esta pasta é um projeto</span>}
            </div>
            <ul className="max-h-[240px] overflow-y-auto" data-testid="browse-list">
              {b?.dirs.length === 0 && <li className="px-3 py-3 text-xs italic text-ink-3">Nenhuma subpasta.</li>}
              {b?.dirs.map((d) => (
                <li key={d.path}>
                  <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-wash" onClick={() => void go(d.path)}>
                    <IconChevron className="h-3 w-3 text-ink-3" />
                    {d.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {creating && (
          <section className="space-y-2 rounded-xl border border-line bg-wash/40 p-3.5">
            <label className="block space-y-1">
              <span className="text-xs text-ink-2">Nome do novo projeto (será criado dentro da pasta mostrada acima)</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: DriveB" autoFocus aria-label="Nome do projeto" />
            </label>
            {b && name.trim() && (
              <p className="break-all font-mono text-[11px] text-ink-3">
                {b.path}
                {b.sep}
                {name.trim()}
              </p>
            )}
          </section>
        )}
        {error && (
          <p className="whitespace-pre-wrap rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert" data-testid="picker-error">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-6 py-3">
        {!creating ? (
          <>
            <button className={btn} disabled={busy || !b} onClick={() => setCreating(true)}>
              Criar projeto novo aqui
            </button>
            <button className={btnClaude} disabled={busy || !b?.isProject} onClick={() => b && void finish(() => api.openProject(b.path))} title={b?.isProject ? "" : "A pasta precisa ter um CLAUDE.md na raiz"}>
              Abrir esta pasta
            </button>
          </>
        ) : (
          <>
            <button className={btn} disabled={busy} onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button className={btnClaude} disabled={busy || !b || !name.trim()} onClick={() => b && void finish(() => api.newProject(b.path, name))}>
              Criar e abrir
            </button>
          </>
        )}
      </div>
    </div>
  );

  return onClose ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" role="dialog" aria-modal="true" aria-label="Trocar de projeto">
      {body}
    </div>
  ) : (
    <div className="flex h-screen items-center justify-center bg-[rgb(var(--canvas))] p-6">{body}</div>
  );
}
