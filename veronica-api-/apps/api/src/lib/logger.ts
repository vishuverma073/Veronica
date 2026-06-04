import { scrub } from "./sentry.js";

/**
 * Structured logging (Phase 5).
 *
 * `log()` always writes a JSON line to stdout (existing behavior) and, when
 * Axiom is configured (AXIOM_DATASET + AXIOM_TOKEN), also batches lines to
 * Axiom's ingest API via fetch. Secrets are scrubbed and phone numbers masked
 * at the log-function level — not the call site — so it's impossible to forget.
 */
type Level = "debug" | "info" | "warn" | "error";

interface AxiomConfig {
  dataset: string;
  token: string;
}

const buffer: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_BATCH = 100;
const FLUSH_MS = 2000;

function axiomConfig(): AxiomConfig | null {
  const dataset = process.env.AXIOM_DATASET;
  const token = process.env.AXIOM_TOKEN;
  return dataset && token ? { dataset, token } : null;
}

/** Keep country code + first 3 digits, mask the rest: +919350529717 → +91935****. */
function maskPhone(p: string): string {
  return p.length <= 6 ? p : `${p.slice(0, 6)}****`;
}

/** Scrub secrets (reuses Sentry's key matcher) and mask any `phone` field. */
export function maskFields(fields: Record<string, unknown>): Record<string, unknown> {
  const scrubbed = scrub(fields) as Record<string, unknown>;
  if (typeof scrubbed.phone === "string") scrubbed.phone = maskPhone(scrubbed.phone);
  return scrubbed;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: "veronica-api",
    env: process.env.NODE_ENV ?? "development",
    release: process.env.GIT_SHA ?? "dev",
    ...maskFields(fields),
  };
  console.log(JSON.stringify(line));

  const cfg = axiomConfig();
  if (cfg && process.env.NODE_ENV !== "test") {
    buffer.push(line);
    if (buffer.length >= MAX_BATCH) void flushLogs();
    else scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flushLogs(), FLUSH_MS);
  // Don't keep the process alive just to flush logs.
  (flushTimer as { unref?: () => void }).unref?.();
}

/** Flush buffered lines to Axiom. Safe to call on shutdown. */
export async function flushLogs(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const cfg = axiomConfig();
  if (!cfg || buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await fetch(`https://api.axiom.co/v1/datasets/${cfg.dataset}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
  } catch (err) {
    // Logging must never take down the app.
    console.error("axiom_ingest_failed", (err as Error).message);
  }
}
