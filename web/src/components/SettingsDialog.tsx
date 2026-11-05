import { useEffect, useState } from "react";
import { api } from "../api";
import type { AppInfo, ProxyTest, Settings } from "../types";
import { btn, btnPrimary, input } from "../ui";
import { IconClose } from "./Icons";

type Props = { app: AppInfo | null; onClose: () => void; onSaved: () => void };

/** Configurações: acesso ao Claude (chave ou token de gateway), modelo e nome. Segredos só entram, nunca voltam. */
export function SettingsDialog({ app, onClose, onSaved }: Props) {
  const [cur, setCur] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [model, setModel] = useState("");
  const [userName, setUserName] = useState("");
  const [clear, setClear] = useState<{ apiKey: boolean; authToken: boolean }>({ apiKey: false, authToken: false });
  const [px, setPx] = useState({ enabled: false, mode: "manual" as "manual" | "pac", host: "", port: "", pacUrl: "", user: "", password: "", clearPassword: false });
  const [test, setTest] = useState<ProxyTest | "running" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        if (!s) return setError("Configurações indisponíveis neste modo de execução.");
        setCur(s);
        setBaseUrl(s.baseUrl);
        setHeaders(s.customHeaders);
        setModel(s.model);
        setUserName(s.userName ?? "");
        setPx((x) => ({ ...x, enabled: s.proxy.enabled, mode: s.proxy.mode, host: s.proxy.host, port: s.proxy.port ? String(s.proxy.port) : "", pacUrl: s.proxy.pacUrl, user: s.proxy.user }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, busy]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: Parameters<typeof api.saveSettings>[0] = { baseUrl, customHeaders: headers, model, userName };
      if (apiKey.trim()) patch.apiKey = apiKey.trim();
      else if (clear.apiKey) patch.apiKey = null;
      patch.proxy = {
        enabled: px.enabled,
        mode: px.mode,
        host: px.host,
        port: px.port.trim() ? Number(px.port) : null,
        pacUrl: px.pacUrl,
        user: px.user,
        ...(px.password ? { password: px.password } : px.clearPassword ? { password: null } : {}),
      };
      if (authToken.trim()) patch.authToken = authToken.trim();
      else if (clear.authToken) patch.authToken = null;
      await api.saveSettings(patch);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setP = (v: Partial<typeof px>) => {
    setPx((x) => ({ ...x, ...v }));
    setTest(null);
  };

  const runTest = async () => {
    setTest("running");
    try {
      setTest(await api.testProxy({ mode: px.mode, host: px.host, port: px.port.trim() ? Number(px.port) : null, pacUrl: px.pacUrl, user: px.user, password: px.password }));
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    }
  };

  const secretHint = (isSet: boolean, willClear: boolean) => (willClear ? "será removida ao salvar" : isSet ? "já configurada — deixe em branco para manter" : "não configurada");
  const noSecure = cur && !cur.secureStorage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" role="dialog" aria-modal="true" aria-label="Configurações" data-testid="settings-dialog">
      <div className="max-h-full w-full max-w-[520px] space-y-3 overflow-y-auto rounded-2xl border border-line bg-sheet p-5 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold text-ink">Configurações</h1>
            <p className="mt-0.5 text-xs text-ink-2">Como o Spec Studio fala com o Claude. Vale para todos os projetos.</p>
          </div>
          <button className="rounded-md p-1 text-ink-2 hover:bg-wash" onClick={onClose} aria-label="Fechar" disabled={busy}>
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {noSecure && (
          <p className="rounded-lg bg-mark-soft px-3 py-2 text-xs text-mark-ink" data-testid="no-secure-storage">
            Neste modo (navegador) chaves e tokens não podem ser salvos por aqui. Coloque-os no arquivo <b>.env</b> do servidor. No aplicativo instalado eles ficam cifrados.
          </p>
        )}

        <fieldset className="space-y-3" disabled={!cur || busy}>
          <label className="block space-y-1">
            <span className="text-xs text-ink-2">Chave da API Anthropic — {cur && secretHint(cur.apiKeySet, clear.apiKey)}</span>
            <input className={input} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" disabled={noSecure ?? false} aria-label="Chave da API" />
            {cur?.apiKeySet && !apiKey && (
              <button type="button" className="text-xs text-ink-2 underline" onClick={() => setClear((c) => ({ ...c, apiKey: !c.apiKey }))}>
                {clear.apiKey ? "Manter a chave" : "Remover a chave"}
              </button>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-ink-2">Token do gateway (LLM gateway) — {cur && secretHint(cur.authTokenSet, clear.authToken)}</span>
            <input className={input} type="password" autoComplete="off" value={authToken} onChange={(e) => setAuthToken(e.target.value)} disabled={noSecure ?? false} aria-label="Token do gateway" />
            {cur?.authTokenSet && !authToken && (
              <button type="button" className="text-xs text-ink-2 underline" onClick={() => setClear((c) => ({ ...c, authToken: !c.authToken }))}>
                {clear.authToken ? "Manter o token" : "Remover o token"}
              </button>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-ink-2">Endereço do gateway (opcional)</span>
            <input className={input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://gateway.suaempresa.com" aria-label="Endereço do gateway" />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-ink-2">Cabeçalhos extras do gateway (opcional, um por linha: Nome: valor)</span>
            <textarea className={`${input} h-16 font-mono text-xs`} value={headers} onChange={(e) => setHeaders(e.target.value)} aria-label="Cabeçalhos extras" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-ink-2">Modelo</span>
              <input className={input} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modelo" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-ink-2">Seu nome (nos comentários)</span>
              <input className={input} value={userName} onChange={(e) => setUserName(e.target.value)} maxLength={60} aria-label="Seu nome" />
            </label>
          </div>

          <div className="space-y-3 border-t border-line pt-4" data-testid="proxy-section">
            <div>
              <h2 className="text-sm font-semibold text-ink">Conexão</h2>
              <p className="text-xs text-ink-2">Se a sua rede acessa a internet por um proxy, configure aqui o caminho até o Claude.</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5">
              <input type="checkbox" role="switch" className="mt-0.5 h-4 w-4 accent-accent" checked={px.enabled} onChange={(e) => setP({ enabled: e.target.checked })} aria-label="Usar proxy" data-testid="proxy-enabled" />
              <span>
                <span className="block text-sm font-medium text-ink">Usar proxy</span>
                <span className="block text-xs text-ink-2">Rotear a conexão com o Claude através de um proxy.</span>
              </span>
            </label>

            {px.enabled && (
              <div className="space-y-3" data-testid="proxy-fields">
                <div className="grid gap-2">
                  {(
                    [
                      ["manual", "Manual", "Informe o endereço e a porta do proxy."],
                      ["pac", "Script automático", "O Windows lê o script e escolhe o proxy para cada destino."],
                    ] as const
                  ).map(([m, title, hint]) => (
                    <label key={m} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5">
                      <input type="radio" name="proxy-mode" className="mt-0.5 h-4 w-4 accent-accent" checked={px.mode === m} onChange={() => setP({ mode: m })} data-testid={`proxy-mode-${m}`} />
                      <span>
                        <span className="block text-sm font-medium text-ink">{title}</span>
                        <span className="block text-xs text-ink-2">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {px.mode === "manual" ? (
                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs text-ink-2">Endereço do proxy</span>
                      <input className={input} value={px.host} onChange={(e) => setP({ host: e.target.value })} placeholder="proxy.suaempresa.com" aria-label="Endereço do proxy" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-ink-2">Porta</span>
                      <input className={input} inputMode="numeric" value={px.port} onChange={(e) => setP({ port: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="8080" aria-label="Porta do proxy" />
                    </label>
                  </div>
                ) : (
                  <label className="block space-y-1">
                    <span className="text-xs text-ink-2">Endereço do script</span>
                    <input className={input} value={px.pacUrl} onChange={(e) => setP({ pacUrl: e.target.value })} placeholder="http://servidor/proxy.pac" aria-label="Endereço do script" />
                    <span className="block text-xs text-ink-3">O mesmo endereço que o Windows usa em Rede e Internet › Proxy › Usar script de instalação. O script decide o proxy por destino, então conexões internas podem sair direto.{app?.desktop ? "" : " Disponível apenas no aplicativo instalado."}</span>
                  </label>
                )}

                <label className="block space-y-1">
                  <span className="text-xs text-ink-2">Usuário (se o proxy exigir)</span>
                  <input className={input} value={px.user} onChange={(e) => setP({ user: e.target.value })} autoComplete="off" aria-label="Usuário do proxy" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-ink-2">Senha {cur?.proxy.passwordSet && !px.clearPassword ? "— já salva" : ""}</span>
                  <input className={input} type="password" autoComplete="off" value={px.password} onChange={(e) => setP({ password: e.target.value })} placeholder="Deixe em branco para manter a senha salva" disabled={noSecure ?? false} aria-label="Senha do proxy" />
                  <span className="block text-xs text-ink-3">
                    {noSecure ? "Neste modo (navegador) a senha do proxy não pode ser salva." : "A senha é salva cifrada pelo Windows e nunca é exibida aqui novamente. “Testar conexão” usa apenas o que estiver preenchido aqui, então digite a senha de novo para testar um proxy que a exija."}
                  </span>
                  {cur?.proxy.passwordSet && !px.password && (
                    <button type="button" className="text-xs text-ink-2 underline" onClick={() => setP({ clearPassword: !px.clearPassword })}>
                      {px.clearPassword ? "Manter a senha salva" : "Remover a senha salva"}
                    </button>
                  )}
                </label>

                <div className="flex items-start gap-3">
                  <button type="button" className={btn} onClick={() => void runTest()} disabled={test === "running"} data-testid="proxy-test">
                    {test === "running" ? "Testando…" : "Testar conexão"}
                  </button>
                  {test && test !== "running" && (
                    <p className={`flex-1 rounded-lg px-3 py-2 text-xs ${test.ok ? "bg-claude-soft text-claude-ink" : "bg-danger-soft text-danger"}`} role="status" data-testid="proxy-test-result">
                      {test.message}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </fieldset>

        {app?.desktop && (
          <p className="text-xs text-ink-3" data-testid="app-version">
            Spec Studio {app.version}
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 rounded-b-2xl border-t border-line bg-sheet px-5 py-3">
          <button className={btn} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={() => void save()} disabled={busy || !cur} data-testid="save-settings">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
