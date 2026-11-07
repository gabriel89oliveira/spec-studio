import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeArchitecture, rnfsOf, vagueSpec } from "../src/architecture.js";
import { createServer } from "../src/app.js";
import { checkProject } from "../src/consistency.js";
import { analyzeDoc } from "../src/guide.js";
import { loadProject } from "../src/project.js";
import { scaffoldArchitecture } from "../src/scaffold.js";
import { overview } from "../src/views.js";
import { makeConfig } from "./helpers.js";

const KIT = path.resolve(__dirname, "../../kit");
const w = (dir: string, rel: string, c: string) => {
  const abs = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, c);
};
const dirs: string[] = [];
const open: { close?: () => Promise<void> | void }[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close?.();
  dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});
const tmp = () => {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "spec-arq-")));
  dirs.push(d);
  return d;
};

const SERVICE = (id = "SV01", mods = "- M01", stack = "- Linguagem: PHP\n- Framework: Laravel") =>
  `# ${id} — API\n\n## Responsabilidade\nRegras de negócio.\n\n## Módulos que cobre\n${mods}\n\n## Stack\n${stack}\n\n## Dados próprios\nPostgres.\n`;
const VISAO = (diagram = "SV01") =>
  `# Visão\n\n## Contexto e restrições\n100 usuários.\n\n## Estilo de arquitetura\nMonólito modular.\n\n## Componentes\n\`\`\`mermaid\ngraph TD\n  ${diagram}[API]\n\`\`\`\n`;

function project() {
  const dir = tmp();
  w(dir, "CLAUDE.md", "# x\n");
  w(dir, "docs/CONCEITO.md", "# X — Conceito\n\n## Mapa de módulos\n| ID | Módulo | Responsabilidade |\n|---|---|---|\n| M01 | Ordens | Ordens |\n| M02 | Frota | Veículos |\n");
  w(dir, "docs/modulos/M01-ordens.md", "# M01 — Ordens\n\n## Responsabilidade\nOrdens.\n\n## Integrações externas\n- Pagamento: cobrança\n");
  w(dir, "docs/modulos/M02-frota.md", "# M02 — Frota\n\n## Responsabilidade\nVeículos.\n");
  return dir;
}

describe("guia de serviço", () => {
  it("avança por etapas", () => {
    const g0 = analyzeDoc("docs/arquitetura/servicos/SV01-api.md", "# SV01 — API\n\n## Responsabilidade\nX.\n");
    expect(g0).toMatchObject({ kind: "service", current: "Ideia" });
    expect(g0!.missing[0].id).toBe("modulos");
    const g1 = analyzeDoc("docs/arquitetura/servicos/SV01-api.md", SERVICE());
    expect(g1).toMatchObject({ reached: 2, current: "Detalhado" });
  });
});

describe("guia de arquitetura", () => {
  const base = { visao: null, dados: null, infra: null, rnf: null, services: [], moduleIds: ["M01"] };
  it("começa pelo contexto e traz arquivo e seção em cada pendência", () => {
    const g = analyzeArchitecture(base);
    expect(g).toMatchObject({ kind: "architecture", reached: 0, current: "Contexto" });
    expect(g.missing[0]).toMatchObject({ file: "docs/arquitetura/visao.md", section: "Contexto e restrições" });
  });
  it("exige serviço, stack, diagrama e cobertura dos módulos", () => {
    const svc = { id: "SV01", path: "docs/arquitetura/servicos/SV01-api.md", content: SERVICE("SV01", "- M01", "- Linguagem: PHP") };
    const g = analyzeArchitecture({ ...base, visao: VISAO(), services: [svc], moduleIds: ["M01", "M02"] });
    expect(g.current).toBe("Serviços");
    expect(g.missing.map((m) => m.id)).toEqual(["stack:SV01", "mapa"]);
  });
  it("lê requisitos não funcionais", () => {
    const r = rnfsOf("## Requisitos\n\n| ID | Categoria | Meta | Como medir | Atendido por |\n|---|---|---|---|---|\n| RNF-01 | Desempenho | < 2 s | teste de carga | SV01 |\n");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "RNF-01", goal: "< 2 s" });
  });
  it("avisa quando a spec está vaga", () => {
    expect(vagueSpec({ conceptCurrent: "Escopo", modules: [{ id: "M01", reached: 0 }], decisionsOpen: 2, hasRequirements: false }).length).toBeGreaterThan(0);
  });
});

describe("modelo, visão geral e consistência", () => {
  it("lista serviços, cruza módulos e aponta problemas", () => {
    const dir = project();
    w(dir, "docs/arquitetura/visao.md", VISAO("SV01"));
    w(dir, "docs/arquitetura/servicos/SV01-api.md", SERVICE("SV01", "- M01\n- M09", "- Linguagem: PHP"));
    w(dir, "docs/arquitetura/servicos/SV02-web.md", SERVICE("SV02", "- M01"));
    w(dir, "docs/arquitetura/dados-e-integracoes.md", "# D\n\n## Dados\nX\n\n## Integrações\n- SV07\n");
    const p = loadProject(dir);
    expect(p.architecture.services.map((s) => s.id)).toEqual(["SV01", "SV02"]);
    const rules = checkProject(p).map((i) => i.rule);
    for (const r of ["servico-inexistente", "servico-modulo-inexistente", "servico-sem-stack", "modulo-em-varios-servicos", "modulo-sem-servico", "servico-fora-do-diagrama", "integracao-nao-desenhada"])
      expect(rules, r).toContain(r);
    const ov = overview(p, checkProject(p));
    expect(ov.architecture.started).toBe(true);
    expect(ov.architecture.services.find((s) => s.id === "SV01")!.modules).toEqual(["M01", "M09"]);
    expect(ov.architecture.uncovered).toEqual(["M02"]);
  });
  it("sem arquitetura não gera problemas nem marca como iniciada", () => {
    const p = loadProject(project());
    expect(checkProject(p).filter((i) => /servico|rnf|integracao/.test(i.rule))).toEqual([]);
    expect(overview(p, checkProject(p)).architecture.started).toBe(false);
  });
});

describe("scaffold e entrevista (modo simulado)", () => {
  it("cria os arquivos que faltam sem sobrescrever e acrescenta o bloco ao CLAUDE.md", () => {
    const dir = project();
    const created = scaffoldArchitecture(dir, KIT);
    expect(created).toContain("docs/arquitetura/visao.md");
    expect(created).toContain("docs/_templates/servico.md");
    expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toContain("docs/arquitetura");
    w(dir, "docs/arquitetura/visao.md", "# meu\n");
    expect(scaffoldArchitecture(dir, KIT)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "docs/arquitetura/visao.md"), "utf8")).toBe("# meu\n");
  });

  it("entrevista: pergunta, grava na seção certa e avança", async () => {
    const dir = project();
    const srv = await createServer(makeConfig(dir, { apiKey: undefined, mock: true }), { watch: false, kitDir: KIT });
    open.push(srv);
    const api = request(srv.app);
    const start = await api.post("/api/chat").send({ message: "Entrevista de arquitetura.\nSiga docs/arquitetura/README.md." }).expect(202);
    await srv.jobs.idle;
    expect(fs.existsSync(path.join(dir, "docs/arquitetura/visao.md"))).toBe(true);
    await api.post("/api/chat").send({ sessionId: start.body.sessionId, message: "Cerca de 200 usuários, equipe de 3 pessoas." }).expect(202);
    await srv.jobs.idle;
    expect(fs.readFileSync(path.join(dir, "docs/arquitetura/visao.md"), "utf8")).toMatch(/## Contexto e restrições\n\nCerca de 200 usuários/);
    const g = (await api.get("/api/file").query({ path: "docs/arquitetura/visao.md" })).body.guide;
    expect(g.kind).toBe("architecture");
    expect(g.missing[0].id).toBe("estilo");
  });
});
