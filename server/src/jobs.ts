import path from "node:path";
import { chatPrompt, commentPrompt, runAgent, type AgentResult, type ClaudeConfig, type QueryFn } from "./claude.js";
import { COMMENTS_DIR, type CommentStore } from "./comments.js";
import { hasCredentials, type Config } from "./config.js";
import type { EventBus, SourceTracker } from "./events.js";
import { currentHash } from "./files.js";
import type { GitService } from "./git.js";
import { SessionStore, type ToolLine } from "./sessions.js";
import { HttpError, oneLine, randomId } from "./util.js";

export type Job = {
  id: string;
  kind: "comment" | "chat";
  commentId?: string;
  sessionId?: string;
  status: "running" | "done" | "error" | "cancelled";
  changedFiles: string[];
  commit?: string;
};

type Deps = {
  config: Config;
  git: GitService;
  comments: CommentStore;
  sessions: SessionStore;
  bus: EventBus;
  tracker: SourceTracker;
  queryFn: QueryFn;
};

/** Pastas que um trabalho do Claude pode alterar e que entram no commit. */
const SPEC_PATHS = ["docs", "CLAUDE.md"];

/** Controla o trabalho do Claude em andamento. Só existe um por vez. */
export class JobRunner {
  current: Job | null = null;
  lastCostUsd?: number;
  lastChangedFiles: string[] = [];
  private controller?: AbortController;
  /** Resolve quando o trabalho atual termina (útil para testes). */
  idle: Promise<void> = Promise.resolve();

  constructor(private d: Deps) {}

  private get claudeConfig(): ClaudeConfig {
    const { projectDir, model, apiKey, authToken, baseUrl, customHeaders } = this.d.config;
    return { projectDir, model, apiKey, authToken, baseUrl, customHeaders };
  }

  isRunning(): boolean {
    return this.current?.status === "running";
  }

  private assertCanStart(): void {
    if (!hasCredentials(this.d.config) && !this.d.config.mock) {
      throw new HttpError(400, "Claude desativado: defina ANTHROPIC_API_KEY ou ANTHROPIC_AUTH_TOKEN no .env (ou CLAUDE_MOCK=true para testar sem custo)");
    }
    if (this.isRunning()) throw new HttpError(409, "O Claude já está trabalhando em outro pedido");
  }

  startComment(commentId: string): Job {
    this.assertCanStart();
    const comment = this.d.comments.find(commentId);
    const sent = this.d.comments.setStatus(commentId, "sent");
    this.d.bus.emit("comment.updated", { file: sent.file, commentId });

    const job = this.newJob({ kind: "comment", commentId });
    this.run(job, commentPrompt(comment), undefined, comment.body, async (res, commit) => {
      const ok = res.status === "done";
      const body = ok ? res.text || "Concluído." : res.status === "cancelled" ? "Pedido cancelado." : `Erro: ${res.error ?? "falha desconhecida"}`;
      const updated = this.d.comments.addReply(commentId, { author: "Claude", body, commit: commit ?? undefined }, ok ? "answered" : "open");
      if (this.d.config.autoCommit) {
        await this.d.git.commitPaths([this.d.comments.relFileFor(updated.file)], `comentários: ${updated.file} (resposta do Claude)`);
      }
      this.d.bus.emit("comment.updated", { file: updated.file, commentId });
    });
    return job;
  }

  startChat(message: string, sessionId?: string, openFile?: string): { job: Job; sessionId: string } {
    this.assertCanStart();
    const session = this.d.sessions.getOrCreate(sessionId);
    this.d.sessions.append(session.id, { role: "user", text: message });

    const job = this.newJob({ kind: "chat", sessionId: session.id });
    this.run(job, chatPrompt(message, openFile), session.sdkSessionId, message, async (res, commit, tools) => {
      this.d.sessions.append(
        session.id,
        {
          role: "assistant",
          text: res.text,
          tools,
          commit: commit ?? undefined,
          error: res.status === "done" ? undefined : res.error,
        },
        res.sessionId,
      );
    });
    return { job, sessionId: session.id };
  }

  cancel(jobId: string): boolean {
    if (!this.current || this.current.id !== jobId || !this.isRunning()) return false;
    this.controller?.abort();
    return true;
  }

  publicJob(): Job | null {
    return this.current;
  }

  private newJob(fields: Pick<Job, "kind" | "commentId" | "sessionId">): Job {
    const job: Job = { id: randomId("j", 4), status: "running", changedFiles: [], ...fields };
    this.current = job;
    return job;
  }

  private run(
    job: Job,
    prompt: string,
    resume: string | undefined,
    request: string,
    finish: (res: AgentResult, commit: string | null, tools: ToolLine[]) => Promise<void>,
  ): void {
    const { bus, tracker, git, config } = this.d;
    const controller = new AbortController();
    this.controller = controller;
    tracker.setJobRunning(true);
    bus.emit("job.started", { jobId: job.id, kind: job.kind, commentId: job.commentId, sessionId: job.sessionId });

    const tools: ToolLine[] = [];
    this.idle = (async () => {
      let res: AgentResult;
      try {
        res = await runAgent(
          this.claudeConfig,
          prompt,
          controller,
          {
            onText: (delta) => bus.emit("job.text", { jobId: job.id, delta }),
            onTool: (tool, p) => {
              tools.push({ tool, path: p });
              bus.emit("job.tool", { jobId: job.id, tool, path: p });
            },
          },
          this.d.queryFn,
          resume,
        );
      } catch (err) {
        res = { status: "error", text: "", error: err instanceof Error ? err.message : String(err) };
      }

      let commit: string | null = null;
      let changed: string[] = [];
      try {
        changed = (await git.changedFiles(SPEC_PATHS)).filter((f) => f.toLowerCase().endsWith(".md"));
        for (const f of changed) tracker.mark(f, currentHash(path.join(config.projectDir, ...f.split("/"))), "claude");
        if (config.autoCommit) {
          const origin = job.kind === "comment" ? `comentário ${job.commentId}` : `chat ${job.sessionId}`;
          const prefix = res.status === "done" ? "claude" : "claude (interrompido)";
          const message = `${prefix}: ${oneLine(request, 60)}\n\nPedido-por: ${config.userName}\nOrigem: ${origin}`;
          commit = await git.commitPaths([...SPEC_PATHS, COMMENTS_DIR], message);
        }
      } catch (err) {
        console.error("[jobs] falha ao registrar alterações:", err);
      }

      try {
        await finish(res, commit, tools);
      } catch (err) {
        console.error("[jobs] falha ao concluir:", err);
      }

      job.status = res.status;
      job.changedFiles = changed;
      job.commit = commit ?? undefined;
      this.lastChangedFiles = changed;
      if (res.costUsd !== undefined) this.lastCostUsd = res.costUsd;
      tracker.setJobRunning(false);

      for (const f of changed) {
        bus.emit("file.changed", { path: f, hash: currentHash(path.join(config.projectDir, ...f.split("/"))), source: "claude" });
      }
      if (changed.length) bus.emit("tree.changed", {});

      if (res.status === "done") {
        bus.emit("job.done", { jobId: job.id, changedFiles: changed, commit: commit ?? undefined, summary: res.text, costUsd: res.costUsd });
      } else {
        bus.emit("job.error", { jobId: job.id, message: res.error ?? "Falha desconhecida", changedFiles: changed, commit: commit ?? undefined });
      }
    })();
  }
}
