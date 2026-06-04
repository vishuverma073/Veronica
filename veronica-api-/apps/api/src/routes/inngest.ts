import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "../inngest/client.js";
import { makeOrderPaid } from "../inngest/functions/order-paid.js";
import { makeReconcilePending } from "../inngest/functions/reconcile-pending.js";
import type { DbClient } from "../db/client.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Serves the Inngest functions at /api/inngest — the URL Inngest Cloud (or the
 * local `inngest-cli dev` server) calls to introspect and invoke them.
 */
export function makeInngestRouter(db: DbClient) {
  const handler = serve({
    client: inngest,
    functions: [makeOrderPaid(db), makeReconcilePending(db)],
  });
  const router = new Hono<AppEnv>();
  router.all("/", (c) => handler(c));
  return router;
}
