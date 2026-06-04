import { Redis } from "@upstash/redis";

/**
 * "Process this key at most once" guard, used to dedupe Razorpay webhook events
 * by `event.id` (Phase 4).
 *
 * Uses Upstash (distributed, survives restarts) when configured; otherwise an
 * in-process Map with TTL eviction — fine for a single instance, and Phase 5
 * standardizes on Upstash everywhere. Mirrors the pattern in lib/ratelimit.ts.
 */
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ─── in-memory fallback ───
const memSeen = new Map<string, number>(); // key → expiry epoch ms
function memMarkOnce(key: string, ttlSeconds: number, now: number): boolean {
  const existing = memSeen.get(key);
  if (existing !== undefined && existing > now) return false;
  // Opportunistic cleanup so the map can't grow unbounded.
  if (memSeen.size > 5000) {
    for (const [k, exp] of memSeen) if (exp <= now) memSeen.delete(k);
  }
  memSeen.set(key, now + ttlSeconds * 1000);
  return true;
}

// ─── Upstash (lazy) ───
let upstash: Redis | null | undefined;
function getUpstash(): Redis | null {
  if (upstash !== undefined) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  upstash = url && token ? new Redis({ url, token }) : null;
  return upstash;
}

/**
 * Atomically mark `key` as processed. Returns true if this is the first time
 * (caller should process), false if it was already seen (caller should skip).
 */
export async function markProcessedOnce(
  key: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  const redis = getUpstash();
  if (redis) {
    // SET key 1 NX EX ttl → "OK" when newly set, null when it already existed.
    const result = await redis.set(key, "1", { nx: true, ex: ttlSeconds });
    return result === "OK";
  }
  return memMarkOnce(key, ttlSeconds, Date.now());
}
