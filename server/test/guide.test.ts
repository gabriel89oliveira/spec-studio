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
  expect(analyzeDoc("docs/README.md", "# x")).toBeNull();
  expect(analyzeDoc("docs/_templates/feature.md", "# x")).toBeNull();
});

describe("guia de fonte", () => {
  const S = "docs/fontes/S01-x.md";
  const vazia = "# S01 — Reunião\n\n| Campo | Valor |\n|---|---|\n| Tipo | Reunião |\n\n## Resumo\n\n## Requisitos\n";
  it("percorre Importada, Revisada e Aplicada pelas marcas das propostas", () => {
    expect(analyzeDoc(S, vazia)).toMatchObject({ kind: "source", reached: 0, current: "Importada" });
    expect(analyzeDoc(S, vazia)!.missing[0].action).toBe("extract");

    const pend = vazia.replace("## Resumo\n", "## Resumo\nConversa sobre oficinas.\n") + "- [ ] Gestor aprova orçamento — [14:32]\n- [ ] Oficina emite nota — [15:10]\n";
    let g = analyzeDoc(S, pend)!;
    expect(g).toMatchObject({ reached: 1, current: "Revisada" });
    expect(g.missing[0]).toMatchObject({ action: "review" });
    expect(g.missing[0].label).toContain("2 propostas");

    const aceitas = pend.replace("- [ ] Gestor", "- [x] Gestor").replace("- [ ] Oficina emite nota — [15:10]", "- ~~Oficina emite nota~~ — [15:10]");
    g = analyzeDoc(S, aceitas)!;
    expect(g).toMatchObject({ reached: 2, current: "Aplicada" });
    expect(g.missing[0]).toMatchObject({ action: "apply" });

    const aplicada = aceitas.replace("[14:32]", "[14:32] → F01");
    expect(analyzeDoc(S, aplicada)).toMatchObject({ reached: 3, current: null });
  });

  it("ignora marcas dentro de bloco de código", () => {
    const c = "# S\n\n## Resumo\nx\n\n```\n- [ ] exemplo\n```\n- [x] real → F01\n";
    expect(analyzeDoc("docs/fontes/S02-y.md", c)).toMatchObject({ reached: 3 });
  });
});

describe("guia do Conceito", () => {
  const C = "docs/CONCEITO.md";
  const empty = "# [Nome do projeto] — Conceito\n\n## Resumo\n\n## Problema\n\n## Perfis de usuário\n| Perfil | Quem é | O que precisa fazer |\n|---|---|---|\n\n## Solução\n\n## Escopo\n**Dentro (MVP)**\n\n**Fora (por enquanto)**\n\n## Mapa de módulos\n| ID | Módulo | Responsabilidade |\n|---|---|---|\n\n## Requisitos gerais\n\n## Diretrizes técnicas\n";
  const visao = empty
    .replace("[Nome do projeto]", "DriveB")
    .replace("## Resumo\n", "## Resumo\nPlataforma de manutenção de frotas.\n")
    .replace("## Problema\n", "## Problema\nOrdens se perdem em planilhas.\n")
    .replace("|---|---|---|\n\n## Solução", "|---|---|---|\n| Gestor | Dono da frota | Acompanhar |\n\n## Solução");
  const escopo = visao
    .replace("## Solução\n", "## Solução\nUm painel único.\n")
    .replace("**Dentro (MVP)**\n", "**Dentro (MVP)**\n- Abrir ordem\n")
    .replace("**Fora (por enquanto)**\n", "**Fora (por enquanto)**\n- Pagamento\n")
    .replace("| ID | Módulo | Responsabilidade |\n|---|---|---|\n", "| ID | Módulo | Responsabilidade |\n|---|---|---|\n| M01 | Ordens | Abrir e acompanhar |\n");

  it("template vazio pede o nome, resumo, problema e perfis", () => {
    const g = analyzeDoc(C, empty)!;
    expect(g.kind).toBe("concept");
    expect(g.reached).toBe(0);
    expect(g.missing.map((m) => m.id)).toEqual(["nome", "resumo", "problema", "perfis"]);
  });
  it("avança por Visão, Escopo e Requisitos", () => {
    expect(analyzeDoc(C, visao)).toMatchObject({ reached: 1, current: "Escopo" });
    expect(analyzeDoc(C, visao)!.missing.map((m) => m.id)).toEqual(["solucao", "escopo", "modulos"]);
    expect(analyzeDoc(C, escopo)).toMatchObject({ reached: 2, current: "Requisitos" });
    const done = escopo.replace("## Requisitos gerais\n", "## Requisitos gerais\n- LGPD\n").replace("## Diretrizes técnicas\n", "## Diretrizes técnicas\nNode e Postgres.\n");
    expect(analyzeDoc(C, done)).toMatchObject({ reached: 3, current: null });
  });
});

describe("guia da matriz de permissões", () => {
  const P = "docs/permissoes.md";
  const base = "# Matriz\n\n## Ações\n| Ação | Módulo | Condição |\n|---|---|---|\n";
  it("sem perfis, depois sem ações, depois células vazias, depois pronta", () => {
    expect(analyzeDoc(P, base)!.missing.map((m) => m.id)).toEqual(["perfis"]);
    const comPerfis = "# Matriz\n\n## Ações\n| Ação | Módulo | Gestor | Mecânico | Condição |\n|---|---|---|---|---|\n";
    expect(analyzeDoc(P, comPerfis)).toMatchObject({ reached: 1, current: "Ações" });
    const vazia = comPerfis + "| Abrir ordem | M01 | S | | |\n";
    const g = analyzeDoc(P, vazia)!;
    expect(g).toMatchObject({ reached: 2, current: "Preenchida" });
    expect(g.missing[0].label).toContain("1 célula");
    expect(analyzeDoc(P, comPerfis + "| Abrir ordem | M01 | S | N | |\n")).toMatchObject({ reached: 3, current: null });
  });
});
