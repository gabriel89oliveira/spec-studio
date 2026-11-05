import http from "node:http";
import net from "node:net";
import tls from "node:tls";

/** Proxy da rede do usuário (comum em redes corporativas). */
export type ProxySettings = {
  enabled: boolean;
  /** manual: endereço e porta; pac: o script de configuração automática que o Windows também usa. */
  mode: "manual" | "pac";
  host: string;
  port: number | null;
  pacUrl: string;
  user: string;
  password: string;
};

export const noProxy: ProxySettings = { enabled: false, mode: "manual", host: "", port: null, pacUrl: "", user: "", password: "" };

/** Dado um endereço de script (PAC) e um destino, devolve o resultado do script, como "PROXY a:8080; DIRECT". Só o aplicativo sabe fazer isso. */
export type PacResolver = (pacUrl: string, target: string) => Promise<string>;

export type Resolved = { kind: "direct" } | { kind: "proxy"; url: string; label: string };

/** Valida o que o usuário preencheu. Devolve a mensagem de erro, ou null se está coerente. */
export function validateProxy(p: ProxySettings): string | null {
  if (!p.enabled) return null;
  if (p.mode === "manual") {
    if (!p.host.trim()) return "Informe o endereço do proxy.";
    if (/[\s/@]/.test(p.host.trim())) return "O endereço do proxy deve ser só o nome ou IP do servidor, sem http:// nem caminho.";
    if (!p.port || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535) return "Informe a porta do proxy (1 a 65535).";
  } else {
    try {
      const u = new URL(p.pacUrl.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      return "O endereço do script deve ser uma URL completa, como http://servidor/proxy.pac";
    }
  }
  return null;
}

export function buildProxyUrl(host: string, port: number, user?: string, password?: string): string {
  const auth = user ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
  return `http://${auth}${host}:${port}`;
}

/** Primeiro proxy HTTP utilizável de um resultado de PAC; null se o destino sai direto (ou só há opções sem suporte). */
export function parsePacResult(result: string): { host: string; port: number } | null {
  for (const part of result.split(";")) {
    const m = /^\s*(PROXY|HTTP|HTTPS)\s+([^:\s]+):(\d{1,5})\s*$/i.exec(part);
    if (m) return { host: m[2], port: Number(m[3]) };
    if (/^\s*DIRECT\s*$/i.test(part)) return null;
  }
  return null;
}

/** Decide por onde a conexão com `target` vai sair, segundo as configurações. */
export async function resolveProxy(p: ProxySettings, target: string, pac?: PacResolver): Promise<Resolved> {
  if (!p.enabled) return { kind: "direct" };
  const bad = validateProxy(p);
  if (bad) throw new Error(bad);
  if (p.mode === "manual") {
    const port = p.port as number;
    return { kind: "proxy", url: buildProxyUrl(p.host.trim(), port, p.user.trim(), p.password), label: `${p.host.trim()}:${port}` };
  }
  if (!pac) throw new Error("O script automático só funciona no aplicativo instalado. Use o modo manual ou o aplicativo.");
  let result: string;
  try {
    result = await pac(p.pacUrl.trim(), target);
  } catch (e) {
    throw new Error(`Não consegui ler o script do proxy: ${e instanceof Error ? e.message : String(e)}`);
  }
  const hit = parsePacResult(result);
  if (!hit) return { kind: "direct" };
  return { kind: "proxy", url: buildProxyUrl(hit.host, hit.port, p.user.trim(), p.password), label: `${hit.host}:${hit.port}` };
}

export type TestResult = { ok: boolean; message: string; via?: string };

/** Abre uma conexão segura com o destino (pelo proxy, se houver), sem enviar nada. */
function reach(target: URL, proxy: URL | null, timeoutMs: number): Promise<TestResult> {
  const host = target.hostname;
  const port = Number(target.port) || 443;
  const via = proxy ? `${proxy.hostname}:${proxy.port}` : undefined;

  return new Promise((resolve) => {
    let done = false;
    const finish = (r: TestResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        req?.destroy();
      } catch {
        /* ignora */
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, via, message: "Tempo esgotado: a conexão não respondeu em 15 segundos." }), timeoutMs);
    let req: http.ClientRequest | undefined;

    const handshake = (socket: net.Socket) => {
      const t = tls.connect({ socket, servername: host });
      t.once("secureConnect", () => {
        t.destroy();
        finish({ ok: true, via, message: proxy ? `Conectado a ${host} pelo proxy ${via}.` : `Conectado a ${host} diretamente.` });
      });
      t.once("error", (e: NodeJS.ErrnoException) => {
        const cert = /certificate|self.signed|issuer|UNABLE_TO_VERIFY/i.test(`${e.code} ${e.message}`);
        finish({
          ok: false,
          via,
          message: cert
            ? "O proxy respondeu, mas o certificado da conexão segura não é confiável. Redes corporativas costumam inspecionar o tráfego; pode ser preciso instalar o certificado da empresa no Windows."
            : `Falha na conexão segura: ${e.message}`,
        });
      });
    };

    if (!proxy) {
      const s = net.connect(port, host);
      s.once("connect", () => handshake(s));
      s.once("error", (e) => finish({ ok: false, message: `Não foi possível conectar a ${host}: ${e.message}` }));
      return;
    }

    const headers: Record<string, string> = { Host: `${host}:${port}` };
    if (proxy.username) {
      const cred = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers["Proxy-Authorization"] = `Basic ${Buffer.from(cred).toString("base64")}`;
    }
    req = http.request({ host: proxy.hostname, port: Number(proxy.port), method: "CONNECT", path: `${host}:${port}`, headers });
    req.once("connect", (res, socket) => {
      if (res.statusCode === 200) return handshake(socket);
      socket.destroy();
      const code = res.statusCode ?? 0;
      finish({
        ok: false,
        via,
        message:
          code === 407
            ? proxy.username
              ? "O proxy recusou o usuário e a senha."
              : "O proxy exige usuário e senha."
            : code === 403
              ? `O proxy bloqueou o acesso a ${host} (403). Peça liberação desse endereço ao time de rede.`
              : `O proxy respondeu ${code} ao tentar chegar em ${host}.`,
      });
    });
    req.once("error", (e: NodeJS.ErrnoException) =>
      finish({
        ok: false,
        via,
        message: e.code === "ECONNREFUSED" ? `O proxy ${via} recusou a conexão. Confira o endereço e a porta.` : e.code === "ENOTFOUND" ? `Não encontrei o proxy ${via}. Confira o endereço.` : `Não foi possível falar com o proxy ${via}: ${e.message}`,
      }),
    );
    req.end();
  });
}

/** "Testar conexão": chega ao destino do Claude com exatamente o que foi preenchido. */
export async function testProxy(p: ProxySettings, target: string, pac?: PacResolver, timeoutMs = 15000): Promise<TestResult> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, message: "Endereço de destino inválido." };
  }
  const bad = validateProxy({ ...p, enabled: true });
  if (bad) return { ok: false, message: bad };
  try {
    const r = await resolveProxy({ ...p, enabled: true }, target, pac);
    return await reach(url, r.kind === "proxy" ? new URL(r.url) : null, timeoutMs);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
