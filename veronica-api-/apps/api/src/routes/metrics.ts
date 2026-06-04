import { Hono } from "hono";
import { getVisits, incrementVisits } from "../lib/metrics.js";
import type { AppEnv } from "../lib/types.js";

/** Public lifetime visit counter for the storefront footer. */
export function makeMetricsRouter() {
  const router = new Hono<AppEnv>();

  // GET /metrics/visits — current total, no increment.
  router.get("/visits", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ total: await getVisits() });
  });

  // POST /metrics/visits — count a visit (storefront calls this once per browser
  // session) and return the new total.
  router.post("/visits", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ total: await incrementVisits() });
  });

  return router;
}
