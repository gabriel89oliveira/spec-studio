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

export type GuideMissing = { id: string; label: string; ask: string; section?: string };
export type Guide = {
  kind: "feature" | "module";
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
