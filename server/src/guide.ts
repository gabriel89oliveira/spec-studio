/**
 * Guia de etapas: a partir do texto de uma feature ou de um módulo, descobre em que etapa o
 * documento está e o que falta para a próxima. Só olha a estrutura (seções e listas), nunca
 * julga o conteúdo. A mesma regra serve ao cartão "Próximo passo" e ao modo simulado.
 */

export type DocKind = "feature" | "module" | "source";

export type Missing = {
  id: string;
  /** Texto curto para a tela. */
  label: string;
  /** Pergunta que o Claude faz na entrevista. */
  ask: string;
  /** Seção do arquivo onde a resposta entra. */
  section?: string;
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
  return null;
}

/** Seções de nível 2, pelo título sem acento. Comentários HTML não contam. */
export function sectionsOf(content: string): Map<string, string> {
  const text = content.replace(/<!--[\s\S]*?-->/g, "");
  const out = new Map<string, string>();
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  const heads: { title: string; start: number; end: number }[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) heads.push({ title: norm(m[1]), start: m.index + m[0].length, end: m.index });
  heads.forEach((h, i) => {
    const stop = heads[i + 1]?.end ?? text.length;
    if (!out.has(h.title)) out.set(h.title, text.slice(h.start, stop));
  });
  return out;
}

const lines = (body: string | undefined) => (body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const bullets = (body: string | undefined) => lines(body).filter((l) => /^[-*]\s+\S/.test(l));
const isDone = (l: string) => /^[-*]\s+(\[x\]|~~)/i.test(l);
const has = (body: string | undefined) => lines(body).length > 0;

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

function doubtsOf(sec: Map<string, string>): number {
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

/** Etapa e pendências de um documento; nulo para arquivos que não são feature nem módulo. */
export function analyzeDoc(rel: string, content: string): Guide | null {
  const kind = kindOfPath(rel);
  if (!kind) return null;
  const sec = sectionsOf(content);
  if (kind === "source") return analyzeSource(content, sec);
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
    else missing = [{ id: "revisao", label: "Revisão final e confirmação", ask: "Revisar a feature contra o Conceito, as permissões e o Glossário e confirmar que está pronta." }];
  }

  return { kind, steps, reached, current: reached < steps.length ? steps[reached] : null, missing, doubts };
}
