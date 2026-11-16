// Botões do guia G4: 13px/500, cantos de 6px, ícone + texto com 8px de espaço.
// A altura do guia é 36px; aqui fica em 32px porque os botões vivem em barras e painéis densos.
const base =
  "inline-flex items-center justify-center gap-2 rounded-md h-8 text-label font-medium whitespace-nowrap " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Ação secundária: fundo branco, borda fina e sombra mínima. */
export const btn = `${base} px-3 border border-line bg-sheet text-ink shadow-xs hover:border-line-strong hover:bg-wash`;

/** Ação principal (quase preta): uma por tela. */
export const btnPrimary = `${base} px-3 border border-accent bg-accent text-accent-ink hover:border-accent-hover hover:bg-accent-hover`;

/** Ação que aciona o Claude: no guia, é a mesma ação principal. */
export const btnClaude = btnPrimary;

/** Ação de texto, sem caixa. */
export const btnGhost = `${base} px-2.5 text-ink-2 hover:bg-wash hover:text-ink`;

export const btnDanger = `${base} px-3 border border-danger bg-danger text-sheet hover:bg-danger/90`;

export const input =
  "w-full rounded-lg border border-line-strong bg-sheet px-3 py-2 text-sm text-ink placeholder:text-ink-3 " +
  "hover:border-ink-3/60 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-60";

/** Aba sublinhada (Tabs do guia): ativa em ink com traço de 2px na cor principal. */
export const tabUnderline = (active: boolean) =>
  `relative flex h-10 items-center gap-1.5 px-0.5 text-label font-medium transition-colors ${
    active
      ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
      : "text-ink-3 hover:text-ink"
  }`;

/** Segmento (SegmentedControl do guia): ativo em bg-subtle. */
export const segment = (active: boolean) =>
  `h-7 rounded-md px-3 text-label font-medium transition-colors disabled:opacity-45 ${
    active ? "bg-wash text-ink" : "text-ink-3 hover:text-ink"
  }`;

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
