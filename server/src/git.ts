import fs from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { HttpError } from "./util.js";

export type CommitOrigin = "claude" | "manual" | "revert" | "comments" | "other";

export type HistoryEntry = {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  origin: CommitOrigin;
};

const COMMIT_RE = /^[0-9a-f]{4,40}$/i;
const SEP = "\x1f";

function originOf(subject: string): CommitOrigin {
  if (subject.startsWith("claude")) return "claude";
  if (subject.startsWith("edição manual:")) return "manual";
  if (subject.startsWith("Revert")) return "revert";
  if (subject.startsWith("comentários:")) return "comments";
  return "other";
}

function lines(out: string): string[] {
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export class GitService {
  private constructor(
    private root: string,
    private git: SimpleGit,
  ) {}

  /**
   * Abre o repositório do projeto. Se a pasta não for um repositório, executa git init
   * e faz o commit inicial. Garante .spec-studio/sessions/ no .gitignore.
   */
  static async open(root: string, userName: string): Promise<GitService> {
    // Nunca esperar por senha ou passphrase de assinatura: o servidor não tem terminal.
    process.env.GIT_TERMINAL_PROMPT = "0";
    const options = { baseDir: root, timeout: { block: 20000 } };
    const common = ["core.quotePath=false", "commit.gpgsign=false"];
    const base = simpleGit({ ...options, config: common });

    const isRepo = await base.checkIsRepo();
    if (!isRepo) await base.init();

    // Sem identidade configurada no Git, usa USER_NAME para os commits.
    const name = (await base.getConfig("user.name")).value;
    const email = (await base.getConfig("user.email")).value;
    const config = [...common];
    if (!name) config.push(`user.name=${userName}`);
    if (!email) config.push("user.email=spec-studio@localhost");
    const git = simpleGit({ ...options, config });
    const svc = new GitService(root, git);

    svc.ensureGitignore();

    if (!isRepo) {
      await git.raw(["add", "-A", "--", "."]);
      const staged = lines(await git.raw(["diff", "--cached", "--name-only"]));
      if (staged.length > 0) await git.raw(["commit", "-m", "spec-studio: commit inicial"]);
    }
    return svc;
  }

  private ensureGitignore(): void {
    const file = path.join(this.root, ".gitignore");
    const entry = ".spec-studio/sessions/";
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current.split(/\r?\n/).some((l) => l.trim() === entry)) return;
    const prefix = current && !current.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(file, `${current}${prefix}${entry}\n`, "utf8");
  }

  async branch(): Promise<string> {
    try {
      return (await this.git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    } catch {
      return "";
    }
  }

  async isDirty(): Promise<boolean> {
    return lines(await this.git.raw(["status", "--porcelain", "--", "."])).length > 0;
  }

  private async hasHead(): Promise<boolean> {
    try {
      await this.git.raw(["rev-parse", "--verify", "HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  /** Arquivos alterados ou novos (relativos ao projeto) dentro dos caminhos informados. */
  async changedFiles(pathspecs: string[]): Promise<string[]> {
    const specs = pathspecs;
    const out = new Set<string>();
    if (await this.hasHead()) {
      for (const f of lines(await this.git.raw(["diff", "--name-only", "--relative", "HEAD", "--", ...specs]))) out.add(f);
    }
    for (const f of lines(await this.git.raw(["ls-files", "--others", "--exclude-standard", "--", ...specs]))) out.add(f);
    return [...out].sort();
  }

  private async isTracked(p: string): Promise<boolean> {
    return lines(await this.git.raw(["ls-files", "--", p])).length > 0;
  }

  /** Commit apenas dos caminhos informados. Retorna o hash curto, ou null se não havia alterações. */
  async commitPaths(paths: string[], message: string): Promise<string | null> {
    const valid: string[] = [];
    for (const p of paths) {
      if (fs.existsSync(path.join(this.root, p)) || (await this.isTracked(p))) valid.push(p);
    }
    if (valid.length === 0) return null;
    await this.git.raw(["add", "-A", "--", ...valid]);
    const staged = lines(await this.git.raw(["diff", "--cached", "--name-only", "--", ...valid]));
    if (staged.length === 0) return null;
    await this.git.raw(["commit", "-m", message, "--", ...valid]);
    return (await this.git.raw(["rev-parse", "--short", "HEAD"])).trim();
  }

  async history(rel: string, limit = 100): Promise<HistoryEntry[]> {
    if (!(await this.hasHead())) return [];
    const format = ["%H", "%h", "%aI", "%an", "%s"].join(SEP);
    const out = await this.git.raw(["log", `-n${limit}`, `--format=${format}`, "--", rel]);
    return lines(out).map((l) => {
      const [hash, shortHash, date, author, message] = l.split(SEP);
      return { hash, shortHash, date, author, message, origin: originOf(message) };
    });
  }

  private async resolveCommit(commit: unknown): Promise<string> {
    if (typeof commit !== "string" || !COMMIT_RE.test(commit)) throw new HttpError(400, "Commit inválido");
    try {
      return (await this.git.raw(["rev-parse", "--verify", `${commit}^{commit}`])).trim();
    } catch {
      throw new HttpError(404, `Commit não encontrado: ${commit}`);
    }
  }

  private async showOrEmpty(rev: string, rel: string): Promise<string> {
    try {
      return await this.git.raw(["show", `${rev}:./${rel}`]);
    } catch {
      return "";
    }
  }

  /** Conteúdo do arquivo antes e depois do commit. */
  async diff(commit: unknown, rel: string): Promise<{ commit: string; before: string; after: string }> {
    const full = await this.resolveCommit(commit);
    const parents = (await this.git.raw(["rev-list", "--parents", "-n", "1", full])).trim().split(/\s+/);
    const parent = parents[1];
    const before = parent ? await this.showOrEmpty(parent, rel) : "";
    const after = await this.showOrEmpty(full, rel);
    return { commit: full, before, after };
  }

  /** git revert do commit. Retorna o hash curto do novo commit e os arquivos afetados. */
  async revert(commit: unknown): Promise<{ commit: string; files: string[] }> {
    const full = await this.resolveCommit(commit);
    try {
      await this.git.raw(["revert", "--no-edit", full]);
    } catch (err) {
      try {
        await this.git.raw(["revert", "--abort"]);
      } catch {
        /* nada a abortar */
      }
      const raw = err instanceof Error ? err.message : String(err);
      if (/CONFLICT|could not revert/i.test(raw)) {
        throw new HttpError(
          409,
          "Não foi possível desfazer automaticamente: alterações feitas depois mexeram nas mesmas linhas. Ajuste o arquivo pelo editor.",
        );
      }
      if (/local changes|would be overwritten|uncommitted/i.test(raw)) {
        throw new HttpError(409, "Não foi possível desfazer: há alterações não salvas no Git nesses arquivos.");
      }
      throw new HttpError(409, `Não foi possível desfazer: ${raw.split("\n").find((l) => l.trim()) ?? raw}`);
    }
    const short = (await this.git.raw(["rev-parse", "--short", "HEAD"])).trim();
    const files = lines(await this.git.raw(["diff", "--name-only", "--relative", "HEAD~1", "HEAD"]));
    return { commit: short, files };
  }
}
