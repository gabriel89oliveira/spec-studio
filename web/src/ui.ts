const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg h-[30px] text-xs font-medium whitespace-nowrap " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-45";

/** Ação secundária: contorno discreto. */
export const btn = `${base} px-3 border border-line bg-sheet text-ink-2 hover:border-line-strong hover:text-ink`;

/** Ação principal do usuário (azul da planta). */
export const btnPrimary = `${base} px-3 bg-accent text-accent-ink hover:bg-accent/90`;

/** Ação que aciona o Claude (verde-petróleo, a cor de tudo que o Claude faz). */
export const btnClaude = `${base} px-3 bg-claude text-claude-ink hover:bg-claude/90`;

/** Ação de texto, sem caixa. */
export const btnGhost = `${base} px-2.5 text-ink-2 hover:bg-wash hover:text-ink`;

export const btnDanger = `${base} px-3 bg-danger text-sheet hover:bg-danger/90`;

export const input =
  "w-full rounded-lg border border-line bg-sheet px-3 py-2 text-sm text-ink placeholder:text-ink-3 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `hoje, ${time}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

export function formatCost(usd: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(usd);
}

const TOOL_LABEL: Record<string, string> = {
  Read: "Leu",
  Edit: "Editou",
  Write: "Escreveu",
  Glob: "Procurou arquivos",
  Grep: "Buscou no texto",
};

export function toolLabel(tool: string, path?: string): string {
  const verb = TOOL_LABEL[tool] ?? tool;
  return path ? `${verb} ${path}` : verb;
}

/** Nome de exibição de um arquivo: sem a extensão .md. */
export function displayName(fileName: string): string {
  return fileName.replace(/\.md$/i, "");
}
