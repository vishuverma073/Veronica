import crypto from "node:crypto";
import { markProcessedOnce } from "./idempotency.js";

/**
 * Slack alerting (Phase 5).
 *
 * Optional: without SLACK_WEBHOOK_URL every call is a no-op. Same alert (by
 * severity+title) is throttled to once per 5 minutes via the shared
 * markProcessedOnce guard, so a failure loop can't spam #alerts. Never throws
 * into the caller — alerting must not take down the request path.
 */
export type Severity = "info" | "warning" | "critical";

const COLOR: Record<Severity, string> = {
  info: "#2563eb", // blue
  warning: "#f59e0b", // yellow
  critical: "#dc2626", // red
};

const THROTTLE_SECONDS = 5 * 60;

export async function alertSlack(
  severity: Severity,
  title: string,
  body: string,
  fields: Record<string, string | number> = {},
): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || process.env.NODE_ENV === "test") return;

  // Throttle identical alerts (keyed by severity+title).
  const key = `slack:${severity}:${crypto.createHash("sha256").update(title).digest("hex").slice(0, 16)}`;
  if (!(await markProcessedOnce(key, THROTTLE_SECONDS))) return;

  const fieldBlocks = Object.entries(fields).map(([k, v]) => ({
    title: k,
    value: String(v),
    short: true,
  }));

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachments: [
          {
            color: COLOR[severity],
            title: `[${severity.toUpperCase()}] ${title}`,
            text: body,
            fields: fieldBlocks,
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
  } catch (err) {
    console.error("slack_alert_failed", (err as Error).message);
  }
}
