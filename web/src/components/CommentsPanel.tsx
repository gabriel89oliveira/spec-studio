import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Anchor, Comment, LiveJob } from "../types";
import { btn, btnClaude, btnGhost, btnPrimary, formatDate, input, toolLabel } from "../ui";
import { IconChevron, IconComment } from "./Icons";

type Props = {
  comments: Comment[];
  found: Set<string>;
  activeId: string | null;
  pending: Anchor | null;
  job: LiveJob | null;
  busy: boolean;
  claudeEnabled: boolean;
  onFocus: (id: string) => void;
  onCreate: (body: string) => Promise<boolean>;
  onCancelPending: () => void;
  onReply: (id: string, body: string) => Promise<void>;
  onSetStatus: (id: string, status: "open" | "resolved") => Promise<void>;
  onSend: (id: string) => Promise<void>;
  onCancelJob: () => void;
};

/** Recolhimento individual dos comentários, lembrado entre sessões. */
type Fold = { folded: Set<string>; toggle: (id: string) => void; expand: (id: string) => void };
const FOLD_KEY = "spec-studio.folded-comments";

function useFold(ids: string[]): Fold & { setAll: (fold: boolean) => void } {
  const [folded, setFolded] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const save = (next: Set<string>) => {
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify([...next].slice(-500)));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    return next;
  };
  const update = (fn: (s: Set<string>) => void) =>
    setFolded((cur) => {
      const next = new Set(cur);
      fn(next);
      return save(next);
    });
  return {
    folded,
    toggle: (id) => update((s) => void (s.has(id) ? s.delete(id) : s.add(id))),
    expand: (id) => folded.has(id) && update((s) => void s.delete(id)),
    setAll: (fold) => update((s) => ids.forEach((id) => (fold ? s.add(id) : s.delete(id)))),
  };
}

const STATUS: Record<Comment["status"], { text: string; bar: string }> = {
  open: { text: "aberto", bar: "bg-mark" },
  sent: { text: "com o Claude", bar: "bg-claude" },
  answered: { text: "respondido", bar: "bg-claude" },
  resolved: { text: "resolvido", bar: "bg-line-strong" },
};

function Quote({ text }: { text: string }) {
  return (
    <blockquote className="line-clamp-3 rounded-r-md border-l-2 border-mark bg-mark-soft/40 py-1 pl-2.5 pr-2 text-[13.5px] italic leading-snug text-ink-2">
      {text}
    </blockquote>
  );
}

function LiveWork({ job, onCancel }: { job: LiveJob; onCancel: () => void }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-claude-soft px-3 py-2.5" data-testid="comment-live">
      <div className="flex items-center gap-2 text-xs font-semibold text-claude">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-claude" aria-hidden="true" />
        Claude trabalhando
      </div>
      {job.tools.map((t, i) => (
        <div key={i} className="truncate text-xs text-ink-2" title={toolLabel(t.tool, t.path)}>
          {toolLabel(t.tool, t.path)}
        </div>
      ))}
      {job.text && <div className="whitespace-pre-wrap text-[13px] leading-snug text-ink">{job.text}</div>}
      <button
        className={`${btnGhost} -ml-2`}
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      >
        Cancelar
      </button>
    </div>
  );
}

function Card({ c, props, orphan, fold }: { c: Comment; props: Props; orphan?: boolean; fold: Fold }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const active = props.activeId === c.id;
  const working = props.job?.kind === "comment" && props.job.commentId === c.id;
  const st = STATUS[c.status];
  const canSend = props.claudeEnabled && !props.busy && c.status !== "resolved";
  const isFolded = fold.folded.has(c.id) && !working && !replying;

  // Clicar no trecho do documento (ou o Claude começar a trabalhar) abre o comentário recolhido.
  useEffect(() => {
    if (active || working) fold.expand(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, working]);

  const submitReply = async (andSend: boolean) => {
    const body = reply.trim();
    if (!body) return;
    await props.onReply(c.id, body);
    setReply("");
    setReplying(false);
    if (andSend) await props.onSend(c.id);
  };

  return (
    <div
      data-comment-id={c.id}
      className={`relative overflow-hidden rounded-xl border bg-sheet py-3.5 pl-4 pr-3 text-sm transition-shadow ${
        active ? "border-accent/60 shadow-[var(--shadow-panel)] ring-2 ring-accent/15" : "border-line/80 hover:border-line-strong"
      } ${orphan ? "" : "cursor-pointer"}`}
      onClick={() => !orphan && props.onFocus(c.id)}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${st.bar}`} aria-hidden="true" />
      <div className={`${isFolded ? "" : "mb-2"} flex items-center justify-between gap-2 text-xs`}>
        <span className="flex min-w-0 items-center gap-1">
          <button
            className="-ml-1 shrink-0 rounded p-1 text-ink-3 hover:bg-wash hover:text-ink"
            aria-label={isFolded ? "Expandir comentário" : "Recolher comentário"}
            aria-expanded={!isFolded}
            title={isFolded ? "Expandir" : "Recolher"}
            data-testid="fold-comment"
            onClick={(e) => {
              e.stopPropagation();
              fold.toggle(c.id);
            }}
          >
            <IconChevron className={`h-3 w-3 transition-transform ${isFolded ? "" : "rotate-90"}`} />
          </button>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">{c.author}</span> <span className="text-ink-3">{formatDate(c.createdAt)}</span>
          </span>
        </span>
        <span className="shrink-0 text-ink-3">
          {isFolded && c.replies.length > 0 && <span className="mr-2 tabular-nums">{c.replies.length} {c.replies.length === 1 ? "resposta" : "respostas"}</span>}
          {st.text}
        </span>
      </div>
      {isFolded ? (
        <p className="ml-5 mt-0.5 truncate text-[13px] text-ink-2" title={c.body} data-testid="comment-summary">
          {c.body}
        </p>
      ) : (
        <>
      <Quote text={c.anchor.quote} />
      <p className="mt-2 whitespace-pre-wrap leading-snug text-ink">{c.body}</p>

      {c.replies.length > 0 && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          {c.replies.map((r, i) => (
            <div key={i}>
              <div className="mb-0.5 flex items-baseline gap-2 text-xs">
                <span className={`font-semibold ${r.author === "Claude" ? "text-claude" : "text-ink"}`}>{r.author}</span>
                <span className="text-ink-3">{formatDate(r.createdAt)}</span>
                {r.commit && (
                  <span className="font-mono text-2xs text-ink-3" title="Commit com as alterações">
                    {r.commit}
                  </span>
                )}
              </div>
              {r.author === "Claude" ? (
                <div className="md-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.body}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap leading-snug text-ink">{r.body}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {working && props.job && (
        <div className="mt-3">
          <LiveWork job={props.job} onCancel={props.onCancelJob} />
        </div>
      )}

      {replying && (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            className={input}
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            autoFocus
            placeholder="Sua resposta"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && reply.trim()) void submitReply(canSend);
              if (e.key === "Escape") setReplying(false);
            }}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className={btnGhost} onClick={() => setReplying(false)}>
              Cancelar
            </button>
            {canSend && (
              <button className={btn} disabled={!reply.trim()} onClick={() => void submitReply(false)} title="Registra a resposta sem chamar o Claude">
                Só responder
              </button>
            )}
            <button
              className={canSend ? btnClaude : btnPrimary}
              disabled={!reply.trim()}
              onClick={() => void submitReply(canSend)}
              title={canSend ? "Registra a resposta e já envia para o Claude" : undefined}
            >
              {canSend ? "Responder e enviar ao Claude" : "Responder"}
            </button>
          </div>
        </div>
      )}

      {!replying && !working && (
        <div className="mt-3 flex flex-wrap items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {c.status !== "resolved" && (
            <button
              className={btnClaude}
              disabled={props.busy || !props.claudeEnabled}
              title={!props.claudeEnabled ? "Configure o acesso ao Claude no .env" : "O Claude faz o que o comentário pede"}
              onClick={() => void props.onSend(c.id)}
            >
              Enviar para o Claude
            </button>
          )}
          <button className={btnGhost} onClick={() => setReplying(true)}>
            Responder
          </button>
          {c.status === "resolved" ? (
            <button className={btnGhost} onClick={() => void props.onSetStatus(c.id, "open")}>
              Reabrir
            </button>
          ) : (
            <button className={btnGhost} disabled={c.status === "sent"} onClick={() => void props.onSetStatus(c.id, "resolved")}>
              Resolver
            </button>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function NewComment({ anchor, onCreate, onCancel }: { anchor: Anchor; onCreate: Props["onCreate"]; onCancel: () => void }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    const ok = await onCreate(body.trim());
    setSaving(false);
    if (ok) setBody("");
  };
  return (
    <div className="space-y-3 rounded-xl border border-accent/60 bg-sheet p-3.5 shadow-lift ring-2 ring-accent/10" data-testid="new-comment">
      <div className="text-[15px] font-semibold text-ink">Novo comentário</div>
      <Quote text={anchor.quote} />
      <textarea
        className={input}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
        placeholder="O que precisa mudar ou ser esclarecido?"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-ink-3">Ctrl+Enter comenta</span>
        <div className="flex gap-2">
          <button className={btn} onClick={onCancel}>
            Cancelar
          </button>
          <button className={btnPrimary} disabled={!body.trim() || saving} onClick={() => void submit()}>
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  props,
  orphan,
  collapsed,
  fold,
}: {
  title: string;
  hint?: string;
  items: Comment[];
  props: Props;
  orphan?: boolean;
  collapsed?: boolean;
  fold: Fold;
}) {
  const [open, setOpen] = useState(!collapsed);
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <button className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
        <IconChevron className={`h-3 w-3 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
        <span className="font-normal tabular-nums text-ink-3">{items.length}</span>
      </button>
      {hint && open && <p className="text-xs text-ink-3">{hint}</p>}
      {open && items.map((c) => <Card key={c.id} c={c} props={props} orphan={orphan} fold={fold} />)}
    </section>
  );
}

export function CommentsPanel(props: Props) {
  const { comments, found } = props;
  const orphans = comments.filter((c) => c.status !== "resolved" && !found.has(c.id));
  const live = comments.filter((c) => c.status !== "resolved" && found.has(c.id));
  const open = live.filter((c) => c.status === "open" || c.status === "sent");
  const answered = live.filter((c) => c.status === "answered");
  const resolved = comments.filter((c) => c.status === "resolved");

  const fold = useFold(comments.map((c) => c.id));
  const allFolded = comments.length > 0 && comments.every((c) => fold.folded.has(c.id));

  return (
    <div className="space-y-5 p-3.5" data-testid="comments-panel">
      {comments.length > 1 && (
        <div className="-mb-2 flex justify-end">
          <button className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline" onClick={() => fold.setAll(!allFolded)} data-testid="fold-all">
            {allFolded ? "Expandir todos" : "Recolher todos"}
          </button>
        </div>
      )}
      {props.pending && <NewComment anchor={props.pending} onCreate={props.onCreate} onCancel={props.onCancelPending} />}
      {comments.length === 0 && !props.pending && (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <IconComment className="h-6 w-6 text-ink-3" />
          <p className="text-sm text-ink-2">Nenhum comentário neste arquivo.</p>
          <p className="text-xs leading-snug text-ink-3">Selecione um trecho do documento e clique em Comentar.</p>
        </div>
      )}
      <Section title="Abertos" items={open} props={props} fold={fold} />
      <Section title="Respondidos" items={answered} props={props} fold={fold} />
      <Section title="Órfãos" hint="O trecho destes comentários não existe mais no texto atual." items={orphans} props={props} orphan fold={fold} />
      <Section title="Resolvidos" items={resolved} props={props} collapsed fold={fold} />
    </div>
  );
}
