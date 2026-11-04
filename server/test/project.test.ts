import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/app.js";
import { checkProject } from "../src/consistency.js";
import { loadProject, parseDecisions } from "../src/project.js";
import { devPack, setStage, stageOf, storiesOf, testPlan } from "../src/views.js";
import { makeConfig } from "./helpers.js";
import os from "node:os";

const w = (dir: string, rel: string, c: string) => {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, c);
};

const FEATURE = (extra = "", etapa = "Ideia", mod = "M01") =>
  `# F01 — Abrir ordem\n\n| Campo | Valor |\n|---|---|\n| Módulo | ${mod} |\n| Etapa | ${etapa} |\n\n## Objetivo\nAbrir uma ordem.\n\n## Quem usa\n- Gestor\n- Mecânico\n\n## Histórias de usuário\n\n### US-01.1 — Abrir pelo painel\nComo gestor, quero abrir.\n\n**Critérios de aceite**\n- Dado um veículo, quando abro, então a ordem é criada.\n- Dado veículo inexistente, então erro.\n\n## Fora do escopo\n- Pagamento\n\n## Regras de negócio\n- RN-01.1 Uma ordem por veículo.\n\n## Permissões\n- Abrir ordem — Gestor, Auditor\n${extra}`;

const CONCEITO = `# DriveB — Conceito\n\n## Resumo\nFrotas.\n\n## Problema\nPlanilhas.\n\n## Perfis de usuário\n| Perfil | Quem é | O que precisa fazer |\n|---|---|---|\n| Gestor | Dono | Acompanhar |\n\n## Solução\nPainel.\n\n## Escopo\n**Dentro (MVP)**\n- Ordens\n\n**Fora (por enquanto)**\n- Pagamento\n\n## Mapa de módulos\n| ID | Módulo | Responsabilidade |\n|---|---|---|\n| M01 | Ordens | Ordens |\n| M02 | Frota | Veículos |\n\n## Requisitos gerais\n- LGPD\n\n## Diretrizes técnicas\nNode.\n`;

const MATRIZ = `# Matriz\n\n## Ações\n| Ação | Módulo | Gestor | Condição |\n|---|---|---|---|\n| Criar ordem | M09 | S | |\n`;

const DECISOES = `# Registro\n\n## D-002 — Qual gateway de pagamento?\n- **Status:** Em discussão\n- **Afeta:** F01, F99\n- **Quem decide:** Gabriel\n- **Prazo:** 2020-01-01\n\n**Contexto:** precisamos cobrar.\n\n**Opções**\n1. **A:** barato\n2. **B:** caro\n\n**Histórico**\n- 2020-01-01 — registrada\n\n---\n\n## D-001 — Banco\n- **Status:** Decidida\n- **Afeta:** M01\n\n**Decisão:**\n**Decidido em:** 2020-02-02 · **Por:** Gabriel\n`;

function proj() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "spec-proj-")));
  w(dir, "CLAUDE.md", "# x\n");
  w(dir, "docs/CONCEITO.md", CONCEITO);
  w(dir, "docs/permissoes.md", MATRIZ);
  w(dir, "docs/decisoes.md", DECISOES);
  w(dir, "docs/modulos/M01-ordens.md", "# M01 — Ordens\n\n## Responsabilidade\nOrdens.\n");
  w(dir, "docs/modulos/M03-extra.md", "# M03 — Extra\n");
  w(dir, "docs/features/F01-abrir-ordem.md", FEATURE());
  return dir;
}

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("modelo do projeto", () => {
  it("lê Conceito, matriz, módulos, features e decisões", () => {
    const p = loadProject(proj());
    expect(p.concept?.profiles).toEqual(["Gestor"]);
    expect(p.concept?.moduleIds).toEqual(["M01", "M02"]);
    expect(p.matrix?.profiles).toEqual(["Gestor"]);
    expect(p.modules.map((m) => m.id)).toEqual(["M01", "M03"]);
    expect(p.features[0]).toMatchObject({ id: "F01", moduleId: "M01", profiles: ["Gestor", "Mecânico"] });
    expect(p.features[0].actions).toEqual([{ name: "Abrir ordem", profiles: ["Gestor", "Auditor"] }]);
  });

  it("interpreta decisões", () => {
    const [d2, d1] = parseDecisions(DECISOES);
    expect(d2).toMatchObject({ id: "D-002", status: "Em discussão", affects: ["F01", "F99"], deadline: "2020-01-01", decider: "Gabriel" });
    expect(d2.options).toHaveLength(2);
    expect(d2.history).toHaveLength(1);
    expect(d1).toMatchObject({ id: "D-001", status: "Decidida", decidedOn: "2020-02-02", decidedBy: "Gabriel" });
  });
});

describe("consistência", () => {
  it("cruza os documentos e aponta o que não bate", () => {
    const ids = checkProject(loadProject(proj()), "2026-01-01").map((i) => i.id);
    expect(ids).toContain("perfil-fora-do-conceito:F01:mecanico");
    expect(ids).toContain("perfil-fora-da-matriz:F01:abrir ordem:auditor");
    expect(ids).toContain("acao-fora-da-matriz:F01:abrir ordem");
    expect(ids).toContain("modulo-sem-arquivo:M02");
    expect(ids).toContain("modulo-fora-do-conceito:M03");
    expect(ids).toContain("matriz-modulo-inexistente:M09:criar ordem");
    expect(ids).toContain("decisao-vencida:D-002");
    expect(ids).toContain("decisao-ref-inexistente:D-002:F99");
    expect(ids).toContain("decisao-sem-resultado:D-001");
  });

  it("feature marcada pronta sem estar detalhada é erro; módulo inexistente também", () => {
    const dir = proj();
    w(dir, "docs/features/F02-x.md", "# F02 — X\n\n| Campo | Valor |\n|---|---|\n| Módulo | M07 |\n| Etapa | Pronta para dev |\n\n## Objetivo\nAlgo.\n");
    const issues = checkProject(loadProject(dir), "2026-01-01");
    expect(issues.find((i) => i.id === "pronta-incompleta:F02")?.severity).toBe("erro");
    expect(issues.find((i) => i.id === "modulo-inexistente:F02")?.severity).toBe("erro");
    expect(issues[0].severity).toBe("erro");
  });

  it("projeto limpo não tem problemas", () => {
    const dir = proj();
    w(dir, "docs/decisoes.md", "# Registro\n");
    w(dir, "docs/permissoes.md", "# M\n\n## Ações\n| Ação | Módulo | Gestor | Auditor | Condição |\n|---|---|---|---|---|\n| Abrir ordem | M01 | S | N | |\n");
    w(dir, "docs/CONCEITO.md", CONCEITO.replace("| Gestor | Dono | Acompanhar |", "| Gestor | Dono | Acompanhar |\n| Mecânico | x | y |"));
    w(dir, "docs/modulos/M02-frota.md", "# M02 — Frota\n");
    fs.rmSync(path.join(dir, "docs/modulos/M03-extra.md"));
    const issues = checkProject(loadProject(dir), "2026-01-01").filter((i) => i.rule !== "perfil-fora-da-matriz");
    expect(issues.map((i) => i.id)).toEqual([]);
  });
});

describe("etapas, plano de testes e pacote", () => {
  it("lê histórias e critérios, e gera um caso de teste por critério", () => {
    const p = loadProject(proj());
    expect(storiesOf(p.features[0].content)).toEqual([{ id: "US-01.1", title: "Abrir pelo painel", criteria: ["Dado um veículo, quando abro, então a ordem é criada.", "Dado veículo inexistente, então erro."] }]);
    const plan = testPlan(p.features[0]);
    expect(plan).toContain("**US-01.1.T1**");
    expect(plan).toContain("**US-01.1.T2**");
  });

  it("deduz a etapa e controla as transições", () => {
    const dir = proj();
    const f = loadProject(dir).features[0];
    expect(stageOf(f)).toBe("Detalhada");
    const ready = setStage(f, "Pronta para dev", f.content);
    expect(ready).toMatch(/\| Etapa \| Pronta para dev \|/);
    w(dir, "docs/features/F01-abrir-ordem.md", ready);
    const f2 = loadProject(dir).features[0];
    expect(stageOf(f2)).toBe("Pronta para dev");
    expect(() => setStage(f2, "Concluída", f2.content)).toThrow(/Não dá para ir/);
    const dev = setStage(f2, "Em desenvolvimento", f2.content);
    w(dir, "docs/features/F01-abrir-ordem.md", dev);
    expect(stageOf(loadProject(dir).features[0])).toBe("Em desenvolvimento");
  });

  it("não deixa marcar como pronta uma feature incompleta", () => {
    const dir = proj();
    w(dir, "docs/features/F01-abrir-ordem.md", FEATURE().replace(/## Regras de negócio[\s\S]*?\n\n/, ""));
    const f = loadProject(dir).features[0];
    expect(() => setStage(f, "Pronta para dev", f.content)).toThrow();
  });

  it("monta o pacote com contexto, módulo, feature, decisões e testes", () => {
    const pack = devPack(loadProject(proj()), "f01");
    expect(pack.markdown).toContain("Diretrizes técnicas");
    expect(pack.markdown).toContain("# Módulo M01");
    expect(pack.markdown).toContain("# Feature F01");
    expect(pack.markdown).toContain("D-002");
    expect(pack.markdown).toContain("Plano de testes");
    expect(pack.warnings.join(" ")).toMatch(/não pronta/);
  });
});

describe("rotas", () => {
  it("expõe issues, overview, decisions, devpack e stage", async () => {
    const dir = proj();
    dirs.push(dir);
    const { app } = await createServer(makeConfig(dir, { mock: true }), { watch: false });
    expect((await request(app).get("/api/issues")).body.length).toBeGreaterThan(0);
    const ov = (await request(app).get("/api/overview")).body;
    expect(ov.counts).toMatchObject({ modules: 2, features: 1 });
    expect(ov.modules[0].features[0]).toMatchObject({ id: "F01", stage: "Detalhada" });
    expect((await request(app).get("/api/decisions")).body).toHaveLength(2);
    const dp = await request(app).get("/api/devpack?feature=F01");
    expect(dp.status).toBe(200);
    expect(dp.body.testPlan).toContain("T1");
    expect((await request(app).get("/api/devpack?feature=F77")).status).toBe(404);
    const st = await request(app).post("/api/stage").send({ path: "docs/features/F01-abrir-ordem.md", stage: "Pronta para dev" });
    expect(st.status).toBe(200);
    expect((await request(app).post("/api/stage").send({ path: "docs/features/F01-abrir-ordem.md", stage: "Concluída" })).status).toBe(409);
  });
});
