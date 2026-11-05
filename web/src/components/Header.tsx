import type { Project } from "../types";
import { formatCost } from "../ui";

type Props = {
  project: Project | null;
  busy: boolean;
  lastError: string | null;
  connected: boolean;
  onSwitch: () => void;
  onSettings: () => void;
};

export function Header({ project, busy, lastError, connected, onSwitch, onSettings }: Props) {
  let label = "Pronto";
  let dot = "bg-claude";
  if (!connected) {
    label = "Sem conexão com o servidor";
    dot = "bg-danger";
  } else if (project && !project.claude.enabled) {
    label = "Claude desativado";
    dot = "bg-ink-3";
  } else if (busy) {
    label = "Claude trabalhando";
    dot = "bg-mark animate-pulse";
  } else if (lastError) {
    label = "Erro no último pedido";
    dot = "bg-danger";
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line/70 bg-panel px-5">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-[13px] font-medium text-ink-3">Spec Studio</span>
        <span className="text-line-strong" aria-hidden="true">
          /
        </span>
        <button
          className="flex min-w-0 items-center gap-1.5 self-center rounded-lg px-2 py-1 -mx-2 text-[16px] font-semibold leading-none text-ink hover:bg-wash"
          title={`${project?.projectDir ?? ""}\nClique para trocar de projeto`}
          onClick={onSwitch}
          aria-label="Trocar de projeto"
          data-testid="switch-project"
        >
          <span className="truncate">{project?.name ?? "…"}</span>
          <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" />
          </svg>
        </button>
        {project?.branch && <span className="text-xs text-ink-3">{project.branch}</span>}
      </div>

      <div className="flex items-center gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-2" title={lastError ?? undefined} data-testid="claude-status">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </span>
        {project?.claude.mock ? (
          <span
            className="rounded-full border border-mark/60 bg-mark-soft px-2.5 py-0.5 font-medium text-mark-ink"
            title="Claude simulado, sem custo. Tire CLAUDE_MOCK=true do .env para usar o Claude de verdade."
            data-testid="mock-badge"
          >
            modo simulado
          </span>
        ) : (
          project?.claude.enabled && <span className="text-ink-3">{project.claude.model}</span>
        )}
        {project?.claude.lastCostUsd != null && (
          <span className="tabular-nums text-ink-3" data-testid="cost" title="Custo do último pedido ao Claude">
            custo: {formatCost(project.claude.lastCostUsd)}
          </span>
        )}
        <button className="rounded-md p-1.5 text-ink-2 hover:bg-wash" onClick={onSettings} aria-label="Configurações" title="Configurações" data-testid="open-settings">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
