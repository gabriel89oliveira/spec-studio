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

export function slugify(s: string): string {
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

export type RenameResult = { oldFicha: string; ficha: string; oldOriginal: string | null; original: string | null; name: string; updatedRefs: string[] };

function walkMd(dir: string, root: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "originais") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(abs, root, out);
    else if (e.name.toLowerCase().endsWith(".md")) out.push(abs);
  }
  return out;
}

/**
 * Renomeia uma fonte: título e arquivo da ficha, arquivo original e referências ao nome antigo nos docs.
 * O ID (S01…) nunca muda, então as propostas e origens que citam o ID continuam valendo.
 */
export function renameSource(root: string, fichaRel: string, rawName: string): RenameResult {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) throw new HttpError(400, "Informe o novo nome da fonte");
  if (name.length > 120) throw new HttpError(400, "O nome pode ter no máximo 120 caracteres");
  const m = fichaRel.match(/^docs\/fontes\/(S\d+)-([^/]+)\.md$/i);
  if (!m) throw new HttpError(400, "Só fichas de fonte (docs/fontes/Sxx-nome.md) podem ser renomeadas");
  const id = m[1].toUpperCase();
  const oldBase = `${m[1]}-${m[2]}`;
  const slug = slugify(name) || "fonte";
  const newBase = `${id}-${slug}`;
  const abs = (rel: string) => path.join(root, ...rel.split("/"));
  if (!fs.existsSync(abs(fichaRel))) throw new HttpError(404, "Ficha não encontrada");

  const ficha = `docs/fontes/${newBase}.md`;
  if (ficha !== fichaRel && fs.existsSync(abs(ficha))) throw new HttpError(409, "Já existe uma fonte com esse nome");

  let text = fs.readFileSync(abs(fichaRel), "utf8");
  const origName = text.match(/^\|\s*Original\s*\|\s*([^|\n]+?)\s*\|/im)?.[1];
  const oldOriginal = origName ? `docs/fontes/${origName}` : null;
  const ext = origName ? path.extname(origName) : "";
  const original = oldOriginal ? `docs/fontes/originais/${newBase}${ext}` : null;
  if (original && original !== oldOriginal && fs.existsSync(abs(original))) throw new HttpError(409, "Já existe um arquivo original com esse nome");

  const oldName = text.match(/^#\s+S\d+\s*[—-]\s*(.*)$/m)?.[1]?.trim();
  if (ficha === fichaRel && oldName === name) throw new HttpError(400, "O nome é o mesmo");

  text = /^#\s+/m.test(text) ? text.replace(/^#\s+.*$/m, `# ${id} — ${name}`) : `# ${id} — ${name}\n\n${text}`;
  if (original && oldOriginal) text = text.replace(/^(\|\s*Original\s*\|)\s*[^|\n]+?\s*\|/im, `$1 ${original.replace("docs/fontes/", "")} |`);

  if (oldOriginal && original && oldOriginal !== original && fs.existsSync(abs(oldOriginal))) fs.renameSync(abs(oldOriginal), abs(original));
  fs.writeFileSync(abs(fichaRel), text, "utf8");
  if (ficha !== fichaRel) fs.renameSync(abs(fichaRel), abs(ficha));

  // Referências ao nome antigo (caminho ou nome de arquivo) em outros documentos.
  const updatedRefs: string[] = [];
  if (oldBase !== newBase) {
    for (const file of walkMd(path.join(root, "docs"), root)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (rel === ficha) continue;
      const before = fs.readFileSync(file, "utf8");
      if (!before.includes(oldBase)) continue;
      fs.writeFileSync(file, before.split(oldBase).join(newBase), "utf8");
      updatedRefs.push(rel);
    }
  }
  return { oldFicha: fichaRel, ficha, oldOriginal: oldOriginal && original !== oldOriginal ? oldOriginal : null, original, name, updatedRefs };
}
