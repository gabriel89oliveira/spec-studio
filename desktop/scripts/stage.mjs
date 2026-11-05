// Monta desktop/stage: a pasta que o electron-builder empacota (app.asar).
//   stage/package.json   dependências de produção do servidor (instaladas no Windows pelo electron-builder)
//   stage/main.js        processo principal do Electron
//   stage/server/dist    servidor compilado   stage/web/dist  interface compilada   stage/kit  modelos de projeto
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const desk = path.resolve(here, "..");
const repo = path.resolve(desk, "..");
const stage = path.join(desk, "stage");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

console.log("Compilando servidor e interface…");
execSync("npm run build -w server", { cwd: repo, stdio: "inherit" });
execSync("npm run build -w web", { cwd: repo, stdio: "inherit" });

const copy = (from, to) => fs.cpSync(from, path.join(stage, to), { recursive: true });
copy(path.join(repo, "server", "dist"), "server/dist");
fs.writeFileSync(path.join(stage, "server", "package.json"), JSON.stringify({ type: "module" }));
copy(path.join(repo, "web", "dist"), "web/dist");
copy(path.join(repo, "kit"), "kit");
copy(path.join(desk, "dist", "main.js"), "main.js");
copy(path.join(desk, "dist", "preload.js"), "preload.js");

const server = read(path.join(repo, "server", "package.json"));
const me = read(path.join(desk, "package.json"));
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: "spec-studio",
      productName: "Spec Studio",
      version: process.env.SPEC_STUDIO_VERSION || me.version,
      description: me.description,
      author: me.author,
      main: "main.js",
      dependencies: { ...server.dependencies, "electron-updater": me.devDependencies["electron-updater"] },
    },
    null,
    2,
  ),
);
console.log("Pronto:", stage);
