import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function hashContent(content: string): string {
  return crypto.createHash("sha1").update(content, "utf8").digest("hex");
}

export function randomId(prefix: string, bytes = 3): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("hex")}`;
}

/** Data e hora local com fuso, ex.: 2026-11-02T09:55:00-03:00 */
export function nowIso(date = new Date()): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** Uma linha, sem quebras e espaços repetidos, cortada em `max` caracteres. */
export function oneLine(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
