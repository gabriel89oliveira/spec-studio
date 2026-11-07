import { ARCH_STEPS, bullets, doubtsOf, has, keyValues, norm, sectionsOf, tableOf, type Guide, type Missing } from "./guide.js";

/**
 * Arquitetura do projeto: docs/arquitetura/ (visão, dados e integrações, infraestrutura, requisitos
 * não funcionais) e um arquivo por serviço em docs/arquitetura/servicos/. O guia aqui é do projeto
 * todo (cruza vários arquivos); o de cada serviço fica em guide.ts, como o de módulos e features.
 */

export const ARCH_DIR = "docs/arquitetura";
export const ARCH_PATHS = {
  visao: `${ARCH_DIR}/visao.md`,
  dados: `${ARCH_DIR}/dados-e-integracoes.md`,
  modelo: `${ARCH_DIR}/modelo-de-dados.md`,
  infra: `${ARCH_DIR}/infraestrutura.md`,
  exec: `${ARCH_DIR}/execucao.md`,
  transv: `${ARCH_DIR}/conceitos-transversais.md`,
  rnf: `${ARCH_DIR}/requisitos-nao-funcionais.md`,
  testes: `${ARCH_DIR}/estrategia-de-testes.md`,
  riscos: `${ARCH_DIR}/riscos-e-divida.md`,
} as const;

export type ArchInput = {
  visao: string | null;
  dados: string | null;
  modelo: string | null;
  infra: string | null;
  exec: string | null;
  transv: string | null;
  rnf: string | null;
  testes: string | null;
  riscos: string | null;
  services: { id: string; path: string; content: string }[];
  /** IDs dos módulos do projeto (arquivos e mapa do Conceito). */
  moduleIds: string[];
};

export type Rnf = { id: string; category: string; goal: string; measure: string; by: string };

export type Entity = { name: string; owner: string | null; fields: { name: string; type: string; required: string; rule: string }[]; raw: string };
export type Relation = { from: string; to: string; cardinality: string; description: string };

/** Entidades de modelo-de-dados.md: cada `### Nome` com "- Dono: SV01" e a tabela de campos. */
export function entitiesOf(content: string | null): Entity[] {
  const body = content ? sectionsOf(content).get("entidades") : undefined;
  return (body ?? "")
    .split(/^###\s+/m)
    .slice(1)
    .map((b) => {
      const name = b.split("\n")[0].trim();
      const owner = keyValues(b).get("dono")?.match(/SV\d+/i)?.[0].toUpperCase() ?? null;
      const t = tableOf(b);
      const col = (n: string) => t.header.findIndex((h) => norm(h).startsWith(n));
      const [c, ty, ob, re] = [col("campo"), col("tipo"), col("obrig"), col("regra")];
      const cell = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
      return { name, owner, raw: `### ${b}`.trimEnd(), fields: t.rows.map((r) => ({ name: cell(r, c < 0 ? 0 : c), type: cell(r, ty), required: cell(r, ob), rule: cell(r, re) })) };
    })
    .filter((e) => e.name);
}

export function relationsOf(content: string | null): Relation[] {
  const t = tableOf(content ? sectionsOf(content).get("relacoes") : undefined);
  return t.rows.map((r) => ({ from: r[0] ?? "", to: r[1] ?? "", cardinality: r[2] ?? "", description: r[3] ?? "" }));
}

/** Pares RNF → teste da seção "Requisitos não funcionais" de estrategia-de-testes.md. */
export function rnfTests(content: string | null): Map<string, string> {
  const t = tableOf(content ? sectionsOf(content).get("requisitos nao funcionais") : undefined);
  return new Map(t.rows.filter((r) => r[0] && r[1]).map((r) => [r[0].toUpperCase(), r[1]]));
}

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
        if (!MERMAID.test(visao("contexto do sistema") ?? ""))
          m.push({
            id: "contexto-diagrama",
            label: "Diagrama de contexto",
            file: ARCH_PATHS.visao,
            section: "Contexto do sistema",
            ask: "Vou desenhar o diagrama de contexto (Mermaid): o sistema no centro, quem o usa (perfis) e os sistemas externos com que conversa. Posso desenhar?",
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
        const ents = entitiesOf(a.modelo);
        if (ents.length === 0)
          m.push({ id: "entidades", label: "Entidades principais, com dono e campos", file: ARCH_PATHS.modelo, section: "Entidades", ask: "Quais são as entidades principais? Para cada uma: qual serviço é dono e quais campos tem (nome, tipo, obrigatório, regra). Proponho a lista a partir dos módulos e das features." });
        for (const e of ents) {
          if (!e.owner) m.push({ id: `dono:${e.name}`, label: `Dono da entidade ${e.name}`, file: ARCH_PATHS.modelo, section: "Entidades", ask: `Qual serviço é dono da entidade ${e.name}? (linha "- Dono: SV01")` });
          else if (!e.fields.length || e.fields.some((f) => !f.type))
            m.push({ id: `campos:${e.name}`, label: `Campos (com tipo) da entidade ${e.name}`, file: ARCH_PATHS.modelo, section: "Entidades", ask: `Quais são os campos da entidade ${e.name}, com tipo, se é obrigatório e a regra?` });
        }
        if (ents.length > 1 && relationsOf(a.modelo).length === 0 && !/sem relac|nenhuma relac|n[ãa]o h[áa] relac/i.test(sec(a.modelo, "relacoes") ?? ""))
          m.push({ id: "relacoes", label: "Relações entre entidades", file: ARCH_PATHS.modelo, section: "Relações", ask: "Como as entidades se relacionam (De, Para, cardinalidade)? Proponho a tabela." });
        if (ents.length > 0 && !/erDiagram/i.test(sec(a.modelo, "diagrama") ?? ""))
          m.push({ id: "er", label: "Diagrama de entidades (Mermaid erDiagram)", file: ARCH_PATHS.modelo, section: "Diagrama", ask: "Vou desenhar o diagrama de entidades e relações (Mermaid erDiagram). Posso desenhar?" });
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
        if (a.services.length > 0 && !has(sec(a.infra, "servicos por ambiente")))
          m.push({ id: "mapa-ambientes", label: "Serviços por ambiente", file: ARCH_PATHS.infra, section: "Serviços por ambiente", ask: "Onde cada serviço roda em cada ambiente (servidor, contêiner, função, banco compartilhado)? Posso propor uma tabela serviço × ambiente." });
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        const cenarios = sec(a.exec, "cenarios");
        if (!cenarios || (cenarios.match(/^###\s/gm) ?? []).length + bullets(cenarios).length === 0)
          m.push({ id: "cenarios", label: "Cenários de execução (ao menos um fluxo principal)", file: ARCH_PATHS.exec, section: "Cenários", ask: "Qual é o fluxo mais importante do sistema (ex.: abrir uma ordem de serviço)? Proponho descrevê-lo passo a passo entre usuário, serviços e sistemas externos, com um diagrama de sequência." });
        if (!has(sec(a.transv, "seguranca e acesso")))
          m.push({ id: "seguranca", label: "Segurança e acesso", file: ARCH_PATHS.transv, section: "Segurança e acesso", ask: "Como as pessoas se autenticam e como a permissão é verificada (login próprio, SSO, token entre serviços)? Há dados pessoais a proteger (LGPD)?" });
        if (!has(sec(a.transv, "registro e tratamento de erros")))
          m.push({ id: "erros", label: "Registro e tratamento de erros", file: ARCH_PATHS.transv, section: "Registro e tratamento de erros", ask: "Como o sistema registra o que acontece (logs, auditoria) e o que faz quando algo falha (nova tentativa, mensagem ao usuário, alerta)?" });
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
        if (m.length === 0) {
          const tipos = tableOf(sec(a.testes, "tipos de teste"));
          const ferr = tipos.header.findIndex((h) => norm(h).startsWith("ferramenta"));
          if (!tipos.rows.length || (ferr >= 0 && tipos.rows.some((r) => !(r[ferr] ?? "").trim())))
            m.push({ id: "tipos-teste", label: "Tipos de teste, com ferramenta", file: ARCH_PATHS.testes, section: "Tipos de teste", ask: "Que tipos de teste o projeto terá (unitário, integração, contrato, ponta a ponta), com que ferramenta e quando rodam? Proponho a tabela a partir da stack de cada serviço." });
          if (!has(sec(a.testes, "dados de teste")))
            m.push({ id: "dados-teste", label: "Dados de teste", file: ARCH_PATHS.testes, section: "Dados de teste", ask: "Como os testes obtêm dados (fixtures, fábricas, banco limpo a cada execução)? Algum dado real é permitido?" });
          if (!has(sec(a.testes, "cobertura minima")))
            m.push({ id: "cobertura", label: "Cobertura mínima", file: ARCH_PATHS.testes, section: "Cobertura mínima", ask: "Qual é a cobertura mínima exigida (por camada ou por serviço) para aceitar uma entrega?" });
          const mapped = rnfTests(a.testes);
          const sem = rnfs.filter((r) => r.id && !mapped.has(r.id.toUpperCase()));
          if (sem.length)
            m.push({ id: "rnf-teste", label: `Como testar ${sem.map((r) => r.id).join(", ")}`, file: ARCH_PATHS.testes, section: "Requisitos não funcionais", ask: `Como o requisito ${sem[0].id} será verificado? (tabela RNF | Teste)` });
        }
        return m;
      },
    },
    {
      check: () => {
        const m: Missing[] = [];
        if (!has(sec(a.riscos, "riscos")))
          m.push({ id: "riscos", label: "Riscos e dívida técnica (ou declarar que não há)", file: ARCH_PATHS.riscos, section: "Riscos", ask: "Quais são os maiores riscos técnicos (prazo, equipe, tecnologia nova, dependência de terceiro) e o que fazer para reduzi-los? Se nenhum, digo que não há." });
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
  const doubts = [a.visao, a.dados, a.infra, a.exec, a.transv, a.rnf, a.riscos, ...a.services.map((s) => s.content)].reduce<number>((n, c) => n + (c ? doubtsOf(sectionsOf(c)) : 0), 0);
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

