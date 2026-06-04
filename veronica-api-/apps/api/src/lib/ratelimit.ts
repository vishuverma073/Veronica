import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isDevAuthBypass } from "./dev-bypass.js";

/**
 * Rate limiting. Two flavours:
 *  - checkOtpLimit: OTP *send* (1/phone/60s, 5/phone/hour) — skipped under the
 *    dev-auth bypass so local OTP testing isn't throttled.
 *  - rateLimit: a generic sliding window for brute-force protection on other
 *    sensitive endpoints (admin login, OTP verify). Always enforced except in
 *    the test runner, so the protection is real in dev/prod and testable by hand.
 *
 * Uses Upstash (distributed) when UPSTASH_REDIS_REST_URL/TOKEN are set; otherwise
 * an in-process sliding window (per-instance — fine for a single machine).
 */
const PER_MINUTE = { limit: 1, windowMs: 60_000 };
const PER_HOUR = { limit: 5, windowMs: 3_600_000 };

// ─── in-memory fallback ───
const memHits = new Map<string, number[]>();
function memCheck(key: string, limit: number, windowMs: number, now: number): number {
  const recent = (memHits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    return Math.ceil((recent[0]! + windowMs - now) / 1000); // retry-after seconds
  }
  recent.push(now);
  memHits.set(key, recent);
  return 0;
}

// ─── Upstash (lazy) ───
let redisClient: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

let otpLimiters: { minute: Ratelimit; hour: Ratelimit } | null | undefined;
function getOtpLimiters() {
  if (otpLimiters !== undefined) return otpLimiters;
  const redis = getRedis();
  otpLimiters = redis
    ? {
        minute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(PER_MINUTE.limit, "60 s"), prefix: "otp:60s" }),
        hour: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(PER_HOUR.limit, "1 h"), prefix: "otp:1h" }),
      }
    : null;
  return otpLimiters;
}

// Generic limiters, one per (limit, windowSec) config. The prefix embeds the
// config so two callers can reuse the same id under different budgets safely.
const genericLimiters = new Map<string, Ratelimit>();
function getGenericLimiter(limit: number, windowSec: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key = `${limit}:${windowSec}`;
  let l = genericLimiters.get(key);
  if (!l) {
    l = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`), prefix: `rl:${key}` });
    genericLimiters.set(key, l);
  }
  return l;
}

export async function checkOtpLimit(phone: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // The OTP is stubbed to the server log in local dev (no real SMS, no cost), so
  // the abuse limiter only gets in the way of testing the send/resend flow.
  // Skipped only under the explicit dev bypass; prod and tests keep 1/min + 5/hour.
  if (isDevAuthBypass()) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const u = getOtpLimiters();
  if (u) {
    const minute = await u.minute.limit(phone);
    if (!minute.success) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((minute.reset - Date.now()) / 1000)) };
    }
    const hour = await u.hour.limit(phone);
    if (!hour.success) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((hour.reset - Date.now()) / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const minuteRetry = memCheck(`otp:60s:${phone}`, PER_MINUTE.limit, PER_MINUTE.windowMs, now);
  if (minuteRetry > 0) return { allowed: false, retryAfterSeconds: minuteRetry };
  const hourRetry = memCheck(`otp:1h:${phone}`, PER_HOUR.limit, PER_HOUR.windowMs, now);
  if (hourRetry > 0) return { allowed: false, retryAfterSeconds: hourRetry };
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Generic sliding-window limiter for brute-force protection. Consumes one token
 * per call — call it ONLY on failed attempts so legitimate (successful) requests
 * are never penalized. `id` should be namespaced by the caller, e.g.
 * `admin-login:<email>`. Disabled under the test runner so unit tests are stable.
 */
export async function rateLimit(
  id: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (process.env.NODE_ENV === "test") return { allowed: true, retryAfterSeconds: 0 };

  const limiter = getGenericLimiter(limit, windowSec);
  if (limiter) {
    const r = await limiter.limit(id);
    return r.success
      ? { allowed: true, retryAfterSeconds: 0 }
      : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  }
  const retry = memCheck(`rl:${windowSec}:${id}`, limit, windowSec * 1000, Date.now());
  return retry > 0 ? { allowed: false, retryAfterSeconds: retry } : { allowed: true, retryAfterSeconds: 0 };
}
