import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { Browse, WorkspaceInfo } from "../types";
import { btn, btnClaude, input } from "../ui";
import { IconChevron, IconClose } from "./Icons";

type Props = {
  /** Sem `onClose`, é a tela inicial (nenhum projeto aberto). */
  onClose?: () => void;
  info: WorkspaceInfo;
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Escolher o projeto: janela de pasta do sistema, projetos recentes e, como plano B, digitar o caminho. */
export function ProjectPicker({ onClose, info }: Props) {
  const [mode, setMode] = useState<"home" | "new">("home");
  const [parent, setParent] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");
  const [b, setB] = useState<Browse | null>(null);

  const startAt = info.current ? undefined : info.home;

  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !waiting && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, waiting]);

  const browse = useCallback(async (p?: string) => {
    try {
      const r = await api.browse(p);
      setB(r);
      setTyped(r.path);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

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

  /** Abre a janela de pastas do sistema. Se não der, cai para o campo de caminho. */
  const pick = async (title: string): Promise<{ path: string; isProject: boolean } | null> => {
    setError(null);
    setWaiting(true);
    try {
      const r = await api.pickFolder(title, startAt);
      return r.path ? { path: r.path, isProject: r.isProject } : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) {
        setError(`${e.message}\nUse o campo abaixo para digitar o caminho.`);
        setManual(true);
        void browse(startAt);
      } else setError(errText(e));
      return null;
    } finally {
      setWaiting(false);
    }
  };

  const openExisting = async () => {
    const r = await pick("Escolha a pasta do projeto");
    if (!r) return;
    if (!r.isProject) {
      setError(`A pasta "${r.path}" não tem um CLAUDE.md na raiz, então não parece um projeto do Spec Studio. Para começar um projeto do zero, use "Criar projeto novo".`);
      return;
    }
    await finish(() => api.openProject(r.path));
  };

  const chooseParent = async () => {
    const r = await pick("Escolha a pasta onde o projeto será criado");
    if (r) {
      setParent(r.path);
      setMode("new");
    }
  };

  const create = () => parent && finish(() => api.newProject(parent, name));

  const body = (
    <div className="flex max-h-full w-full max-w-[640px] flex-col rounded-2xl border border-line bg-sheet shadow-lift" data-testid="project-picker">
      <div className="flex items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{onClose ? "Trocar de projeto" : "Escolha o projeto"}</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Abra uma pasta de projeto existente ou crie um projeto novo a partir do kit.</p>
        </div>
        {onClose && (
          <button className="rounded-md p-1 text-ink-2 hover:bg-wash disabled:opacity-40" onClick={onClose} disabled={waiting} aria-label="Fechar">
            <IconClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {mode === "home" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-xl border border-line bg-sheet px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
                disabled={busy || waiting}
                onClick={() => void openExisting()}
                data-testid="open-existing"
              >
                <div className="text-[14.5px] font-semibold text-ink">Abrir pasta de projeto…</div>
                <div className="mt-1 text-xs leading-snug text-ink-2">Escolha na janela do sistema uma pasta que já tem o CLAUDE.md.</div>
              </button>
              <button
                className="rounded-xl border border-line bg-sheet px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
                disabled={busy || waiting}
                onClick={() => void chooseParent()}
                data-testid="create-new"
              >
                <div className="text-[14.5px] font-semibold text-ink">Criar projeto novo…</div>
                <div className="mt-1 text-xs leading-snug text-ink-2">Escolha onde guardar. O app copia o kit e começa pelo Conceito.</div>
              </button>
            </div>
            {waiting && (
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent" role="status" data-testid="picker-waiting">
                A janela de escolha de pasta foi aberta. Se não a vir, procure na barra de tarefas.
              </p>
            )}

            {info.recent.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Recentes</h2>
                <ul className="space-y-0.5">
                  {info.recent.map((r) => (
                    <li key={r.path}>
                      <button
                        className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-wash disabled:opacity-50"
                        disabled={busy || waiting || r.path === info.current}
                        onClick={() => void finish(() => api.openProject(r.path))}
                      >
                        <span className="shrink-0 text-[13.5px] font-medium text-ink">
                          {r.name}
                          {r.path === info.current && <span className="ml-2 text-xs font-normal text-ink-3">aberto agora</span>}
                        </span>
                        <span className="truncate font-mono text-[11px] text-ink-3" title={r.path}>
                          {r.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink"
                onClick={() => {
                  setManual((v) => !v);
                  if (!b) void browse(startAt);
                }}
                aria-expanded={manual}
              >
                <IconChevron className={`h-3 w-3 transition-transform ${manual ? "rotate-90" : ""}`} />
                Digitar o caminho
              </button>
              {manual && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <input
                      className={`${input} font-mono !text-[12.5px]`}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void browse(typed)}
                      aria-label="Caminho da pasta"
                      placeholder="Cole ou digite o caminho da pasta"
                    />
                    <button className={btn} onClick={() => void browse(typed)}>
                      Ir
                    </button>
                  </div>
                  {b && (
                    <div className="overflow-hidden rounded-xl border border-line/70">
                      <div className="flex items-center justify-between gap-2 border-b border-line/60 bg-wash/50 px-3 py-1.5">
                        <button className="text-xs font-medium text-accent disabled:text-ink-3" disabled={!b.parent} onClick={() => b.parent && void browse(b.parent)}>
                          ↑ Pasta acima
                        </button>
                        <div className="flex items-center gap-2">
                          {b.isProject ? (
                            <button className={btnClaude} disabled={busy} onClick={() => void finish(() => api.openProject(b.path))}>
                              Abrir esta pasta
                            </button>
                          ) : (
                            <button
                              className={btn}
                              disabled={busy}
                              onClick={() => {
                                setParent(b.path);
                                setMode("new");
                              }}
                            >
                              Criar projeto aqui
                            </button>
                          )}
                        </div>
                      </div>
                      <ul className="max-h-[200px] overflow-y-auto" data-testid="browse-list">
                        {b.dirs.length === 0 && <li className="px-3 py-3 text-xs italic text-ink-3">Nenhuma subpasta.</li>}
                        {b.dirs.map((d) => (
                          <li key={d.path}>
                            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-wash" onClick={() => void browse(d.path)}>
                              <IconChevron className="h-3 w-3 text-ink-3" />
                              {d.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="space-y-3" data-testid="new-project">
            <div>
              <div className="text-xs text-ink-2">Pasta onde o projeto será criado</div>
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-wash/40 px-3 py-2">
                <span className="truncate font-mono text-[12px] text-ink" title={parent ?? ""}>
                  {parent}
                </span>
                <button className="shrink-0 text-xs font-medium text-accent disabled:opacity-50" disabled={busy || waiting} onClick={() => void chooseParent()}>
                  Trocar…
                </button>
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-ink-2">Nome do projeto</span>
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && void create()}
                placeholder="Ex.: DriveB"
                autoFocus
                aria-label="Nome do projeto"
              />
            </label>
            {parent && name.trim() && (
              <p className="break-all font-mono text-[11px] text-ink-3">
                {parent}
                {info.sep}
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

      {mode === "new" && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-6 py-3">
          <button
            className={btn}
            disabled={busy}
            onClick={() => {
              setMode("home");
              setError(null);
            }}
          >
            Voltar
          </button>
          <button className={btnClaude} disabled={busy || !parent || !name.trim()} onClick={() => void create()}>
            Criar e abrir
          </button>
        </div>
      )}
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
