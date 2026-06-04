import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HomeConfigSchema, type HomeSection } from "@veronica/contracts";
import type { DbClient } from "../../db/client.js";
import { homeConfig } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { DEFAULT_HOME_SECTIONS } from "../../lib/home-defaults.js";
import type { AppEnv } from "../../lib/types.js";

export function makeAdminHomeRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/home — raw config (includes disabled sections) for editing.
  // Falls back to the default layout when nothing has been saved yet, so the
  // composer always opens on a sensible starting point.
  router.get("/", async (c) => {
    const [row] = await db.select().from(homeConfig).where(eq(homeConfig.id, 1)).limit(1);
    const sections = (row?.sections as HomeSection[] | undefined) ?? [];
    return c.json(HomeConfigSchema.parse({ sections: sections.length > 0 ? sections : DEFAULT_HOME_SECTIONS }));
  });

  // PUT /admin/home — atomic replace of the whole config (upsert: the singleton
  // row may not exist yet on a fresh install).
  router.put("/", async (c) => {
    const parsed = HomeConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const adminUserId = c.get("adminUserId") ?? null;
    const [before] = await db.select().from(homeConfig).where(eq(homeConfig.id, 1)).limit(1);

    await db
      .insert(homeConfig)
      .values({ id: 1, sections: parsed.data.sections, updatedAt: new Date(), updatedBy: adminUserId })
      .onConflictDoUpdate({
        target: homeConfig.id,
        set: { sections: parsed.data.sections, updatedAt: new Date(), updatedBy: adminUserId },
      });

    await logAudit(db, {
      actorUserId: adminUserId,
      action: "home_config.update",
      resourceType: "home_config",
      resourceId: "1",
      changes: { before: before?.sections, after: parsed.data.sections },
    });
    return c.json(HomeConfigSchema.parse(parsed.data));
  });

  return router;
}
