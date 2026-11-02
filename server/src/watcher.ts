import fs from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { COMMENTS_DIR } from "./comments.js";
import type { EventBus, SourceTracker } from "./events.js";
import { currentHash } from "./files.js";
import { toPosix } from "./paths.js";

/** Observa CLAUDE.md, docs/ e os comentários, e transforma mudanças em eventos. */
export function startWatcher(root: string, bus: EventBus, tracker: SourceTracker): FSWatcher {
  for (const dir of ["docs", COMMENTS_DIR]) fs.mkdirSync(path.join(root, ...dir.split("/")), { recursive: true });

  const targets = [path.join(root, "CLAUDE.md"), path.join(root, "docs"), path.join(root, ...COMMENTS_DIR.split("/"))];
  const watcher = watch(targets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  const handle = (kind: "add" | "change" | "unlink", abs: string) => {
    const rel = toPosix(path.relative(root, abs));
    if (rel.startsWith(`${COMMENTS_DIR}/`)) {
      if (rel.endsWith(".json")) {
        bus.emit("comment.updated", { file: rel.slice(COMMENTS_DIR.length + 1, -".json".length), commentId: null });
      }
      return;
    }
    if (!rel.toLowerCase().endsWith(".md")) return;
    const hash = kind === "unlink" ? null : currentHash(abs);
    bus.emit("file.changed", { path: rel, hash, source: tracker.sourceFor(rel, hash) });
    if (kind !== "change") bus.emit("tree.changed", {});
  };

  watcher.on("add", (p) => handle("add", p));
  watcher.on("change", (p) => handle("change", p));
  watcher.on("unlink", (p) => handle("unlink", p));
  watcher.on("addDir", () => bus.emit("tree.changed", {}));
  watcher.on("unlinkDir", () => bus.emit("tree.changed", {}));
  watcher.on("error", (err) => console.error("[watcher]", err));
  return watcher;
}
