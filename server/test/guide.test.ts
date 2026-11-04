import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../src/guide.js";

const F = "docs/features/F01-x.md";
const M = "docs/modulos/M01-x.md";

const seed = "# F01 — X\n\n| Campo | Valor |\n|---|---|\n| Módulo | M01 |\n| Etapa | Ideia |\n\n## Objetivo\n\n## Quem usa\n";
const ideia = seed.replace("## Objetivo\n", "## Objetivo\nPermitir abrir uma ordem.\n").replace("## Quem usa\n", "## Quem usa\n- Gestor\n");
const entendida = `${ideia}\n## Histórias de usuário\n\n### US-01.1 — Abrir pelo painel\nComo gestor, quero abrir, para começar.\n\n## Fora do escopo\n- Pagamento\n`;
const detalhada = entendida
  .replace("para começar.\n", "para começar.\n\n**Critérios de aceite**\n- Dado um veículo, quando abro, então a ordem é criada.\n")
  .concat("\n## Regras de negócio\n- RN-01.1 Uma ordem por veículo.\n");

describe("guia de feature", () => {
  it("esqueleto vazio: falta objetivo e quem usa, módulo já informado", () => {
    const g = analyzeDoc(F, seed)!;
    expect(g.reached).toBe(0);
    expect(g.current).toBe("Ideia");
    expect(g.missing.map((m) => m.id)).toEqual(["objetivo", "quem-usa"]);
  });

  it("placeholder de módulo (M00) conta como módulo faltando", () => {
    expect(analyzeDoc(F, seed.replace("M01", "[M00]"))!.missing.map((m) => m.id)).toContain("modulo");
  });

  it("avança por etapas conforme o arquivo ganha seções", () => {
    expect(analyzeDoc(F, ideia)).toMatchObject({ reached: 1, current: "Entendida" });
    expect(analyzeDoc(F, entendida)).toMatchObject({ reached: 2, current: "Detalhada" });
    expect(analyzeDoc(F, entendida)!.missing.map((m) => m.id)).toEqual(["criterios", "regras"]);
    const g = analyzeDoc(F, detalhada)!;
    expect(g).toMatchObject({ reached: 3, current: "Pronta para dev" });
    expect(g.missing.map((m) => m.id)).toEqual(["revisao"]);
  });

  it("dúvida em aberto segura a etapa Detalhada; marcada com [x] libera", () => {
    const open = `${detalhada}\n## Dúvidas em aberto\n- Quem aprova?\n`;
    expect(analyzeDoc(F, open)).toMatchObject({ reached: 2, doubts: 1 });
    expect(analyzeDoc(F, open.replace("- Quem aprova?", "- [x] Quem aprova?"))).toMatchObject({ reached: 3, doubts: 0 });
  });

  it("Etapa declarada Pronta para dev fecha as quatro etapas; depois vira só situação", () => {
    const pronta = detalhada.replace("| Etapa | Ideia |", "| Etapa | Pronta para dev |");
    expect(analyzeDoc(F, pronta)).toMatchObject({ reached: 4, current: null });
    expect(analyzeDoc(F, seed.replace("Ideia", "Em desenvolvimento"))).toMatchObject({ reached: 4, current: null, status: "Em desenvolvimento" });
  });

  it("ignora comentário HTML e texto de seção vazia", () => {
    expect(analyzeDoc(F, seed.replace("## Objetivo\n", "## Objetivo\n<!-- uma frase -->\n"))!.missing[0].id).toBe("objetivo");
  });
});

describe("guia de módulo", () => {
  const base = "# M01 — X\n\n## Responsabilidade\n\n## Perfis envolvidos\n";
  it("percorre Ideia, Mapeado e Detalhado", () => {
    expect(analyzeDoc(M, base)).toMatchObject({ reached: 0, current: "Ideia" });
    const ideia = base.replace("## Responsabilidade\n", "## Responsabilidade\nRede de oficinas.\n").replace("## Perfis envolvidos\n", "## Perfis envolvidos\n- Gestor\n");
    expect(analyzeDoc(M, ideia)).toMatchObject({ reached: 1, current: "Mapeado" });
    const mapeado = `${ideia}\n## Entidades\n- Oficina\n\n## Fora deste módulo\n- Pagamento, no M03\n`;
    expect(analyzeDoc(M, mapeado)).toMatchObject({ reached: 2, current: "Detalhado" });
    const det = `${mapeado}\n## Ciclo de vida\nAtiva, suspensa.\n\n## Relação com outros módulos\nNenhuma.\n`;
    expect(analyzeDoc(M, det)).toMatchObject({ reached: 3, current: null });
  });
});

it("só analisa features e módulos", () => {
  expect(analyzeDoc("docs/CONCEITO.md", "# x")).toBeNull();
  expect(analyzeDoc("docs/_templates/feature.md", "# x")).toBeNull();
});
