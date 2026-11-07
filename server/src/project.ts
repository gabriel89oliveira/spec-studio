import fs from "node:fs";
import path from "node:path";
import { analyzeArchitecture, ARCH_DIR, ARCH_PATHS, rnfsOf, type Rnf } from "./architecture.js";
import { analyzeDoc, matrixOf, norm, sectionsOf, tableOf, type Guide } from "./guide.js";
import { toPosix } from "./paths.js";

/**
 * Modelo do projeto: lê docs/ uma vez e entrega módulos, features, decisões, fontes, matriz e Conceito
 * já interpretados. Serve à verificação de consistência, à visão geral, às decisões e ao pacote para dev.
 */

export type Doc = { id: string; name: string; path: string; content: string; guide: Guide | null };
export type Feature = Doc & {
  moduleId?: string;
  declared?: string;
  profiles: string[];
  actions: { name: string; profiles: string[] }[];
  doubts: string[];
  hasPermissions: boolean;
};
export type Decision = {
  id: string;
  title: string;
  status: string;
  affects: string[];
  decider: string;
  deadline: string | null;
  context: string;
  options: string[];
  decision: string;
  decidedOn: string;
  decidedBy: string;
  history: string[];
};
export type Architecture = {
  /** A pasta docs/arquitetura existe (a entrevista de arquitetura já foi iniciada ou o kit trouxe os modelos). */
  exists: boolean;
  /** Conteúdo dos quatro documentos do projeto; nulo se o arquivo não existe. */
  docs: { visao: string | null; dados: string | null; infra: string | null; rnf: string | null };
  services: Doc[];
  rnfs: Rnf[];
  guide: Guide;
};
export type Project = {
  root: string;
  concept: { content: string; guide: Guide | null; profiles: string[]; moduleIds: string[] } | null;
  matrix: { content: string; guide: Guide | null; profiles: string[]; actions: string[] } | null;
  modules: Doc[];
  features: Feature[];
  sources: Doc[];
  decisions: Decision[];
  architecture: Architecture;
};

const lines = (s: string | undefined) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const bulletText = (s: string | undefined) => lines(s).filter((l) => /^[-*]\s+\S/.test(l)).map((l) => l.replace(/^[-*]\s+(\[[ x]\]\s+)?/i, ""));

function read(root: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
  } catch {
    return null;
  }
}

function listMd(root: string, dir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(root, ...dir.split("/")), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => `${dir}/${e.name}`)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  } catch {
    return [];
  }
}

export function field(content: string, name: string): string | undefined {
  const raw = content.slice(0, 4000).match(new RegExp(`^\\|\\s*${name}\\s*\\|([^\\n]*)$`, "im"))?.[1];
  return raw?.replace(/\|\s*$/, "").trim() || undefined;
}

function docOf(root: string, rel: string, idRe: RegExp): Doc | null {
  const content = read(root, rel);
  if (content === null) return null;
  const base = rel.split("/").pop()!.replace(/\.md$/i, "");
  const id = (base.match(idRe)?.[0] ?? base).toUpperCase();
  const h1 = content.match(/^#\s+(.+)$/m)?.[1] ?? base;
  const name = h1.replace(/^[A-Z]+\d+\s*[—-]\s*/i, "").trim() || base;
  return { id, name, path: rel, content, guide: analyzeDoc(rel, content) };
}

/** "Ação — Perfil 1, Perfil 2" */
function parseActions(body: string | undefined): { name: string; profiles: string[] }[] {
  return bulletText(body).map((t) => {
    const [name, rest] = t.split(/\s+[—–-]\s+/, 2);
    return { name: name.trim(), profiles: (rest ?? "").split(/[,;]/).map((p) => p.trim()).filter(Boolean) };
  });
}

export function parseDecisions(content: string): Decision[] {
  const out: Decision[] = [];
  const re = /^##\s+(D-\d+)\s*[—–-]\s*(.*)$/gm;
  const heads: { id: string; title: string; start: number; end: number }[] = [];
  for (let m = re.exec(content); m; m = re.exec(content)) heads.push({ id: m[1].toUpperCase(), title: m[2].trim(), start: m.index + m[0].length, end: m.index });
  heads.forEach((h, i) => {
    const body = content.slice(h.start, heads[i + 1]?.end ?? content.length).replace(/\n---\s*$/m, "");
    const f = (label: string) => body.match(new RegExp(`\\*\\*${label}:?\\*\\*:?\\s*([^\\n]*)`, "i"))?.[1]?.trim() ?? "";
    const block = (label: string) => {
      const m = body.match(new RegExp(`\\*\\*${label}:?\\*\\*:?[ \\t]*([\\s\\S]*?)(?=\\n\\s*\\n|\\n\\*\\*|$)`, "i"));
      return m?.[1]?.trim() ?? "";
    };
    const sec = (label: string) => {
      const m = body.match(new RegExp(`\\*\\*${label}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\s*\\n\\*\\*|\\n\\*\\*|$)`, "i"));
      return lines(m?.[1]).map((l) => l.replace(/^(\d+\.|[-*])\s+/, ""));
    };
    const deadlineRaw = f("Prazo");
    const iso = deadlineRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    const br = deadlineRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const decidedLine = f("Decidido em");
    out.push({
      id: h.id,
      title: h.title,
      status: f("Status") || "Aberta",
      affects: (f("Afeta").match(/\b(?:SV|[MFS])\d+\b/gi) ?? []).map((x) => x.toUpperCase()),
      decider: f("Quem decide"),
      deadline: iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : null,
      context: block("Contexto"),
      options: sec("Opções"),
      decision: block("Decisão"),
      decidedOn: decidedLine.split("·")[0].trim(),
      decidedBy: (decidedLine.match(/Por:\*\*\s*(.*)$/i)?.[1] ?? "").trim(),
      history: sec("Histórico"),
    });
  });
  return out;
}

export function loadProject(root: string): Project {
  const conceptRaw = read(root, "docs/CONCEITO.md");
  const concept = conceptRaw === null ? null : (() => {
    const sec = sectionsOf(conceptRaw);
    return {
      content: conceptRaw,
      guide: analyzeDoc("docs/CONCEITO.md", conceptRaw),
      profiles: tableOf(sec.get("perfis de usuario")).rows.map((r) => r[0]).filter(Boolean),
      moduleIds: tableOf(sec.get("mapa de modulos")).rows.map((r) => (r[0] ?? "").toUpperCase()).filter((x) => /^M\d+$/.test(x)),
    };
  })();

  const matrixRaw = read(root, "docs/permissoes.md");
  const matrix = matrixRaw === null ? null : (() => {
    const m = matrixOf(matrixRaw);
    const ai = m.header.findIndex((h) => norm(h) === "acao");
    return { content: matrixRaw, guide: analyzeDoc("docs/permissoes.md", matrixRaw), profiles: m.profiles, actions: m.rows.map((r) => r[ai < 0 ? 0 : ai]).filter(Boolean) };
  })();

  const modules = listMd(root, "docs/modulos").map((p) => docOf(root, p, /^M\d+/i)).filter((d): d is Doc => !!d);
  const sources = listMd(root, "docs/fontes").map((p) => docOf(root, p, /^S\d+/i)).filter((d): d is Doc => !!d);
  const features: Feature[] = listMd(root, "docs/features")
    .map((p) => docOf(root, p, /^F\d+/i))
    .filter((d): d is Doc => !!d)
    .map((d) => {
      const sec = sectionsOf(d.content);
      const mod = field(d.content, "M[óo]dulo")?.match(/\bM(\d+)\b/i);
      return {
        ...d,
        moduleId: mod && !/^0+$/.test(mod[1]) ? `M${mod[1]}` : undefined,
        declared: field(d.content, "Etapa"),
        profiles: bulletText(sec.get("quem usa")),
        actions: parseActions(sec.get("permissoes")),
        doubts: bulletText(sec.get("duvidas em aberto")).filter((t) => !/^\[x\]|^~~/i.test(t)),
        hasPermissions: sec.has("permissoes"),
      };
    });

  const decRaw = read(root, "docs/decisoes.md");

  const services = listMd(root, `${ARCH_DIR}/servicos`).map((p) => docOf(root, p, /^SV\d+/i)).filter((d): d is Doc => !!d);
  const docs = { visao: read(root, ARCH_PATHS.visao), dados: read(root, ARCH_PATHS.dados), infra: read(root, ARCH_PATHS.infra), rnf: read(root, ARCH_PATHS.rnf) };
  const moduleIds = [...new Set([...modules.map((m) => m.id), ...(concept?.moduleIds ?? [])])].sort();
  const architecture: Architecture = {
    exists: fs.existsSync(path.join(root, ...ARCH_DIR.split("/"))),
    docs,
    services,
    rnfs: rnfsOf(docs.rnf),
    guide: analyzeArchitecture({ ...docs, services: services.map((x) => ({ id: x.id, path: x.path, content: x.content })), moduleIds }),
  };
  return { root, concept, matrix, modules, features, sources, decisions: decRaw ? parseDecisions(decRaw) : [], architecture };
}

export const relPath = (root: string, abs: string) => toPosix(path.relative(root, abs));
