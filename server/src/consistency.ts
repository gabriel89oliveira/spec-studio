import { norm, matrixOf } from "./guide.js";
import type { Project } from "./project.js";

export type Issue = {
  id: string;
  rule: string;
  severity: "erro" | "aviso";
  message: string;
  files: string[];
  /** Pedido pronto para o Claude resolver. */
  fix: string;
};

const same = (a: string, b: string) => norm(a) === norm(b);
const has = (list: string[], x: string) => list.some((y) => same(y, x));
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Cruza o Conceito, os módulos, as features, a matriz, as decisões e as fontes e lista o que não bate. */
export function checkProject(p: Project, today = todayIso()): Issue[] {
  const out: Issue[] = [];
  const add = (rule: string, key: string, severity: Issue["severity"], message: string, files: string[], fix: string) =>
    out.push({ id: `${rule}:${key}`, rule, severity, message, files, fix });

  const moduleIds = new Set(p.modules.map((m) => m.id));
  const featureIds = new Set(p.features.map((f) => f.id));

  // IDs duplicados
  for (const [label, list] of [["módulo", p.modules], ["feature", p.features]] as const) {
    const seen = new Map<string, string>();
    for (const d of list) {
      const other = seen.get(d.id);
      if (other) add("id-duplicado", d.id + d.path, "erro", `Dois arquivos de ${label} usam o ID ${d.id}.`, [other, d.path], `Dois arquivos usam o ID ${d.id} (${other} e ${d.path}). Renumere um deles, ajustando o nome do arquivo, o título e as referências.`);
      else seen.set(d.id, d.path);
    }
  }

  // Features
  for (const f of p.features) {
    if (p.modules.length > 0 || p.concept?.moduleIds.length) {
      if (!f.moduleId) add("feature-sem-modulo", f.id, "aviso", `${f.id} não indica a qual módulo pertence.`, [f.path], `A feature ${f.path} não declara o módulo. Pergunte-me a qual módulo ela pertence e preencha o campo Módulo.`);
      else if (!moduleIds.has(f.moduleId)) add("modulo-inexistente", f.id, "erro", `${f.id} aponta para o módulo ${f.moduleId}, que não existe.`, [f.path], `A feature ${f.path} usa o módulo ${f.moduleId}, mas não há arquivo desse módulo em docs/modulos. Corrija o campo Módulo ou crie o módulo, conforme eu decidir.`);
    }
    if (p.concept && f.profiles.length) {
      for (const prof of f.profiles) {
        if (p.concept.profiles.length && !has(p.concept.profiles, prof))
          add("perfil-fora-do-conceito", `${f.id}:${norm(prof)}`, "aviso", `${f.id} cita o perfil “${prof}”, que não está no Conceito.`, [f.path, "docs/CONCEITO.md"], `A feature ${f.path} cita o perfil “${prof}”, ausente em Perfis de usuário do Conceito. Pergunte-me se é um perfil novo (adicione ao Conceito) ou outro nome de um perfil existente (corrija a feature).`);
      }
    }
    if (p.matrix && p.matrix.profiles.length) {
      for (const a of f.actions) {
        for (const prof of a.profiles)
          if (!has(p.matrix.profiles, prof))
            add("perfil-fora-da-matriz", `${f.id}:${norm(a.name)}:${norm(prof)}`, "aviso", `${f.id}: a ação “${a.name}” cita o perfil “${prof}”, que não está na matriz de permissões.`, [f.path, "docs/permissoes.md"], `Em ${f.path}, a ação “${a.name}” cita o perfil “${prof}”, que não existe na matriz docs/permissoes.md. Alinhe os dois, perguntando-me se necessário.`);
        if (!has(p.matrix.actions, a.name))
          add("acao-fora-da-matriz", `${f.id}:${norm(a.name)}`, "aviso", `${f.id}: a ação “${a.name}” não consta na matriz de permissões.`, [f.path, "docs/permissoes.md"], `A ação “${a.name}” de ${f.path} não está na matriz docs/permissoes.md. Adicione a linha na matriz (módulo ${f.moduleId ?? "?"}) e pergunte-me quem pode executá-la.`);
      }
    }
    const declaredReady = f.declared && /pronta/i.test(f.declared);
    const late = f.declared && /(pronta|em desenvolvimento|conclu)/i.test(f.declared);
    if (declaredReady && f.guide && f.guide.reached < 3 && f.guide.missing.length)
      add("pronta-incompleta", f.id, "erro", `${f.id} está marcada como pronta para dev, mas falta: ${f.guide.missing.map((m) => m.label.toLowerCase()).join(", ")}.`, [f.path], `${f.path} está como “Pronta para dev”, mas falta: ${f.guide.missing.map((m) => m.label).join("; ")}. Volte a etapa para Detalhada ou complete o que falta, perguntando-me.`);
    if (late && f.doubts.length)
      add("duvida-em-feature-pronta", f.id, "aviso", `${f.id} está adiantada, mas tem ${f.doubts.length} ${f.doubts.length === 1 ? "dúvida em aberto" : "dúvidas em aberto"}.`, [f.path], `${f.path} tem dúvidas em aberto (${f.doubts.join(" | ")}) embora esteja adiantada. Ajude-me a resolvê-las uma a uma, ou registre-as como decisões.`);
  }

  // Módulos x Conceito
  if (p.concept) {
    for (const id of p.concept.moduleIds)
      if (!moduleIds.has(id)) add("modulo-sem-arquivo", id, "aviso", `${id} está no mapa de módulos do Conceito, mas não tem arquivo.`, ["docs/CONCEITO.md"], `O módulo ${id} está no Conceito mas não existe em docs/modulos. Crie o arquivo a partir do modelo _templates/modulo.md e me entreviste para preenchê-lo.`);
    for (const m of p.modules)
      if (p.concept.moduleIds.length && !p.concept.moduleIds.includes(m.id))
        add("modulo-fora-do-conceito", m.id, "aviso", `${m.id} tem arquivo, mas não está no mapa de módulos do Conceito.`, [m.path, "docs/CONCEITO.md"], `O módulo ${m.id} (${m.path}) não consta em Mapa de módulos do Conceito. Adicione a linha ao Conceito.`);
  }

  // Matriz x módulos
  if (p.matrix) {
    const m = matrixOf(p.matrix.content);
    const mi = m.header.findIndex((h) => norm(h) === "modulo");
    if (mi >= 0)
      for (const r of m.rows) {
        const id = (r[mi] ?? "").match(/\bM\d+\b/i)?.[0]?.toUpperCase();
        if (id && !moduleIds.has(id)) add("matriz-modulo-inexistente", `${id}:${norm(r[0] ?? "")}`, "aviso", `A matriz cita o módulo ${id}, que não existe.`, ["docs/permissoes.md"], `Na matriz docs/permissoes.md a ação “${r[0]}” aponta para ${id}, que não existe. Corrija o módulo da linha.`);
      }
  }

  // Decisões
  const allIds = new Set([...moduleIds, ...featureIds, ...p.sources.map((s) => s.id)]);
  for (const d of p.decisions) {
    const open = /aberta|discuss/i.test(d.status);
    for (const ref of d.affects)
      if (!allIds.has(ref)) add("decisao-ref-inexistente", `${d.id}:${ref}`, "aviso", `${d.id} afeta ${ref}, que não existe.`, ["docs/decisoes.md"], `A decisão ${d.id} afeta ${ref}, que não existe. Corrija o campo Afeta.`);
    if (open && d.deadline && d.deadline < today)
      add("decisao-vencida", d.id, "aviso", `${d.id} (“${d.title}”) passou do prazo de ${d.deadline} e segue ${d.status.toLowerCase()}.`, ["docs/decisoes.md"], `A decisão ${d.id} está vencida (${d.deadline}). Ajude-me a decidir ou a redefinir o prazo.`);
    if (/decidida/i.test(d.status) && !d.decision)
      add("decisao-sem-resultado", d.id, "erro", `${d.id} está como decidida, mas não registra o que foi decidido.`, ["docs/decisoes.md"], `A decisão ${d.id} está como Decidida, mas o campo Decisão está vazio. Pergunte-me o que foi decidido e registre.`);
    if (open)
      for (const ref of d.affects) {
        const f = p.features.find((x) => x.id === ref);
        if (f?.declared && /pronta|desenvolvimento/i.test(f.declared))
          add("decisao-bloqueia", `${d.id}:${ref}`, "aviso", `${ref} está adiantada, mas a decisão ${d.id} que a afeta ainda está aberta.`, [f.path, "docs/decisoes.md"], `A feature ${ref} está adiantada, mas depende da decisão aberta ${d.id} (“${d.title}”). Ajude-me a fechar a decisão antes de seguir.`);
      }
  }

  // Fontes
  for (const s of p.sources) {
    const g = s.guide;
    if (g && g.current && g.missing.length)
      add("fonte-pendente", s.id, "aviso", `A fonte ${s.id} (“${s.name}”) ainda não foi ${g.current === "Revisada" ? "revisada" : "aplicada"}.`, [s.path], `A fonte ${s.path} está na etapa ${g.current}. ${g.missing[0]?.ask ?? ""}`.trim());
  }

  const order = { erro: 0, aviso: 1 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
}
