import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { noProxy, validateProxy, type ProxySettings } from "./proxy.js";
import type { BaseConfig } from "./workspace.js";

/** Como guardar segredos. No app instalado, o Electron cifra com o Windows (DPAPI); no modo navegador não há cifra. */
export type SecretCodec = {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(stored: string): string;
};

export const noCodec: SecretCodec = {
  available: () => false,
  encrypt: () => {
    throw new Error("Sem armazenamento seguro neste modo");
  },
  decrypt: () => "",
};

type StoredProxy = { enabled?: boolean; mode?: "manual" | "pac"; host?: string; port?: number; pacUrl?: string; user?: string; password?: string };
type Stored = { apiKey?: string; authToken?: string; baseUrl?: string; customHeaders?: string; model?: string; userName?: string; proxy?: StoredProxy };

export type ProxyView = Omit<ProxySettings, "password"> & { passwordSet: boolean };

export type SettingsView = {
  apiKeySet: boolean;
  authTokenSet: boolean;
  baseUrl: string;
  customHeaders: string;
  model: string;
  userName: string;
  proxy: ProxyView;
  /** Se os segredos podem ser guardados por esta tela. */
  secureStorage: boolean;
};

const patchSchema = z.object({
  /** string = definir; null = apagar; ausente = manter. */
  apiKey: z.string().max(500).nullable().optional(),
  authToken: z.string().max(2000).nullable().optional(),
  baseUrl: z.union([z.literal(""), z.url({ error: "O endereço do gateway deve ser uma URL completa, como https://gateway.suaempresa.com" })]).optional(),
  customHeaders: z.string().max(2000).optional(),
  model: z.string().trim().max(100).optional(),
  userName: z.string().trim().max(60).optional(),
  proxy: z
    .object({
      enabled: z.boolean().optional(),
      mode: z.enum(["manual", "pac"]).optional(),
      host: z.string().trim().max(255).optional(),
      port: z.number().int().nullable().optional(),
      pacUrl: z.string().trim().max(2000).optional(),
      user: z.string().trim().max(255).optional(),
      /** string = definir; null = apagar; ausente = manter. */
      password: z.string().max(500).nullable().optional(),
    })
    .optional(),
});
export type SettingsPatch = z.infer<typeof patchSchema>;
export const parseSettingsPatch = (x: unknown): SettingsPatch => patchSchema.parse(x);

/** Configurações feitas pela tela, em um arquivo na pasta de dados do usuário. Sobrepõem o .env. */
export class SettingsStore {
  private data: Stored = {};

  constructor(
    private file: string,
    private codec: SecretCodec = noCodec,
  ) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8")) as Stored;
    } catch {
      /* primeiro uso */
    }
  }

  private listeners: Array<() => void> = [];

  /** Chamado depois de cada alteração salva (o aplicativo usa para reaplicar o proxy). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** O proxy configurado, com a senha em texto, para uso interno (nunca enviado à tela). */
  proxy(): ProxySettings {
    const d = this.data.proxy ?? {};
    return {
      enabled: d.enabled ?? false,
      mode: d.mode ?? "manual",
      host: d.host ?? "",
      port: d.port ?? null,
      pacUrl: d.pacUrl ?? "",
      user: d.user ?? "",
      password: this.secret(d.password) ?? "",
    };
  }

  private secret(v?: string): string | undefined {
    if (!v) return undefined;
    try {
      return this.codec.decrypt(v) || undefined;
    } catch {
      return undefined;
    }
  }

  view(env: Omit<BaseConfig, never>): SettingsView {
    const eff = this.apply(env);
    return {
      apiKeySet: Boolean(eff.apiKey),
      authTokenSet: Boolean(eff.authToken),
      baseUrl: eff.baseUrl ?? "",
      customHeaders: eff.customHeaders ?? "",
      model: eff.model,
      userName: eff.userName,
      proxy: (({ password, ...rest }) => ({ ...rest, passwordSet: Boolean(password) }))(this.proxy()),
      secureStorage: this.codec.available(),
    };
  }

  /** A configuração do .env com o que foi salvo pela tela por cima. */
  apply(env: BaseConfig): BaseConfig {
    const d = this.data;
    return {
      ...env,
      apiKey: this.secret(d.apiKey) ?? env.apiKey,
      authToken: this.secret(d.authToken) ?? env.authToken,
      baseUrl: d.baseUrl || env.baseUrl,
      customHeaders: d.customHeaders || env.customHeaders,
      model: d.model || env.model,
      userName: d.userName || env.userName,
      proxy: this.proxy(),
    };
  }

  update(patch: SettingsPatch): void {
    const next: Stored = { ...this.data };
    for (const k of ["apiKey", "authToken"] as const) {
      const v = patch[k];
      if (v === undefined) continue;
      if (v === null || v.trim() === "") delete next[k];
      else {
        if (!this.codec.available()) throw new Error("Este modo não guarda segredos pela tela. Use o arquivo .env.");
        next[k] = this.codec.encrypt(v.trim());
      }
    }
    for (const k of ["baseUrl", "customHeaders", "model", "userName"] as const) {
      const v = patch[k];
      if (v === undefined) continue;
      if (v.trim() === "") delete next[k];
      else next[k] = v.trim();
    }
    if (patch.proxy) {
      const pp = patch.proxy;
      const cur: StoredProxy = { ...(next.proxy ?? {}) };
      if (pp.enabled !== undefined) cur.enabled = pp.enabled;
      if (pp.mode !== undefined) cur.mode = pp.mode;
      if (pp.host !== undefined) cur.host = pp.host;
      if (pp.port !== undefined) pp.port === null ? delete cur.port : (cur.port = pp.port);
      if (pp.pacUrl !== undefined) cur.pacUrl = pp.pacUrl;
      if (pp.user !== undefined) cur.user = pp.user;
      if (pp.password !== undefined) {
        if (pp.password === null || pp.password === "") delete cur.password;
        else {
          if (!this.codec.available()) throw new Error("Este modo não guarda a senha do proxy pela tela.");
          cur.password = this.codec.encrypt(pp.password);
        }
      }
      next.proxy = cur;
      const check: ProxySettings = { ...noProxy, enabled: cur.enabled ?? false, mode: cur.mode ?? "manual", host: cur.host ?? "", port: cur.port ?? null, pacUrl: cur.pacUrl ?? "" };
      const bad = validateProxy(check);
      if (bad) throw new Error(bad);
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2), "utf8");
    this.data = next;
    for (const fn of this.listeners) fn();
  }
}
