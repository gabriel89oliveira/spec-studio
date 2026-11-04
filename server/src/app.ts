import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import type { FSWatcher } from "chokidar";
import { z } from "zod";
import { realQuery, type QueryFn } from "./claude.js";
import { mockQuery } from "./mock.js";
import { CommentStore } from "./comments.js";
import type { Config } from "./config.js";
import { EventBus, SourceTracker } from "./events.js";
import { listTree, readDoc, writeDoc } from "./files.js";
import { analyzeDoc } from "./guide.js";
import { GitService } from "./git.js";
import { JobRunner } from "./jobs.js";
import { PathError, resolveDocPath } from "./paths.js";
import { SessionStore } from "./sessions.js";
import { HttpError } from "./util.js";
import { startWatcher } from "./watcher.js";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");
    throw new HttpError(400, `Dados inválidos — ${msg}`);
  }
  return r.data;
}

const anchorSchema = z.object({
  quote: z.string().trim().min(1, "selecione um trecho"),
  prefix: z.string().max(200).default(""),
  suffix: z.string().max(200).default(""),
});

export type ServerOptions = { queryFn?: QueryFn; watch?: boolean };

export async function createServer(config: Config, opts: ServerOptions = {}) {
  const root = config.projectDir;
  const git = await GitService.open(root, config.userName);
  const bus = new EventBus();
  const tracker = new SourceTracker();
  const comments = new CommentStore(root);
  const sessions = new SessionStore(root);
  const jobs = new JobRunner({ config, git, comments, sessions, bus, tracker, queryFn: opts.queryFn ?? (config.mock ? mockQuery : realQuery) });

  const commitComments = async (file: string, what: string) => {
    if (config.autoCommit) await git.commitPaths([comments.relFileFor(file)], `comentários: ${file} (${what})`);
  };
  const assertIdle = () => {
    if (jobs.isRunning()) throw new HttpError(409, "Aguarde: o Claude está trabalhando");
  };

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));

  app.get(
    "/api/project",
    h(async (_req, res) => {
      res.json({
        name: path.basename(root),
        projectDir: root,
        branch: await git.branch(),
        dirty: await git.isDirty(),
        userName: config.userName,
        autoCommit: config.autoCommit,
        claude: {
          enabled: Boolean(config.apiKey) || config.mock,
          mock: config.mock,
          model: config.mock ? "modo simulado" : config.model,
          job: jobs.publicJob(),
          lastCostUsd: jobs.lastCostUsd ?? null,
          lastChangedFiles: jobs.lastChangedFiles,
        },
      });
    }),
  );

  app.get(
    "/api/tree",
    h((_req, res) => res.json(listTree(root, comments.openCounts()))),
  );

  app.get(
    "/api/file",
    h((req, res) => {
      const { abs, rel } = resolveDocPath(root, req.query.path);
      const doc = readDoc(abs, rel);
      res.json({ ...doc, guide: analyzeDoc(rel, doc.content) });
    }),
  );

  app.put(
    "/api/file",
    h(async (req, res) => {
      const body = parse(z.object({ path: z.string(), content: z.string(), baseHash: z.string() }), req.body);
      const { abs, rel } = resolveDocPath(root, body.path);
      assertIdle();
      const { hash } = writeDoc(abs, rel, body.content, body.baseHash);
      tracker.mark(rel, hash, "manual");
      const commit = config.autoCommit ? await git.commitPaths([rel], `edição manual: ${rel}`) : null;
      res.json({ path: rel, hash, commit });
    }),
  );

  app.get(
    "/api/comments",
    h((req, res) => {
      const { rel } = resolveDocPath(root, req.query.path);
      res.json(comments.list(rel));
    }),
  );

  app.post(
    "/api/comments",
    h(async (req, res) => {
      const body = parse(
        z.object({ file: z.string(), anchor: anchorSchema, body: z.string().trim().min(1, "escreva o comentário") }),
        req.body,
      );
      const { abs, rel } = resolveDocPath(root, body.file);
      if (!fs.existsSync(abs)) throw new HttpError(404, `Arquivo não encontrado: ${rel}`);
      const c = comments.create(rel, body.anchor, body.body, config.userName);
      await commitComments(rel, "novo");
      bus.emit("comment.updated", { file: rel, commentId: c.id });
      res.status(201).json(c);
    }),
  );

  app.patch(
    "/api/comments/:id",
    h(async (req, res) => {
      const body = parse(
        z.object({ body: z.string().trim().min(1).optional(), status: z.enum(["open", "resolved"]).optional() }),
        req.body,
      );
      let c = comments.find(req.params.id);
      if (body.body !== undefined) c = comments.update(c.id, (x) => (x.body = body.body!));
      if (body.status !== undefined) c = comments.setStatus(c.id, body.status);
      await commitComments(c.file, body.status === "resolved" ? "resolvido" : body.status === "open" ? "reaberto" : "editado");
      bus.emit("comment.updated", { file: c.file, commentId: c.id });
      res.json(c);
    }),
  );

  app.post(
    "/api/comments/:id/reply",
    h(async (req, res) => {
      const body = parse(z.object({ body: z.string().trim().min(1, "escreva a resposta") }), req.body);
      const current = comments.find(req.params.id);
      const status = current.status === "answered" || current.status === "resolved" ? "open" : undefined;
      const c = comments.addReply(current.id, { author: config.userName, body: body.body }, status);
      await commitComments(c.file, "resposta");
      bus.emit("comment.updated", { file: c.file, commentId: c.id });
      res.json(c);
    }),
  );

  app.post(
    "/api/comments/:id/send",
    h((req, res) => {
      const job = jobs.startComment(req.params.id);
      res.status(202).json({ jobId: job.id });
    }),
  );

  app.post(
    "/api/chat",
    h((req, res) => {
      const body = parse(
        z.object({
          message: z.string().trim().min(1, "escreva a mensagem"),
          sessionId: z.string().optional(),
          openFile: z.string().optional(),
        }),
        req.body,
      );
      if (body.sessionId !== undefined && !SessionStore.isValidId(body.sessionId)) throw new HttpError(400, "Id de conversa inválido");
      const openFile = body.openFile ? resolveDocPath(root, body.openFile).rel : undefined;
      const { job, sessionId } = jobs.startChat(body.message, body.sessionId, openFile);
      res.status(202).json({ jobId: job.id, sessionId });
    }),
  );

  app.get(
    "/api/chat/sessions/:id",
    h((req, res) => res.json(sessions.get(req.params.id))),
  );

  app.post(
    "/api/jobs/:id/cancel",
    h((req, res) => {
      if (!jobs.cancel(req.params.id)) throw new HttpError(404, "Nenhum trabalho em andamento com esse id");
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/history",
    h(async (req, res) => {
      const { rel } = resolveDocPath(root, req.query.path);
      res.json(await git.history(rel));
    }),
  );

  app.get(
    "/api/diff",
    h(async (req, res) => {
      const { rel } = resolveDocPath(root, req.query.path);
      res.json(await git.diff(req.query.commit, rel));
    }),
  );

  app.post(
    "/api/revert",
    h(async (req, res) => {
      const body = parse(z.object({ commit: z.string() }), req.body);
      assertIdle();
      const result = await git.revert(body.commit);
      for (const f of result.files) {
        if (f.toLowerCase().endsWith(".md")) tracker.mark(f, null, "manual");
      }
      bus.emit("tree.changed", {});
      res.json(result);
    }),
  );

  app.get("/api/events", (req, res) => {
    const detach = bus.attachSse(res);
    req.on("close", detach);
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada" }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.data });
    if (err instanceof PathError) return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON inválido" });
    console.error("[server]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro interno" });
  });

  let watcher: FSWatcher | undefined;
  if (opts.watch !== false) watcher = startWatcher(root, bus, tracker);

  return {
    app,
    bus,
    jobs,
    git,
    comments,
    sessions,
    ready: async () => {
      if (watcher) await new Promise<void>((r) => watcher!.once("ready", () => r()));
    },
    close: async () => {
      await watcher?.close();
    },
  };
}
