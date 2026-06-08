import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { DbClient } from "../../db/client.js";
import { auditLog, users } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import type { AppEnv } from "../../lib/types.js";

const LIMIT = 50;

/** Audit-log viewer. Read-only; filterable; id-desc cursor pagination. */
export function makeAdminAuditRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  router.get("/", async (c) => {
    const q = c.req.query();
    const conditions = [];
    if (q.actor_user_id) conditions.push(eq(auditLog.actorUserId, q.actor_user_id));
    if (q.resource_type) conditions.push(eq(auditLog.resourceType, q.resource_type));
    if (q.resource_id) conditions.push(eq(auditLog.resourceId, q.resource_id));
    if (q.from) conditions.push(gte(auditLog.createdAt, new Date(q.from)));
    if (q.to) conditions.push(lte(auditLog.createdAt, new Date(q.to)));
    if (q.cursor && Number.isInteger(Number(q.cursor))) {
      conditions.push(lt(auditLog.id, Number(q.cursor)));
    }

    const rows = await db
      .select()
      .from(auditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(LIMIT + 1);

    const hasMore = rows.length > LIMIT;
    const pageRows = rows.slice(0, LIMIT);
    const actorIds = [
      ...new Set(pageRows.map((r) => r.actorUserId).filter((id): id is string => id != null)),
    ];
    const actorEmails =
      actorIds.length > 0
        ? await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, actorIds))
        : [];
    const emailById = new Map(actorEmails.map((u) => [u.id, u.email]));

    const items = pageRows.map((r) => ({
      id: Number(r.id),
      actorUserId: r.actorUserId,
      actorEmail: r.actorUserId ? (emailById.get(r.actorUserId) ?? null) : null,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      changes: r.changes ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    const last = items[items.length - 1];
    return c.json({ items, nextCursor: hasMore && last ? String(last.id) : null });
  });

  return router;
}
