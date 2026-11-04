import type { Project } from "../types";
import { formatCost } from "../ui";

type Props = {
  project: Project | null;
  busy: boolean;
  lastError: string | null;
  connected: boolean;
};

export function Header({ project, busy, lastError, connected }: Props) {
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-panel px-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-[13px] font-medium text-ink-3">Spec Studio</span>
        <span className="text-line-strong" aria-hidden="true">
          /
        </span>
        <span className="truncate text-[16px] font-semibold leading-none text-ink" title={project?.projectDir}>
          {project?.name ?? "…"}
        </span>
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
      </div>
    </header>
  );
}
