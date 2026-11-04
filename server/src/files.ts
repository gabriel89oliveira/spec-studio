import fs from "node:fs";
import path from "node:path";
import { hashContent, HttpError } from "./util.js";

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
  openComments?: number;
  /** Só em docs/features/: o módulo declarado na tabela do topo (ex.: "M01"). */
  module?: string;
};

/**
 * Lê o módulo da linha "| Módulo | ... |" no topo da feature.
 * Aceita "M01", "[M01](../modulos/M01-x.md)" ou "M01 — Nome"; o placeholder do template ("[M00]") não conta.
 */
export function moduleOf(content: string): string | undefined {
  const row = content.slice(0, 4000).match(/^\|\s*M[óo]dulo\s*\|([^\n]*)$/im)?.[1];
  const id = row?.match(/\bM(\d+)\b/i);
  if (!id || /^0+$/.test(id[1])) return undefined;
  return `M${id[1]}`;
}

function readModule(abs: string): string | undefined {
  try {
    return moduleOf(fs.readFileSync(abs, "utf8"));
  } catch {
    return undefined;
  }
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) return a.type === "file" ? -1 : 1;
  const au = a.name.startsWith("_");
  const bu = b.name.startsWith("_");
  if (au !== bu) return au ? 1 : -1;
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });
}

function walk(root: string, relDir: string, counts: Record<string, number>): TreeNode[] {
  const absDir = path.join(root, ...relDir.split("/"));
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = `${relDir}/${e.name}`;
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: rel, type: "dir", children: walk(root, rel, counts) });
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      const node: TreeNode = { name: e.name, path: rel, type: "file", openComments: counts[rel] ?? 0 };
      if (relDir === "docs/features") {
        const mod = readModule(path.join(absDir, e.name));
        if (mod) node.module = mod;
      }
      nodes.push(node);
    }
  }
  return nodes.sort(sortNodes);
}

/** CLAUDE.md e todos os .md de docs/, com a contagem de comentários abertos. */
export function listTree(root: string, counts: Record<string, number>): TreeNode[] {
  const tree: TreeNode[] = [];
  if (fs.existsSync(path.join(root, "CLAUDE.md"))) {
    tree.push({ name: "CLAUDE.md", path: "CLAUDE.md", type: "file", openComments: counts["CLAUDE.md"] ?? 0 });
  }
  if (fs.existsSync(path.join(root, "docs"))) {
    tree.push({ name: "docs", path: "docs", type: "dir", children: walk(root, "docs", counts) });
  }
  return tree;
}

export function readDoc(abs: string, rel: string): { path: string; content: string; hash: string } {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new HttpError(404, `Arquivo não encontrado: ${rel}`);
  const content = fs.readFileSync(abs, "utf8");
  return { path: rel, content, hash: hashContent(content) };
}

export function currentHash(abs: string): string | null {
  try {
    return hashContent(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/** Grava se o arquivo não mudou desde `baseHash`; senão lança 409 com o hash atual. */
export function writeDoc(abs: string, rel: string, content: string, baseHash: string): { hash: string } {
  const now = currentHash(abs);
  if (now === null) throw new HttpError(404, `Arquivo não encontrado: ${rel}`);
  if (now !== baseHash) {
    throw new HttpError(409, "O arquivo foi alterado desde que você o abriu", { conflict: true, hash: now });
  }
  fs.writeFileSync(abs, content, "utf8");
  return { hash: hashContent(content) };
}
