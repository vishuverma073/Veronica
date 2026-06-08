import { Redis } from "@upstash/redis";

/**
 * Small read-through cache for hot public GETs (Phase 5).
 *
 * Uses Upstash Redis when configured; otherwise an in-process Map with TTL —
 * fine for a single instance (mirrors lib/ratelimit.ts and lib/idempotency.ts).
 * Negative results (null/undefined) are never cached, so a 404 can't get pinned.
 *
 * Redis is best-effort: if Upstash is unreachable the loader still runs and the
 * response is served from Postgres (with in-memory fallback caching).
 */

// ─── in-memory fallback ───
const memStore = new Map<string, { value: unknown; expiresAt: number }>();

// ─── Upstash (lazy) ───
let upstash: Redis | null | undefined;
function getUpstash(): Redis | null {
  if (upstash !== undefined) return upstash;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  upstash = url && token ? new Redis({ url, token }) : null;
  return upstash;
}

export interface CacheResult<T> {
  value: T;
  hit: boolean;
}

async function memCached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const now = Date.now();
  const entry = memStore.get(key);
  if (entry && entry.expiresAt > now) return { value: entry.value as T, hit: true };
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    memStore.set(key, { value: fresh, expiresAt: now + ttlSeconds * 1000 });
  }
  return { value: fresh, hit: false };
}

/**
 * Read `key` from cache, or run `loader` and store its result for `ttlSeconds`.
 * `hit` tells the caller whether it came from cache (for the x-cache header).
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const redis = getUpstash();
  if (redis) {
    try {
      const existing = await redis.get<T>(key);
      if (existing !== null && existing !== undefined) return { value: existing, hit: true };
      const fresh = await loader();
      if (fresh !== null && fresh !== undefined) {
        try {
          await redis.set(key, fresh, { ex: ttlSeconds });
        } catch {
          /* best-effort write — response already loaded from DB */
        }
      }
      return { value: fresh, hit: false };
    } catch {
      /* Redis down or slow — never fail the request; fall back to mem + loader */
    }
  }

  return memCached(key, ttlSeconds, loader);
}

/** Delete exact keys. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = getUpstash();
  if (redis) {
    try {
      await redis.del(...keys);
    } catch {
      /* cache invalidation must not block admin writes */
    }
  }
  for (const k of keys) memStore.delete(k);
}

/** Delete every key starting with `prefix` (Redis SCAN+DEL; Map scan in fallback). */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const redis = getUpstash();
  if (redis) {
    try {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
        cursor = String(next);
        if (keys.length) await redis.del(...keys);
      } while (cursor !== "0");
    } catch {
      /* fall through to mem scan */
    }
  }
  for (const k of [...memStore.keys()]) {
    if (k.startsWith(prefix)) memStore.delete(k);
  }
}

/** Invalidate everything affected by a product write (detail + category lists). */
export async function invalidateProductCaches(slug: string): Promise<void> {
  await invalidate(`product:${slug}`, "categories:root");
  await invalidatePrefix("category-products:");
  await invalidatePrefix("category:");
  await notifyStorefrontRevalidate(["products", `product-${slug}`]);
}

/** Invalidate everything affected by a category write. */
export async function invalidateCategoryCaches(): Promise<void> {
  await invalidate("categories:root");
  await invalidatePrefix("category:");
  await invalidatePrefix("category-products:");
  // A category add/edit/delete changes the nav, footer, sidebar and homepage —
  // all tagged "categories" on the storefront.
  await notifyStorefrontRevalidate(["categories", "products"]);
}

/**
 * Best-effort: ask the Next.js storefront to purge its tagged data cache so
 * admin changes appear immediately instead of waiting out the ISR window.
 * No-ops silently unless REVALIDATE_URL + REVALIDATE_SECRET are configured, and
 * never throws — the storefront still self-heals on its own revalidate window.
 */
export async function notifyStorefrontRevalidate(tags: string[]): Promise<void> {
  const url = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags }),
    });
  } catch {
    // Fail open.
  }
}

/** Test-only: clear the in-memory store between cases. */
export function __clearMemCache(): void {
  memStore.clear();
}
