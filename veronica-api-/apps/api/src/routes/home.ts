import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HomeConfigSchema, type HomeSection } from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { homeConfig } from "../db/schema.js";
import { DEFAULT_HOME_SECTIONS } from "../lib/home-defaults.js";
import type { AppEnv } from "../lib/types.js";

/** Public storefront home config: enabled sections only, schedule-aware, sorted. */
export function makePublicHomeRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  router.get("/", async (c) => {
    const [row] = await db.select().from(homeConfig).where(eq(homeConfig.id, 1)).limit(1);
    // Until an admin saves a custom layout, serve the default one.
    const stored = (row?.sections ?? []) as HomeSection[];
    const sections = stored.length > 0 ? stored : DEFAULT_HOME_SECTIONS;
    const now = Date.now();

    const visible = sections
      .filter((s) => s.enabled)
      .filter((s) => {
        if (s.key === "hero") {
          if (s.config.showFrom && new Date(s.config.showFrom).getTime() > now) return false;
          if (s.config.showTo && new Date(s.config.showTo).getTime() < now) return false;
        }
        return true;
      })
      .sort((a, b) => a.order - b.order);

    c.header("Cache-Control", "public, max-age=300");
    return c.json(HomeConfigSchema.parse({ sections: visible }));
  });

  return router;
}
