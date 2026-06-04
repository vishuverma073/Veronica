import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/types.js";

/**
 * Baseline security headers for the API. It serves only JSON (no HTML/scripts),
 * so a deny-all CSP is safe and shuts off clickjacking + MIME-sniffing. HSTS is
 * sent only in production — on plain-http localhost browsers ignore it, and a
 * stray rule could wrongly pin http→https during dev.
 */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === "production") {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});
