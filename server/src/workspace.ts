import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { createServer, type ServerOptions } from "./app.js";
import { checkProjectDir, ConfigError, type Config } from "./config.js";
import { EventBus } from "./events.js";
import { nativeFolderPicker, type FolderPicker } from "./folderDialog.js";
import { HttpError } from "./util.js";

type Server = Awaited<ReturnType<typeof createServer>>;
export type BaseConfig = Omit<Config, "projectDir">;

const here = path.dirname(fileURLToPath(import.meta.url));
const KIT_DIR = path.resolve(here, "../../kit");
const MAX_RECENT = 8;

export type Entry = { path: string; name: string };

/** Pasta do projeto atual, projetos recentes e criação de projeto novo, sem reiniciar o servidor. */
export class Workspace {
  readonly bus = new EventBus();
  private server: Server | null = null;
  private dir: string | null = null;
  private recent: string[] = [];
  /** Último projeto aberto pela tela. */
  private last: string | null = null;

  constructor(
    private base: BaseConfig,
    private opts: { stateFile?: string; kitDir?: string; queryFn?: ServerOptions["queryFn"]; watch?: boolean; picker?: FolderPicker } = {},
  ) {
    this.loadState();
  }

  private get stateFile(): string {
    return this.opts.stateFile ?? process.env.SPEC_STUDIO_STATE ?? path.join(os.homedir(), ".spec-studio", "state.json");
  }

  private loadState(): void {
    try {
      const s = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      this.recent = Array.isArray(s.recent) ? s.recent.filter((x: unknown) => typeof x === "string") : [];
      this.last = typeof s.last === "string" ? s.last : null;
    } catch {
      /* primeiro uso */
    }
  }

  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify({ recent: this.recent, last: this.last }, null, 2));
    } catch {
      /* sem permissão: segue sem lembrar */
    }
  }

  get current(): Server | null {
    return this.server;
  }
  get currentDir(): string | null {
    return this.dir;
  }

  /** Abre o último projeto usado; senão, o do .env; senão, fica sem projeto. */
  async start(envDir?: string): Promise<string | null> {
    for (const candidate of [this.last, envDir]) {
      if (!candidate) continue;
      try {
        await this.open(candidate, false);
        return null;
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        if (candidate === envDir) return e.message;
      }
    }
    return null;
  }

  async open(input: string, remember = true): Promise<string> {
    const dir = checkProjectDir(input);
    if (this.server?.jobs.isRunning()) throw new HttpError(409, "Aguarde: o Claude está trabalhando neste projeto");
    const next = await createServer({ ...this.base, projectDir: dir }, { bus: this.bus, watch: this.opts.watch, queryFn: this.opts.queryFn });
    await this.server?.close();
    this.server = next;
    this.dir = dir;
    this.recent = [dir, ...this.recent.filter((r) => r !== dir)].slice(0, MAX_RECENT);
    if (remember) this.last = dir;
    this.saveState();
    return dir;
  }

  /** Cria uma pasta nova a partir do kit e abre. */
  async create(parent: string, rawName: string): Promise<string> {
    const name = rawName.trim();
    if (!name || name.length > 80 || /[\\/:*?"<>|]/.test(name) || name === "." || name === "..") {
      throw new HttpError(400, 'Nome inválido: use letras, números, espaços, "-" ou "_", sem barras nem caracteres especiais');
    }
    const parentDir = path.resolve(parent.trim());
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) throw new HttpError(400, `A pasta-mãe não existe: ${parentDir}`);
    const target = path.join(parentDir, name);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) throw new HttpError(409, `Já existe uma pasta "${name}" com conteúdo em ${parentDir}`);
    const kit = this.opts.kitDir ?? KIT_DIR;
    if (!fs.existsSync(path.join(kit, "CLAUDE.md"))) throw new HttpError(500, `Kit de especificação não encontrado em ${kit}`);
    fs.cpSync(kit, target, { recursive: true });
    return this.open(target);
  }

  recents(): Entry[] {
    return this.recent
      .filter((r) => {
        try {
          return fs.statSync(r).isDirectory() && fs.existsSync(path.join(r, "CLAUDE.md"));
        } catch {
          return false;
        }
      })
      .map((p) => ({ path: p, name: path.basename(p) }));
  }

  /** Subpastas de uma pasta, para o seletor da tela. */
  browse(input?: string): { path: string; parent: string | null; dirs: Entry[]; isProject: boolean; sep: string } {
    const dir = path.resolve(input?.trim() || this.dir || os.homedir());
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new HttpError(400, `A pasta não existe: ${dir}`);
    let dirs: Entry[] = [];
    try {
      dirs = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "$RECYCLE.BIN", "System Volume Information"].includes(e.name))
        .map((e) => ({ path: path.join(dir, e.name), name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    } catch {
      /* sem permissão de leitura: mostra vazia */
    }
    const up = path.dirname(dir);
    return { path: dir, parent: up === dir ? null : up, dirs, isProject: fs.existsSync(path.join(dir, "CLAUDE.md")), sep: path.sep };
  }

  /** Aplicação HTTP: rotas de projeto aqui; o resto vai para o servidor do projeto aberto. */
  app() {
    const app = express();
    app.disable("x-powered-by");
    const json = express.json({ limit: "1mb" });
    const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response) => {
      Promise.resolve(fn(req, res)).catch((e) => {
        if (e instanceof z.ZodError) return void res.status(400).json({ error: e.issues.map((i) => i.message).join("; ") });
        const status = e instanceof HttpError ? e.status : e instanceof ConfigError ? 400 : 500;
        res.status(status).json({ error: e instanceof Error ? e.message : String(e) });
      });
    };
    const info = () => ({ current: this.dir, name: this.dir ? path.basename(this.dir) : null, recent: this.recents(), home: os.homedir(), sep: path.sep });

    app.get("/api/workspace", wrap((_req, res) => res.json(info())));
    app.get("/api/workspace/browse", wrap((req, res) => res.json(this.browse(typeof req.query.path === "string" ? req.query.path : undefined))));
    let picking = false;
    app.post(
      "/api/workspace/pick",
      json,
      wrap(async (req, res) => {
        const b = z.object({ title: z.string().max(120).optional(), initial: z.string().optional() }).parse(req.body ?? {});
        if (picking) throw new HttpError(409, "A janela de escolha de pasta já está aberta");
        picking = true;
        try {
          const chosen = await (this.opts.picker ?? nativeFolderPicker)({ title: b.title ?? "Escolha a pasta", initial: b.initial?.trim() || (this.dir ? path.dirname(this.dir) : os.homedir()) });
          res.json({ path: chosen ? path.resolve(chosen) : null, isProject: chosen ? fs.existsSync(path.join(chosen, "CLAUDE.md")) : false });
        } finally {
          picking = false;
        }
      }),
    );
    app.post(
      "/api/workspace/open",
      json,
      wrap(async (req, res) => {
        const b = z.object({ path: z.string().min(1, "informe a pasta") }).parse(req.body);
        await this.open(b.path);
        res.json(info());
      }),
    );
    app.post(
      "/api/workspace/new",
      json,
      wrap(async (req, res) => {
        const b = z.object({ parent: z.string().min(1, "informe a pasta-mãe"), name: z.string().min(1, "informe o nome") }).parse(req.body);
        await this.create(b.parent, b.name);
        res.json(info());
      }),
    );
    app.use((req, res, next) => {
      if (!this.server) {
        res.status(409).json({ error: "Nenhum projeto aberto. Escolha ou crie um projeto.", noProject: true });
        return;
      }
      this.server.app(req, res, next);
    });
    return app;
  }

  async close(): Promise<void> {
    await this.server?.close();
  }
}
