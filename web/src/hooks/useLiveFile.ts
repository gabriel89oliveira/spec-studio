import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { FileDoc } from "../types";

export type FileUpdate = { before: string; after: string; source: string };

/**
 * Arquivo aberto, mantido em dia com as mudanças vindas do servidor.
 * Em modo de edição o texto na tela não é substituído; apenas marca que o disco mudou.
 */
export function useLiveFile(path: string | null) {
  const [doc, setDoc] = useState<FileDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<FileUpdate | null>(null);
  const [diskChanged, setDiskChanged] = useState(false);
  const docRef = useRef<FileDoc | null>(null);
  docRef.current = doc;

  const load = useCallback(async (p: string) => {
    try {
      const d = await api.file(p);
      setDoc(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDoc(null);
      return null;
    }
  }, []);

  useEffect(() => {
    setDoc(null);
    setUpdate(null);
    setDiskChanged(false);
    setError(null);
    if (path) void load(path);
  }, [path, load]);

  /** Chamado quando o servidor avisa que o arquivo aberto mudou. */
  const onRemoteChange = useCallback(
    async (hash: string | null, source: string, editing: boolean) => {
      const current = docRef.current;
      if (!path) return;
      if (hash === null) {
        setError("Este arquivo foi removido.");
        return;
      }
      if (current && current.hash === hash) return;
      if (editing) {
        setDiskChanged(true);
        return;
      }
      const before = current?.content ?? "";
      const next = await load(path);
      if (next && next.content !== before) setUpdate({ before, after: next.content, source });
    },
    [path, load],
  );

  /** Depois de salvar pelo editor. */
  const markSaved = useCallback((d: FileDoc) => {
    setDoc(d);
    setDiskChanged(false);
  }, []);

  const reload = useCallback(async () => {
    setDiskChanged(false);
    if (path) return load(path);
    return null;
  }, [path, load]);

  return {
    doc,
    error,
    update,
    clearUpdate: () => setUpdate(null),
    diskChanged,
    onRemoteChange,
    markSaved,
    reload,
  };
}
