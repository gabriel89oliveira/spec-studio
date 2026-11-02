import fs from "node:fs";
import path from "node:path";
import { HttpError, nowIso, randomId } from "./util.js";

export type ToolLine = { tool: string; path?: string };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  tools?: ToolLine[];
  commit?: string;
  error?: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  /** Id da sessão no Agent SDK, usado para continuar a conversa (resume). */
  sdkSessionId?: string;
  createdAt: string;
  messages: ChatMessage[];
};

const ID_RE = /^s_[0-9a-f]{8}$/;

/** Conversas do chat em .spec-studio/sessions/ (fora do Git). */
export class SessionStore {
  readonly dir: string;

  constructor(root: string) {
    this.dir = path.join(root, ".spec-studio", "sessions");
  }

  static isValidId(id: unknown): id is string {
    return typeof id === "string" && ID_RE.test(id);
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  get(id: string): ChatSession {
    if (!SessionStore.isValidId(id)) throw new HttpError(400, "Id de conversa inválido");
    const f = this.file(id);
    if (!fs.existsSync(f)) throw new HttpError(404, "Conversa não encontrada");
    return JSON.parse(fs.readFileSync(f, "utf8")) as ChatSession;
  }

  getOrCreate(id?: string): ChatSession {
    if (id) return this.get(id);
    const session: ChatSession = { id: randomId("s", 4), createdAt: nowIso(), messages: [] };
    this.save(session);
    return session;
  }

  save(session: ChatSession): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file(session.id), `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }

  append(id: string, message: Omit<ChatMessage, "createdAt">, sdkSessionId?: string): ChatSession {
    const s = this.get(id);
    s.messages.push({ ...message, createdAt: nowIso() });
    if (sdkSessionId) s.sdkSessionId = sdkSessionId;
    this.save(s);
    return s;
  }
}
