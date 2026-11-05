import type { Browse, WorkspaceInfo, Anchor, ChatSession, Comment, Decision, DevPack, FileDoc, HistoryEntry, Issue, Overview, Project, TreeNode } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor do Spec Studio");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* resposta sem JSON */
  }
  if (!res.ok) {
    const fallback =
      res.status >= 500
        ? "O servidor do Spec Studio não está respondendo. Veja a mensagem no terminal do npm run dev ou no arquivo server/startup.log."
        : `Erro ${res.status}`;
    throw new ApiError(res.status, (data.error as string) || fallback, data);
  }
  return data as T;
}

const q = (path: string) => encodeURIComponent(path);

export const api = {
  project: () => req<Project>("GET", "/api/project"),
  tree: () => req<TreeNode[]>("GET", "/api/tree"),
  file: (path: string) => req<FileDoc>("GET", `/api/file?path=${q(path)}`),
  saveFile: (path: string, content: string, baseHash: string) =>
    req<{ path: string; hash: string; commit: string | null }>("PUT", "/api/file", { path, content, baseHash }),

  workspace: () => req<WorkspaceInfo>("GET", "/api/workspace"),
  browse: (path?: string) => req<Browse>("GET", `/api/workspace/browse${path ? `?path=${q(path)}` : ""}`),
  pickFolder: (title: string, initial?: string) => req<{ path: string | null; isProject: boolean }>("POST", "/api/workspace/pick", { title, initial }),
  openProject: (path: string) => req<WorkspaceInfo>("POST", "/api/workspace/open", { path }),
  newProject: (parent: string, name: string) => req<WorkspaceInfo>("POST", "/api/workspace/new", { parent, name }),

  issues: () => req<Issue[]>("GET", "/api/issues"),
  overview: () => req<Overview>("GET", "/api/overview"),
  decisions: () => req<Decision[]>("GET", "/api/decisions"),
  devpack: (feature: string) => req<DevPack>("GET", `/api/devpack?feature=${q(feature)}`),
  setStage: (path: string, stage: string) => req<{ path: string; hash: string }>("POST", "/api/stage", { path, stage }),

  importSource: (b: { name: string; type: string; fileName?: string; encoding: "base64" | "text"; content: string }) =>
    req<{ ficha: string; original: string; commit: string | null }>("POST", "/api/sources", b),

  renameSource: (path: string, name: string) =>
    req<{ path: string; name: string; updatedRefs: string[]; commit: string | null }>("POST", "/api/sources/rename", { path, name }),

  comments: (path: string) => req<Comment[]>("GET", `/api/comments?path=${q(path)}`),
  createComment: (file: string, anchor: Anchor, body: string) => req<Comment>("POST", "/api/comments", { file, anchor, body }),
  updateComment: (id: string, patch: { body?: string; status?: "open" | "resolved" }) =>
    req<Comment>("PATCH", `/api/comments/${id}`, patch),
  reply: (id: string, body: string) => req<Comment>("POST", `/api/comments/${id}/reply`, { body }),
  sendComment: (id: string) => req<{ jobId: string }>("POST", `/api/comments/${id}/send`),

  chat: (message: string, sessionId?: string, openFile?: string) =>
    req<{ jobId: string; sessionId: string }>("POST", "/api/chat", { message, sessionId, openFile }),
  session: (id: string) => req<ChatSession>("GET", `/api/chat/sessions/${id}`),
  cancel: (jobId: string) => req<{ ok: boolean }>("POST", `/api/jobs/${jobId}/cancel`),

  history: (path: string) => req<HistoryEntry[]>("GET", `/api/history?path=${q(path)}`),
  diff: (commit: string, path: string) =>
    req<{ commit: string; before: string; after: string }>("GET", `/api/diff?commit=${q(commit)}&path=${q(path)}`),
  revert: (commit: string) => req<{ commit: string; files: string[] }>("POST", "/api/revert", { commit }),
};

/** localStorage pode não existir ou falhar (janela privada etc.); a interface funciona sem ele. */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* ignora */
    }
  },
};
