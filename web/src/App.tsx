import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, storage } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffView } from "./components/DiffView";
import { DocView } from "./components/DocView";
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
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
        mode === id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
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

  return (
    <div className="flex h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header project={project} busy={busy} lastError={lastError} connected={connected} />
      <div className="flex min-h-0 flex-1">
        <FileTree tree={tree} openPath={openPath} changed={changed} canCreate={claudeEnabled && !busy} onOpen={openFile} onCreate={(p) => {
          setRightTab("chat");
          void sendChat(p);
        }} />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
            <span className="truncate font-mono text-xs text-zinc-500" data-testid="open-path">
              {openPath ?? "Nenhum arquivo aberto"}
            </span>
            <div className="flex gap-1">
              {tab("view", "Ler")}
              {tab("edit", "Editar")}
              {tab("history", "Histórico")}
            </div>
          </div>

          {notice && (
            <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200" data-testid="notice">
              <span className="flex-1 whitespace-pre-wrap">{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="Fechar">
                ×
              </button>
            </div>
          )}
          {updateBanner && (
            <div className="flex items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200" data-testid="update-banner">
              <span className="flex-1">{updateBanner}</span>
              <button className={btn} onClick={() => setMode("changes")}>
                Ver alterações
              </button>
              <button onClick={live.clearUpdate} aria-label="Fechar">
                ×
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {live.error && <p className="p-6 text-sm text-red-600">{live.error}</p>}
            {!live.doc && !live.error && openPath && <p className="p-6 text-sm text-zinc-500">Carregando…</p>}
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
              <div className="mx-auto max-w-4xl space-y-3 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">O que mudou neste arquivo</span>
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
              </div>
            )}
          </div>
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-200 px-2 dark:border-zinc-800">
            {(["comments", "chat"] as const).map((t) => (
              <button
                key={t}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  rightTab === t ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
                onClick={() => setRightTab(t)}
              >
                {t === "comments" ? `Comentários${comments.filter((c) => c.status !== "resolved").length ? ` (${comments.filter((c) => c.status !== "resolved").length})` : ""}` : "Chat"}
                {t === "chat" && job?.kind === "chat" && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
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
