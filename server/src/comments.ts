import fs from "node:fs";
import path from "node:path";
import { HttpError, nowIso, randomId } from "./util.js";

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

export const COMMENTS_DIR = ".spec-studio/comments";

/** Um JSON por documento comentado: .spec-studio/comments/<caminho do doc>.json */
export class CommentStore {
  readonly dir: string;

  constructor(private root: string) {
    this.dir = path.join(root, ".spec-studio", "comments");
  }

  /** Caminho do JSON, relativo ao projeto (formato posix). */
  relFileFor(docRel: string): string {
    return `${COMMENTS_DIR}/${docRel}.json`;
  }

  private absFileFor(docRel: string): string {
    return path.join(this.dir, ...docRel.split("/")) + ".json";
  }

  list(docRel: string): Comment[] {
    const abs = this.absFileFor(docRel);
    if (!fs.existsSync(abs)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(abs, "utf8"));
      return Array.isArray(data) ? (data as Comment[]) : [];
    } catch {
      return [];
    }
  }

  private save(docRel: string, comments: Comment[]): void {
    const abs = this.absFileFor(docRel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(comments, null, 2)}\n`, "utf8");
  }

  /** Todos os documentos que têm arquivo de comentários. */
  private allDocs(): string[] {
    const out: string[] = [];
    const walk = (absDir: string, relDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = relDir ? `${relDir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(absDir, e.name), rel);
        else if (e.isFile() && e.name.endsWith(".json")) out.push(rel.slice(0, -".json".length));
      }
    };
    walk(this.dir, "");
    return out;
  }

  find(id: string): Comment {
    for (const doc of this.allDocs()) {
      const c = this.list(doc).find((x) => x.id === id);
      if (c) return c;
    }
    throw new HttpError(404, `Comentário não encontrado: ${id}`);
  }

  /** Comentários não resolvidos por documento. */
  openCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const doc of this.allDocs()) {
      const n = this.list(doc).filter((c) => c.status !== "resolved").length;
      if (n > 0) counts[doc] = n;
    }
    return counts;
  }

  create(file: string, anchor: Anchor, body: string, author: string): Comment {
    const comments = this.list(file);
    const comment: Comment = {
      id: randomId("c"),
      file,
      anchor,
      body,
      author,
      status: "open",
      replies: [],
      createdAt: nowIso(),
      resolvedAt: null,
    };
    comments.push(comment);
    this.save(file, comments);
    return comment;
  }

  update(id: string, change: (c: Comment) => void): Comment {
    const found = this.find(id);
    const comments = this.list(found.file);
    const c = comments.find((x) => x.id === id)!;
    change(c);
    this.save(found.file, comments);
    return c;
  }

  setStatus(id: string, status: CommentStatus): Comment {
    return this.update(id, (c) => {
      c.status = status;
      c.resolvedAt = status === "resolved" ? nowIso() : null;
    });
  }

  addReply(id: string, reply: Omit<Reply, "createdAt">, status?: CommentStatus): Comment {
    return this.update(id, (c) => {
      c.replies.push({ ...reply, createdAt: nowIso() });
      if (status) {
        c.status = status;
        c.resolvedAt = status === "resolved" ? nowIso() : null;
      }
    });
  }
}
