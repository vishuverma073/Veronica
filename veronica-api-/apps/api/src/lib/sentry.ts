import * as Sentry from "@sentry/node";

/**
 * Sentry error tracking (Phase 5).
 *
 * Entirely optional: without SENTRY_DSN every function here is a no-op, so dev
 * and tests run untouched. When the DSN is set, errors are captured with a
 * release tag and a `beforeSend` scrubber that strips secrets/PII.
 */
const SENSITIVE_KEY = /^(password|token|code|code_hash|signature|authorization|otp|secret)$|^razorpay/i;
const REDACTED = "[redacted]";

/** Recursively redact values whose key looks sensitive. Mutates a copy. */
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrub(v, depth + 1);
  }
  return out as unknown as T;
}

/** beforeSend hook — exported for testing. */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) event.request = scrub(event.request);
  if (event.extra) event.extra = scrub(event.extra);
  if (event.contexts) event.contexts = scrub(event.contexts);
  return event;
}

let initialized = false;

/** Initialize Sentry once. No-op when SENTRY_DSN is unset. */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    release: process.env.GIT_SHA ?? "dev",
    environment: process.env.NODE_ENV ?? "development",
    beforeSend: scrubEvent,
  });
}

/** Capture an exception with extra context. No-op without a DSN. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
