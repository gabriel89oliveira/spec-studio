/** Leitura e escrita da tabela "## Ações" de docs/permissoes.md. */
export type MatrixTable = { header: string[]; rows: string[][] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const FIXED = ["acao", "modulo", "condicao"];
export const isFixed = (h: string) => FIXED.includes(norm(h));

const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function findSection(content: string, name: string): { start: number; end: number } | null {
  const lines = content.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.*)$/);
    if (!m) continue;
    if (start >= 0) return { start, end: i };
    if (norm(m[1].replace(/^\d+\.\s*/, "")) === norm(name)) start = i;
  }
  return start >= 0 ? { start, end: lines.length } : null;
}

export function readMatrix(content: string): MatrixTable {
  const sec = findSection(content, "Ações");
  const lines = content.split("\n").slice(sec ? sec.start + 1 : 0, sec ? sec.end : 0).filter((l) => l.trim().startsWith("|"));
  const data = lines.filter((l) => !/^\|?\s*:?-{2,}/.test(l.replace(/\s/g, ""))).map(cells);
  const [header, ...rows] = data;
  return { header: header ?? ["Ação", "Módulo", "Condição"], rows: rows.map((r) => header?.map((_, i) => r[i] ?? "") ?? r) };
}

const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function writeMatrix(content: string, t: MatrixTable): string {
  const table = [`| ${t.header.map(esc).join(" | ")} |`, `|${t.header.map(() => "---").join("|")}|`, ...t.rows.map((r) => `| ${t.header.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`)];
  const lines = content.split("\n");
  const sec = findSection(content, "Ações");
  if (!sec) return `${content.replace(/\n*$/, "\n")}\n## Ações\n${table.join("\n")}\n`;
  let a = sec.start + 1;
  while (a < sec.end && !lines[a].trim().startsWith("|")) a++;
  let b = a;
  while (b < sec.end && lines[b].trim().startsWith("|")) b++;
  if (a >= sec.end) {
    a = sec.start + 1;
    b = a;
  }
  return [...lines.slice(0, a), ...table, ...lines.slice(b)].join("\n");
}

/** Primeira coluna da tabela "Perfis de usuário" do Conceito. */
export function conceptProfiles(content: string): string[] {
  const sec = findSection(content, "Perfis de usuário");
  if (!sec) return [];
  const rows = content.split("\n").slice(sec.start + 1, sec.end).filter((l) => l.trim().startsWith("|") && !/^\|?\s*:?-{2,}/.test(l.replace(/\s/g, "")));
  return rows.slice(1).map((l) => cells(l)[0]).filter(Boolean);
}
