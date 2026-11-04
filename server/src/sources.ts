import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./util.js";

export const SOURCE_TYPES = {
  reuniao: "Reunião (transcrição)",
  documento: "Documento do cliente",
  norma: "Norma ou legislação",
  outro: "Outro",
} as const;
export type SourceType = keyof typeof SOURCE_TYPES;

const EXTS = new Set([".pdf", ".md", ".txt"]);
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function nextSourceId(root: string): string {
  let max = 0;
  for (const dir of ["docs/fontes", "docs/fontes/originais"]) {
    try {
      for (const name of fs.readdirSync(path.join(root, ...dir.split("/")))) {
        const n = name.match(/^S(\d+)/i);
        if (n) max = Math.max(max, Number(n[1]));
      }
    } catch {
      /* pasta ainda não existe */
    }
  }
  return `S${String(max + 1).padStart(2, "0")}`;
}

export type SourceInput = {
  name: string;
  type: SourceType;
  fileName?: string;
  encoding: "base64" | "text";
  content: string;
};

/** Guarda o original e cria a ficha vazia da fonte. Quem preenche a ficha é o Claude. */
export function saveSource(root: string, input: SourceInput, now = new Date()): { ficha: string; original: string } {
  const ext = input.fileName ? path.extname(input.fileName).toLowerCase() : ".txt";
  if (!EXTS.has(ext)) throw new HttpError(400, "Formato não suportado. Use PDF, Markdown (.md) ou texto (.txt).");
  const data = input.encoding === "base64" ? Buffer.from(input.content, "base64") : Buffer.from(input.content, "utf8");
  if (data.length === 0) throw new HttpError(400, "O arquivo está vazio");
  if (data.length > MAX_SOURCE_BYTES) throw new HttpError(413, "Arquivo maior que 25 MB");
  if (ext === ".pdf" && data.subarray(0, 4).toString("latin1") !== "%PDF") throw new HttpError(400, "Este arquivo não parece ser um PDF");

  const id = nextSourceId(root);
  const slug = slugify(input.name) || "fonte";
  const original = `docs/fontes/originais/${id}-${slug}${ext}`;
  const ficha = `docs/fontes/${id}-${slug}.md`;
  fs.mkdirSync(path.join(root, "docs", "fontes", "originais"), { recursive: true });
  fs.writeFileSync(path.join(root, ...original.split("/")), data);

  const date = now.toLocaleDateString("pt-BR");
  const text =
    `# ${id} — ${input.name.trim()}\n\n` +
    `| Campo | Valor |\n|---|---|\n| Tipo | ${SOURCE_TYPES[input.type]} |\n| Original | ${original.replace("docs/fontes/", "")} |\n| Importada em | ${date} |\n\n` +
    `## Resumo\n\n## Decisões\n\n## Requisitos\n\n## Regras de negócio\n\n## Dúvidas\n\n## Perfis e termos\n`;
  fs.writeFileSync(path.join(root, ...ficha.split("/")), text, "utf8");
  return { ficha, original };
}
