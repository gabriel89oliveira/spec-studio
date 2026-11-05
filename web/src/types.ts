export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
  openComments?: number;
  /** Em features: o módulo declarado (ex.: "M01"). */
  module?: string;
  /** Em módulos: as features que pertencem a ele (montado no cliente). */
  features?: TreeNode[];
};

export type GuideMissing = { id: string; label: string; ask: string; section?: string; action?: "extract" | "review" | "apply" };
export type Guide = {
  kind: "feature" | "module" | "source" | "concept" | "matrix";
  steps: string[];
  reached: number;
  current: string | null;
  missing: GuideMissing[];
  doubts: number;
  status?: string;
};

export type FileDoc = { path: string; content: string; hash: string; guide?: Guide | null };

export type Anchor = { quote: string; prefix: string; suffix: string };
export type Reply = { author: string; body: string; createdAt: string; commit?: string };
export type CommentStatus = "open" | "sent" | "answered" | "resolved";

export type Comment = {
  id: string;
  file: string;
  anchor: Anchor;
  body: string;
  author: string;
  status: CommentStatus;
  replies: Reply[];
  createdAt: string;
  resolvedAt: string | null;
};

export type Job = {
  id: string;
  kind: "comment" | "chat";
  commentId?: string;
  sessionId?: string;
  status: "running" | "done" | "error" | "cancelled";
  changedFiles: string[];
  commit?: string;
};

export type Project = {
  name: string;
  projectDir: string;
  branch: string;
  dirty: boolean;
  userName: string;
  autoCommit: boolean;
  claude: {
    enabled: boolean;
    mock: boolean;
    model: string;
    job: Job | null;
    lastCostUsd: number | null;
    lastChangedFiles: string[];
  };
};

export type ToolLine = { tool: string; path?: string };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  tools?: ToolLine[];
  commit?: string;
  error?: string;
  createdAt: string;
};

export type ChatSession = { id: string; createdAt: string; messages: ChatMessage[] };

export type HistoryEntry = {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  origin: "claude" | "manual" | "revert" | "comments" | "other";
};

/** Trabalho do Claude acompanhado ao vivo na interface. */
export type LiveJob = {
  id: string;
  kind: "comment" | "chat";
  commentId?: string;
  sessionId?: string;
  text: string;
  tools: ToolLine[];
};

export type EventName =
  | "file.changed"
  | "tree.changed"
  | "comment.updated"
  | "job.started"
  | "job.text"
  | "job.tool"
  | "job.done"
  | "job.error";

export type Issue = { id: string; rule: string; severity: "erro" | "aviso"; message: string; files: string[]; fix: string };

export type Progress = { reached: number; steps: string[]; current: string | null };
export type FeatureLine = { id: string; name: string; path: string; stage: string; missing: number; doubts: number };
export type Decision = {
  id: string;
  title: string;
  status: string;
  affects: string[];
  decider: string;
  deadline: string | null;
  context: string;
  options: string[];
  decision: string;
  decidedOn: string;
  decidedBy: string;
  history: string[];
};
export type Overview = {
  name: string;
  concept: Progress | null;
  matrix: Progress | null;
  counts: { modules: number; features: number; sources: number; decisionsOpen: number; issues: number; errors: number; doubts: number };
  stages: { stage: string; count: number }[];
  modules: { id: string; name: string; path: string; guide: Progress | null; features: FeatureLine[] }[];
  orphans: FeatureLine[];
  decisions: Decision[];
  next: { text: string; path?: string }[];
};
export type DevPack = { title: string; markdown: string; warnings: string[]; testPlan: string };
export type Screen = "overview" | "issues" | "decisions";

export type WsEntry = { path: string; name: string };
export type WorkspaceInfo = { current: string | null; name: string | null; recent: WsEntry[]; home: string; sep: string };
export type Browse = { path: string; parent: string | null; dirs: WsEntry[]; isProject: boolean; sep: string };

export type UpdateState = { state: "idle" | "checking" | "downloading" | "ready" | "error"; version?: string; percent?: number; error?: string };
export type AppInfo = { version: string; desktop: boolean; update: UpdateState };
export type Settings = {
  apiKeySet: boolean;
  authTokenSet: boolean;
  baseUrl: string;
  customHeaders: string;
  model: string;
  userName: string;
  proxy: ProxyView;
  secureStorage: boolean;
};
export type ProxyView = { enabled: boolean; mode: "manual" | "pac"; host: string; port: number | null; pacUrl: string; user: string; passwordSet: boolean };
export type ProxyPatch = Partial<Omit<ProxyView, "passwordSet">> & { password?: string | null };
export type ProxyTest = { ok: boolean; message: string; via?: string };
export type SettingsPatch = Partial<Pick<Settings, "baseUrl" | "customHeaders" | "model" | "userName">> & { apiKey?: string | null; authToken?: string | null; proxy?: ProxyPatch };
