import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { startServer, type Started } from "../src/start.js";
import type { SecretCodec } from "../src/settings.js";
import { makeConfig, makeProject } from "./helpers.js";

const fakeCodec: SecretCodec = {
  available: () => true,
  encrypt: (s) => `enc:${Buffer.from(s).toString("base64")}`,
  decrypt: (s) => Buffer.from(s.replace(/^enc:/, ""), "base64").toString(),
};

const running: Started[] = [];
const tmp = () => fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "start-test-")));

async function boot(over: { codec?: SecretCodec; webDir?: string; env?: Partial<ReturnType<typeof makeConfig>> } = {}) {
  const dataDir = tmp();
  const { projectDir: _p, ...base } = makeConfig("x", { apiKey: undefined, mock: false, ...over.env });
  const s = await startServer({ base, port: 0, dataDir, codec: over.codec, webDir: over.webDir, envProjectDir: makeProject() });
  running.push(s);
  return { s, dataDir, api: request(s.url) };
}

afterEach(async () => {
  while (running.length) await running.pop()!.close();
});

describe("startServer e configurações", () => {
  it("escolhe uma porta livre e abre o projeto inicial", async () => {
    const { s, api } = await boot();
    expect(s.port).toBeGreaterThan(0);
    expect((await api.get("/api/project")).status).toBe(200);
  });

  it("salva a chave cifrada, ativa o Claude e nunca devolve o segredo", async () => {
    const { api, dataDir } = await boot({ codec: fakeCodec });
    expect((await api.get("/api/project")).body.claude.enabled).toBe(false);
    const r = await api.put("/api/settings").send({ apiKey: "sk-ant-segredo", baseUrl: "https://gw.exemplo.com", model: "opus" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ apiKeySet: true, authTokenSet: false, baseUrl: "https://gw.exemplo.com", model: "opus", secureStorage: true });
    expect(JSON.stringify(r.body)).not.toContain("segredo");
    const project = (await api.get("/api/project")).body;
    expect(project.claude.enabled).toBe(true);
    expect(project.claude.model).toBe("opus");
    const file = fs.readFileSync(path.join(dataDir, "settings.json"), "utf8");
    expect(file).not.toContain("sk-ant-segredo");
    expect(file).toContain("enc:");
    // apagar
    const del = await api.put("/api/settings").send({ apiKey: null });
    expect(del.body.apiKeySet).toBe(false);
    expect((await api.get("/api/project")).body.claude.enabled).toBe(false);
  });

  it("sem armazenamento seguro, recusa segredos mas aceita o resto", async () => {
    const { api } = await boot();
    const r = await api.put("/api/settings").send({ apiKey: "sk-x" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/\.env/);
    const ok = await api.put("/api/settings").send({ model: "haiku", userName: "Gabriel" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ model: "haiku", userName: "Gabriel", secureStorage: false });
  });

  it("valida o endereço do gateway", async () => {
    const { api } = await boot({ codec: fakeCodec });
    expect((await api.put("/api/settings").send({ baseUrl: "sem protocolo" })).status).toBe(400);
  });

  it("serve a interface compilada na mesma porta, sem atrapalhar a API", async () => {
    const web = tmp();
    fs.writeFileSync(path.join(web, "index.html"), "<!doctype html><title>Spec Studio</title>");
    fs.mkdirSync(path.join(web, "assets"));
    fs.writeFileSync(path.join(web, "assets", "a.js"), "console.log(1)");
    const { api } = await boot({ webDir: web });
    expect((await api.get("/")).text).toContain("Spec Studio");
    expect((await api.get("/qualquer/rota")).text).toContain("Spec Studio");
    expect((await api.get("/assets/a.js")).text).toContain("console.log");
    expect((await api.get("/api/workspace")).body.current).toBeTruthy();
    expect((await api.get("/api/nao-existe")).status).toBe(404);
  });

  it("informa versão e estado da atualização quando há um aplicativo", async () => {
    const dataDir = tmp();
    const { projectDir: _p, ...base } = makeConfig("x");
    let installed = 0;
    const s = await startServer({
      base,
      port: 0,
      dataDir,
      envProjectDir: makeProject(),
      app: { version: "1.2.3", desktop: true, update: () => ({ state: "ready", version: "1.3.0" }), check: () => {}, install: () => void installed++ },
    });
    running.push(s);
    const api = request(s.url);
    expect((await api.get("/api/app")).body).toEqual({ version: "1.2.3", desktop: true, update: { state: "ready", version: "1.3.0" } });
    await api.post("/api/app/install-update");
    expect(installed).toBe(1);
  });
});
