/**
 * Marcas das propostas de uma ficha de fonte, editadas direto no texto:
 * "- [ ] texto" pendente, "- [x] texto" aceita, "- ~~texto~~" descartada.
 */
export type TaskAction = "toggle" | "discard" | "restore";

export function applyTask(content: string, line: number, action: TaskAction): string | null {
  const ls = content.split("\n");
  const l = ls[line - 1];
  if (l === undefined) return null;
  let next: string | null = null;
  if (action === "toggle") {
    const m = l.match(/^(\s*[-*]\s+)\[( |x)\](\s.*)$/i);
    if (m) next = `${m[1]}[${m[2] === " " ? "x" : " "}]${m[3]}`;
  } else if (action === "discard") {
    const m = l.match(/^(\s*[-*]\s+)\[[ x]\]\s+(.*\S)\s*$/i);
    if (m) next = `${m[1]}~~${m[2].replace(/~~/g, "")}~~`;
  } else {
    const m = l.match(/^(\s*[-*]\s+)~~(.*)~~\s*$/);
    if (m) next = `${m[1]}[ ] ${m[2]}`;
  }
  if (next === null) return null;
  ls[line - 1] = next;
  return ls.join("\n");
}
