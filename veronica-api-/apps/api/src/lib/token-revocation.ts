import { Redis } from "@upstash/redis";

/**
 * Refresh-token revocation list (Phase 5/6).
 *
 * On logout we blacklist the token's `jti` so a leaked-but-unexpired refresh
 * token can't be exchanged for new access tokens. Entries live for the
 * remaining lifetime of the refresh token (TTL); after that the token is
 * expired anyway and the entry is reclaimed automatically.
 *
 * Uses Upstash when configured; otherwise an in-process Map with TTL eviction —
 * fine for a single instance. Mirrors the fallback pattern in lib/idempotency.ts.
 */

// ─── in-memory fallback ───
const memRevoked = new Map<string, number>(); // jti → expiry epoch ms

function memIsRevoked(jti: string, now: number): boolean {
  const exp = memRevoked.get(jti);
  if (exp === undefined) return false;
  if (exp <= now) {
    memRevoked.delete(jti);
    return false;
  }
  return true;
}

function memRevoke(jti: string, ttlSeconds: number, now: number): void {
  // Opportunistic cleanup so the map can't grow unbounded.
  if (memRevoked.size > 5000) {
    for (const [k, exp] of memRevoked) if (exp <= now) memRevoked.delete(k);
  }
  memRevoked.set(jti, now + ttlSeconds * 1000);
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

const keyOf = (jti: string) => `revoked:jti:${jti}`;

/** Blacklist a refresh-token jti for `ttlSeconds` (its remaining lifetime). */
export async function revokeJti(jti: string, ttlSeconds: number): Promise<void> {
  const redis = getUpstash();
  if (redis) {
    await redis.set(keyOf(jti), "1", { ex: ttlSeconds });
    return;
  }
  memRevoke(jti, ttlSeconds, Date.now());
}

/** True if this jti has been revoked — a refresh carrying it must be rejected. */
export async function isJtiRevoked(jti: string): Promise<boolean> {
  const redis = getUpstash();
  if (redis) {
    return (await redis.get(keyOf(jti))) !== null;
  }
  return memIsRevoked(jti, Date.now());
}

/** Test-only: clear the in-memory revocation list between cases. */
export function __clearRevoked(): void {
  memRevoked.clear();
}
