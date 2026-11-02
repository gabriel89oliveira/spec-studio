import { useMemo, useState } from "react";
import type { TreeNode } from "../types";
import { btn, btnPrimary, input } from "../ui";

type Props = {
  tree: TreeNode[];
  openPath: string | null;
  changed: Set<string>;
  canCreate: boolean;
  onOpen: (path: string) => void;
  onCreate: (prompt: string) => void;
};

function modulesOf(tree: TreeNode[]): { id: string; label: string }[] {
  const docs = tree.find((n) => n.path === "docs");
  const mods = docs?.children?.find((n) => n.name === "modulos");
  return (mods?.children ?? [])
    .filter((n) => n.type === "file")
    .map((n) => {
      const base = n.name.replace(/\.md$/i, "");
      const id = base.match(/^M\d+/i)?.[0].toUpperCase() ?? base;
      return { id, label: base };
    });
}

function Node({ node, depth, props }: { node: TreeNode; depth: number; props: Props }) {
  const [open, setOpen] = useState(!node.name.startsWith("_"));
  const pad = { paddingLeft: `${8 + depth * 12}px` };

  if (node.type === "dir") {
    return (
      <div>
        <button
          className="flex w-full items-center gap-1 py-1 pr-2 text-left text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          style={pad}
          onClick={() => setOpen(!open)}
        >
          <span className="w-3 text-[10px]">{open ? "▾" : "▸"}</span>
          {node.name}
        </button>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} props={props} />)}
        {open && node.children?.length === 0 && (
          <div className="py-1 text-[11px] italic text-zinc-400" style={{ paddingLeft: `${20 + (depth + 1) * 12}px` }}>
            vazio
          </div>
        )}
      </div>
    );
  }

  const active = node.path === props.openPath;
  const changed = props.changed.has(node.path);
  return (
    <button
      className={`flex w-full items-center justify-between gap-2 py-1 pr-2 text-left text-[13px] ${
        active
          ? "bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
      onClick={() => props.onOpen(node.path)}
      title={node.path}
      data-path={node.path}
    >
      <span className="truncate">{node.name.replace(/\.md$/i, "")}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!!node.openComments && (
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            {node.openComments}
          </span>
        )}
        {changed && <span className="h-2 w-2 rounded-full bg-sky-500" title="Alterado pelo Claude" data-testid="changed-dot" />}
      </span>
    </button>
  );
}

function NewItemForm({ kind, modules, onSubmit, onClose }: {
  kind: "feature" | "module";
  modules: { id: string; label: string }[];
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [mod, setMod] = useState(modules[0]?.id ?? "");
  const valid = name.trim() && (kind === "module" || mod.trim());

  const submit = () => {
    if (!valid) return;
    const n = name.trim();
    onSubmit(
      kind === "feature"
        ? `Crie o rascunho da feature "${n}" no módulo ${mod.trim()} a partir de docs/_templates/feature.md, seguindo o CLAUDE.md.`
        : `Crie o rascunho do módulo "${n}" a partir de docs/_templates/modulo.md, seguindo o CLAUDE.md, e inclua-o no mapa de módulos do Conceito.`,
    );
  };

  return (
    <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{kind === "feature" ? "Nova feature" : "Novo módulo"}</div>
      <input className={input} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
      {kind === "feature" &&
        (modules.length > 0 ? (
          <select className={input} value={mod} onChange={(e) => setMod(e.target.value)}>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <input className={input} placeholder="Módulo (ex.: M01)" value={mod} onChange={(e) => setMod(e.target.value)} />
        ))}
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={!valid} onClick={submit}>
          Pedir ao Claude
        </button>
      </div>
    </div>
  );
}

export function FileTree(props: Props) {
  const [creating, setCreating] = useState<"feature" | "module" | null>(null);
  const modules = useMemo(() => modulesOf(props.tree), [props.tree]);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex gap-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <button className={btn} disabled={!props.canCreate} onClick={() => setCreating("feature")} title="O Claude cria o arquivo a partir do template">
          + Feature
        </button>
        <button className={btn} disabled={!props.canCreate} onClick={() => setCreating("module")}>
          + Módulo
        </button>
      </div>
      {creating && (
        <NewItemForm
          kind={creating}
          modules={modules}
          onClose={() => setCreating(null)}
          onSubmit={(p) => {
            setCreating(null);
            props.onCreate(p);
          }}
        />
      )}
      <nav className="flex-1 overflow-y-auto py-2" data-testid="file-tree">
        {props.tree.map((n) => (
          <Node key={n.path} node={n} depth={0} props={props} />
        ))}
      </nav>
    </aside>
  );
}
