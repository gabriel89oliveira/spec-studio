import { useEffect, useState } from "react";
import { api } from "./api";
import App from "./App";
import { ProjectPicker } from "./components/ProjectPicker";
import type { WorkspaceInfo } from "./types";

/** Abre o app quando há projeto; senão, pede para escolher ou criar um. */
export default function Gate() {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.workspace().then(setInfo, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p className="p-8 text-center text-sm text-danger">{error}</p>;
  if (!info) return <p className="p-8 text-center text-sm text-ink-3">Carregando…</p>;
  if (!info.current) return <ProjectPicker info={info} />;
  return <App workspace={info} />;
}
