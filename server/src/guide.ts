/**
 * Guia de etapas: a partir do texto de uma feature ou de um módulo, descobre em que etapa o
 * documento está e o que falta para a próxima. Só olha a estrutura (seções e listas), nunca
 * julga o conteúdo. A mesma regra serve ao cartão "Próximo passo" e ao modo simulado.
 */

export type DocKind = "feature" | "module" | "source" | "concept" | "matrix" | "service" | "architecture";

export type Missing = {
  id: string;
  /** Texto curto para a tela. */
  label: string;
  /** Pergunta que o Claude faz na entrevista. */
  ask: string;
  /** Seção do arquivo onde a resposta entra. */
  section?: string;
  /** Arquivo onde a resposta entra, quando não é o documento aberto (guia da arquitetura). */
  file?: string;
  /** O que fazer: sem valor = entrevista; extract/apply = pedido ao Claude; review = só o usuário. */
  action?: "extract" | "review" | "apply";
};

export type Guide = {
  kind: DocKind;
  steps: string[];
  /** Quantas etapas já estão completas (0 até steps.length). */
  reached: number;
  /** Etapa em andamento; nula quando todas estão completas. */
  current: string | null;
  /** O que falta na etapa em andamento. */
  missing: Missing[];
  /** Dúvidas em aberto no documento. */
  doubts: number;
  /** Situação declarada depois de "Pronta para dev" (Em desenvolvimento, Concluída, Cancelada). */
  status?: string;
};

export const FEATURE_STEPS = ["Ideia", "Entendida", "Detalhada", "Pronta para dev"];
export const MODULE_STEPS = ["Ideia", "Mapeado", "Detalhado"];
export const SOURCE_STEPS = ["Importada", "Revisada", "Aplicada"];
export const CONCEPT_STEPS = ["Visão", "Escopo", "Requisitos"];
export const MATRIX_STEPS = ["Perfis", "Ações", "Preenchida"];
export const SERVICE_STEPS = ["Ideia", "Definido", "Detalhado"];
export const ARCH_STEPS = ["Contexto", "Serviços", "Dados e integrações", "Infraestrutura", "Comportamento", "Qualidade", "Riscos"];

const LATER_STATUS = ["em desenvolvimento", "concluida", "cancelada"];

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function kindOfPath(rel: string): DocKind | null {
  if (/^docs\/features\/[^/]+\.md$/i.test(rel)) return "feature";
  if (/^docs\/modulos\/[^/]+\.md$/i.test(rel)) return "module";
  if (/^docs\/fontes\/[^/]+\.md$/i.test(rel)) return "source";
  if (/^docs\/CONCEITO\.md$/i.test(rel)) return "concept";
  if (/^docs\/permissoes\.md$/i.test(rel)) return "matrix";
  if (/^docs\/arquitetura\/servicos\/[^/]+\.md$/i.test(rel)) return "service";
  if (/^docs\/arquitetura\/(visao|dados-e-integracoes|modelo-de-dados|infraestrutura|execucao|conceitos-transversais|estrategia-de-testes|requisitos-nao-funcionais|riscos-e-divida)\.md$/i.test(rel)) return "architecture";
  return null;
}

/** Seções de nível 2, pelo título sem acento. Comentários HTML não contam. */
export function sectionsOf(content: string): Map<string, string> {
  const text = content.replace(/<!--[\s\S]*?-->/g, "");
  const out = new Map<string, string>();
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  const heads: { title: string; start: number; end: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) heads.push({ title: norm(m[1].replace(/^\d+\.\s*/, "")), start: m.index + m[0].length, end: m.index });
  heads.forEach((h, i) => {
    const stop = heads[i + 1]?.end ?? text.length;
    if (!out.has(h.title)) out.set(h.title, text.slice(h.start, stop));
  });
  return out;
}

export const lines = (body: string | undefined) => (body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
export const bullets = (body: string | undefined) => lines(body).filter((l) => /^[-*]\s+\S/.test(l));
const isDone = (l: string) => /^[-*]\s+(\[x\]|~~)/i.test(l);
export const has = (body: string | undefined) => lines(body).length > 0;

/** Linha "| Campo | valor |" da tabela do topo. */
function field(content: string, name: string): string | undefined {
  const re = new RegExp(`^\\|\\s*${name}\\s*\\|([^\\n]*)$`, "im");
  const raw = content.slice(0, 4000).match(re)?.[1];
  return raw?.replace(/\|\s*$/, "").trim() || undefined;
}

function realModule(content: string): boolean {
  const id = field(content, "M[óo]dulo")?.match(/\bM(\d+)\b/i);
  return !!id && !/^0+$/.test(id[1]);
}

/** Cada história (### …) com o texto que vem depois do título. */
function stories(body: string | undefined): { title: string; body: string }[] {
  const parts = (body ?? "").split(/^###[ \t]+/m).slice(1);
  return parts.map((p) => {
    const nl = p.indexOf("\n");
    return { title: (nl < 0 ? p : p.slice(0, nl)).trim(), body: nl < 0 ? "" : p.slice(nl + 1) };
  });
}

const storyHasCriteria = (s: { body: string }) => {
  const m = s.body.match(/crit[ée]rios de aceite\**\s*\n([\s\S]*)/i);
  return !!m && bullets(m[1]).length > 0;
};

export function doubtsOf(sec: Map<string, string>): number {
  return bullets(sec.get("duvidas em aberto")).filter((l) => !isDone(l)).length;
}

type Step = { name: string; check: (c: string, sec: Map<string, string>) => Missing[] };

const featureSteps: Step[] = [
  {
    name: "Ideia",
    check: (c, sec) => {
      const m: Missing[] = [];
      if (!has(sec.get("objetivo")))
        m.push({ id: "objetivo", label: "Objetivo, em uma frase", section: "Objetivo", ask: "Em uma frase, o que esta feature permite fazer e por que isso importa?" });
      if (bullets(sec.get("quem usa")).length === 0)
        m.push({ id: "quem-usa", label: "Quem usa (ao menos um perfil)", section: "Quem usa", ask: "Quais perfis de usuário usam esta feature?" });
      if (!realModule(c)) m.push({ id: "modulo", label: "Módulo a que pertence", ask: "Em qual módulo esta feature fica?" });
      return m;
    },
  },
  {
    name: "Entendida",
    check: (_c, sec) => {
      const m: Missing[] = [];
      if (stories(sec.get("historias de usuario")).length === 0)
        m.push({
          id: "historias",
          label: "Histórias de usuário (ao menos uma)",
          section: "Histórias de usuário",
          ask: "O que cada perfil precisa conseguir fazer com esta feature? Conte a primeira situação de uso.",
        });
      if (!has(sec.get("fora do escopo")))
        m.push({ id: "fora", label: "O que fica fora do escopo", section: "Fora do escopo", ask: "O que esta feature NÃO faz, mesmo que alguém espere que faça?" });
      return m;
    },
  },
  {
    name: "Detalhada",
    check: (_c, sec) => {
      const m: Missing[] = [];
      const without = stories(sec.get("historias de usuario")).filter((s) => !storyHasCriteria(s));
      if (without.length)
        m.push({
          id: "criterios",
          label: `Critérios de aceite (${without.length} ${without.length === 1 ? "história sem" : "histórias sem"})`,
          section: "Histórias de usuário",
          ask: `Como saberemos que a história "${without[0].title}" está pronta? Descreva o caso normal e um caso de erro.`,
        });
      if (!has(sec.get("regras de negocio")))
        m.push({
          id: "regras",
          label: "Regras de negócio (ou declarar que não há)",
          section: "Regras de negócio",
          ask: "Existe alguma regra que limite ou condicione esta feature (prazos, valores, quem pode)? Se não, digo que não há.",
        });
      const d = doubtsOf(sec);
      if (d > 0)
        m.push({ id: "duvidas", label: `Resolver ${d} ${d === 1 ? "dúvida em aberto" : "dúvidas em aberto"}`, section: "Dúvidas em aberto", ask: `Vamos resolver a dúvida: ${bullets(sec.get("duvidas em aberto")).find((l) => !isDone(l))?.replace(/^[-*]\s+/, "") ?? ""}` });
      return m;
    },
  },
];

const moduleSteps: Step[] = [
  {
    name: "Ideia",
    check: (_c, sec) => {
      const m: Missing[] = [];
      if (!has(sec.get("responsabilidade")))
        m.push({ id: "responsabilidade", label: "Responsabilidade, em uma frase", section: "Responsabilidade", ask: "Em uma ou duas frases, que problema este módulo resolve?" });
      if (bullets(sec.get("perfis envolvidos")).length === 0)
        m.push({ id: "perfis", label: "Perfis envolvidos", section: "Perfis envolvidos", ask: "Quais perfis de usuário atuam neste módulo?" });
      return m;
    },
  },
  {
    name: "Mapeado",
    check: (_c, sec) => {
      const m: Missing[] = [];
      if (bullets(sec.get("entidades")).length === 0)
        m.push({ id: "entidades", label: "Entidades principais", section: "Entidades", ask: "Quais são as coisas principais que este módulo guarda e controla (ex.: pedido, oficina)?" });
      if (!has(sec.get("fora deste modulo")))
        m.push({ id: "fora", label: "O que fica fora deste módulo", section: "Fora deste módulo", ask: "O que pode parecer parte deste módulo mas fica em outro? Em qual?" });
      return m;
    },
  },
  {
    name: "Detalhado",
    check: (_c, sec) => {
      const m: Missing[] = [];
      if (!has(sec.get("ciclo de vida")))
        m.push({ id: "ciclo", label: "Ciclo de vida da entidade principal", section: "Ciclo de vida", ask: "Pela vida da entidade principal, por quais estados ela passa, do início ao fim?" });
      if (!has(sec.get("relacao com outros modulos")))
        m.push({ id: "relacao", label: "Relação com outros módulos (ou declarar que não há)", section: "Relação com outros módulos", ask: "O que este módulo usa de outros, e o que fornece a eles?" });
      const d = doubtsOf(sec);
      if (d > 0)
        m.push({ id: "duvidas", label: `Resolver ${d} ${d === 1 ? "dúvida em aberto" : "dúvidas em aberto"}`, section: "Dúvidas em aberto", ask: `Vamos resolver a dúvida: ${bullets(sec.get("duvidas em aberto")).find((l) => !isDone(l))?.replace(/^[-*]\s+/, "") ?? ""}` });
      return m;
    },
  },
];

/** Linhas de dados de uma tabela Markdown (sem o cabeçalho e o separador), com o cabeçalho à parte. */
export function tableOf(body: string | undefined): { header: string[]; rows: string[][] } {
  const rows = lines(body).filter((l) => l.startsWith("|"));
  const cells = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const data = rows.filter((l) => !/^\|?\s*:?-{2,}/.test(l.replace(/\s/g, "")));
  const [head, ...rest] = data.map(cells);
  return { header: head ?? [], rows: rest.filter((r) => r.some(Boolean)) };
}

const PLACEHOLDER = /\[[^\]]+\]/;

function analyzeConcept(content: string, sec: Map<string, string>): Guide {
  const title = content.match(/^#\s+(.+)$/m)?.[1] ?? "";
  const scope = sec.get("escopo");
  const forIdx = lines(scope).findIndex((l) => /^\*\*fora/i.test(l));
  const scopeLines = lines(scope);
  const inside = forIdx < 0 ? 0 : bullets(scopeLines.slice(0, forIdx).join("\n")).length;
  const outside = forIdx < 0 ? 0 : bullets(scopeLines.slice(forIdx).join("\n")).length;
  const steps: { name: string; check: () => Missing[] }[] = [
    {
      name: "Visão",
      check: () => {
        const m: Missing[] = [];
        if (!title || PLACEHOLDER.test(title)) m.push({ id: "nome", label: "Nome do projeto", ask: "Qual é o nome do projeto?" });
        if (!has(sec.get("resumo"))) m.push({ id: "resumo", label: "Resumo, em 2 ou 3 frases", section: "Resumo", ask: "Em 2 ou 3 frases: o que é a plataforma, para quem e que resultado entrega?" });
        if (!has(sec.get("problema"))) m.push({ id: "problema", label: "Problema que resolve", section: "Problema", ask: "Quem sofre hoje, qual é a dor e como resolvem agora (planilha, concorrente, processo manual)?" });
        if (tableOf(sec.get("perfis de usuario")).rows.length === 0)
          m.push({ id: "perfis", label: "Perfis de usuário (ao menos um)", section: "Perfis de usuário", ask: "Quem usa a plataforma? Cite um perfil, quem é e o que precisa fazer nela." });
        return m;
      },
    },
    {
      name: "Escopo",
      check: () => {
        const m: Missing[] = [];
        if (!has(sec.get("solucao"))) m.push({ id: "solucao", label: "Solução, em um parágrafo", section: "Solução", ask: "Como a plataforma resolve o problema, em um parágrafo?" });
        if (inside === 0 || outside === 0)
          m.push({ id: "escopo", label: "Escopo: o que está dentro e o que está fora", section: "Escopo", ask: "O que precisa estar na primeira versão (MVP) e o que fica explicitamente de fora?" });
        if (tableOf(sec.get("mapa de modulos")).rows.length === 0)
          m.push({ id: "modulos", label: "Mapa de módulos (ao menos um)", section: "Mapa de módulos", ask: "Em quais áreas (módulos) a plataforma se divide? Cite o primeiro e o que ele resolve." });
        return m;
      },
    },
    {
      name: "Requisitos",
      check: () => {
        const m: Missing[] = [];
        if (bullets(sec.get("requisitos gerais")).length === 0)
          m.push({ id: "requisitos", label: "Requisitos gerais (segurança, LGPD, desempenho…)", section: "Requisitos gerais", ask: "Que exigências valem para a plataforma toda: acesso e segurança, LGPD, desempenho, disponibilidade, plataformas?" });
        if (!has(sec.get("diretrizes tecnicas")))
          m.push({ id: "tecnicas", label: "Diretrizes técnicas", section: "Diretrizes técnicas", ask: "Há escolhas técnicas já definidas (linguagem, banco, hospedagem, integrações)? Se não, digo que ainda não há." });
        return m;
      },
    },
  ];
  let reached = 0;
  let missing: Missing[] = [];
  for (const st of steps) {
    missing = st.check();
    if (missing.length) break;
    reached++;
  }
  return { kind: "concept", steps: CONCEPT_STEPS, reached, current: reached < steps.length ? steps[reached].name : null, missing, doubts: 0 };
}

/** Colunas fixas da tabela de ações; as demais são perfis. */
export const MATRIX_FIXED = ["acao", "modulo", "condicao"];

export function matrixOf(content: string): { profiles: string[]; header: string[]; rows: string[][] } {
  const t = tableOf(sectionsOf(content).get("acoes"));
  const profiles = t.header.filter((h) => !MATRIX_FIXED.includes(norm(h)));
  return { profiles, header: t.header, rows: t.rows };
}

function analyzeMatrix(content: string): Guide {
  const { profiles, header, rows } = matrixOf(content);
  const idx = profiles.map((p) => header.indexOf(p));
  const emptyCells = rows.reduce((n, r) => n + idx.filter((i) => !(r[i] ?? "").trim()).length, 0);
  const checks: (() => Missing[])[] = [
    () => (profiles.length ? [] : [{ id: "perfis", label: "Perfis na matriz (traga os do Conceito)", ask: "Quais perfis entram na matriz? Posso trazer os do Conceito." }]),
    () => (rows.length ? [] : [{ id: "acoes", label: "Ações (ao menos uma)", section: "Ações", ask: "Qual é a primeira ação que alguém faz na plataforma (ex.: criar ordem de serviço) e em qual módulo?" }]),
    () => (emptyCells === 0 ? [] : [{ id: "celulas", label: `Preencher ${emptyCells} ${emptyCells === 1 ? "célula" : "células"} (S, N ou C)`, section: "Ações", ask: "Vamos preencher a matriz: quem pode fazer cada ação?" }]),
  ];
  let reached = 0;
  let missing: Missing[] = [];
  for (const c of checks) {
    missing = c();
    if (missing.length) break;
    reached++;
  }
  return { kind: "matrix", steps: MATRIX_STEPS, reached, current: reached < MATRIX_STEPS.length ? MATRIX_STEPS[reached] : null, missing, doubts: 0 };
}

/** Propostas de uma ficha de fonte: "- [ ] texto" pendente, "- [x] texto" aceita, "- ~~texto~~" descartada. */
export function proposalsOf(content: string): { pending: number; accepted: number; applied: number; discarded: number } {
  const out = { pending: 0, accepted: 0, applied: 0, discarded: 0 };
  let fence = false;
  for (const raw of content.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("```")) fence = !fence;
    if (fence) continue;
    if (/^[-*]\s+\[ \]\s+\S/.test(l)) out.pending++;
    else if (/^[-*]\s+\[x\]\s+\S/i.test(l)) {
      out.accepted++;
      if (l.includes("→")) out.applied++;
    } else if (/^[-*]\s+~~/.test(l)) out.discarded++;
  }
  return out;
}

function analyzeSource(content: string, sec: Map<string, string>): Guide {
  const p = proposalsOf(content);
  const total = p.pending + p.accepted + p.discarded;
  const steps = SOURCE_STEPS;
  const checks: (() => Missing[])[] = [
    () =>
      has(sec.get("resumo")) && total > 0
        ? []
        : [{ id: "extracao", label: "Extração do Claude (resumo e propostas)", ask: "", action: "extract" }],
    () =>
      p.pending === 0
        ? []
        : [{ id: "revisao", label: `Revisar ${p.pending} ${p.pending === 1 ? "proposta" : "propostas"} (aceite ou descarte cada uma)`, ask: "", action: "review" }],
    () => {
      const n = p.accepted - p.applied;
      return n === 0 ? [] : [{ id: "aplicacao", label: `Aplicar ${n} ${n === 1 ? "proposta aceita" : "propostas aceitas"} nas specs`, ask: "", action: "apply" }];
    },
  ];
  let reached = 0;
  let missing: Missing[] = [];
  for (const c of checks) {
    missing = c();
    if (missing.length) break;
    reached++;
  }
  return { kind: "source", steps, reached, current: reached < steps.length ? steps[reached] : null, missing, doubts: 0 };
}

/** Itens "- Chave: valor" de uma seção, com a chave sem acento; valor vazio não conta. */
export function keyValues(body: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of bullets(body)) {
    const m = l.replace(/^[-*]\s+/, "").match(/^\**([^:*]+?)\**\s*:\s*(.+)$/);
    if (m && m[2].trim()) out.set(norm(m[1]), m[2].trim());
  }
  return out;
}

export type Endpoint = { id: string; method: string; path: string; description: string; who: string; errors: string };
export type DomainEvent = { id: string; name: string; when: string; fields: string; consumers: string };

/** Endpoints e eventos declarados nas tabelas de "API e contratos" (reconhecidos pelo cabeçalho). */
export function contractsOf(body: string | undefined): { endpoints: Endpoint[]; events: DomainEvent[] } {
  const endpoints: Endpoint[] = [];
  const events: DomainEvent[] = [];
  for (const part of (body ?? "").split(/^###\s+/m)) {
    const t = tableOf(part);
    const col = (names: string[]) => t.header.findIndex((h) => names.some((n) => norm(h).startsWith(n)));
    const cell = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
    if (col(["caminho"]) >= 0) {
      const [i, m, c, d, q, e] = [col(["id"]), col(["metodo"]), col(["caminho"]), col(["descricao"]), col(["quem"]), col(["erro"])];
      for (const r of t.rows) endpoints.push({ id: cell(r, i), method: cell(r, m), path: cell(r, c), description: cell(r, d), who: cell(r, q), errors: cell(r, e) });
    } else if (col(["evento"]) >= 0) {
      const [i, n, w, f, c] = [col(["id"]), col(["evento"]), col(["quando"]), col(["campos"]), col(["consumido"])];
      for (const r of t.rows) events.push({ id: cell(r, i), name: cell(r, n), when: cell(r, w), fields: cell(r, f), consumers: cell(r, c) });
    }
  }
  return { endpoints, events };
}

const askDoubt = (sec: Map<string, string>) => `Vamos resolver a dúvida: ${bullets(sec.get("duvidas em aberto")).find((l) => !isDone(l))?.replace(/^[-*]\s+/, "") ?? ""}`;

function analyzeService(content: string, sec: Map<string, string>): Guide {
  const stack = keyValues(sec.get("stack"));
  const checks: (() => Missing[])[] = [
    () => {
      const m: Missing[] = [];
      if (!has(sec.get("responsabilidade"))) m.push({ id: "responsabilidade", label: "Responsabilidade, em uma frase", section: "Responsabilidade", ask: "Em uma ou duas frases, o que este serviço faz e por que ele é separado?" });
      if (bullets(sec.get("modulos que cobre")).length === 0) m.push({ id: "modulos", label: "Módulos que o serviço cobre", section: "Módulos que cobre", ask: "Quais módulos (M01, M02…) este serviço implementa?" });
      return m;
    },
    () => {
      const m: Missing[] = [];
      if (!stack.has("linguagem") || !stack.has("framework"))
        m.push({ id: "stack", label: "Stack (linguagem e framework)", section: "Stack", ask: "Qual é a stack deste serviço: linguagem, framework, banco de dados e ferramenta de testes?" });
      if (!has(sec.get("dados proprios"))) m.push({ id: "dados", label: "Dados próprios (ou declarar que não há)", section: "Dados próprios", ask: "Que dados este serviço guarda e controla sozinho? Onde ficam guardados?" });
      return m;
    },
    () => {
      const m: Missing[] = [];
      const api = sec.get("api e contratos");
      const { endpoints, events } = contractsOf(api);
      if (endpoints.length + events.length === 0 && !(has(api) && /n[ãa]o (exp[õo]e|h[áa]|possui)|nenhum/i.test(api ?? "")))
        m.push({ id: "api", label: "API e contratos (tabelas de endpoints ou eventos, ou declarar que não expõe)", section: "API e contratos", ask: "O que este serviço expõe a outros? Para cada endpoint: método, caminho, descrição, quem acessa e erros possíveis. Para cada evento: quando é publicado, campos e quem consome. Proponho montar as tabelas." });
      const sem = endpoints.filter((e) => !e.method || !e.path || !e.errors);
      if (sem.length)
        m.push({ id: "contrato-incompleto", label: `Completar ${sem.length} ${sem.length === 1 ? "endpoint sem" : "endpoints sem"} método, caminho ou erros`, section: "API e contratos", ask: `O endpoint ${sem[0].id || sem[0].path || sem[0].description} está incompleto: falta ${!sem[0].method ? "o método" : !sem[0].path ? "o caminho" : "a lista de erros possíveis"}. Qual é?` });
      if (!has(sec.get("dependencias"))) m.push({ id: "dependencias", label: "Dependências (ou declarar que não há)", section: "Dependências", ask: "De quais outros serviços ou sistemas externos este serviço depende?" });
      if (!has(sec.get("implantacao"))) m.push({ id: "implantacao", label: "Implantação", section: "Implantação", ask: "Como este serviço é empacotado e implantado (contêiner, servidor, variáveis de ambiente)?" });
      const d = doubtsOf(sec);
      if (d > 0) m.push({ id: "duvidas", label: `Resolver ${d} ${d === 1 ? "dúvida em aberto" : "dúvidas em aberto"}`, section: "Dúvidas em aberto", ask: askDoubt(sec) });
      return m;
    },
  ];
  let reached = 0;
  let missing: Missing[] = [];
  for (const c of checks) {
    missing = c();
    if (missing.length) break;
    reached++;
  }
  void content;
  return { kind: "service", steps: SERVICE_STEPS, reached, current: reached < SERVICE_STEPS.length ? SERVICE_STEPS[reached] : null, missing, doubts: doubtsOf(sec) };
}

/** Etapa e pendências de um documento; nulo para arquivos que não são feature nem módulo. */
export function analyzeDoc(rel: string, content: string): Guide | null {
  const kind = kindOfPath(rel);
  if (!kind) return null;
  const sec = sectionsOf(content);
  if (kind === "source") return analyzeSource(content, sec);
  if (kind === "concept") return analyzeConcept(content, sec);
  if (kind === "matrix") return analyzeMatrix(content);
  if (kind === "service") return analyzeService(content, sec);
  if (kind === "architecture") return null; // o guia da arquitetura é do projeto todo: ver architecture.ts
  const defs = kind === "feature" ? featureSteps : moduleSteps;
  const steps = kind === "feature" ? FEATURE_STEPS : MODULE_STEPS;
  const doubts = doubtsOf(sec);

  const declared = field(content, "Etapa");
  if (kind === "feature" && declared && LATER_STATUS.includes(norm(declared))) {
    return { kind, steps, reached: steps.length, current: null, missing: [], doubts, status: declared };
  }

  let reached = 0;
  let missing: Missing[] = [];
  for (const d of defs) {
    missing = d.check(content, sec);
    if (missing.length) break;
    reached++;
  }

  // "Pronta para dev" não se deduz do texto: é a confirmação depois da revisão final.
  if (kind === "feature" && reached === defs.length) {
    if (declared && norm(declared) === "pronta para dev") reached = steps.length;
    else missing = [{ id: "revisao", label: "Revisão final e confirmação", ask: "Revisar a feature contra o Conceito, as permissões e as permissões e confirmar que está pronta." }];
  }

  return { kind, steps, reached, current: reached < steps.length ? steps[reached] : null, missing, doubts };
}
