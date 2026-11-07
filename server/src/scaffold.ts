import fs from "node:fs";
import path from "node:path";
import { ARCH_DIR } from "./architecture.js";

const ARCH_TEMPLATE = "docs/_templates/servico.md";

const BLOCK = `
## Arquitetura

A arquitetura do projeto fica em \`docs/arquitetura/\`. Leia \`docs/arquitetura/README.md\` antes de mexer nela. IDs: serviços \`SV01\`, requisitos não funcionais \`RNF-01\`.
`;

/** Copia para o projeto os arquivos de arquitetura do kit que ainda não existem. Nunca sobrescreve. */
export function scaffoldArchitecture(root: string, kit: string): string[] {
  const created: string[] = [];
  const copy = (rel: string) => {
    const from = path.join(kit, ...rel.split("/"));
    const to = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(from) || fs.existsSync(to)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    created.push(rel);
  };
  const walk = (rel: string) => {
    const dir = path.join(kit, ...rel.split("/"));
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else copy(r);
    }
  };
  const fresh = !fs.existsSync(path.join(root, ...ARCH_DIR.split("/")));
  walk(ARCH_DIR);
  copy(ARCH_TEMPLATE);
  const claude = path.join(root, "CLAUDE.md");
  if (fresh && fs.existsSync(claude)) {
    const c = fs.readFileSync(claude, "utf8");
    if (!/docs\/arquitetura/.test(c)) {
      fs.writeFileSync(claude, `${c.replace(/\s*$/, "\n")}${BLOCK}`, "utf8");
      created.push("CLAUDE.md");
    }
  }
  return created;
}
