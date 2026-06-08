/** Opt-in request tracing — set NEXT_PUBLIC_DEBUG_API=true and restart next dev. */
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_API === "true";

export function logApiFetch(
  phase: "start" | "response" | "parse_error" | "http_error",
  detail: Record<string, unknown>,
): void {
  if (!DEBUG) return;
  console.info(`[veronica-api] ${phase}`, detail);
}
