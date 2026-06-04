import { Redis } from "@upstash/redis";

/**
 * Lifetime site-visit counter (shown in the storefront footer). Backed by an
 * atomic Upstash INCR when configured; otherwise an in-process counter that
 * resets on restart — fine for local dev, but production needs Upstash to
 * persist the total. Mirrors the lazy-Redis pattern in token-revocation.ts.
 */
const KEY = "site:visits:total";

let upstash: Redis | null | undefined;
function getUpstash(): Redis | null {
  if (upstash !== undefined) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  upstash = url && token ? new Redis({ url, token }) : null;
  return upstash;
}

let memCount = 0; // fallback only (per-instance)

/** Atomically increment the lifetime visit total and return the new value. */
export async function incrementVisits(): Promise<number> {
  const redis = getUpstash();
  if (redis) return await redis.incr(KEY);
  return ++memCount;
}

/** Read the lifetime visit total without incrementing. */
export async function getVisits(): Promise<number> {
  const redis = getUpstash();
  if (redis) return Number((await redis.get<number>(KEY)) ?? 0);
  return memCount;
}
