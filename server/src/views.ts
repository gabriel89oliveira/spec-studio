import { coveredModules, entitiesOf, vagueSpec } from "./architecture.js";
import { bigSources } from "./bigsource.js";
import { FEATURE_STEPS, norm, sectionsOf } from "./guide.js";
import type { Issue } from "./consistency.js";
import type { Decision, Feature, Project } from "./project.js";
import { HttpError } from "./util.js";

const sectionsOfHasContent = (c: string) => [...sectionsOf(c).values()].some((v) => v.trim().length > 0);

/** Etapa de uma feature: a declarada no arquivo, se for posterior à análise, senão a da análise. */
export function stageOf(f: Feature): string {
  const g = f.guide;
  if (!g) return "Ideia";
  if (g.status) {
    const k = norm(g.status);
    if (k.startsWith("conclu")) return "Concluída";
    if (k.startsWith("cancel")) return "Cancelada";
    if (k.startsWith("em desenv")) return "Em desenvolvimento";
    if (k.startsWith("pronta")) return "Pronta para dev";
  }
  return FEATURE_STEPS[Math.min(Math.max(g.reached - 1, 0), FEATURE_STEPS.length - 1)];
}

const STAGE_ORDER = ["Ideia", "Entendida", "Detalhada", "Pronta para dev", "Em desenvolvimento", "Concluída", "Cancelada"];

export type Overview = {
  name: string;
  concept: { reached: number; steps: string[]; current: string | null } | null;
  matrix: { reached: number; steps: string[]; current: string | null } | null;
  counts: { modules: number; features: number; sources: number; decisionsOpen: number; issues: number; errors: number; doubts: number };
  stages: { stage: string; count: number }[];
  modules: { id: string; name: string; path: string; guide: { reached: number; steps: string[]; current: string | null } | null; features: { id: string; name: string; path: string; stage: string; missing: number; doubts: number }[] }[];
  orphans: { id: string; name: string; path: string; stage: string; missing: number; doubts: number }[];
  decisions: Decision[];
  /** Fontes grandes (fatiadas em peças) e quanto delas já tem destino. */
  sources: { id: string; name: string; path: string; total: number; used: number; discarded: number; pending: number }[];
  architecture: {
    started: boolean;
    guide: { reached: number; steps: string[]; current: string | null; missing: { label: string }[] };
    services: { id: string; name: string; path: string; modules: string[]; guide: { reached: number; steps: string[]; current: string | null } | null }[];
    /** Módulos ainda sem serviço (só quando já há serviços). */
    uncovered: string[];
    /** O que a spec ainda deixa vago; aviso antes da entrevista. */
    warnings: string[];
  };
  next: { text: string; path?: string }[];
};

export function overview(p: Project, issues: Issue[]): Overview {
  const mini = (f: Feature) => ({ id: f.id, name: f.name, path: f.path, stage: stageOf(f), missing: f.guide?.missing.length ?? 0, doubts: f.doubts.length });
  const g = (x: { reached: number; steps: string[]; current: string | null } | null | undefined) => (x ? { reached: x.reached, steps: x.steps, current: x.current } : null);
  const stageCount = new Map<string, number>();
  for (const f of p.features) stageCount.set(stageOf(f), (stageCount.get(stageOf(f)) ?? 0) + 1);
  const known = new Set(p.modules.map((m) => m.id));
  const next: Overview["next"] = [];
  if (!p.concept || (p.concept.guide && p.concept.guide.current)) next.push({ text: `Conceito: ${p.concept?.guide?.missing[0]?.label ?? "criar o Conceito do projeto"}`, path: "docs/CONCEITO.md" });
  const errors = issues.filter((i) => i.severity === "erro");
  if (errors.length) next.push({ text: `Corrigir: ${errors[0].message}`, path: errors[0].files[0] });
  const open = p.decisions.filter((d) => /aberta|discuss/i.test(d.status));
  if (open.length) next.push({ text: `Decidir: ${open[0].id} — ${open[0].title}`, path: "docs/decisoes.md" });
  for (const f of p.features) {
    if (next.length >= 5) break;
    const s = stageOf(f);
    if (["Ideia", "Entendida", "Detalhada"].includes(s) && f.guide?.missing[0]) next.push({ text: `${f.id}: ${f.guide.missing[0].label}`, path: f.path });
  }
  const covered = new Map(p.architecture.services.map((x) => [x.id, coveredModules(x.content)] as const));
  const coveredSet = new Set([...covered.values()].flat());
  const moduleIds = [...new Set([...p.modules.map((m) => m.id), ...(p.concept?.moduleIds ?? [])])];
  const arch = p.architecture;
  const started = arch.services.length > 0 || arch.rnfs.length > 0 || [arch.docs.visao, arch.docs.dados, arch.docs.modelo, arch.docs.infra, arch.docs.exec, arch.docs.transv, arch.docs.testes, arch.docs.riscos].some((c) => !!c && sectionsOfHasContent(c));
  if (started && arch.guide.current && arch.guide.missing[0]) next.push({ text: `Arquitetura: ${arch.guide.missing[0].label}`, path: arch.guide.missing[0].file ?? "docs/arquitetura/visao.md" });
  for (const v of bigSources(p.root)) if (v.pending > 0) next.push({ text: `${v.id}: ${v.pending} de ${v.total} peças da fonte sem destino`, path: v.ficha });
  const conceptSec = p.concept ? sectionsOf(p.concept.content) : new Map<string, string>();
  return {
    name: p.concept?.content.match(/^#\s+(.+?)(?:\s+[—-]\s+Conceito)?\s*$/m)?.[1] ?? "Projeto",
    concept: g(p.concept?.guide),
    matrix: g(p.matrix?.guide),
    counts: {
      modules: p.modules.length,
      features: p.features.length,
      sources: p.sources.length,
      decisionsOpen: open.length,
      issues: issues.length,
      errors: errors.length,
      doubts: p.features.reduce((n, f) => n + f.doubts.length, 0),
    },
    stages: STAGE_ORDER.map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 })).filter((s) => s.count > 0),
    modules: p.modules.map((m) => ({ id: m.id, name: m.name, path: m.path, guide: g(m.guide), features: p.features.filter((f) => f.moduleId === m.id).map(mini) })),
    orphans: p.features.filter((f) => !f.moduleId || !known.has(f.moduleId)).map(mini),
    decisions: p.decisions,
    sources: bigSources(p.root).map((v) => ({ id: v.id, name: v.name, path: v.ficha, total: v.total, used: v.used, discarded: v.discarded, pending: v.pending })),
    architecture: {
      started,
      guide: { reached: arch.guide.reached, steps: arch.guide.steps, current: arch.guide.current, missing: arch.guide.missing.map((m) => ({ label: m.label })) },
      services: arch.services.map((x) => ({ id: x.id, name: x.name, path: x.path, modules: covered.get(x.id) ?? [], guide: g(x.guide) })),
      uncovered: arch.services.length ? moduleIds.filter((id) => !coveredSet.has(id)) : [],
      warnings: vagueSpec({
        conceptCurrent: p.concept?.guide?.current ?? null,
        hasRequirements: !!conceptSec.get("requisitos gerais")?.trim(),
        modules: p.modules.map((m) => ({ id: m.id, reached: m.guide?.reached ?? 0 })),
        decisionsOpen: open.length,
      }),
    },
    next: next.slice(0, 5),
  };
}

/* ---------- Histórias e plano de testes ---------- */

export type Story = { id: string; title: string; criteria: string[] };

export function storiesOf(content: string): Story[] {
  const sec = sectionsOf(content).get("historias de usuario") ?? "";
  const parts = sec.split(/^###\s+/m).slice(1);
  return parts.map((b) => {
    const head = b.split("\n")[0].trim();
    const m = head.match(/^(US-[\w.]+)\s*[—–-]\s*(.*)$/i);
    const crit = b.match(/crit[ée]rios de aceite\**\s*\n([\s\S]*?)(?=\n\*\*|\n###|$)/i)?.[1] ?? "";
    return {
      id: (m?.[1] ?? head).toUpperCase(),
      title: m?.[2] ?? head,
      criteria: crit.split("\n").map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, "")),
    };
  });
}

/** Plano de testes: um caso por critério de aceite, rastreável até a história e a feature. */
export function testPlan(f: Feature): string {
  const out = [`# Plano de testes — ${f.id} ${f.name}`, "", "Cada caso tem um ID (CA-…). Cite-o no nome do teste (ex.: `test_CA_01_1_1`) para que a cobertura da spec possa ser conferida.", ""];
  for (const s of storiesOf(f.content)) {
    out.push(`## ${s.id} — ${s.title}`);
    s.criteria.forEach((c, i) => {
      const ca = c.match(/^CA-[\w.]+/i)?.[0].toUpperCase();
      out.push(`- [ ] **${ca ?? `${s.id}.T${i + 1}`}** ${ca ? c.replace(/^CA-[\w.]+\s*[:—–-]?\s*/i, "") : c}`);
    });
    if (!s.criteria.length) out.push("- (sem critérios de aceite)");
    out.push("");
  }
  const rules = sectionsOf(f.content).get("regras de negocio");
  if (rules?.trim()) out.push("## Regras de negócio a cobrir", rules.trim(), "");
  return out.join("\n").trimEnd() + "\n";
}

/* ---------- Pacote para o desenvolvimento ---------- */

const stripTitle = (c: string) => c.replace(/^#\s+.*\n+/, "").trim();

/** O que o programador precisa da arquitetura: serviço dono, contratos, entidades, cenários, transversais e testes. */
function archPack(p: Project, f: Feature, warnings: string[]): string[] {
  const a = p.architecture;
  const mine = f.moduleId ? a.services.filter((s) => coveredModules(s.content).includes(f.moduleId!)) : [];
  if (!mine.length) {
    if (a.services.length) warnings.push(`O módulo ${f.moduleId ?? "da feature"} não está em nenhum serviço da arquitetura.`);
    return [];
  }
  const out: string[] = [];
  for (const s of mine) {
    if (s.guide && s.guide.current) warnings.push(`O serviço ${s.id} ainda está na etapa ${s.guide.current}.`);
    out.push(`# Serviço ${s.id} — ${s.name}`, "", stripTitle(s.content), "");
  }
  const ids = new Set(mine.map((s) => s.id));
  const ents = entitiesOf(a.docs.modelo).filter((e) => e.owner && ids.has(e.owner));
  if (ents.length) out.push("# Entidades dos serviços acima", "", ...ents.map((e) => e.raw + "\n"));
  const cen = (sectionsOf(a.docs.exec ?? "").get("cenarios") ?? "")
    .split(/^###\s+/m)
    .slice(1)
    .filter((b) => [...ids].some((id) => new RegExp(`\\b${id}\\b`, "i").test(b)));
  if (cen.length) out.push("# Cenários de execução que envolvem estes serviços", "", ...cen.map((b) => `### ${b.trimEnd()}\n`));
  if (a.docs.transv?.trim() && sectionsOfHasContent(a.docs.transv)) out.push("# Conceitos transversais (valem para todo o código)", "", stripTitle(a.docs.transv), "");
  if (a.docs.testes?.trim() && sectionsOfHasContent(a.docs.testes)) out.push("# Estratégia de testes", "", stripTitle(a.docs.testes), "");
  return out;
}

export function devPack(p: Project, featureId: string): { title: string; markdown: string; warnings: string[] } {
  const f = p.features.find((x) => x.id === featureId.toUpperCase());
  if (!f) throw new HttpError(404, "Feature não encontrada");
  const mod = p.modules.find((m) => m.id === f.moduleId);
  const sec = p.concept ? sectionsOf(p.concept.content) : new Map<string, string>();
  const warnings: string[] = [];
  const stage = stageOf(f);
  if (!["Pronta para dev", "Em desenvolvimento", "Concluída"].includes(stage)) warnings.push(`A feature está em “${stage}”, não pronta para desenvolvimento.`);
  if (f.doubts.length) warnings.push(`Há ${f.doubts.length} dúvida(s) em aberto na feature.`);
  const decisions = p.decisions.filter((d) => d.affects.includes(f.id) || (f.moduleId && d.affects.includes(f.moduleId)));
  for (const d of decisions.filter((x) => /aberta|discuss/i.test(x.status))) warnings.push(`A decisão ${d.id} (“${d.title}”) ainda está aberta.`);

  const parts: string[] = [`# Pacote de desenvolvimento — ${f.id} ${f.name}`, ""];
  parts.push(
    "Você vai implementar a feature abaixo. Siga estritamente a spec: não invente regras, perfis ou campos que não estejam escritos. Se algo estiver ambíguo, pare e pergunte. Escreva os testes do plano antes de considerar a feature concluída.",
    "",
  );
  if (warnings.length) parts.push("> **Atenção:** " + warnings.join(" "), "");
  const gen = (title: string, key: string) => {
    const s = sec.get(key)?.trim();
    if (s) parts.push(`## ${title}`, s, "");
  };
  parts.push("# Contexto do projeto", "");
  gen("Resumo", "resumo");
  gen("Requisitos gerais (valem para esta feature)", "requisitos gerais");
  gen("Diretrizes técnicas", "diretrizes tecnicas");
  if (mod) parts.push(`# Módulo ${mod.id} — ${mod.name}`, "", mod.content.replace(/^#\s+.*\n+/, "").trim(), "");
  if (p.matrix) {
    const rows = p.matrix.content.split("\n").filter((l) => l.startsWith("|"));
    const head = rows.slice(0, 2);
    const mine = rows.slice(2).filter((l) => (f.moduleId && l.toUpperCase().includes(f.moduleId)) || f.actions.some((a) => l.toLowerCase().includes(a.name.toLowerCase())));
    if (mine.length) parts.push("# Permissões relevantes", "", ...head, ...mine, "");
  }
  parts.push(`# Feature ${f.id}`, "", f.content.replace(/^#\s+.*\n+/, "").trim(), "");
  if (decisions.length) {
    parts.push("# Decisões que afetam esta feature", "");
    for (const d of decisions) parts.push(`- **${d.id} — ${d.title}** (${d.status})${d.decision ? `: ${d.decision}` : ""}`);
    parts.push("");
  }
  parts.push(...archPack(p, f, warnings));
  parts.push(testPlan(f).replace(/^# /, "# "));
  return { title: `${f.id} ${f.name}`, markdown: parts.join("\n").trimEnd() + "\n", warnings };
}

/* ---------- Mudança de etapa ---------- */

const NEXT: Record<string, string[]> = {
  "Detalhada": ["Pronta para dev"],
  "Pronta para dev": ["Em desenvolvimento", "Detalhada"],
  "Em desenvolvimento": ["Concluída", "Pronta para dev"],
  "Concluída": ["Em desenvolvimento"],
};

export function setStage(f: Feature, to: string, content: string): string {
  const from = stageOf(f);
  if (!["Pronta para dev", "Em desenvolvimento", "Concluída", "Detalhada", "Cancelada"].includes(to)) throw new HttpError(400, "Etapa inválida");
  if (to !== "Cancelada" && !(NEXT[from] ?? []).includes(to)) throw new HttpError(409, `Não dá para ir de “${from}” para “${to}”`);
  if (to === "Pronta para dev" && (f.guide?.reached ?? 0) < 3) throw new HttpError(409, `A feature ainda não está detalhada: ${f.guide?.missing.map((m) => m.label).join("; ")}`);
  if (to === "Pronta para dev" && f.doubts.length) throw new HttpError(409, "Resolva as dúvidas em aberto antes de marcar como pronta");
  const row = /^(\|\s*Etapa\s*\|)[^\n]*$/im;
  if (!row.test(content)) throw new HttpError(409, "A feature não tem a linha Etapa na tabela do início");
  return content.replace(row, `$1 ${to} |`);
}

export { FEATURE_STEPS };
