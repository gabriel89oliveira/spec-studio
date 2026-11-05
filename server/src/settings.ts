import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
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

type Stored = { apiKey?: string; authToken?: string; baseUrl?: string; customHeaders?: string; model?: string; userName?: string };

export type SettingsView = {
  apiKeySet: boolean;
  authTokenSet: boolean;
  baseUrl: string;
  customHeaders: string;
  model: string;
  userName: string;
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
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2), "utf8");
    this.data = next;
  }
}
