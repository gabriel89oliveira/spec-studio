import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/app.js";
import { checkProject } from "../src/consistency.js";
import { loadProject } from "../src/project.js";
import { BIG_SOURCE_CHARS, sliceText } from "../src/slicing.js";
import { overview } from "../src/views.js";
import { makeConfig } from "./helpers.js";

const KIT = path.resolve(__dirname, "../../kit");
const PAD = "Texto de apoio da regra com detalhes de implementação. ".repeat(40);

function bigDoc(rules = 12): string {
  const out: string[] = ["# Mapa de regras", "", "## Como ler este documento", "", "Cada regra tem peso de 0 a 20.", "", "## Ranking geral", "", "| # | ID | Regra |", "|---|---|---|"];
  for (let i = 1; i <= 25; i++) out.push(`| ${i} | RN-AAA-${String(i).padStart(2, "0")} | Regra ${i} |`);
  out.push("", "## Detalhamento", "");
  for (let i = 1; i <= rules; i++) {
    const dom = i % 2 ? "A — Pedidos" : "B — Cobrança";
    out.push(`### ${i}. RN-AAA-${String(i).padStart(2, "0")} — Regra número ${i}`, "", `- **Domínio:** ${dom}`, `- **Peso:** ${20 - i}/20`, `- **O que faz:** faz a coisa ${i}. ${PAD}`, `- **Onde está:** \`x/Y.java:${i}\``, "");
  }
  out.push("## Anexo A — Regras menores", "", "### A — Pedidos", "", "| ID | Regra | Onde |", "|---|---|---|", "| RN-AAA-M01 | Menor um | `a.java:1` |", "| RN-AAA-M02 | Menor dois | `a.java:2` |", "", "### B — Cobrança", "", "| ID | Regra | Onde |", "|---|---|---|", "| RN-AAA-M03 | Menor três | `b.java:3` |", "| RN-AAA-99 | Só na tabela | `b.java:9` |");
  return out.join("\n");
}

describe("fatiamento", () => {
  it("separa blocos e linhas de tabela, com grupo, peso e introdução", () => {
    const text = bigDoc();
    const s = sliceText(text);
    expect(s.strategy).toBe("ids");
    expect(s.pieces.filter((p) => p.kind === "bloco")).toHaveLength(12);
    // Linhas de tabela: as do anexo e os IDs do ranking que não têm bloco de detalhe (13 a 25).
    const rows = s.pieces.filter((p) => p.kind === "linha").map((p) => p.id);
    expect(rows).toEqual(expect.arrayContaining(["RN-AAA-M01", "RN-AAA-M02", "RN-AAA-M03", "RN-AAA-99", "RN-AAA-13", "RN-AAA-25"]));
    expect(rows).toHaveLength(4 + 13);
    const p1 = s.pieces.find((p) => p.id === "RN-AAA-01")!;
    expect(p1).toMatchObject({ title: "Regra número 1", group: "A — Pedidos", weight: 19, kind: "bloco" });
    expect(s.pieces.find((p) => p.id === "RN-AAA-M03")!.group).toBe("B — Cobrança");
    expect(s.groups.map((g) => g.name)).toEqual(["A — Pedidos", "B — Cobrança", "Ranking geral"]);
    // A tabela de ranking (25 linhas) não faz parte da introdução herdada.
    const pre = text.split("\n").slice(s.preamble.start - 1, s.preamble.end).join("\n");
    expect(pre).toContain("Cada regra tem peso");
    expect(pre).not.toContain("| 1 | RN-AAA-01 |");
    // Um ID só presente no ranking não vira peça duplicada de um bloco existente.
    expect(s.pieces.filter((p) => p.id === "RN-AAA-01")).toHaveLength(1);
  });
  it("cada bloco termina antes do próximo título do mesmo nível", () => {
    const text = bigDoc(3);
    const s = sliceText(text);
    const [a, b] = s.pieces.filter((p) => p.kind === "bloco");
    expect(a.end).toBe(b.start - 1);
    const lines = text.split("\n");
    expect(lines[a.start - 1]).toMatch(/^### 1\. RN-AAA-01/);
    expect(lines.slice(a.start - 1, a.end).join("\n")).not.toContain("RN-AAA-02 —");
  });
  it("sem IDs usa seções, e sem títulos usa janelas de linhas", () => {
    const secs = sliceText("# T\n\n## Um\ntexto\n\n## Dois\ntexto\n\n### Dois.um\ntexto\n");
    expect(secs.strategy).toBe("secoes");
    expect(secs.pieces.map((p) => p.id)).toEqual(["SEC-001", "SEC-002", "SEC-003"]);
    const flat = sliceText(Array.from({ length: 300 }, (_, i) => `linha ${i}`).join("\n"));
    expect(flat.strategy).toBe("janelas");
    expect(flat.pieces).toHaveLength(3);
    expect(flat.pieces[0]).toMatchObject({ id: "LIN-0001", start: 1, end: 120 });
  });
  it("ignora títulos dentro de blocos de código", () => {
    const s = sliceText("## A\n```\n### RN-X-01 — falso\n```\n### RN-X-02 — um\n### RN-X-03 — dois\n### RN-X-04 — três\n");
    expect(s.pieces.map((p) => p.id)).toEqual(["RN-X-02", "RN-X-03", "RN-X-04"]);
  });
});

describe("fonte grande: índice, cobertura, descarte e pedidos", () => {
  const dirs: string[] = [];
  const servers: { close?: () => Promise<void> | void }[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) await s.close?.();
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  });

  async function setup() {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "spec-big-")));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# x\n");
    fs.writeFileSync(path.join(dir, "docs/CONCEITO.md"), "# X — Conceito\n\n## Requisitos gerais\n");
    const srv = await createServer(makeConfig(dir, { apiKey: undefined, mock: true }), { watch: false, kitDir: KIT });
    servers.push(srv);
    const api = request(srv.app);
    const text = bigDoc(80);
    expect(text.length).toBeGreaterThan(BIG_SOURCE_CHARS);
    const created = await api.post("/api/sources").send({ name: "Mapa de regras", type: "documento", fileName: "mapa.md", encoding: "text", content: text }).expect(201);
    return { dir, api, srv, ficha: created.body.ficha as string };
  }

  it("indexa a fonte e mostra tudo pendente", async () => {
    const { api } = await setup();
    const v = (await api.get("/api/sources/S01/index").expect(200)).body;
    expect(v).toMatchObject({ big: true, id: "S01", total: 84, used: 0, discarded: 0, pending: 84 });
    expect(v.groups).toHaveLength(2);
    expect(v.groups[0].summarized).toBe(false);
  });

  it("fonte pequena não é indexada", async () => {
    const { api } = await setup();
    await api.post("/api/sources").send({ name: "Pequena", type: "outro", fileName: "p.md", encoding: "text", content: "# Pequena\n\nTexto." }).expect(201);
    expect((await api.get("/api/sources/S02/index").expect(200)).body).toEqual({ big: false });
  });

  it("a cobertura vem das citações nas specs, e as descartadas pedem motivo", async () => {
    const { dir, api, ficha } = await setup();
    fs.writeFileSync(path.join(dir, "docs/CONCEITO.md"), "# X — Conceito\n\n## Requisitos gerais\n- Algo [fonte: S01, RN-AAA-01 e RN-AAA-02]\n");
    await api.post("/api/sources/S01/discard").send({ ids: ["RN-AAA-03"], reason: "" }).expect(400);
    await api.post("/api/sources/S01/discard").send({ ids: ["RN-AAA-03", "RN-AAA-M01"], reason: "regra legada, sem uso" }).expect(200);
    await api.post("/api/sources/S01/discard").send({ ids: ["RN-ZZZ-01"], reason: "x" }).expect(400);
    const v = (await api.get("/api/sources/S01/index")).body;
    expect(v).toMatchObject({ used: 2, discarded: 2, pending: 80 });
    expect(v.pieces.find((p: { id: string }) => p.id === "RN-AAA-03")).toMatchObject({ status: "descartada", reason: "regra legada, sem uso" });
    expect(v.pieces.find((p: { id: string }) => p.id === "RN-AAA-01").usedIn).toEqual(["docs/CONCEITO.md"]);
    expect(fs.readFileSync(path.join(dir, ficha), "utf8")).toMatch(/## Peças descartadas\n\n- RN-AAA-03 — regra legada, sem uso\n- RN-AAA-M01 — regra legada, sem uso/);
    // Descartar de novo não duplica.
    await api.post("/api/sources/S01/discard").send({ ids: ["RN-AAA-03"], reason: "outra" }).expect(200);
    expect(fs.readFileSync(path.join(dir, ficha), "utf8").match(/RN-AAA-03 —/g)).toHaveLength(1);
  });

  it("o guia da ficha segue índice → resumo dos grupos → destino das peças", async () => {
    const { dir, api, ficha } = await setup();
    const guide = async () => (await api.get("/api/file").query({ path: ficha })).body.guide;
    let g = await guide();
    expect(g).toMatchObject({ kind: "source", current: "Resumo dos grupos" });
    expect(g.missing[0].label).toContain("2 grupos");
    const f = path.join(dir, ficha);
    fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n## Resumo por grupo\n\n### A — Pedidos\nResumo A.\n\n### B — Cobrança\nResumo B.\n");
    g = await guide();
    expect(g).toMatchObject({ current: "Destino das peças" });
    expect(g.missing[0].label).toContain("84");
  });

  it("monta pedidos com a introdução e só as peças pedidas, com limites", async () => {
    const { api } = await setup();
    const one = (await api.post("/api/sources/S01/prompt").send({ mode: "apply", ids: ["RN-AAA-01", "RN-AAA-M02"] }).expect(200)).body;
    expect(one.pieces).toBe(2);
    expect(one.prompt).toMatch(/^Aplicação de peças de fonte grande\./);
    expect(one.prompt).toContain("Cada regra tem peso de 0 a 20.");
    expect(one.prompt).toContain("### RN-AAA-01 — Regra número 1");
    expect(one.prompt).toContain("| RN-AAA-M02 | Menor dois |");
    expect(one.prompt).not.toContain("Regra número 2 (linhas");
    expect(one.prompt).not.toContain("| 1 | RN-AAA-01 |");
    const many = Array.from({ length: 16 }, (_, i) => `RN-AAA-${String(i + 1).padStart(2, "0")}`);
    await api.post("/api/sources/S01/prompt").send({ mode: "apply", ids: many }).expect(400);
    await api.post("/api/sources/S01/prompt").send({ mode: "apply", ids: ["RN-QQQ-01"] }).expect(400);
    const sum = (await api.post("/api/sources/S01/prompt").send({ mode: "summarize", group: "A — Pedidos" }).expect(200)).body;
    expect(sum.prompt).toMatch(/^Resumo de grupo de fonte grande\./);
    expect(sum.prompt).toContain('Grupo: "A — Pedidos"');
    expect(sum.chars).toBeLessThan(20_000);
    const piece = (await api.get("/api/sources/S01/pieces/RN-AAA-04").expect(200)).body;
    expect(piece.text).toContain("faz a coisa 4");
    expect(piece.text).not.toContain("faz a coisa 5");
  });

  it("aponta citação de peça que não existe e mostra a fonte na visão geral", async () => {
    const { dir } = await setup();
    fs.writeFileSync(path.join(dir, "docs/CONCEITO.md"), "# X — Conceito\n\n## Requisitos gerais\n- Ok [fonte: S01, RN-AAA-01]\n- Errado [fonte: S01, RN-AAA-81]\n");
    const p = loadProject(dir);
    const issues = checkProject(p);
    expect(issues.filter((i) => i.rule === "fonte-peca-inexistente").map((i) => i.message)).toEqual([expect.stringContaining("RN-AAA-81")]);
    const ov = overview(p, issues);
    expect(ov.sources).toEqual([expect.objectContaining({ id: "S01", total: 84, used: 1, pending: 83 })]);
    expect(ov.next.some((n) => n.text.includes("83 de 84"))).toBe(true);
  });

  it("modo simulado: resume um grupo e aplica peças, e a cobertura sobe", async () => {
    const { api, srv, ficha } = await setup();
    const sum = (await api.post("/api/sources/S01/prompt").send({ mode: "summarize", group: "A — Pedidos" })).body.prompt;
    await api.post("/api/chat").send({ message: sum }).expect(202);
    await srv.jobs.idle;
    expect((await api.get("/api/sources/S01/index")).body.groups.find((g: { name: string }) => g.name === "A — Pedidos").summarized).toBe(true);
    const app = (await api.post("/api/sources/S01/prompt").send({ mode: "apply", ids: ["RN-AAA-01", "RN-AAA-02"] })).body.prompt;
    await api.post("/api/chat").send({ message: app }).expect(202);
    await srv.jobs.idle;
    expect((await api.get("/api/sources/S01/index")).body).toMatchObject({ used: 2 });
    expect(ficha).toMatch(/S01-/);
  });
});
