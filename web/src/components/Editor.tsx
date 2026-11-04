import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { api, ApiError } from "../api";
import type { FileDoc } from "../types";
import { btn, btnDanger, btnPrimary } from "../ui";
import { Sheet } from "./DocView";

/** Realce do Markdown com as cores da interface (claro e escuro via variáveis CSS). */
const specHighlight = HighlightStyle.define([
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], fontWeight: "700", color: "rgb(var(--ink))" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "rgb(var(--accent))" },
  { tag: t.quote, color: "rgb(var(--ink-2))", fontStyle: "italic" },
  { tag: t.monospace, color: "rgb(var(--claude))" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta, t.labelName], color: "rgb(var(--ink-3))" },
]);

const EXTENSIONS = [markdown(), EditorView.lineWrapping, syntaxHighlighting(specHighlight)];

type Props = {
  doc: FileDoc;
  readOnly: boolean;
  diskChanged: boolean;
  onSaved: (doc: FileDoc) => void;
  onClose: () => void;
  onReload: () => Promise<FileDoc | null>;
  onDirtyChange?: (dirty: boolean) => void;
};

export function Editor({ doc, readOnly, diskChanged, onSaved, onClose, onReload, onDirtyChange }: Props) {
  const [draft, setDraft] = useState(doc.content);
  const [baseHash, setBaseHash] = useState(doc.hash);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [conflictHash, setConflictHash] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = draft !== doc.content || baseHash !== doc.hash;

  useEffect(() => {
    onDirtyChange?.(draft !== doc.content);
  }, [draft, doc.content, onDirtyChange]);

  const save = async (overwrite = false) => {
    if (readOnly) return;
    setState("saving");
    try {
      const hash = overwrite && conflictHash ? conflictHash : baseHash;
      const r = await api.saveFile(doc.path, draft, hash);
      setBaseHash(r.hash);
      setConflictHash(null);
      setState("saved");
      setMessage(r.commit ? `Salvo (commit ${r.commit})` : "Salvo");
      onSaved({ path: doc.path, content: draft, hash: r.hash });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.conflict) {
        setConflictHash(String(e.data.hash));
        setState("conflict");
        setMessage(null);
      } else {
        setState("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const reloadFromDisk = async () => {
    const d = await onReload();
    if (d) {
      setDraft(d.content);
      setBaseHash(d.hash);
      setConflictHash(null);
      setState("idle");
      setMessage(null);
    }
  };

  const statusText = readOnly
    ? "Somente leitura enquanto o Claude trabalha"
    : dirty
      ? "Alterações não salvas. Ctrl+S salva."
      : (message ?? "Sem alterações");

  return (
    <Sheet flush>
      <div
        onKeyDownCapture={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-line bg-sheet/95 px-5 py-3 backdrop-blur">
          <span className={`flex items-center gap-2 text-xs ${dirty && !readOnly ? "text-ink" : "text-ink-3"}`}>
            {dirty && !readOnly && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
            {statusText}
          </span>
          <div className="flex items-center gap-2">
            {confirmClose ? (
              <>
                <span className="text-xs text-ink-2">Descartar alterações?</span>
                <button className={btn} onClick={() => setConfirmClose(false)}>
                  Continuar editando
                </button>
                <button className={btnDanger} onClick={onClose}>
                  Descartar
                </button>
              </>
            ) : (
              <>
                <button className={btn} onClick={() => (dirty && draft !== doc.content ? setConfirmClose(true) : onClose())}>
                  Voltar para leitura
                </button>
                <button className={btnPrimary} disabled={readOnly || state === "saving" || !dirty} onClick={() => void save()}>
                  {state === "saving" ? "Salvando…" : "Salvar"}
                </button>
              </>
            )}
          </div>
        </div>

        {(state === "conflict" || (diskChanged && state !== "saved")) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-mark/40 bg-mark-soft px-5 py-2.5 text-xs text-mark-ink">
            <span className="min-w-[200px] flex-1">
              {state === "conflict"
                ? "Este arquivo mudou desde que você abriu o editor. Seu texto foi mantido."
                : "O arquivo mudou no disco enquanto você editava. Ao salvar, você vai escolher qual versão vale."}
            </span>
            <button className={btn} onClick={() => void reloadFromDisk()}>
              Descartar meu texto e recarregar
            </button>
            {state === "conflict" && (
              <button className={btnDanger} onClick={() => void save(true)}>
                Sobrescrever com meu texto
              </button>
            )}
          </div>
        )}
        {state === "error" && message && (
          <div className="border-b border-danger/30 bg-danger-soft px-5 py-2.5 text-xs text-danger">{message}</div>
        )}

        <div className="px-3" data-testid="editor">
          <CodeMirror
            value={draft}
            onChange={setDraft}
            readOnly={readOnly}
            theme="none"
            extensions={EXTENSIONS}
            basicSetup={{ foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
            minHeight="60vh"
          />
        </div>
      </div>
    </Sheet>
  );
}
