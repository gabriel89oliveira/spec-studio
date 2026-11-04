import { useRef, useState } from "react";
import { btn, btnClaude, input } from "../ui";
import { IconUpload } from "./Icons";

export type SourcePayload = { name: string; type: string; fileName?: string; encoding: "base64" | "text"; content: string };

const TYPES: { id: string; label: string }[] = [
  { id: "reuniao", label: "Reunião (transcrição)" },
  { id: "documento", label: "Documento do cliente" },
  { id: "norma", label: "Norma ou legislação" },
  { id: "outro", label: "Outro" },
];

const MAX = 25 * 1024 * 1024;

function toBase64(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Texto em UTF-8, mesmo quando o arquivo vem em UTF-16 (comum em exportações do Teams). */
function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf).replace(/^﻿/, "");
  return new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
}

type Props = { onSubmit: (p: SourcePayload) => Promise<boolean>; onClose: () => void };

export function ImportSource({ onSubmit, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("reuniao");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const valid = name.trim() && (file || pasted.trim());

  const choose = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!/\.(pdf|md|txt)$/i.test(f.name)) return setError("Use PDF, Markdown (.md) ou texto (.txt).");
    if (f.size > MAX) return setError("O arquivo passa de 25 MB.");
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      let payload: SourcePayload;
      if (file) {
        const buf = await file.arrayBuffer();
        payload = /\.pdf$/i.test(file.name)
          ? { name: name.trim(), type, fileName: file.name, encoding: "base64", content: toBase64(buf) }
          : { name: name.trim(), type, fileName: file.name, encoding: "text", content: decodeText(buf) };
      } else {
        payload = { name: name.trim(), type, encoding: "text", content: pasted };
      }
      if (!(await onSubmit(payload))) setSending(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  };

  return (
    <div className="mx-2 mb-2 space-y-2.5 rounded-xl border border-line bg-sheet p-3.5 shadow-lift" data-testid="import-source">
      <div className="text-[15px] font-semibold text-ink">Importar fonte</div>

      <div className="space-y-1">
        <span className="text-xs text-ink-2">Arquivo (PDF, .md ou .txt)</span>
        <input ref={picker} type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" className="sr-only" aria-label="Arquivo" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong bg-wash/60 px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:border-accent/60 hover:text-ink"
          onClick={() => picker.current?.click()}
        >
          <IconUpload className="h-4 w-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Escolher arquivo"}</span>
          {file && (
            <span
              role="button"
              tabIndex={0}
              className="shrink-0 text-ink-3 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                if (picker.current) picker.current.value = "";
              }}
            >
              trocar
            </span>
          )}
        </button>
      </div>

      {!file && (
        <label className="block space-y-1">
          <span className="text-xs text-ink-2">ou cole o texto</span>
          <textarea className={input} rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Transcrição, trecho de documento…" />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-ink-2">Nome</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reunião com a oficina 05/11" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-2">Tipo</span>
        <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs leading-snug text-ink-3">O Claude lê a fonte e propõe decisões, requisitos e dúvidas. Nada entra nas specs sem você aceitar.</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnClaude} disabled={!valid || sending} onClick={() => void submit()}>
          {sending ? "Enviando…" : "Importar"}
        </button>
      </div>
    </div>
  );
}
