import type { Response } from "express";

export type EventName =
  | "file.changed"
  | "tree.changed"
  | "comment.updated"
  | "job.started"
  | "job.text"
  | "job.tool"
  | "job.done"
  | "job.error";

type Listener = (event: EventName, data: unknown) => void;

/** Barramento de eventos: alimenta o stream SSE e os testes. */
export class EventBus {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: EventName, data: unknown = {}): void {
    for (const l of this.listeners) {
      try {
        l(event, data);
      } catch {
        /* um cliente com problema não derruba os outros */
      }
    }
  }

  /** Conecta uma resposta HTTP como cliente SSE. */
  attachSse(res: Response): () => void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");
    const off = this.on((event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    });
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    return () => {
      clearInterval(ping);
      off();
    };
  }
}

/** Atribui a origem (claude, manual ou external) às mudanças vistas pelo watcher. */
export class SourceTracker {
  private recent = new Map<string, { hash: string | null; source: "claude" | "manual"; at: number }>();
  private jobRunning = false;

  setJobRunning(v: boolean): void {
    this.jobRunning = v;
  }

  mark(rel: string, hash: string | null, source: "claude" | "manual"): void {
    this.recent.set(rel, { hash, source, at: Date.now() });
  }

  sourceFor(rel: string, hash: string | null): "claude" | "manual" | "external" {
    const r = this.recent.get(rel);
    if (r && r.hash === hash && Date.now() - r.at < 15000) return r.source;
    if (this.jobRunning) return "claude";
    return "external";
  }
}
