import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { users } from "../db/schema.js";
import { verifyAccess, verifyAdminAccess } from "../lib/jwt.js";
import type { AdminUserRecord, AppEnv } from "../lib/types.js";

/**
 * Re-check `is_admin` on every admin request (don't trust the JWT alone), but
 * cache the DB lookup for 60s to avoid a query per request.
 *
 * The cache is a simple in-process TTL map standing in for Redis until Phase 5
 * wires Upstash. It's skipped entirely when LOG_LEVEL=debug for easy local
 * testing (per agent council).
 */
const ADMIN_CACHE_TTL_MS = 60_000;
const adminCache = new Map<string, { value: AdminUserRecord | null; expiresAt: number }>();

function cacheGet(userId: string, nowMs: number): AdminUserRecord | null | undefined {
  const hit = adminCache.get(userId);
  if (!hit) return undefined;
  if (nowMs > hit.expiresAt) {
    adminCache.delete(userId);
    return undefined;
  }
  return hit.value;
}

function cacheSet(userId: string, value: AdminUserRecord | null, nowMs: number): void {
  adminCache.set(userId, { value, expiresAt: nowMs + ADMIN_CACHE_TTL_MS });
}

export function makeRequireAdmin(db: DbClient) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let sub: string;
    try {
      ({ sub } = await verifyAdminAccess(token));
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const skipCache = process.env.LOG_LEVEL === "debug";
    const now = Date.now();
    let record: AdminUserRecord | null | undefined = skipCache ? undefined : cacheGet(sub, now);

    if (record === undefined) {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          isAdmin: users.isAdmin,
        })
        .from(users)
        .where(eq(users.id, sub))
        .limit(1);
      record = row ?? null;
      if (!skipCache) cacheSet(sub, record, now);
    }

    if (!record || record.isAdmin !== true) {
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("adminUserId", record.id);
    c.set("adminUser", record);
    await next();
  });
}

/**
 * Gate a route by a valid customer access JWT (Phase 3). Sets `userId` and
 * `isAdmin` on the context. Distinct from makeRequireAdmin, which uses the
 * separate admin-panel JWT.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { sub, isAdmin } = await verifyAccess(token);
    c.set("userId", sub);
    c.set("isAdmin", isAdmin);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
