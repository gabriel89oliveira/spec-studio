import { useEffect, useState } from "react";
import { api } from "../api";
import type { AppInfo, Settings } from "../types";
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
        <div className="flex justify-end gap-2">
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
