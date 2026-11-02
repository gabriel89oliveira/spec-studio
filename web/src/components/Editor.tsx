import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { api, ApiError } from "../api";
import type { FileDoc } from "../types";
import { btn, btnDanger, btnPrimary } from "../ui";

type Props = {
  doc: FileDoc;
  readOnly: boolean;
  diskChanged: boolean;
  onSaved: (doc: FileDoc) => void;
  onClose: () => void;
  onReload: () => Promise<FileDoc | null>;
  onDirtyChange?: (dirty: boolean) => void;
};

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const fn = () => setDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return dark;
}

export function Editor({ doc, readOnly, diskChanged, onSaved, onClose, onReload, onDirtyChange }: Props) {
  const [draft, setDraft] = useState(doc.content);
  const [baseHash, setBaseHash] = useState(doc.hash);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [conflictHash, setConflictHash] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dark = useDarkMode();
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

  return (
    <div
      className="flex h-full flex-col"
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">
          {readOnly ? "Somente leitura enquanto o Claude trabalha" : dirty ? "Alterações não salvas · Ctrl+S salva" : message ?? "Sem alterações"}
        </span>
        <div className="flex gap-2">
          {confirmClose ? (
            <>
              <span className="self-center text-xs text-zinc-600 dark:text-zinc-400">Descartar alterações?</span>
              <button className={btn} onClick={() => setConfirmClose(false)}>
                Não
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
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <span className="flex-1">
            {state === "conflict"
              ? "Este arquivo mudou desde que você abriu o editor. Seu texto foi mantido."
              : "O arquivo mudou no disco enquanto você editava. Ao salvar, você vai precisar escolher qual versão vale."}
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
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{message}</div>
      )}

      <div className="min-h-0 flex-1 overflow-auto" data-testid="editor">
        <CodeMirror
          value={draft}
          onChange={setDraft}
          readOnly={readOnly}
          theme={dark ? "dark" : "light"}
          extensions={[markdown(), EditorView.lineWrapping]}
          basicSetup={{ foldGutter: false, highlightActiveLine: false }}
          height="100%"
          style={{ fontSize: 13 }}
        />
      </div>
    </div>
  );
}
