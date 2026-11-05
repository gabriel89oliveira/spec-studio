import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { agentEnv } from "../src/claude.js";
import { buildProxyUrl, noProxy, parsePacResult, resolveProxy, testProxy, validateProxy } from "../src/proxy.js";

const closers: Array<() => void> = [];
afterEach(() => closers.splice(0).forEach((c) => c()));

/** Proxy de mentira: responde ao CONNECT com o status pedido. */
function fakeProxy(status: number, seen: { auth?: string; path?: string } = {}): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.on("connect", (req, socket) => {
      seen.auth = req.headers["proxy-authorization"] as string | undefined;
      seen.path = req.url;
      socket.write(`HTTP/1.1 ${status} X\r\n\r\n`);
      if (status === 200) setTimeout(() => socket.destroy(), 20);
      else socket.end();
    });
    s.listen(0, "127.0.0.1", () => {
      closers.push(() => s.close());
      resolve((s.address() as AddressInfo).port);
    });
  });
}

const manual = (port: number, extra: object = {}) => ({ ...noProxy, enabled: true, mode: "manual" as const, host: "127.0.0.1", port, ...extra });

describe("proxy: regras", () => {
  it("monta a URL com usuário e senha codificados", () => {
    expect(buildProxyUrl("p.local", 8080)).toBe("http://p.local:8080");
    expect(buildProxyUrl("p.local", 8080, "dom\\ana@x.com", "p@ss:w/rd")).toBe("http://dom%5Cana%40x.com:p%40ss%3Aw%2Frd@p.local:8080");
  });

  it("lê o resultado de um script PAC", () => {
    expect(parsePacResult("PROXY proxy.bosch.com:8080; DIRECT")).toEqual({ host: "proxy.bosch.com", port: 8080 });
    expect(parsePacResult("DIRECT")).toBeNull();
    expect(parsePacResult("DIRECT; PROXY a:1")).toBeNull();
    expect(parsePacResult("SOCKS5 s:1080; PROXY h:3128")).toEqual({ host: "h", port: 3128 });
    expect(parsePacResult("")).toBeNull();
  });

  it("valida o que foi preenchido", () => {
    expect(validateProxy({ ...noProxy, enabled: false })).toBeNull();
    expect(validateProxy(manual(8080))).toBeNull();
    expect(validateProxy(manual(0))).toMatch(/porta/);
    expect(validateProxy(manual(8080, { host: "" }))).toMatch(/endereço/);
    expect(validateProxy(manual(8080, { host: "http://p.local" }))).toMatch(/sem http/);
    expect(validateProxy({ ...noProxy, enabled: true, mode: "pac", pacUrl: "ftp://x" })).toMatch(/URL/);
    expect(validateProxy({ ...noProxy, enabled: true, mode: "pac", pacUrl: "http://rede/ca.pac" })).toBeNull();
  });

  it("resolve o script automático pelo leitor de PAC do aplicativo", async () => {
    const p = { ...noProxy, enabled: true, mode: "pac" as const, pacUrl: "http://rede/ca.pac", user: "ana", password: "s" };
    const r = await resolveProxy(p, "https://api.anthropic.com", async (url, target) => {
      expect(url).toBe("http://rede/ca.pac");
      expect(target).toBe("https://api.anthropic.com");
      return "PROXY proxy.local:8080; DIRECT";
    });
    expect(r).toEqual({ kind: "proxy", url: "http://ana:s@proxy.local:8080", label: "proxy.local:8080" });
    expect(await resolveProxy(p, "https://interno", async () => "DIRECT")).toEqual({ kind: "direct" });
    await expect(resolveProxy(p, "https://x")).rejects.toThrow(/aplicativo instalado/);
    await expect(resolveProxy(p, "https://x", async () => Promise.reject(new Error("timeout")))).rejects.toThrow(/script do proxy: timeout/);
    expect(await resolveProxy({ ...p, enabled: false }, "https://x")).toEqual({ kind: "direct" });
  });
});

describe("proxy: testar conexão", () => {
  it("explica um proxy que exige senha ou a recusa", async () => {
    const seen: { auth?: string; path?: string } = {};
    const port = await fakeProxy(407, seen);
    expect((await testProxy(manual(port), "https://api.anthropic.com")).message).toMatch(/exige usuário e senha/);
    expect(seen.path).toBe("api.anthropic.com:443");
    expect(seen.auth).toBeUndefined();
    const r = await testProxy(manual(port, { user: "ana", password: "x" }), "https://api.anthropic.com");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/recusou o usuário e a senha/);
    expect(seen.auth).toBe(`Basic ${Buffer.from("ana:x").toString("base64")}`);
  });

  it("explica bloqueio (403), outro erro e proxy fora do ar", async () => {
    expect((await testProxy(manual(await fakeProxy(403)), "https://api.anthropic.com")).message).toMatch(/bloqueou/);
    expect((await testProxy(manual(await fakeProxy(502)), "https://api.anthropic.com")).message).toMatch(/502/);
    const free = await new Promise<number>((r) => {
      const s = net.createServer().listen(0, "127.0.0.1", () => {
        const p = (s.address() as AddressInfo).port;
        s.close(() => r(p));
      });
    });
    const down = await testProxy(manual(free), "https://api.anthropic.com");
    expect(down.ok).toBe(false);
    expect(down.message).toMatch(/recusou a conexão/);
  });

  it("falha com clareza se o proxy fecha logo após o túnel (sem conexão segura)", async () => {
    const r = await testProxy(manual(await fakeProxy(200)), "https://api.anthropic.com");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/conexão segura/);
  });

  it("avisa de campos incompletos sem tentar conectar", async () => {
    expect((await testProxy({ ...noProxy, mode: "manual" }, "https://api.anthropic.com")).message).toMatch(/endereço do proxy/);
    expect((await testProxy(manual(8080), "não é url")).message).toMatch(/inválido/);
  });
});

describe("proxy no ambiente do Claude", () => {
  it("usa o proxy configurado no lugar do que veio do sistema", () => {
    const env = agentEnv({ apiKey: "k", proxyUrl: "http://u:p@proxy.local:8080" }, { PATH: "x", HTTPS_PROXY: "http://velho:1", no_proxy: "algo" });
    expect(env.HTTPS_PROXY).toBe("http://u:p@proxy.local:8080");
    expect(env.HTTP_PROXY).toBe("http://u:p@proxy.local:8080");
    expect(env.NO_PROXY).toBe("localhost,127.0.0.1");
    expect(env.PATH).toBe("x");
  });

  it("sem proxy configurado, não mexe no que o sistema já definiu", () => {
    expect(agentEnv({ apiKey: "k" }, { HTTPS_PROXY: "http://sistema:1" }).HTTPS_PROXY).toBe("http://sistema:1");
  });
});
