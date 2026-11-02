import { useEffect, useRef } from "react";
import type { EventName } from "../types";

const EVENTS: EventName[] = [
  "file.changed",
  "tree.changed",
  "comment.updated",
  "job.started",
  "job.text",
  "job.tool",
  "job.done",
  "job.error",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventHandler = (event: EventName | "connected" | "disconnected", data: any) => void;

/** Assina o stream SSE do servidor. "connected" dispara a cada (re)conexão. */
export function useEvents(handler: EventHandler): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => ref.current("connected", {});
    es.onerror = () => ref.current("disconnected", {});
    for (const name of EVENTS) {
      es.addEventListener(name, (e) => {
        try {
          ref.current(name, JSON.parse((e as MessageEvent).data));
        } catch {
          /* evento malformado */
        }
      });
    }
    return () => es.close();
  }, []);
}
