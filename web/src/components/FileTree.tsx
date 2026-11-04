import { useMemo, useState } from "react";
import type { TreeNode } from "../types";
import { btn, btnClaude, btnGhost, displayName, input } from "../ui";
import { IconChevron, IconFile, IconPlus } from "./Icons";
import { ImportSource, type SourcePayload } from "./ImportSource";

type Props = {
  tree: TreeNode[];
  openPath: string | null;
  changed: Set<string>;
  canCreate: boolean;
  onOpen: (path: string) => void;
  onCreate: (prompt: string) => void;
  onImport: (p: SourcePayload) => Promise<boolean>;
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

const moduleId = (name: string) => name.match(/^M\d+/i)?.[0].toUpperCase();

/** Põe cada feature dentro do módulo a que pertence. Sobram em "features" só as sem módulo. */
export function nestFeatures(tree: TreeNode[]): TreeNode[] {
  return tree.map((top) => {
    if (top.path !== "docs" || !top.children) return top;
    const featDir = top.children.find((n) => n.type === "dir" && n.name === "features");
    const modDir = top.children.find((n) => n.type === "dir" && n.name === "modulos");
    if (!featDir || !modDir) return top;

    const ids = new Set((modDir.children ?? []).filter((n) => n.type === "file").map((n) => moduleId(n.name)));
    const feats = featDir.children ?? [];
    const placed = (f: TreeNode) => f.type === "file" && !!f.module && ids.has(f.module);

    const newMod: TreeNode = {
      ...modDir,
      children: (modDir.children ?? []).map((m) =>
        m.type === "file" ? { ...m, features: feats.filter((f) => placed(f) && f.module === moduleId(m.name)) } : m,
      ),
    };
    const rest = feats.filter((f) => !placed(f));
    const children = top.children
      .map((n) => (n === modDir ? newMod : n))
      .filter((n) => n !== featDir || rest.length > 0)
      .map((n) => (n === featDir ? { ...featDir, children: rest } : n));
    return { ...top, children };
  });
}

const INDENT = 14;

function Node({ node, depth, props }: { node: TreeNode; depth: number; props: Props }) {
  const [open, setOpen] = useState(!node.name.startsWith("_"));
  const [featOpen, setFeatOpen] = useState(true);

  if (node.type === "dir") {
    return (
      <div>
        <button
          className="group flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] font-medium text-ink-2 hover:text-ink"
          style={{ paddingLeft: `${6 + depth * INDENT}px` }}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <IconChevron className={`h-3 w-3 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} />
          {node.name}
        </button>
        {open && (
          <div className="relative">
            <span className="absolute bottom-1 top-0 w-px bg-line" style={{ left: `${11 + depth * INDENT}px` }} aria-hidden="true" />
            {node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} props={props} />)}
            {node.children?.length === 0 && (
              <div className="py-1 text-xs italic text-ink-3" style={{ paddingLeft: `${8 + (depth + 1) * INDENT}px` }}>
                vazia
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const active = node.path === props.openPath;
  const changed = props.changed.has(node.path);
  const feats = node.features;
  const hasFeats = !!feats && feats.length > 0;
  const row = (
    <button
      className={`relative my-px flex w-full items-start gap-2 rounded-lg py-1.5 pr-2 text-left text-[13.5px] ${
        active ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:bg-wash hover:text-ink"
      }`}
      style={{ paddingLeft: `${6 + depth * INDENT}px` }}
      onClick={() => props.onOpen(node.path)}
      title={node.path}
      data-path={node.path}
      aria-current={active ? "page" : undefined}
    >
      {feats ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={featOpen ? "Recolher features" : "Mostrar features"}
          aria-expanded={hasFeats ? featOpen : undefined}
          className={`-ml-1 mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded ${hasFeats ? "hover:bg-line/60" : "opacity-0"}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasFeats) setFeatOpen(!featOpen);
          }}
        >
          <IconChevron className={`h-3 w-3 text-ink-3 transition-transform ${hasFeats && featOpen ? "rotate-90" : ""}`} />
        </span>
      ) : null}
      {!feats && <IconFile className={`mt-[2px] h-[15px] w-[15px] shrink-0 ${active ? "text-accent" : "text-ink-3"}`} />}
      <span className="min-w-0 flex-1 break-words leading-snug [overflow-wrap:anywhere] line-clamp-2">{displayName(node.name)}</span>
      {!!node.openComments && (
        <span
          className="mt-[2px] shrink-0 rounded-full bg-mark-soft px-1.5 text-2xs font-semibold tabular-nums text-mark-ink"
          title={`${node.openComments} comentário(s) em aberto`}
        >
          {node.openComments}
        </span>
      )}
      {changed && <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-claude" title="Alterado pelo Claude" data-testid="changed-dot" />}
    </button>
  );
  if (!feats) return row;
  return (
    <div>
      {row}
      {hasFeats && featOpen && (
        <div className="relative">
          <span className="absolute bottom-1 top-0 w-px bg-line" style={{ left: `${11 + (depth + 1) * INDENT}px` }} aria-hidden="true" />
          {feats.map((f) => (
            <Node key={f.path} node={f} depth={depth + 1} props={props} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewItemForm({
  kind,
  modules,
  onSubmit,
  onClose,
}: {
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
        ? `Crie a feature "${n}" no módulo ${mod.trim()} a partir de docs/_templates/feature.md e inicie a entrevista da etapa Ideia, seguindo a seção "Entrevista guiada" do CLAUDE.md.`
        : `Crie o módulo "${n}" a partir de docs/_templates/modulo.md e inicie a entrevista da etapa Ideia, seguindo a seção "Entrevista guiada" do CLAUDE.md.`,
    );
  };

  return (
    <div className="mx-2 mb-2 space-y-2.5 rounded-xl border border-line bg-sheet p-3.5 shadow-lift">
      <div className="text-[15px] font-semibold text-ink">{kind === "feature" ? "Nova feature" : "Novo módulo"}</div>
      <label className="block space-y-1">
        <span className="text-xs text-ink-2">Nome</span>
        <input
          className={input}
          placeholder={kind === "feature" ? "Ex.: Aprovar orçamento" : "Ex.: Rede de oficinas"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />
      </label>
      {kind === "feature" && (
        <label className="block space-y-1">
          <span className="text-xs text-ink-2">Módulo</span>
          {modules.length > 0 ? (
            <select className={input} value={mod} onChange={(e) => setMod(e.target.value)}>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            <input className={input} placeholder="Ex.: M01" value={mod} onChange={(e) => setMod(e.target.value)} />
          )}
        </label>
      )}
      <p className="text-xs leading-snug text-ink-3">O Claude cria o arquivo e já começa a entrevista no chat, uma pergunta por vez.</p>
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnClaude} disabled={!valid} onClick={submit}>
          Pedir ao Claude
        </button>
      </div>
    </div>
  );
}

export function FileTree(props: Props) {
  const [creating, setCreating] = useState<"feature" | "module" | "source" | null>(null);
  const modules = useMemo(() => modulesOf(props.tree), [props.tree]);
  const nested = useMemo(() => nestFeatures(props.tree), [props.tree]);

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-clip rounded-2xl border border-line/70 bg-panel shadow-[var(--shadow-panel)] 2xl:w-64">
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3" data-testid="file-tree" aria-label="Arquivos do projeto">
        {nested.map((n) => (
          <Node key={n.path} node={n} depth={0} props={props} />
        ))}
      </nav>
      {creating === "source" && (
        <ImportSource
          onClose={() => setCreating(null)}
          onSubmit={async (p) => {
            const ok = await props.onImport(p);
            if (ok) setCreating(null);
            return ok;
          }}
        />
      )}
      {creating && creating !== "source" && (
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
      <div className="flex gap-1 border-t border-line/70 p-2">
        <button
          className={`${btnGhost} min-w-0 flex-1 !px-1.5`}
          disabled={!props.canCreate}
          onClick={() => setCreating("feature")}
          title="O Claude cria o arquivo e começa a entrevista"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Feature
        </button>
        <button className={`${btnGhost} min-w-0 flex-1 !px-1.5`} disabled={!props.canCreate} onClick={() => setCreating("module")}>
          <IconPlus className="h-3.5 w-3.5" />
          Módulo
        </button>
        <button className={`${btnGhost} min-w-0 flex-1 !px-1.5`} disabled={!props.canCreate} onClick={() => setCreating("source")} title="Importar PDF, texto ou transcrição como fonte de contexto">
          <IconPlus className="h-3.5 w-3.5" />
          Fonte
        </button>
      </div>
    </aside>
  );
}
