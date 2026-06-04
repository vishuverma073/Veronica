import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/types.js";

/**
 * Sets Cache-Control on responses (Phase 5) so Cloudflare/Vercel can cache
 * public reads at the edge — even before the Redis layer kicks in.
 *
 * Authenticated surfaces are always `private, no-store`. Public GETs get edge
 * TTLs, but only on 2xx (never cache an error response).
 */
const DETAIL = "public, max-age=60, stale-while-revalidate=300";
const LIST = "public, max-age=30, stale-while-revalidate=120";
const SEARCH = "public, max-age=10, stale-while-revalidate=60";

export const cacheControl = createMiddleware<AppEnv>(async (c, next) => {
  await next();

  const path = c.req.path;

  // Never cache authenticated / sensitive surfaces (regardless of status).
  if (path.startsWith("/me") || path.startsWith("/admin") || path.startsWith("/auth")) {
    c.res.headers.set("Cache-Control", "private, no-store");
    return;
  }
  if (path === "/healthz") {
    c.res.headers.set("Cache-Control", "no-store");
    return;
  }

  // Public caching applies to successful GETs only.
  if (c.req.method !== "GET" || c.res.status < 200 || c.res.status >= 300) return;

  let value: string | null = null;
  if (path.startsWith("/search")) {
    value = SEARCH;
  } else if (path === "/products" || path === "/categories" || path.startsWith("/products/by-category/")) {
    value = LIST;
  } else if (path.startsWith("/products/") || path.startsWith("/categories/")) {
    value = DETAIL;
  }
  if (value) c.res.headers.set("Cache-Control", value);
});
