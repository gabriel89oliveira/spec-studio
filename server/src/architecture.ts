import { ARCH_STEPS, doubtsOf, has, keyValues, norm, sectionsOf, tableOf, type Guide, type Missing } from "./guide.js";

/**
 * Arquitetura do projeto: docs/arquitetura/ (visão, dados e integrações, infraestrutura, requisitos
 * não funcionais) e um arquivo por serviço em docs/arquitetura/servicos/. O guia aqui é do projeto
 * todo (cruza vários arquivos); o de cada serviço fica em guide.ts, como o de módulos e features.
 */

export const ARCH_DIR = "docs/arquitetura";
export const ARCH_PATHS = {
  visao: `${ARCH_DIR}/visao.md`,
  dados: `${ARCH_DIR}/dados-e-integracoes.md`,
  infra: `${ARCH_DIR}/infraestrutura.md`,
  rnf: `${ARCH_DIR}/requisitos-nao-funcionais.md`,
} as const;

export type ArchInput = {
  visao: string | null;
  dados: string | null;
  infra: string | null;
  rnf: string | null;
  services: { id: string; path: string; content: string }[];
  /** IDs dos módulos do projeto (arquivos e mapa do Conceito). */
  moduleIds: string[];
};

export type Rnf = { id: string; category: string; goal: string; measure: string; by: string };

const MERMAID = /```\s*mermaid\b[\s\S]*?```/i;
export const mermaidBlocks = (content: string): string[] => [...content.matchAll(/```\s*mermaid\b([\s\S]*?)```/gi)].map((m) => m[1]);

/** Módulos citados na seção "Módulos que cobre" de um serviço. */
export function coveredModules(content: string): string[] {
  const body = sectionsOf(content).get("modulos que cobre");
  return [...new Set((body ?? "").match(/\bM\d+\b/gi)?.map((x) => x.toUpperCase()) ?? [])];
}

/** Linhas da tabela de requisitos não funcionais: ID | Categoria | Meta | Como medir | Atendido por. */
export function rnfsOf(content: string | null): Rnf[] {
  if (!content) return [];
  const t = tableOf(sectionsOf(content).get("requisitos"));
  const col = (name: string) => t.header.findIndex((h) => norm(h) === name);
  const [ci, cc, cg, cm, cb] = [col("id"), col("categoria"), col("meta"), col("como medir"), col("atendido por")];
  const at = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
  return t.rows.map((r) => ({ id: at(r, ci), category: at(r, cc), goal: at(r, cg), measure: at(r, cm), by: at(r, cb) }));
}

const sec = (content: string | null, key: string) => (content ? sectionsOf(content).get(key) : undefined);

export function analyzeArchitecture(a: ArchInput): Guide {
  const visao = (key: string) => sec(a.visao, key);
  const steps: { check: () => Missing[] }[] = [
    {
      check: () => {
        const m: Missing[] = [];
        if (!has(visao("contexto e restricoes")))
          m.push({
            id: "contexto",
            label: "Contexto e restrições",
            file: ARCH_PATHS.visao,
            section: "Contexto e restrições",
            ask: "Qual é o contexto de uso: quantos usuários, volume de dados, picos, e que restrições existem (prazo, equipe, orçamento, nuvem ou sistemas obrigatórios)?",
          });
        if (!has(visao("estilo de arquitetura")))
          m.push({
            id: "estilo",
            label: "Estilo de arquitetura",
            file: ARCH_PATHS.visao,
            section: "Estilo de arquitetura",
            ask: "Com base no contexto, proponho um estilo: um sistema só organizado em módulos (monólito modular) ou serviços separados. Qual faz sentido e por quê?",
          });
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        if (a.services.length === 0)
          m.push({ id: "servicos", label: "Serviços (ao menos um)", ask: "Proponho a divisão em serviços a partir dos módulos e do contexto. Quais serviços ficam, e que módulos cada um cobre?" });
        for (const s of a.services) {
          const st = keyValues(sectionsOf(s.content).get("stack"));
          if (!st.has("linguagem") || !st.has("framework"))
            m.push({ id: `stack:${s.id}`, label: `Stack do ${s.id}`, file: s.path, section: "Stack", ask: `Qual é a stack do serviço ${s.id}: linguagem, framework, banco de dados e ferramenta de testes?` });
        }
        if (!a.visao || !MERMAID.test(visao("componentes") ?? ""))
          m.push({ id: "diagrama", label: "Diagrama de componentes", file: ARCH_PATHS.visao, section: "Componentes", ask: "Vou desenhar o diagrama de componentes (Mermaid) com os serviços e como se comunicam. Posso desenhar?" });
        const covered = new Set(a.services.flatMap((s) => coveredModules(s.content)));
        const left = a.moduleIds.filter((id) => !covered.has(id));
        if (a.services.length > 0 && left.length > 0)
          m.push({ id: "mapa", label: `Mapear ${left.length} ${left.length === 1 ? "módulo" : "módulos"} a um serviço`, ask: `Em qual serviço fica o módulo ${left[0]}?` });
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        if (!has(sec(a.dados, "dados")))
          m.push({ id: "dados", label: "Dados: entidades e dono de cada uma", file: ARCH_PATHS.dados, section: "Dados", ask: "Quais são as entidades principais e qual serviço é dono de cada uma? Onde ficam guardadas (banco, arquivos)?" });
        if (!has(sec(a.dados, "integracoes")))
          m.push({ id: "integracoes", label: "Integrações externas (ou declarar que não há)", file: ARCH_PATHS.dados, section: "Integrações", ask: "Com que sistemas externos a plataforma conversa (pagamento, ERP, e-mail, mapas)? Se nenhum, digo que não há." });
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        if (!has(sec(a.infra, "ambientes")))
          m.push({ id: "ambientes", label: "Ambientes", file: ARCH_PATHS.infra, section: "Ambientes", ask: "Quais ambientes existem (desenvolvimento, homologação, produção) e para que serve cada um?" });
        if (!has(sec(a.infra, "hospedagem")))
          m.push({ id: "hospedagem", label: "Hospedagem", file: ARCH_PATHS.infra, section: "Hospedagem", ask: "Onde a plataforma roda (nuvem, servidor próprio, contêineres)? Há restrição de provedor ou de região?" });
        if (!has(sec(a.infra, "implantacao")))
          m.push({ id: "implantacao", label: "Implantação (CI/CD)", file: ARCH_PATHS.infra, section: "Implantação", ask: "Como o código chega à produção: quem aprova, que testes rodam, como voltar atrás se algo der errado?" });
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        const rnfs = rnfsOf(a.rnf);
        if (rnfs.length === 0)
          m.push({ id: "rnf", label: "Requisitos não funcionais (ao menos um)", file: ARCH_PATHS.rnf, section: "Requisitos", ask: "Que metas mensuráveis valem (tempo de resposta, disponibilidade, usuários simultâneos, backup, segurança)? Para cada uma: a meta, como medir e que serviço atende." });
        else {
          const bad = rnfs.filter((r) => !r.goal || !r.measure);
          if (bad.length)
            m.push({ id: "rnf-completo", label: `Completar ${bad.length} ${bad.length === 1 ? "requisito sem" : "requisitos sem"} meta ou forma de medir`, file: ARCH_PATHS.rnf, section: "Requisitos", ask: `O requisito ${bad[0].id || bad[0].category || ""} não tem ${!bad[0].goal ? "meta" : "forma de medir"}. Qual é?`.replace("  ", " ") });
        }
        return m;
      },
    },
  ];
  let reached = 0;
  let missing: Missing[] = [];
  for (const s of steps) {
    missing = s.check();
    if (missing.length) break;
    reached++;
  }
  const doubts = [a.visao, a.dados, a.infra, a.rnf, ...a.services.map((s) => s.content)].reduce<number>((n, c) => n + (c ? doubtsOf(sectionsOf(c)) : 0), 0);
  return { kind: "architecture", steps: ARCH_STEPS, reached, current: reached < ARCH_STEPS.length ? ARCH_STEPS[reached] : null, missing, doubts };
}

/** O que a spec ainda deixa vago e pode enfraquecer o desenho da arquitetura (aviso, não bloqueio). */
export function vagueSpec(p: { conceptCurrent: string | null; modules: { id: string; reached: number }[]; decisionsOpen: number; hasRequirements: boolean }): string[] {
  const out: string[] = [];
  if (p.conceptCurrent) out.push(`O Conceito ainda está na etapa ${p.conceptCurrent}.`);
  if (!p.hasRequirements) out.push("Os requisitos gerais do Conceito (segurança, desempenho…) ainda estão vazios.");
  const raw = p.modules.filter((m) => m.reached < 3).length;
  if (raw) out.push(`${raw} ${raw === 1 ? "módulo ainda não está detalhado" : "módulos ainda não estão detalhados"}.`);
  if (p.decisionsOpen) out.push(`${p.decisionsOpen} ${p.decisionsOpen === 1 ? "decisão aberta" : "decisões abertas"}.`);
  return out;
}

