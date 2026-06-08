import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { logger } from "./middleware/logger.js";
import { cacheControl } from "./middleware/cache-control.js";
import { healthRouter } from "./routes/health.js";
import { makeCategoriesRouter } from "./routes/categories.js";
import { makeProductsRouter } from "./routes/products.js";
import { makeSearchRouter } from "./routes/search.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeMeRouter } from "./routes/me.js";
import { makeCheckoutRouter } from "./routes/checkout.js";
import { makeWebhooksRouter } from "./routes/webhooks.js";
import { makePincodeRouter } from "./routes/pincode.js";
import { makeMetricsRouter } from "./routes/metrics.js";
import { makeInngestRouter } from "./routes/inngest.js";
import { makeAdminAuthRouter } from "./routes/admin/auth.js";
import { makeAdminProductsRouter } from "./routes/admin/products.js";
import { makeAdminCategoriesRouter } from "./routes/admin/categories.js";
import { makePublicHomeRouter } from "./routes/home.js";
import { makeAdminHomeRouter } from "./routes/admin/home.js";
import { makePublicSettingsRouter } from "./routes/settings.js";
import { makeAdminSettingsRouter } from "./routes/admin/settings.js";
import { makeAdminOrdersRouter } from "./routes/admin/orders.js";
import { makeAdminAuditRouter } from "./routes/admin/audit.js";
import { makeAdminUploadsRouter } from "./routes/admin/uploads.js";
import { captureException } from "./lib/sentry.js";
import { alertSlack } from "./lib/alerts.js";
import type { AppEnv } from "./lib/types.js";
import type { DbClient } from "./db/client.js";

export interface AppDeps {
  db: DbClient;
}

/** Build the Hono application with middleware, routes, and error handlers wired in. */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", requestId);
  app.use("*", securityHeaders);

  // CORS: the storefront/admin run on a different origin (localhost:3000 in dev,
  // a real domain in prod) and auth uses credentialed requests (refresh cookie),
  // so we must reflect the caller's origin — a wildcard "*" is illegal with
  // credentials. localhost/127.0.0.1 and private LAN IPs are reflected only OUTSIDE
  // production; in production ONLY the comma-separated CORS_ORIGINS are accepted.
  const isProd = process.env.NODE_ENV === "production";
  const devOrigin =
    /^https?:\/\/((localhost|127\.0\.0\.1)|(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}))(:\d+)?$/;
  const extraOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return origin; // non-browser caller (curl, server-to-server)
        if (!isProd && devOrigin.test(origin)) return origin;
        return extraOrigins.includes(origin) ? origin : null;
      },
      credentials: true,
    }),
  );

  app.use("*", logger);
  app.use("*", cacheControl);

  app.route("/healthz", healthRouter);
  app.route("/categories", makeCategoriesRouter(deps.db));
  app.route("/products", makeProductsRouter(deps.db));
  app.route("/search", makeSearchRouter(deps.db));
  app.route("/auth", makeAuthRouter(deps.db));
  app.route("/me", makeMeRouter(deps.db));
  app.route("/checkout", makeCheckoutRouter(deps.db));
  app.route("/webhooks", makeWebhooksRouter(deps.db));
  app.route("/pincode", makePincodeRouter());
  app.route("/metrics", makeMetricsRouter());
  app.route("/api/inngest", makeInngestRouter(deps.db));
  app.route("/admin/auth", makeAdminAuthRouter(deps.db));
  app.route("/admin/products", makeAdminProductsRouter(deps.db));
  app.route("/admin/categories", makeAdminCategoriesRouter(deps.db));
  app.route("/home", makePublicHomeRouter(deps.db));
  app.route("/admin/home", makeAdminHomeRouter(deps.db));
  app.route("/settings", makePublicSettingsRouter(deps.db));
  app.route("/admin/settings", makeAdminSettingsRouter(deps.db));
  app.route("/admin/orders", makeAdminOrdersRouter(deps.db));
  app.route("/admin/audit-log", makeAdminAuditRouter(deps.db));
  app.route("/admin/uploads", makeAdminUploadsRouter(deps.db));

  // Phase 5 failure drill: an opt-in route that throws, to verify the full
  // Sentry → Axiom → Slack pipeline end to end. Off unless ENABLE_TEST_ERROR=1,
  // so it's never an attack surface in production.
  if (process.env.ENABLE_TEST_ERROR === "1") {
    app.get("/test-error", () => {
      throw new Error("Deliberate test error (Phase 5 failure drill)");
    });
  }

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  app.onError((err, c) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "unhandled_error",
        error: err.message,
        stack: err.stack,
        request_id: c.get("requestId"),
      }),
    );
    captureException(err, { path: c.req.path, requestId: c.get("requestId") });
    void alertSlack("critical", "Unhandled 5xx error", err.message, { path: c.req.path });
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
