import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, storage } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffView } from "./components/DiffView";
import { DocView, Sheet } from "./components/DocView";
import { IconClose } from "./components/Icons";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { Header } from "./components/Header";
import { HistoryPanel } from "./components/HistoryPanel";
import { useEvents } from "./hooks/useEvents";
import { useLiveFile } from "./hooks/useLiveFile";
import type { Anchor, ChatMessage, Comment, LiveJob, Project, TreeNode } from "./types";
import { btn } from "./ui";

type Mode = "view" | "edit" | "history" | "changes";

function filesOf(nodes: TreeNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type === "file") out.add(n.path);
    else if (n.children) filesOf(n.children, out);
  }
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [connected, setConnected] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [rightTab, setRightTab] = useState<"comments" | "chat">("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const [job, setJob] = useState<LiveJob | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editorDirty, setEditorDirty] = useState(false);
  const live = useLiveFile(openPath);

  const keyBase = project ? `spec-studio:${project.projectDir}` : null;
  const openRef = useRef(openPath);
  openRef.current = openPath;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const chatRef = useRef(chatSessionId);
  chatRef.current = chatSessionId;

  /** Trabalhos cujo fim já chegou pelo stream; respostas atrasadas da API não os reabrem. */
  const finishedRef = useRef(new Set<string>());
  const busy = job !== null;
  const claudeEnabled = Boolean(project?.claude.enabled);

  // ---------------------------------------------------------------- carregamento
  const refreshProject = useCallback(async () => {
    try {
      const p = await api.project();
      setProject(p);
      const j = p.claude.job;
      if (j && j.status === "running" && !finishedRef.current.has(j.id)) {
        setJob((cur) => cur ?? { id: j.id, kind: j.kind, commentId: j.commentId, sessionId: j.sessionId, text: "", tools: [] });
      } else if (j) {
        setJob((cur) => (cur && cur.id === j.id ? null : cur));
      }
      return p;
    } catch (e) {
      setNotice(errText(e));
      return null;
    }
  }, []);

  const refreshTree = useCallback(async () => {
    try {
      const t = await api.tree();
      setTree(t);
      return t;
    } catch (e) {
      setNotice(errText(e));
      return null;
    }
  }, []);

  const refreshComments = useCallback(async () => {
    const p = openRef.current;
    if (!p) return setComments([]);
    try {
      const list = await api.comments(p);
      if (openRef.current === p) setComments(list);
    } catch {
      /* arquivo pode ter sido removido */
    }
  }, []);

  const refreshChat = useCallback(async () => {
    const id = chatRef.current;
    if (!id) return setChatMessages([]);
    try {
      setChatMessages((await api.session(id)).messages);
    } catch {
      setChatSessionId(null);
      setChatMessages([]);
    }
  }, []);

  // Primeira carga: projeto, árvore, arquivo e conversa lembrados.
  useEffect(() => {
    void (async () => {
      const [p, t] = await Promise.all([refreshProject(), refreshTree()]);
      if (!p || !t) return;
      const base = `spec-studio:${p.projectDir}`;
      const files = filesOf(t);
      const remembered = storage.get(`${base}:open`);
      const first = remembered && files.has(remembered) ? remembered : files.has("docs/CONCEITO.md") ? "docs/CONCEITO.md" : files.has("CLAUDE.md") ? "CLAUDE.md" : null;
      setOpenPath(first);
      setChatSessionId(storage.get(`${base}:chat`));
      setChanged(new Set(p.claude.lastChangedFiles.filter((f) => f !== first)));
    })();
  }, [refreshProject, refreshTree]);

  useEffect(() => {
    if (keyBase && openPath) storage.set(`${keyBase}:open`, openPath);
    setMode("view");
    setActiveId(null);
    setPendingAnchor(null);
    setFound(new Set());
    setEditorDirty(false);
    if (openPath) setChanged((prev) => (prev.has(openPath) ? new Set([...prev].filter((x) => x !== openPath)) : prev));
    void refreshComments();
  }, [openPath, keyBase, refreshComments]);

  useEffect(() => {
    if (keyBase) storage.set(`${keyBase}:chat`, chatSessionId);
    void refreshChat();
  }, [chatSessionId, keyBase, refreshChat]);

  // ---------------------------------------------------------------- eventos ao vivo
  useEvents((event, data) => {
    switch (event) {
      case "connected":
        setConnected(true);
        void refreshProject();
        void refreshTree();
        void refreshComments();
        break;
      case "disconnected":
        setConnected(false);
        break;
      case "file.changed":
        if (data.path === openRef.current) void live.onRemoteChange(data.hash, data.source, modeRef.current === "edit");
        break;
      case "tree.changed":
        void refreshTree();
        break;
      case "comment.updated":
        void refreshTree();
        if (!data.file || data.file === openRef.current) void refreshComments();
        break;
      case "job.started":
        setJob({ id: data.jobId, kind: data.kind, commentId: data.commentId, sessionId: data.sessionId, text: "", tools: [] });
        setLastError(null);
        void refreshProject();
        break;
      case "job.text":
        setJob((j) => (j && j.id === data.jobId ? { ...j, text: j.text + data.delta } : j));
        break;
      case "job.tool":
        setJob((j) => (j && j.id === data.jobId ? { ...j, tools: [...j.tools, { tool: data.tool, path: data.path }] } : j));
        break;
      case "job.done":
      case "job.error": {
        finishedRef.current.add(data.jobId);
        setJob((j) => (j && j.id !== data.jobId ? j : null));
        const files: string[] = data.changedFiles ?? [];
        setChanged((prev) => {
          const next = new Set(prev);
          for (const f of files) if (f !== openRef.current) next.add(f);
          return next;
        });
        if (event === "job.error" && data.message !== "Cancelado") {
          setLastError(data.message);
          setNotice(`Claude: ${data.message}`);
        }
        void refreshProject();
        void refreshTree();
        void refreshComments();
        void refreshChat();
        break;
      }
    }
  });

  // ---------------------------------------------------------------- ações
  const openFile = (p: string) => {
    if (p === openPath) return;
    if (mode === "edit" && editorDirty && !window.confirm("Descartar as alterações não salvas?")) return;
    setOpenPath(p);
  };

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      setNotice(errText(e));
      return null;
    }
  };

  const createComment = async (body: string) => {
    if (!openPath || !pendingAnchor) return false;
    const c = await run(() => api.createComment(openPath, pendingAnchor, body));
    if (!c) return false;
    setPendingAnchor(null);
    setActiveId(c.id);
    await refreshComments();
    return true;
  };

  const sendChat = async (text: string) => {
    const r = await run(() => api.chat(text, chatSessionId ?? undefined, openPath ?? undefined));
    if (!r) return false;
    if (r.sessionId !== chatSessionId) setChatSessionId(r.sessionId);
    else void refreshChat();
    return true;
  };

  const cancelJob = () => {
    if (job) void run(() => api.cancel(job.id));
  };

  const onAnchorsResolved = useCallback((s: Set<string>) => setFound((prev) => (sameSet(prev, s) ? prev : s)), []);
  const onFocusComment = useCallback((id: string) => {
    setActiveId(id);
    setRightTab("comments");
  }, []);
  const onComment = useCallback((a: Anchor) => {
    setPendingAnchor(a);
    setRightTab("comments");
  }, []);
  const onHistoryError = useCallback((m: string) => setNotice(m), []);

  useEffect(() => {
    if (activeId) document.querySelector(`[data-comment-id="${activeId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const updateBanner = useMemo(() => {
    if (!live.update || mode !== "view") return null;
    return live.update.source === "claude" ? "Arquivo atualizado pelo Claude" : "Arquivo atualizado";
  }, [live.update, mode]);

  // ---------------------------------------------------------------- interface
  const tab = (id: Mode, label: string) => (
    <button
      role="tab"
      aria-selected={mode === id}
      className={`h-7 rounded-[5px] px-3 text-xs font-medium transition-colors disabled:opacity-45 ${
        mode === id ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(var(--ink)/0.14)]" : "text-ink-2 hover:text-ink"
      }`}
      disabled={!live.doc}
      onClick={() => {
        if (mode === "edit" && id !== "edit" && editorDirty && !window.confirm("Descartar as alterações não salvas?")) return;
        setMode(id);
      }}
    >
      {label}
    </button>
  );

  const crumbs = openPath?.split("/") ?? [];
  const openCount = comments.filter((c) => c.status !== "resolved").length;

  return (
    <div className="flex h-screen flex-col bg-panel text-ink">
      <Header project={project} busy={busy} lastError={lastError} connected={connected} />
      <div className="flex min-h-0 flex-1">
        <FileTree
          tree={tree}
          openPath={openPath}
          changed={changed}
          canCreate={claudeEnabled && !busy}
          onOpen={openFile}
          onCreate={(p) => {
            setRightTab("chat");
            void sendChat(p);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4">
            <nav aria-label="Caminho do arquivo" className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3" data-testid="open-path">
              {crumbs.length === 0 && "Nenhum arquivo aberto"}
              {crumbs.map((c, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span className="text-line-strong" aria-hidden="true">
                      /
                    </span>
                  )}
                  <span className={i === crumbs.length - 1 ? "truncate font-medium text-ink" : "shrink-0"}>{c}</span>
                </Fragment>
              ))}
            </nav>
            <div role="tablist" aria-label="Modo" className="flex shrink-0 gap-0.5 rounded-md bg-wash p-0.5">
              {tab("view", "Ler")}
              {tab("edit", "Editar")}
              {tab("history", "Histórico")}
            </div>
          </div>

          {notice && (
            <div className="flex items-start gap-3 border-b border-danger/25 bg-danger-soft px-4 py-2.5 text-xs text-danger" data-testid="notice" role="alert">
              <span className="flex-1 whitespace-pre-wrap leading-snug">{notice}</span>
              <button className="shrink-0 rounded p-0.5 hover:bg-danger/10" onClick={() => setNotice(null)} aria-label="Fechar aviso">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {updateBanner && (
            <div
              className={`flex items-center gap-3 border-b px-4 py-2 text-xs ${
                live.update?.source === "claude" ? "border-claude/25 bg-claude-soft text-claude" : "border-accent/25 bg-accent-soft text-accent"
              }`}
              data-testid="update-banner"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              <span className="flex-1 font-medium">{updateBanner}</span>
              <button className={btn} onClick={() => setMode("changes")}>
                Ver alterações
              </button>
              <button className="shrink-0 rounded p-0.5 hover:bg-ink/5" onClick={live.clearUpdate} aria-label="Fechar aviso">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="canvas min-h-0 flex-1 overflow-y-auto">
            {live.error && (
              <Sheet>
                <p className="text-sm text-danger">{live.error}</p>
              </Sheet>
            )}
            {!live.doc && !live.error && openPath && <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>}
            {!openPath && <p className="p-8 text-center text-sm text-ink-3">Escolha um arquivo à esquerda.</p>}
            {live.doc && mode === "view" && (
              <DocView
                content={live.doc.content}
                comments={comments}
                activeId={activeId}
                onComment={onComment}
                onFocusComment={onFocusComment}
                onAnchorsResolved={onAnchorsResolved}
              />
            )}
            {live.doc && mode === "edit" && (
              <EditorHost
                key={live.doc.path}
                doc={live.doc}
                readOnly={busy}
                diskChanged={live.diskChanged}
                onDirty={setEditorDirty}
                onSaved={(d) => {
                  live.markSaved(d);
                  live.clearUpdate();
                }}
                onClose={() => setMode("view")}
                onReload={live.reload}
              />
            )}
            {live.doc && mode === "history" && openPath && (
              <HistoryPanel path={openPath} refreshKey={live.doc.hash} disabled={busy} onError={onHistoryError} />
            )}
            {mode === "changes" && live.update && (
              <Sheet wide>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[21px] font-semibold text-ink">O que mudou neste arquivo</div>
                    <div className="text-xs text-ink-3">Comparação entre o que estava na tela e a versão nova.</div>
                  </div>
                  <button
                    className={btn}
                    onClick={() => {
                      live.clearUpdate();
                      setMode("view");
                    }}
                  >
                    Voltar ao documento
                  </button>
                </div>
                <DiffView before={live.update.before} after={live.update.after} />
              </Sheet>
            )}
          </div>
        </main>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-panel 2xl:w-[380px]">
          <div role="tablist" aria-label="Painel" className="flex h-11 shrink-0 items-end gap-5 border-b border-line px-4">
            {(["comments", "chat"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={rightTab === t}
                className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[13px] font-medium ${
                  rightTab === t ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"
                }`}
                onClick={() => setRightTab(t)}
              >
                {t === "comments" ? "Comentários" : "Chat"}
                {t === "comments" && openCount > 0 && (
                  <span className="rounded-full bg-mark-soft px-1.5 text-2xs font-semibold tabular-nums text-mark-ink">{openCount}</span>
                )}
                {t === "chat" && job?.kind === "chat" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-claude" aria-label="Claude trabalhando" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === "comments" ? (
              <CommentsPanel
                comments={comments}
                found={found}
                activeId={activeId}
                pending={pendingAnchor}
                job={job}
                busy={busy}
                claudeEnabled={claudeEnabled}
                onFocus={(id) => {
                  setActiveId(id);
                  if (mode !== "view") setMode("view");
                }}
                onCreate={createComment}
                onCancelPending={() => setPendingAnchor(null)}
                onReply={async (id, body) => {
                  await run(() => api.reply(id, body));
                  await refreshComments();
                }}
                onSetStatus={async (id, status) => {
                  await run(() => api.updateComment(id, { status }));
                  await refreshComments();
                }}
                onSend={async (id) => {
                  await run(() => api.sendComment(id));
                }}
                onCancelJob={cancelJob}
              />
            ) : (
              <ChatPanel
                messages={chatMessages}
                job={job}
                busy={busy}
                claudeEnabled={claudeEnabled}
                openPath={openPath}
                onSend={sendChat}
                onNew={() => setChatSessionId(null)}
                onCancel={cancelJob}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Editor com aviso de alterações não salvas para o App. */
function EditorHost(props: Omit<React.ComponentProps<typeof Editor>, "onDirtyChange"> & { onDirty: (dirty: boolean) => void }) {
  const { onDirty, ...rest } = props;
  useEffect(() => () => onDirty(false), [onDirty]);
  return <Editor {...rest} onDirtyChange={onDirty} />;
}
