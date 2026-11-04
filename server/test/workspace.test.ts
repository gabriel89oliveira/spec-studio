import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { Workspace } from "../src/workspace.js";
import { makeConfig, makeProject } from "./helpers.js";

const KIT = path.resolve(__dirname, "../../kit");
const open: Workspace[] = [];
const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ws-test-")));

function make() {
  const state = path.join(tmp(), "state.json");
  const { projectDir: _p, ...base } = makeConfig("x", { mock: true });
  const ws = new Workspace(base, { stateFile: state, kitDir: KIT, watch: false });
  open.push(ws);
  return { ws, state, api: request(ws.app()) };
}

afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

describe("projetos pela tela", () => {
  it("sem projeto aberto, a API responde 409 e o seletor funciona", async () => {
    const { api } = make();
    const r = await api.get("/api/tree");
    expect(r.status).toBe(409);
    expect(r.body.noProject).toBe(true);
    const w = (await api.get("/api/workspace")).body;
    expect(w.current).toBeNull();
    expect(w.recent).toEqual([]);
  });

  it("abre uma pasta existente, lembra nos recentes e entrega as rotas do projeto", async () => {
    const { ws, api, state } = make();
    const dir = makeProject();
    const r = await api.post("/api/workspace/open").send({ path: dir });
    expect(r.status).toBe(200);
    expect(r.body.current).toBe(dir);
    expect(r.body.recent[0].path).toBe(dir);
    expect((await api.get("/api/project")).body.projectDir).toBe(dir);
    expect(JSON.parse(fs.readFileSync(state, "utf8")).last).toBe(dir);
    // um novo Workspace com o mesmo estado volta ao último projeto
    const again = new Workspace(makeConfig("x", { mock: true }), { stateFile: state, watch: false });
    open.push(again);
    await again.start();
    expect(again.currentDir).toBe(dir);
    void ws;
  });

  it("recusa pasta inexistente ou sem CLAUDE.md, mantendo o projeto atual", async () => {
    const { api } = make();
    const dir = makeProject();
    await api.post("/api/workspace/open").send({ path: dir });
    expect((await api.post("/api/workspace/open").send({ path: "/nao/existe" })).status).toBe(400);
    const vazia = tmp();
    const r = await api.post("/api/workspace/open").send({ path: vazia });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/CLAUDE\.md/);
    expect((await api.get("/api/workspace")).body.current).toBe(dir);
  });

  it("troca de projeto: a árvore passa a ser a do novo", async () => {
    const { api } = make();
    const a = makeProject();
    const b = makeProject();
    fs.writeFileSync(path.join(b, "docs", "features", "F09-so-no-b.md"), "# F09 — Só no B\n");
    await api.post("/api/workspace/open").send({ path: a });
    expect(JSON.stringify((await api.get("/api/tree")).body)).not.toContain("F09");
    await api.post("/api/workspace/open").send({ path: b });
    expect(JSON.stringify((await api.get("/api/tree")).body)).toContain("F09");
  });

  it("cria projeto novo a partir do kit e abre", async () => {
    const { api } = make();
    const parent = tmp();
    const r = await api.post("/api/workspace/new").send({ parent, name: "Meu Projeto" });
    expect(r.status).toBe(200);
    expect(r.body.current).toBe(path.join(parent, "Meu Projeto"));
    expect(fs.existsSync(path.join(parent, "Meu Projeto", "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(parent, "Meu Projeto", "docs", "CONCEITO.md"))).toBe(true);
    const file = (await api.get("/api/file?path=docs/CONCEITO.md")).body;
    expect(file.guide.kind).toBe("concept");
  });

  it("valida o nome e não sobrescreve pasta com conteúdo", async () => {
    const { api } = make();
    const parent = tmp();
    for (const name of ["a/b", "..", "x:y", "  "]) expect((await api.post("/api/workspace/new").send({ parent, name })).status).toBe(400);
    fs.mkdirSync(path.join(parent, "Existe"));
    fs.writeFileSync(path.join(parent, "Existe", "a.txt"), "x");
    expect((await api.post("/api/workspace/new").send({ parent, name: "Existe" })).status).toBe(409);
    expect((await api.post("/api/workspace/new").send({ parent: path.join(parent, "nada"), name: "N" })).status).toBe(400);
  });

  it("lista subpastas e marca as que são projeto", async () => {
    const { api } = make();
    const parent = tmp();
    fs.mkdirSync(path.join(parent, "b"));
    fs.mkdirSync(path.join(parent, "a"));
    fs.mkdirSync(path.join(parent, ".oculta"));
    const r = (await api.get(`/api/workspace/browse?path=${encodeURIComponent(parent)}`)).body;
    expect(r.dirs.map((d: { name: string }) => d.name)).toEqual(["a", "b"]);
    expect(r.isProject).toBe(false);
    expect(r.parent).toBe(path.dirname(parent));
    expect((await api.get(`/api/workspace/browse?path=${encodeURIComponent(makeProject())}`)).body.isProject).toBe(true);
  });
});
