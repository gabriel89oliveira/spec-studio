import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkToolCall } from "../src/claude.js";
import { checkLexical, isBlocked, PathError, resolveDocPath } from "../src/paths.js";
import { makeProject } from "./helpers.js";

describe("resolveDocPath (rotas da API)", () => {
  const root = makeProject();

  it("aceita caminhos .md dentro do projeto", () => {
    expect(resolveDocPath(root, "docs/CONCEITO.md").rel).toBe("docs/CONCEITO.md");
    expect(resolveDocPath(root, "docs\\features\\F01-agendamento.md").rel).toBe("docs/features/F01-agendamento.md");
  });

  it.each([
    ["docs/../CLAUDE.md"],
    ["../fora.md"],
    ["/etc/passwd.md"],
    ["C:\\Windows\\x.md"],
    ["docs/CONCEITO.txt"],
    [".git/HEAD.md"],
    [".spec-studio/comments/x.md"],
    ["node_modules/pkg/README.md"],
    [""],
  ])("rejeita %s com 400", (input) => {
    expect(() => resolveDocPath(root, input)).toThrow(PathError);
  });

  it("rejeita link simbólico que aponta para fora do projeto", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "fora-"));
    fs.writeFileSync(path.join(outside, "segredo.md"), "x");
    fs.symlinkSync(outside, path.join(root, "docs", "atalho"), "dir");
    expect(() => resolveDocPath(root, "docs/atalho/segredo.md")).toThrow(PathError);
  });
});

describe("áreas protegidas", () => {
  it("bloqueia .git, .spec-studio, node_modules e .env", () => {
    expect(isBlocked(".git/config")).toBe(true);
    expect(isBlocked("docs/.spec-studio/x")).toBe(true);
    expect(isBlocked("a\\node_modules\\b")).toBe(true);
    expect(isBlocked(".env")).toBe(true);
    expect(isBlocked("server/.env.local")).toBe(true);
    expect(isBlocked("docs/ambiente.md")).toBe(false);
  });
});

describe("caminhos do Windows", () => {
  const root = "C:\\Users\\Gabriel\\Projetos\\driveb";
  const w = path.win32;

  it("aceita caminho absoluto dentro do projeto, ignorando maiúsculas", () => {
    const r = checkLexical(root, "c:\\users\\gabriel\\projetos\\driveb\\docs\\CONCEITO.md", w);
    expect(r).toEqual({ ok: true, abs: "c:\\users\\gabriel\\projetos\\driveb\\docs\\CONCEITO.md", rel: "docs/CONCEITO.md" });
  });

  it.each([
    ["C:\\Users\\Gabriel\\Projetos\\outro\\x.md"],
    ["D:\\driveb\\docs\\x.md"],
    ["..\\x.md"],
    ["docs\\..\\..\\x.md"],
    ["C:\\Users\\Gabriel\\Projetos\\driveb\\.git\\config"],
    ["C:\\Users\\Gabriel\\Projetos\\driveb\\.env"],
  ])("nega %s", (input) => {
    expect(checkLexical(root, input, w).ok).toBe(false);
    expect(checkToolCall(root, "Edit", { file_path: input }, w)).not.toBeNull();
  });
});

describe("guardPaths (ferramentas do agente)", () => {
  const root = makeProject();

  it("permite ler e editar dentro do projeto", () => {
    expect(checkToolCall(root, "Read", { file_path: path.join(root, "docs", "CONCEITO.md") })).toBeNull();
    expect(checkToolCall(root, "Edit", { file_path: "docs/CONCEITO.md" })).toBeNull();
    expect(checkToolCall(root, "Write", { file_path: path.join(root, "docs", "features", "F02-nova.md") })).toBeNull();
    expect(checkToolCall(root, "Glob", { pattern: "docs/**/*.md" })).toBeNull();
    expect(checkToolCall(root, "Grep", { pattern: "RN-", path: "docs" })).toBeNull();
  });

  it.each([
    ["Read", { file_path: "../segredo.md" }],
    ["Read", { file_path: "/etc/passwd" }],
    ["Read", { file_path: ".git/config" }],
    ["Read", { file_path: ".env" }],
    ["Edit", { file_path: "docs/../../x.md" }],
    ["Write", { file_path: ".spec-studio/comments/docs/CONCEITO.md.json" }],
    ["Glob", { pattern: "../**/*" }],
    ["Glob", { pattern: "/etc/*" }],
    ["Glob", { pattern: "*.md", path: "/tmp" }],
    ["Grep", { pattern: "x", path: ".git" }],
    ["Grep", { pattern: "x", glob: "../**" }],
    ["Bash", { command: "ls" }],
  ])("nega %s %j", (tool, input) => {
    expect(checkToolCall(root, tool, input)).not.toBeNull();
  });
});
