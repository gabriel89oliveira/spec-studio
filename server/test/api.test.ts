import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/app.js";
import { agentEnv, buildOptions, TOOLS } from "../src/claude.js";
import { ConfigError, loadConfig } from "../src/config.js";
import type { EventName } from "../src/events.js";
import { fakeQuery, makeConfig, makeProject, msg, waitForAbort } from "./helpers.js";

type Srv = Awaited<ReturnType<typeof createServer>>;
const open: Srv[] = [];

async function setup(opts: Parameters<typeof createServer>[1] = {}, over = {}) {
  const dir = makeProject();
  const srv = await createServer(makeConfig(dir, over), { watch: false, ...opts });
  open.push(srv);
  const events: { event: EventName; data: any }[] = [];
  srv.bus.on((event, data) => events.push({ event, data }));
  return { dir, srv, api: request(srv.app), events };
}

async function log(dir: string) {
  return (await simpleGit(dir).log()).all;
}

afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

// ---------------------------------------------------------------------------
describe("Fase 1 — Navegar e ler", () => {
  it("lista CLAUDE.md e os .md de docs/", async () => {
    const { api } = await setup();
    const res = await api.get("/api/tree").expect(200);
    expect(res.body[0]).toMatchObject({ path: "CLAUDE.md", type: "file" });
    const docs = res.body[1];
    expect(docs).toMatchObject({ path: "docs", type: "dir" });
    const names = JSON.stringify(docs);
    expect(names).toContain("docs/CONCEITO.md");
    expect(names).toContain("docs/features/F01-agendamento.md");
  });

  it("informa o módulo de cada feature, lido da tabela do topo", async () => {
    const { api, dir: root } = await setup();
    const dir = path.join(root, "docs", "features");
    fs.writeFileSync(path.join(dir, "F02-orcamento.md"), "# F02\n\n| Campo | Valor |\n|---|---|\n| Módulo | [M03](../modulos/M03-x.md) |\n");
    fs.writeFileSync(path.join(dir, "F03-rascunho.md"), "# F03\n\n| Campo | Valor |\n|---|---|\n| Módulo | [M00] |\n");
    const res = await api.get("/api/tree").expect(200);
    const features = res.body[1].children.find((n: { name: string }) => n.name === "features").children;
    const byName = Object.fromEntries(features.map((n: { name: string; module?: string }) => [n.name, n.module]));
    expect(byName).toEqual({ "F01-agendamento.md": undefined, "F02-orcamento.md": "M03", "F03-rascunho.md": undefined });
  });

  it("devolve o conteúdo e o hash do arquivo", async () => {
    const { api } = await setup();
    const res = await api.get("/api/file").query({ path: "docs/CONCEITO.md" }).expect(200);
    expect(res.body.content).toContain("| Perfil | Quem é |");
    expect(res.body.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('responde 400 para caminho com ".."', async () => {
    const { api } = await setup();
    await api.get("/api/file").query({ path: "docs/../CLAUDE.md" }).expect(400);
    await api.get("/api/file").query({ path: "../x.md" }).expect(400);
  });

  it("encerra com mensagem clara quando PROJECT_DIR é inválido", () => {
    expect(() => loadConfig({ PROJECT_DIR: "/nao/existe" })).toThrow(ConfigError);
    const semClaude = makeProject();
    fs.rmSync(path.join(semClaude, "CLAUDE.md"));
    expect(() => loadConfig({ PROJECT_DIR: semClaude })).toThrow(/CLAUDE\.md/);
    expect(() => loadConfig({})).toThrow(/PROJECT_DIR/);
  });

  it("cria o repositório Git e ignora as sessões", async () => {
    const { dir } = await setup();
    expect((await log(dir))[0].message).toBe("spec-studio: commit inicial");
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf8")).toContain(".spec-studio/sessions/");
  });
});

// ---------------------------------------------------------------------------
describe("Fase 2 — Editar e atualizar ao vivo", () => {
  it("grava e cria o commit de edição manual", async () => {
    const { api, dir } = await setup();
    const { body } = await api.get("/api/file").query({ path: "docs/CONCEITO.md" });
    const res = await api
      .put("/api/file")
      .send({ path: "docs/CONCEITO.md", content: "# Conceito novo\n", baseHash: body.hash })
      .expect(200);
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toBe("# Conceito novo\n");
    expect(res.body.commit).toBeTruthy();
    expect((await log(dir))[0].message).toBe("edição manual: docs/CONCEITO.md");
  });

  it("responde 409 quando o baseHash está desatualizado", async () => {
    const { api, dir } = await setup();
    const res = await api
      .put("/api/file")
      .send({ path: "docs/CONCEITO.md", content: "x", baseHash: "0".repeat(40) })
      .expect(409);
    expect(res.body.conflict).toBe(true);
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toContain("Plataforma");
  });

  it("avisa em até 2 segundos quando o arquivo muda fora da aplicação", async () => {
    const dir = makeProject();
    const srv = await createServer(makeConfig(dir), { watch: true });
    open.push(srv);
    await srv.ready();
    const got = new Promise<any>((resolve) => {
      srv.bus.on((event, data: any) => {
        if (event === "file.changed" && data.path === "docs/CONCEITO.md") resolve(data);
      });
    });
    const started = Date.now();
    fs.writeFileSync(path.join(dir, "docs", "CONCEITO.md"), "# Mudou lá fora\n");
    const data = await got;
    expect(Date.now() - started).toBeLessThan(2000);
    expect(data.source).toBe("external");
  });
});

// ---------------------------------------------------------------------------
describe("Fase 3 — Comentários", () => {
  const anchor = { quote: "manutenção de frotas", prefix: "Plataforma de ", suffix: "." };

  it("cria, persiste e conta comentários", async () => {
    const { api, dir, srv } = await setup();
    const created = await api
      .post("/api/comments")
      .send({ file: "docs/CONCEITO.md", anchor, body: "Detalhe o público" })
      .expect(201);
    expect(created.body).toMatchObject({ status: "open", author: "Gabriel", anchor });
    expect(fs.existsSync(path.join(dir, ".spec-studio", "comments", "docs", "CONCEITO.md.json"))).toBe(true);

    // novo servidor lendo a mesma pasta = página recarregada
    await srv.close();
    const srv2 = await createServer(makeConfig(dir), { watch: false });
    open.push(srv2);
    const list = await request(srv2.app).get("/api/comments").query({ path: "docs/CONCEITO.md" }).expect(200);
    expect(list.body).toHaveLength(1);
    const tree = await request(srv2.app).get("/api/tree");
    expect(JSON.stringify(tree.body)).toContain('"openComments":1');
  });

  it("resolve e reabre, e o status persiste", async () => {
    const { api } = await setup();
    const { body: c } = await api.post("/api/comments").send({ file: "docs/CONCEITO.md", anchor, body: "x" });
    await api.patch(`/api/comments/${c.id}`).send({ status: "resolved" }).expect(200);
    let list = await api.get("/api/comments").query({ path: "docs/CONCEITO.md" });
    expect(list.body[0].status).toBe("resolved");
    expect(list.body[0].resolvedAt).toBeTruthy();
    await api.patch(`/api/comments/${c.id}`).send({ status: "open" }).expect(200);
    list = await api.get("/api/comments").query({ path: "docs/CONCEITO.md" });
    expect(list.body[0]).toMatchObject({ status: "open", resolvedAt: null });
  });

  it("guarda respostas do usuário no fio", async () => {
    const { api } = await setup();
    const { body: c } = await api.post("/api/comments").send({ file: "docs/CONCEITO.md", anchor, body: "x" });
    const res = await api.post(`/api/comments/${c.id}/reply`).send({ body: "Mais um detalhe" }).expect(200);
    expect(res.body.replies[0]).toMatchObject({ author: "Gabriel", body: "Mais um detalhe" });
  });

  it("rejeita comentário sem trecho", async () => {
    const { api } = await setup();
    await api.post("/api/comments").send({ file: "docs/CONCEITO.md", anchor: { quote: " " }, body: "x" }).expect(400);
  });
});

// ---------------------------------------------------------------------------
describe("Fase 4 — Claude", () => {
  /** Simula o Claude editando o CONCEITO e respondendo com um resumo. */
  const editingClaude = (dir: string) =>
    fakeQuery(async function* (_call, n) {
      const sid = "sdk-session-1";
      yield msg.init(sid);
      yield msg.blockStart(sid);
      yield msg.text(sid, "Vou ajustar ");
      yield msg.text(sid, "o resumo.");
      yield msg.tool(sid, "Edit", { file_path: path.join(dir, "docs", "CONCEITO.md") });
      fs.appendFileSync(path.join(dir, "docs", "CONCEITO.md"), `\nCenário de erro ${n}.\n`);
      yield msg.result(sid, "Adicionei um cenário de erro em docs/CONCEITO.md.", 0.04);
    });

  it("passa as opções certas para o Agent SDK", () => {
    const opts = buildOptions(makeConfig("/proj"), new AbortController());
    expect(opts.tools).toEqual(TOOLS);
    expect(opts.allowedTools).toEqual(TOOLS);
    expect(opts.tools).not.toContain("Bash");
    expect(opts.settingSources).toEqual(["project"]);
    expect(opts.cwd).toBe("/proj");
    expect(opts.hooks?.PreToolUse?.[0].matcher).toBe("Read|Edit|Write|Glob|Grep");
  });

  it("usa a chave do .env e não herda a sessão de um Claude Code pai", () => {
    const env = agentEnv("sk-ant-do-env", {
      PATH: "/usr/bin",
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "pai",
      CLAUDE_CODE_OAUTH_TOKEN: "x",
      ANTHROPIC_AUTH_TOKEN: "y",
      ANTHROPIC_API_KEY: "outra",
      CLAUDE_CODE_GIT_BASH_PATH: "C:\\Git\\bin\\bash.exe",
    });
    expect(env).toMatchObject({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-do-env", CLAUDE_CODE_GIT_BASH_PATH: "C:\\Git\\bin\\bash.exe" });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it("comentário: progresso em tempo real, resposta no fio e commit com a origem", async () => {
    const dir = makeProject();
    const fq = editingClaude(dir);
    const srv = await createServer(makeConfig(dir), { watch: false, queryFn: fq.fn });
    open.push(srv);
    const events: { event: EventName; data: any }[] = [];
    srv.bus.on((event, data) => events.push({ event, data }));
    const api = request(srv.app);

    const { body: c } = await api
      .post("/api/comments")
      .send({ file: "docs/CONCEITO.md", anchor: { quote: "Resumo", prefix: "", suffix: "" }, body: "Detalhe os cenários de erro" })
      .expect(201);
    const sent = await api.post(`/api/comments/${c.id}/send`).expect(202);
    await srv.jobs.idle;

    expect(fq.calls[0].prompt).toContain("Trecho comentado:");
    expect(fq.calls[0].prompt).toContain("Detalhe os cenários de erro");
    expect(events.filter((e) => e.event === "job.text").map((e) => e.data.delta).join("")).toBe("Vou ajustar o resumo.");
    expect(events.find((e) => e.event === "job.tool")?.data).toMatchObject({ tool: "Edit", path: "docs/CONCEITO.md" });

    const done = events.find((e) => e.event === "job.done")!.data;
    expect(done).toMatchObject({ jobId: sent.body.jobId, changedFiles: ["docs/CONCEITO.md"], costUsd: 0.04 });
    expect(events.some((e) => e.event === "file.changed" && e.data.source === "claude")).toBe(true);

    const list = await api.get("/api/comments").query({ path: "docs/CONCEITO.md" });
    expect(list.body[0].status).toBe("answered");
    expect(list.body[0].replies[0]).toMatchObject({ author: "Claude", commit: done.commit });

    const commits = await log(dir);
    const claudeCommit = commits.find((x) => x.message.startsWith("claude:"))!;
    expect(claudeCommit.body).toContain(`Origem: comentário ${c.id}`);
    expect(claudeCommit.body).toContain("Pedido-por: Gabriel");

    const project = await api.get("/api/project");
    expect(project.body.claude.lastCostUsd).toBe(0.04);
    expect(project.body.claude.lastChangedFiles).toEqual(["docs/CONCEITO.md"]);
  });

  it("chat: mantém o contexto na segunda mensagem e zera em nova conversa", async () => {
    const dir = makeProject();
    const fq = editingClaude(dir);
    const srv = await createServer(makeConfig(dir), { watch: false, queryFn: fq.fn });
    open.push(srv);
    const api = request(srv.app);

    const first = await api.post("/api/chat").send({ message: "Revise o conceito", openFile: "docs/CONCEITO.md" }).expect(202);
    await srv.jobs.idle;
    expect(fq.calls[0].prompt).toBe("Arquivo aberto na tela: docs/CONCEITO.md\n\nRevise o conceito");
    expect(fq.calls[0].options.resume).toBeUndefined();

    await api.post("/api/chat").send({ message: "E o glossário?", sessionId: first.body.sessionId }).expect(202);
    await srv.jobs.idle;
    expect(fq.calls[1].options.resume).toBe("sdk-session-1");

    const session = await api.get(`/api/chat/sessions/${first.body.sessionId}`).expect(200);
    expect(session.body.messages.map((x: any) => x.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(session.body.messages[1].tools[0]).toMatchObject({ tool: "Edit", path: "docs/CONCEITO.md" });

    await api.post("/api/chat").send({ message: "Outra conversa" }).expect(202);
    await srv.jobs.idle;
    expect(fq.calls[2].options.resume).toBeUndefined();

    const claudeCommits = (await log(dir)).filter((x) => x.message.startsWith("claude:"));
    expect(claudeCommits).toHaveLength(3);
    expect(claudeCommits[0].body).toContain("Origem: chat s_");
  });

  it("cancela o trabalho em andamento e volta para pronto", async () => {
    const dir = makeProject();
    const fq = fakeQuery(async function* (call) {
      yield msg.init("s");
      await waitForAbort(call.options);
    });
    const srv = await createServer(makeConfig(dir), { watch: false, queryFn: fq.fn });
    open.push(srv);
    const events: { event: EventName; data: any }[] = [];
    srv.bus.on((event, data) => events.push({ event, data }));
    const api = request(srv.app);

    const { body } = await api.post("/api/chat").send({ message: "Demora" }).expect(202);
    await new Promise((r) => setTimeout(r, 50));
    await api.post(`/api/jobs/${body.jobId}/cancel`).expect(200);
    await srv.jobs.idle;
    expect(events.find((e) => e.event === "job.error")?.data.message).toBe("Cancelado");
    const project = await api.get("/api/project");
    expect(project.body.claude.job.status).toBe("cancelled");
  });

  it("impede um segundo pedido enquanto há trabalho em andamento (409)", async () => {
    const dir = makeProject();
    const fq = fakeQuery(async function* (call) {
      yield msg.init("s");
      await waitForAbort(call.options);
    });
    const srv = await createServer(makeConfig(dir), { watch: false, queryFn: fq.fn });
    open.push(srv);
    const api = request(srv.app);
    const { body } = await api.post("/api/chat").send({ message: "Primeiro" }).expect(202);
    await api.post("/api/chat").send({ message: "Segundo" }).expect(409);
    const { body: c } = await api
      .post("/api/comments")
      .send({ file: "docs/CONCEITO.md", anchor: { quote: "Resumo" }, body: "x" })
      .expect(201);
    await api.post(`/api/comments/${c.id}/send`).expect(409);
    const file = await api.get("/api/file").query({ path: "docs/CONCEITO.md" });
    await api.put("/api/file").send({ path: "docs/CONCEITO.md", content: "x", baseHash: file.body.hash }).expect(409);
    await api.post(`/api/jobs/${body.jobId}/cancel`).expect(200);
    await srv.jobs.idle;
  });

  it("devolve erro claro quando o Claude está desativado", async () => {
    const { api } = await setup({}, { apiKey: undefined });
    const res = await api.post("/api/chat").send({ message: "Oi" }).expect(400);
    expect(res.body.error).toContain("ANTHROPIC_API_KEY");
  });
});

// ---------------------------------------------------------------------------
describe("Fase 5 — Histórico", () => {
  it("lista commits, mostra o diff e desfaz", async () => {
    const { api, dir } = await setup();
    const f = await api.get("/api/file").query({ path: "docs/CONCEITO.md" });
    const original = f.body.content;
    await api.put("/api/file").send({ path: "docs/CONCEITO.md", content: "# Versão nova\n", baseHash: f.body.hash }).expect(200);

    const hist = await api.get("/api/history").query({ path: "docs/CONCEITO.md" }).expect(200);
    expect(hist.body[0]).toMatchObject({ message: "edição manual: docs/CONCEITO.md", origin: "manual", author: expect.any(String) });
    expect(hist.body[1].message).toBe("spec-studio: commit inicial");

    const diff = await api.get("/api/diff").query({ path: "docs/CONCEITO.md", commit: hist.body[0].shortHash }).expect(200);
    expect(diff.body.before).toBe(original);
    expect(diff.body.after).toBe("# Versão nova\n");

    const first = await api.get("/api/diff").query({ path: "docs/CONCEITO.md", commit: hist.body[1].hash }).expect(200);
    expect(first.body.before).toBe("");

    await api.get("/api/diff").query({ path: "docs/CONCEITO.md", commit: "nao-e-hash" }).expect(400);

    const rev = await api.post("/api/revert").send({ commit: hist.body[0].hash }).expect(200);
    expect(rev.body.files).toContain("docs/CONCEITO.md");
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toBe(original);
    const after = await api.get("/api/history").query({ path: "docs/CONCEITO.md" });
    expect(after.body[0].origin).toBe("revert");
  });

  it("explica quando não dá para desfazer por conflito e deixa tudo como estava", async () => {
    const { api, dir } = await setup();
    let f = await api.get("/api/file").query({ path: "docs/CONCEITO.md" });
    await api.put("/api/file").send({ path: "docs/CONCEITO.md", content: "linha A\n", baseHash: f.body.hash }).expect(200);
    f = await api.get("/api/file").query({ path: "docs/CONCEITO.md" });
    await api.put("/api/file").send({ path: "docs/CONCEITO.md", content: "linha B\n", baseHash: f.body.hash }).expect(200);
    const hist = await api.get("/api/history").query({ path: "docs/CONCEITO.md" });
    const res = await api.post("/api/revert").send({ commit: hist.body[1].hash }).expect(409);
    expect(res.body.error).toContain("mexeram nas mesmas linhas");
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toBe("linha B\n");
    expect(await simpleGit(dir).status()).toMatchObject({ conflicted: [] });
  });
});

// ---------------------------------------------------------------------------
describe("Modo simulado (CLAUDE_MOCK=true)", () => {
  async function mockSetup() {
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, "docs", "_templates"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "_templates", "feature.md"), "# F00 — [Nome da feature]\n\n| Campo | Valor |\n|---|---|\n| Módulo | [M00] |\n\n## Objetivo\n[1 frase]\n");
    fs.writeFileSync(path.join(dir, "docs", "_templates", "modulo.md"), "# M00 — [Nome do módulo]\n\n## Responsabilidade\n[texto]\n");
    const srv = await createServer(makeConfig(dir, { apiKey: undefined, mock: true }), { watch: false });
    open.push(srv);
    return { dir, srv, api: request(srv.app) };
  }

  it("fica ativo sem chave da API e sinaliza o modo", async () => {
    const { api } = await mockSetup();
    const p = await api.get("/api/project").expect(200);
    expect(p.body.claude).toMatchObject({ enabled: true, mock: true, model: "modo simulado" });
  });

  it("comentário: altera o arquivo com conteúdo marcado, responde e faz commit, sem custo", async () => {
    const { api, dir, srv } = await mockSetup();
    const { body: c } = await api
      .post("/api/comments")
      .send({ file: "docs/CONCEITO.md", anchor: { quote: "Resumo" }, body: "Detalhe o público" })
      .expect(201);
    await api.post(`/api/comments/${c.id}/send`).expect(202);
    await srv.jobs.idle;
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toContain("## Nota do modo simulado");
    const list = await api.get("/api/comments").query({ path: "docs/CONCEITO.md" });
    expect(list.body[0].status).toBe("answered");
    expect(list.body[0].replies[0].body).toContain("Modo simulado");
    expect((await log(dir)).some((x) => x.message.startsWith("claude: Detalhe o público"))).toBe(true);
    expect(srv.jobs.lastCostUsd).toBe(0);
  });

  it("pergunta no comentário: responde sem alterar arquivos", async () => {
    const { api, dir, srv } = await mockSetup();
    const before = fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8");
    const { body: c } = await api
      .post("/api/comments")
      .send({ file: "docs/CONCEITO.md", anchor: { quote: "Resumo" }, body: "Isso inclui motoristas?" })
      .expect(201);
    await api.post(`/api/comments/${c.id}/send`).expect(202);
    await srv.jobs.idle;
    expect(fs.readFileSync(path.join(dir, "docs", "CONCEITO.md"), "utf8")).toBe(before);
    expect(srv.jobs.current?.changedFiles).toEqual([]);
  });

  it("cria feature e módulo a partir dos templates, com o próximo ID livre", async () => {
    const { api, dir, srv } = await mockSetup();
    await api
      .post("/api/chat")
      .send({ message: 'Crie o rascunho da feature "Aprovar orçamento" no módulo M01 a partir de docs/_templates/feature.md, seguindo o CLAUDE.md.' })
      .expect(202);
    await srv.jobs.idle;
    const feature = fs.readFileSync(path.join(dir, "docs", "features", "F02-aprovar-orcamento.md"), "utf8");
    expect(feature).toContain("# F02 — Aprovar orçamento");
    expect(feature).toContain("| Módulo | M01 |");

    await api.post("/api/chat").send({ message: 'Crie o rascunho do módulo "Rede de oficinas" a partir de docs/_templates/modulo.md.' }).expect(202);
    await srv.jobs.idle;
    expect(fs.readFileSync(path.join(dir, "docs", "modulos", "M01-rede-de-oficinas.md"), "utf8")).toContain("# M01 — Rede de oficinas");
  });

  it("pode ser cancelado", async () => {
    const { api, srv } = await mockSetup();
    const events: { event: EventName; data: any }[] = [];
    srv.bus.on((event, data) => events.push({ event, data }));
    const { body } = await api.post("/api/chat").send({ message: "Revise o conceito", openFile: "docs/CONCEITO.md" }).expect(202);
    await new Promise((r) => setTimeout(r, 100));
    await api.post(`/api/jobs/${body.jobId}/cancel`).expect(200);
    await srv.jobs.idle;
    expect(events.find((e) => e.event === "job.error")?.data.message).toBe("Cancelado");
  });
});
