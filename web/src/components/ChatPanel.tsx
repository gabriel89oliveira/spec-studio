import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, LiveJob, ToolLine } from "../types";
import { btnClaude, btnGhost, toolLabel } from "../ui";
import { IconPlus } from "./Icons";

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

const SUGGESTIONS = [
  "Revise este arquivo e liste o que falta para ficar Pronta para dev",
  "Sugira cenários de erro para os critérios de aceite",
  "Liste os termos que deveriam entrar no Glossário",
];

function Tools({ tools }: { tools?: ToolLine[] }) {
  if (!tools?.length) return null;
  return (
    <ul className="space-y-0.5">
      {tools.map((t, i) => (
        <li key={i} className="flex items-center gap-2 truncate text-xs text-ink-2" title={toolLabel(t.tool, t.path)}>
          <span className="h-1 w-1 shrink-0 rounded-full bg-claude/70" aria-hidden="true" />
          {toolLabel(t.tool, t.path)}
        </li>
      ))}
    </ul>
  );
}

function Assistant({ text, tools, error, commit, live }: { text: string; tools?: ToolLine[]; error?: string; commit?: string; live?: boolean }) {
  return (
    <div className="space-y-2 border-l-2 border-claude pl-3" data-testid={live ? "chat-live" : undefined}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-claude">Claude</span>
        {live && (
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-claude" aria-hidden="true" />
            trabalhando
          </span>
        )}
        {commit && (
          <span className="font-mono text-2xs text-ink-3" title="Commit com as alterações">
            {commit}
          </span>
        )}
      </div>
      <Tools tools={tools} />
      {text && (
        <div className="md-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}

export function ChatPanel({ messages, job, busy, claudeEnabled, openPath, onSend, onNew, onCancel }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveChat = job?.kind === "chat" ? job : null;
  const fileName = openPath?.split("/").pop()?.replace(/\.md$/i, "");

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
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 truncate text-xs text-ink-3" title={openPath ?? undefined}>
          {fileName ? (
            <>
              Sobre <span className="font-medium text-ink-2">{fileName}</span>
            </>
          ) : (
            "Nenhum arquivo aberto"
          )}
        </span>
        <button className={btnGhost} disabled={busy || messages.length === 0} onClick={onNew}>
          <IconPlus className="h-3.5 w-3.5" />
          Nova conversa
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4" data-testid="chat-messages">
        {messages.length === 0 && !liveChat && (
          <div className="space-y-3 pt-2">
            <p className="text-sm leading-snug text-ink-2">
              Peça mudanças maiores aqui. O arquivo aberto vai junto como contexto, e o Claude altera os arquivos e faz o commit.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="block w-full rounded-md border border-line bg-sheet px-3 py-2 text-left text-[13px] leading-snug text-ink-2 hover:border-claude/50 hover:text-ink disabled:opacity-50"
                  disabled={!claudeEnabled}
                  onClick={() => {
                    setText(s);
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 whitespace-pre-wrap rounded-lg rounded-br-sm bg-accent-soft px-3 py-2 text-[13.5px] leading-snug text-ink">
              {m.text}
            </div>
          ) : (
            <Assistant key={i} text={m.text} tools={m.tools} error={m.error} commit={m.commit} />
          ),
        )}
        {liveChat && <Assistant text={liveChat.text} tools={liveChat.tools} live />}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-sheet focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <textarea
            ref={inputRef}
            className="block w-full resize-none rounded-t-lg bg-transparent px-3 pt-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none disabled:opacity-60"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!claudeEnabled}
            placeholder={claudeEnabled ? "Mensagem para o Claude" : "Claude desativado: defina ANTHROPIC_API_KEY no .env"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            data-testid="chat-input"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <span className="pl-1 text-2xs text-ink-3">Enter envia, Shift+Enter quebra linha</span>
            <div className="flex gap-1.5">
              {liveChat && (
                <button className={btnGhost} onClick={onCancel}>
                  Cancelar
                </button>
              )}
              <button className={btnClaude} disabled={busy || !claudeEnabled || !text.trim()} onClick={() => void send()}>
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
