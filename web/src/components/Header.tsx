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
  let dot = "bg-emerald-500";
  if (!connected) {
    label = "Sem conexão com o servidor";
    dot = "bg-red-500";
  } else if (project && !project.claude.enabled) {
    label = "Claude desativado";
    dot = "bg-zinc-400";
  } else if (busy) {
    label = "Trabalhando…";
    dot = "bg-amber-500 animate-pulse";
  } else if (lastError) {
    label = "Erro";
    dot = "bg-red-500";
  }

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{project?.name ?? "Spec Studio"}</span>
        {project?.branch && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">{project.branch}</span>}
        <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400" title={lastError ?? undefined} data-testid="claude-status">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {project?.claude.mock ? (
          <span
            className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
            title="Claude simulado, sem custo. Tire CLAUDE_MOCK=true do .env para usar o Claude de verdade."
            data-testid="mock-badge"
          >
            modo simulado
          </span>
        ) : (
          project?.claude.enabled && <span>{project.claude.model}</span>
        )}
        {project?.claude.lastCostUsd != null && <span data-testid="cost">custo: {formatCost(project.claude.lastCostUsd)}</span>}
      </div>
    </header>
  );
}
