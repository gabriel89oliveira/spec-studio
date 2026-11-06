import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, storage } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffView } from "./components/DiffView";
import { DocView, Sheet } from "./components/DocView";
import { GuideCard } from "./components/GuideCard";
import { applyTask, type TaskAction } from "./tasks";
import { IconClose } from "./components/Icons";
import { DecisionsScreen, DevPackModal, IssuesScreen, OverviewScreen, SCREEN_LABEL } from "./components/Screens";
import { MatrixEditor } from "./components/MatrixEditor";
import { RenameSource } from "./components/RenameSource";
import { Editor } from "./components/Editor";
import { FileTree } from "./components/FileTree";
import { Resizer, usePaneWidth } from "./components/Resizer";
import { Header } from "./components/Header";
import { SettingsDialog } from "./components/SettingsDialog";
import { HistoryPanel } from "./components/HistoryPanel";
import { useEvents } from "./hooks/useEvents";
import { useLiveFile } from "./hooks/useLiveFile";
import type { AppInfo, Anchor, ChatMessage, Comment, LiveJob, Project, Screen, TreeNode, WorkspaceInfo } from "./types";
import { ProjectPicker } from "./components/ProjectPicker";
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

export default function App({ workspace }: { workspace: WorkspaceInfo }) {
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
  const [screen, setScreen] = useState<Screen | null>(null);
  const [packFor, setPackFor] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const treePane = usePaneWidth("tree-width", 248, 180, 520);
  const sidePane = usePaneWidth("side-width", 368, 300, 760);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [badges, setBadges] = useState({ issues: 0, decisions: 0 });
  const [rev, setRev] = useState(0);
  const live = useLiveFile(openPath);

  useEffect(() => {
    let stop = false;
    const tick = () => api.appInfo().then((a) => !stop && setAppInfo(a)).catch(() => {});
    void tick();
    const t = setInterval(tick, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

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
      setRev((r) => r + 1);
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

  // Contadores ao lado das telas do projeto.
  useEffect(() => {
    let alive = true;
    api.overview().then(
      (o) => alive && setBadges({ issues: o.counts.issues, decisions: o.counts.decisionsOpen }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [rev]);

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
    if (p === openPath) {
      setScreen(null);
      return;
    }
    if (mode === "edit" && editorDirty && !window.confirm("Descartar as alterações não salvas?")) return;
    setScreen(null);
    setOpenPath(p);
  };

  const ask = (prompt: string, file?: string | null) => {
    setRightTab("chat");
    void sendChat(prompt, file ?? openPath);
  };

  const changeStage = async (stage: string) => {
    const d = live.doc;
    if (!d || busy) return;
    if (await run(() => api.setStage(d.path, stage))) {
      await live.reload();
      await refreshTree();
    }
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

  const sendChat = async (text: string, file: string | null = openPath) => {
    const r = await run(() => api.chat(text, chatSessionId ?? undefined, file ?? undefined));
    if (!r) return false;
    if (r.sessionId !== chatSessionId) setChatSessionId(r.sessionId);
    else void refreshChat();
    return true;
  };

  const importSource = async (p: Parameters<typeof api.importSource>[0]) => {
    const r = await run(() => api.importSource(p));
    if (!r) return false;
    await refreshTree();
    setOpenPath(r.ficha);
    setMode("view");
    setRightTab("chat");
    void sendChat(`Extração de fonte: ${r.ficha}.\nSiga a seção "Fontes de contexto" do CLAUDE.md: leia o original e preencha a ficha só com propostas rastreáveis ao texto.`, r.ficha);
    return true;
  };

  const onTask = async (line: number, action: TaskAction) => {
    const d = live.doc;
    if (!d || busy) return;
    const next = applyTask(d.content, line, action);
    if (next === null) return;
    const saved = await run(() => api.saveFile(d.path, next, d.hash));
    if (saved) await live.reload();
  };

  const onTaskRef = useRef(onTask);
  onTaskRef.current = onTask;
  const stableTask = useCallback((l: number, a: TaskAction) => void onTaskRef.current(l, a), []);

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
      className={`h-7 rounded-lg px-3.5 text-xs font-medium transition-colors disabled:opacity-45 ${
        mode === id ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-wash hover:text-ink"
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

  const sourceMatch = live.doc?.guide?.kind === "source" ? live.doc.content.match(/^#\s+(S\d+)\s*[—-]\s*(.*)$/m) : null;

  const renameSource = async (name: string): Promise<string | null> => {
    const d = live.doc;
    if (!d) return "Nenhum arquivo aberto";
    try {
      const r = await api.renameSource(d.path, name);
      await refreshTree();
      setRenaming(false);
      setOpenPath(r.path);
      return null;
    } catch (e) {
      return errText(e);
    }
  };

  const crumbs = screen ? [SCREEN_LABEL[screen]] : (openPath?.split("/") ?? []);
  const showDoc = !screen;
  const featureId = live.doc?.guide?.kind === "feature" ? live.doc.path.match(/F\d+/i)?.[0]?.toUpperCase() : undefined;
  const openCount = comments.filter((c) => c.status !== "resolved").length;

  return (
    <div className="flex h-screen flex-col bg-[rgb(var(--canvas))] text-ink">
      <Header project={project} busy={busy} lastError={lastError} connected={connected} onSwitch={() => setSwitching(true)} onSettings={() => setSettingsOpen(true)} />
      {appInfo?.desktop && (appInfo.update.state === "ready" || appInfo.update.state === "downloading") && (
        <div className="flex items-center justify-center gap-3 border-b border-line/70 bg-mark-soft px-4 py-1.5 text-xs text-mark-ink" data-testid="update-banner">
          {appInfo.update.state === "ready" ? (
            <>
              <span>Nova versão {appInfo.update.version} pronta.</span>
              <button className="font-semibold underline" onClick={() => void api.installUpdate()}>Reiniciar e atualizar</button>
            </>
          ) : (
            <span>Baixando a nova versão{appInfo.update.percent != null ? ` (${Math.round(appInfo.update.percent)}%)` : ""}…</span>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <FileTree
          width={treePane.width}
          tree={tree}
          openPath={screen ? null : openPath}
          screen={screen}
          onScreen={(s) => {
            if (mode === "edit" && editorDirty && !window.confirm("Descartar as alterações não salvas?")) return;
            setScreen(s);
          }}
          badges={badges}
          changed={changed}
          canCreate={claudeEnabled && !busy}
          onOpen={openFile}
          onCreate={(p) => {
            setRightTab("chat");
            void sendChat(p);
          }}
          onImport={importSource}
        />

        <Resizer pane={treePane} grows="right" label="Largura da árvore de arquivos" testId="resize-tree" />
        <main className="flex min-w-[360px] flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-2 pb-3">
            <nav aria-label="Caminho do arquivo" className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-3" data-testid="open-path">
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
            {showDoc && sourceMatch && mode === "view" && (
              <button className={`${btn} ml-auto shrink-0`} disabled={busy} onClick={() => setRenaming(true)} data-testid="rename-source-btn" title="Mudar o nome desta fonte e dos arquivos dela">
                Renomear fonte
              </button>
            )}
            <div
              role="tablist"
              aria-label="Modo"
              className="flex shrink-0 gap-1 rounded-xl border border-line/70 bg-panel p-1 shadow-[var(--shadow-panel)]"
            >
              {showDoc && tab("view", "Ler")}
              {showDoc && tab("edit", "Editar")}
              {showDoc && tab("history", "Histórico")}
            </div>
          </div>

          {notice && (
            <div className="mx-2 mb-3 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-xs text-danger" data-testid="notice" role="alert">
              <span className="flex-1 whitespace-pre-wrap leading-snug">{notice}</span>
              <button className="shrink-0 rounded-md p-0.5 hover:bg-danger/10" onClick={() => setNotice(null)} aria-label="Fechar aviso">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {updateBanner && (
            <div
              className={`mx-2 mb-3 flex items-center gap-3 rounded-xl border px-4 py-2 text-xs ${
                live.update?.source === "claude" ? "border-claude/25 bg-claude-soft text-claude" : "border-accent/25 bg-accent-soft text-accent"
              }`}
              data-testid="update-banner"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              <span className="flex-1 font-medium">{updateBanner}</span>
              <button className={btn} onClick={() => setMode("changes")}>
                Ver alterações
              </button>
              <button className="shrink-0 rounded-md p-0.5 hover:bg-ink/5" onClick={live.clearUpdate} aria-label="Fechar aviso">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {screen === "overview" && <OverviewScreen refreshKey={String(rev)} busy={busy} claudeEnabled={claudeEnabled} onOpen={openFile} onAsk={ask} />}
            {screen === "issues" && <IssuesScreen refreshKey={String(rev)} busy={busy} claudeEnabled={claudeEnabled} onOpen={openFile} onAsk={ask} />}
            {screen === "decisions" && <DecisionsScreen refreshKey={String(rev)} busy={busy} claudeEnabled={claudeEnabled} onOpen={openFile} onAsk={ask} />}
            {showDoc && live.error && (
              <Sheet>
                <p className="text-sm text-danger">{live.error}</p>
              </Sheet>
            )}
            {showDoc && !live.doc && !live.error && openPath && <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>}
            {showDoc && !openPath && <p className="p-8 text-center text-sm text-ink-3">Escolha um arquivo à esquerda.</p>}
            {showDoc && live.doc && mode === "view" && live.doc.guide && (
              <GuideCard
                path={live.doc.path}
                guide={live.doc.guide}
                busy={busy}
                claudeEnabled={claudeEnabled}
                onContinue={(p) => {
                  setRightTab("chat");
                  void sendChat(p);
                }}
                onStage={featureId ? (st) => void changeStage(st) : undefined}
                onPack={featureId ? () => setPackFor(featureId) : undefined}
              />
            )}
            {showDoc && live.doc && mode === "view" && live.doc.guide?.kind === "matrix" && (
              <MatrixEditor
                content={live.doc.content}
                disabled={busy}
                onSave={async (c) => {
                  const d = live.doc!;
                  const r = await run(() => api.saveFile(d.path, c, d.hash));
                  if (r) await live.reload();
                  return !!r;
                }}
              />
            )}
            {showDoc && live.doc && mode === "view" && live.doc.guide?.kind !== "matrix" && (
              <DocView
                content={live.doc.content}
                comments={comments}
                activeId={activeId}
                onComment={onComment}
                onFocusComment={onFocusComment}
                onAnchorsResolved={onAnchorsResolved}
                onTask={live.doc.guide?.kind === "source" && !busy ? stableTask : undefined}
              />
            )}
            {showDoc && live.doc && mode === "edit" && (
              <EditorHost
                key={live.doc.path}
                doc={live.doc}
                readOnly={busy}
                diskChanged={live.diskChanged}
                onDirty={setEditorDirty}
                onSaved={(d) => {
                  live.markSaved(d);
                  live.clearUpdate();
                  void live.reload();
                }}
                onClose={() => setMode("view")}
                onReload={live.reload}
              />
            )}
            {showDoc && live.doc && mode === "history" && openPath && (
              <HistoryPanel path={openPath} refreshKey={live.doc.hash} disabled={busy} onError={onHistoryError} />
            )}
            {showDoc && mode === "changes" && live.update && (
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

        <Resizer pane={sidePane} grows="left" label="Largura do painel de comentários e chat" testId="resize-side" />
        <aside style={{ width: sidePane.width }} className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line/70 bg-panel shadow-[var(--shadow-panel)]">
          <div role="tablist" aria-label="Painel" className="flex shrink-0 items-center gap-1 border-b border-line/70 p-2">
            {(["comments", "chat"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={rightTab === t}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                  rightTab === t ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-wash hover:text-ink"
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
      {settingsOpen && <SettingsDialog app={appInfo} onClose={() => setSettingsOpen(false)} onSaved={() => void refreshProject()} />}
      {renaming && sourceMatch && <RenameSource id={sourceMatch[1]} current={sourceMatch[2].trim()} onSubmit={renameSource} onClose={() => setRenaming(false)} />}
      {switching && <ProjectPicker info={workspace} onClose={() => setSwitching(false)} />}
      {packFor && <DevPackModal featureId={packFor} onClose={() => setPackFor(null)} />}
    </div>
  );
}

/** Editor com aviso de alterações não salvas para o App. */
function EditorHost(props: Omit<React.ComponentProps<typeof Editor>, "onDirtyChange"> & { onDirty: (dirty: boolean) => void }) {
  const { onDirty, ...rest } = props;
  useEffect(() => () => onDirty(false), [onDirty]);
  return <Editor {...rest} onDirtyChange={onDirty} />;
}
