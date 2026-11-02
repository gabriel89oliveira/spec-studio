import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, LiveJob, ToolLine } from "../types";
import { btn, btnPrimary, input, toolLabel } from "../ui";

type Props = {
  messages: ChatMessage[];
  job: LiveJob | null;
  busy: boolean;
  claudeEnabled: boolean;
  openPath: string | null;
  onSend: (text: string) => Promise<boolean>;
  onNew: () => void;
  onCancel: () => void;
};

function Tools({ tools }: { tools?: ToolLine[] }) {
  if (!tools?.length) return null;
  return (
    <div className="space-y-0.5">
      {tools.map((t, i) => (
        <div key={i} className="text-[11px] text-zinc-500">
          {toolLabel(t.tool, t.path)}
        </div>
      ))}
    </div>
  );
}

function Assistant({ text, tools, error, commit, live }: { text: string; tools?: ToolLine[]; error?: string; commit?: string; live?: boolean }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-violet-50 px-3 py-2 dark:bg-violet-950/40" data-testid={live ? "chat-live" : undefined}>
      <div className="text-[11px] font-semibold text-violet-800 dark:text-violet-200">
        Claude{live ? " — trabalhando…" : ""}
        {commit && <span className="ml-1 font-mono font-normal text-zinc-400">{commit}</span>}
      </div>
      <Tools tools={tools} />
      {text && (
        <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
      {error && <div className="text-xs text-red-700 dark:text-red-300">{error}</div>}
    </div>
  );
}

export function ChatPanel({ messages, job, busy, claudeEnabled, openPath, onSend, onNew, onCancel }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const liveChat = job?.kind === "chat" ? job : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, liveChat?.text, liveChat?.tools.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy || !claudeEnabled) return;
    if (await onSend(t)) setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="truncate text-[11px] text-zinc-500">{openPath ? `Contexto: ${openPath}` : "Sem arquivo aberto"}</span>
        <button className={btn} disabled={busy} onClick={onNew}>
          Nova conversa
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="chat-messages">
        {messages.length === 0 && !liveChat && (
          <p className="text-sm text-zinc-500">
            Peça mudanças maiores aqui. Ex.: <em>Rascunhe as features do módulo de oficinas</em> ou <em>Revise a F03 e liste o que falta para ficar Pronta para dev.</em>
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {m.text}
            </div>
          ) : (
            <Assistant key={i} text={m.text} tools={m.tools} error={m.error} commit={m.commit} />
          ),
        )}
        {liveChat && <Assistant text={liveChat.text} tools={liveChat.tools} live />}
        <div ref={endRef} />
      </div>
      <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <textarea
          className={input}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!claudeEnabled}
          placeholder={claudeEnabled ? "Mensagem para o Claude (Enter envia, Shift+Enter quebra linha)" : "Claude desativado: defina ANTHROPIC_API_KEY no .env"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          data-testid="chat-input"
        />
        <div className="flex justify-end gap-2">
          {liveChat && (
            <button className={btn} onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button className={btnPrimary} disabled={busy || !claudeEnabled || !text.trim()} onClick={() => void send()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
