import fs from "node:fs";
import path from "node:path";

/** Pastas que nunca podem ser lidas ou gravadas pela API nem pelo agente. */
const BLOCKED_DIRS = new Set([".git", ".spec-studio", "node_modules"]);

export class PathError extends Error {
  status = 400;
}

export type PathCheck = { ok: true; abs: string; rel: string } | { ok: false; reason: string };

/**
 * Caminho de `target` relativo a `root`, ou null se estiver fora.
 * `p` permite testar a lógica do Windows (path.win32) em qualquer sistema.
 */
export function relativeInside(root: string, target: string, p: path.PlatformPath = path): string | null {
  const rel = p.relative(root, target);
  if (rel === "") return "";
  if (p.isAbsolute(rel)) return null; // outro disco no Windows
  if (rel === ".." || rel.startsWith(`..${p.sep}`) || rel.startsWith("../")) return null;
  return rel;
}

export function toPosix(rel: string): string {
  return rel.split(/[\\/]+/).filter(Boolean).join("/");
}

/** Verdadeiro para .git/, .spec-studio/, node_modules/ e arquivos .env. */
export function isBlocked(rel: string): boolean {
  const segs = rel
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (segs.some((s) => BLOCKED_DIRS.has(s))) return true;
  const base = segs[segs.length - 1] ?? "";
  return base === ".env" || base.startsWith(".env.");
}

/** Verificação só pelo texto do caminho (sem acessar o disco). */
export function checkLexical(root: string, input: unknown, p: path.PlatformPath = path): PathCheck {
  if (typeof input !== "string" || input.trim() === "") return { ok: false, reason: "caminho vazio" };
  if (input.includes("\0")) return { ok: false, reason: "caminho inválido" };
  const abs = p.resolve(root, input);
  const rel = relativeInside(root, abs, p);
  if (rel === null) return { ok: false, reason: "caminho fora do projeto" };
  if (isBlocked(rel)) return { ok: false, reason: "caminho em área protegida" };
  return { ok: true, abs, rel: toPosix(rel) };
}

/**
 * Confere o caminho real no disco, seguindo links simbólicos.
 * Para arquivos que ainda não existem, confere o ancestral existente mais próximo.
 * `root` deve ser um caminho real (fs.realpathSync.native).
 */
export function realInside(root: string, abs: string): boolean {
  let cur = abs;
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync.native(cur);
  } catch {
    return false;
  }
  const rel = relativeInside(root, real);
  return rel !== null && !isBlocked(rel);
}

function hasParentSegment(input: string): boolean {
  return input.split(/[\\/]+/).some((s) => s === "..");
}

function looksAbsolute(input: string): boolean {
  return path.posix.isAbsolute(input) || path.win32.isAbsolute(input) || /^[a-zA-Z]:/.test(input);
}

/**
 * Caminho vindo da API: relativo, sem "..", apenas .md, dentro do projeto e fora das áreas protegidas.
 * Lança PathError (HTTP 400) quando inválido.
 */
export function resolveDocPath(root: string, input: unknown): { abs: string; rel: string } {
  if (typeof input !== "string" || input.trim() === "") throw new PathError("Informe o caminho do arquivo");
  if (looksAbsolute(input)) throw new PathError("Use um caminho relativo ao projeto");
  if (hasParentSegment(input)) throw new PathError('Caminho com ".." não é permitido');
  if (!input.toLowerCase().endsWith(".md")) throw new PathError("Apenas arquivos .md são permitidos");
  const check = checkLexical(root, input);
  if (!check.ok) throw new PathError(`Caminho inválido: ${check.reason}`);
  if (!realInside(root, check.abs)) throw new PathError("Caminho inválido: fora da área permitida");
  return { abs: check.abs, rel: check.rel };
}

/** Mesma regra, para o agente: caminhos absolutos são normais, mas o destino real precisa ser permitido. */
export function checkAgentPath(root: string, input: unknown, p: path.PlatformPath = path): PathCheck {
  const check = checkLexical(root, input, p);
  if (!check.ok) return check;
  if (p === path && !realInside(root, check.abs)) return { ok: false, reason: "caminho fora da área permitida" };
  return check;
}

/** Padrões de busca (Glob/Grep) não podem ser absolutos nem subir de pasta. */
export function checkAgentPattern(pattern: unknown): string | null {
  if (pattern === undefined || pattern === null) return null;
  if (typeof pattern !== "string") return "padrão inválido";
  if (looksAbsolute(pattern)) return "padrão absoluto não é permitido";
  if (hasParentSegment(pattern)) return 'padrão com ".." não é permitido';
  if (isBlocked(pattern.replace(/\*+/g, "x"))) return "padrão em área protegida";
  return null;
}
