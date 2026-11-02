import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Anchor, Comment, LiveJob } from "../types";
import { btn, btnPrimary, formatDate, input, toolLabel } from "../ui";

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

function Quote({ text }: { text: string }) {
  return <blockquote className="line-clamp-3 border-l-2 border-amber-400 pl-2 text-xs italic text-zinc-600 dark:text-zinc-400">"{text}"</blockquote>;
}

function Card({ c, props, orphan }: { c: Comment; props: Props; orphan?: boolean }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const active = props.activeId === c.id;
  const working = props.job?.kind === "comment" && props.job.commentId === c.id;
  const statusText: Record<Comment["status"], string> = {
    open: "aberto",
    sent: "enviado ao Claude",
    answered: "respondido",
    resolved: "resolvido",
  };

  return (
    <div
      data-comment-id={c.id}
      className={`space-y-2 rounded-lg border p-3 text-sm ${
        active ? "border-amber-400 bg-amber-50/60 dark:border-amber-600 dark:bg-amber-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
      onClick={() => !orphan && props.onFocus(c.id)}
    >
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {c.author} · {formatDate(c.createdAt)}
        </span>
        <span>{statusText[c.status]}</span>
      </div>
      <Quote text={c.anchor.quote} />
      <p className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{c.body}</p>

      {c.replies.map((r, i) => (
        <div key={i} className={`rounded-md px-2 py-1.5 text-xs ${r.author === "Claude" ? "bg-violet-50 dark:bg-violet-950/40" : "bg-zinc-50 dark:bg-zinc-800/60"}`}>
          <div className="mb-0.5 font-semibold text-zinc-700 dark:text-zinc-300">
            {r.author}
            {r.commit && <span className="ml-1 font-mono font-normal text-zinc-400">{r.commit}</span>}
          </div>
          {r.author === "Claude" ? (
            <div className="prose prose-sm prose-zinc max-w-none text-xs dark:prose-invert prose-p:my-1 prose-ul:my-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.body}</ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{r.body}</div>
          )}
        </div>
      ))}

      {working && props.job && (
        <div className="space-y-1 rounded-md bg-violet-50 px-2 py-1.5 text-xs dark:bg-violet-950/40" data-testid="comment-live">
          <div className="font-semibold text-violet-800 dark:text-violet-200">Claude trabalhando…</div>
          {props.job.tools.map((t, i) => (
            <div key={i} className="text-zinc-500">
              {toolLabel(t.tool, t.path)}
            </div>
          ))}
          {props.job.text && <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{props.job.text}</div>}
          <button
            className={btn}
            onClick={(e) => {
              e.stopPropagation();
              props.onCancelJob();
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {replying && (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea className={input} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus placeholder="Sua resposta" />
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setReplying(false)}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              disabled={!reply.trim()}
              onClick={async () => {
                await props.onReply(c.id, reply.trim());
                setReply("");
                setReplying(false);
              }}
            >
              Responder
            </button>
          </div>
        </div>
      )}

      {!replying && (
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {c.status !== "resolved" && (
            <button
              className={btnPrimary}
              disabled={props.busy || !props.claudeEnabled}
              title={!props.claudeEnabled ? "Defina ANTHROPIC_API_KEY no .env" : undefined}
              onClick={() => void props.onSend(c.id)}
            >
              Enviar para o Claude
            </button>
          )}
          <button className={btn} onClick={() => setReplying(true)}>
            Responder
          </button>
          {c.status === "resolved" ? (
            <button className={btn} onClick={() => void props.onSetStatus(c.id, "open")}>
              Reabrir
            </button>
          ) : (
            <button className={btn} disabled={c.status === "sent"} onClick={() => void props.onSetStatus(c.id, "resolved")}>
              Resolver
            </button>
          )}
        </div>
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
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30" data-testid="new-comment">
      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Novo comentário</div>
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
        }}
      />
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={onCancel}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={!body.trim() || saving} onClick={() => void submit()}>
          Comentar
        </button>
      </div>
    </div>
  );
}

function Section({ title, items, props, orphan, collapsed }: { title: string; items: Comment[]; props: Props; orphan?: boolean; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <button className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title} ({items.length})
      </button>
      {orphan && open && <p className="text-[11px] text-zinc-500">O trecho destes comentários não existe mais no texto atual.</p>}
      {open && items.map((c) => <Card key={c.id} c={c} props={props} orphan={orphan} />)}
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

  return (
    <div className="space-y-4 p-3" data-testid="comments-panel">
      {props.pending && <NewComment anchor={props.pending} onCreate={props.onCreate} onCancel={props.onCancelPending} />}
      {comments.length === 0 && !props.pending && (
        <p className="text-sm text-zinc-500">Selecione um trecho do documento e clique em Comentar.</p>
      )}
      <Section title="Abertos" items={open} props={props} />
      <Section title="Respondidos" items={answered} props={props} />
      <Section title="Órfãos" items={orphans} props={props} orphan />
      <Section title="Resolvidos" items={resolved} props={props} collapsed />
    </div>
  );
}
