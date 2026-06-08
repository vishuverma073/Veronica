import { Hono } from "hono";
import { and, asc, count, eq, isNotNull, ne } from "drizzle-orm";
import {
  AdminCategoryCreateSchema,
  AdminCategoryListSchema,
  AdminCategoryPatchSchema,
  CategorySchema,
} from "@veronica/contracts";
import type { DbClient } from "../../db/client.js";
import { categories, products } from "../../db/schema.js";
import {
  archiveCategorySubtree,
  deleteCategorySubtree,
  restoreCategorySubtree,
} from "../../lib/category-tree.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { invalidateCategoryCaches } from "../../lib/cache.js";
import { slugify } from "../../lib/slug.js";
import { normalizeImageUrl } from "../../lib/normalize-image.js";
import { buildCategoryProductCounts } from "../../lib/category-products.js";
import type { AppEnv } from "../../lib/types.js";

type CategoryRow = typeof categories.$inferSelect;

function mapCategory(row: CategoryRow) {
  return CategorySchema.parse({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    image: normalizeImageUrl(row.imageUrl) ?? undefined,
    sortOrder: row.sortOrder,
    showInHeader: row.showInHeader,
    status: row.status,
  });
}

async function uniqueCategorySlug(db: DbClient, base: string, excludeId?: number): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now()}`;
}

async function wouldCreateCycle(db: DbClient, editId: number, proposedParentId: number): Promise<boolean> {
  let current: number | null = proposedParentId;
  const seen = new Set<number>();
  while (current !== null) {
    if (current === editId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const [row]: { parentId: number | null }[] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, current))
      .limit(1);
    if (!row) break;
    current = row.parentId;
  }
  return false;
}

function postgresErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else if (typeof cur === "string") {
      parts.push(cur);
      break;
    } else {
      break;
    }
  }
  return parts.join(" ");
}

function categoryWriteError(c: { json: (body: unknown, status?: number) => Response }, err: unknown) {
  const text = postgresErrorText(err);
  if (/categories_slug_unique|duplicate key.*slug/i.test(text)) {
    return c.json(
      { error: "Duplicate slug", message: "That URL slug is already used by another category" },
      409,
    );
  }
  return null;
}

export function makeAdminCategoriesRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  router.get("/", async (c) => {
    const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
    const childRows = await db
      .select({ parentId: categories.parentId, n: count() })
      .from(categories)
      .where(isNotNull(categories.parentId))
      .groupBy(categories.parentId);
    const prodRows = await db
      .select({ categoryId: products.categoryId, n: count() })
      .from(products)
      .where(ne(products.status, "archived"))
      .groupBy(products.categoryId);

    const childMap = new Map(childRows.map((r) => [r.parentId, Number(r.n)]));
    const directMap = new Map(prodRows.map((r) => [r.categoryId, Number(r.n)]));
    const { direct, subtree } = buildCategoryProductCounts(cats, directMap);

    const items = cats.map((row) => ({
      ...mapCategory(row),
      childCount: childMap.get(row.id) ?? 0,
      productCount: direct.get(row.id) ?? 0,
      subtreeProductCount: subtree.get(row.id) ?? 0,
    }));
    return c.json(AdminCategoryListSchema.parse(items));
  });

  router.post("/", async (c) => {
    const parsed = AdminCategoryCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    if (body.parentId !== null) {
      const [parent] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, body.parentId))
        .limit(1);
      if (!parent) return c.json({ error: "Parent category not found" }, 400);
    }

    const slug = await uniqueCategorySlug(db, body.slug ?? slugify(body.name));
    let row: CategoryRow;
    try {
      const inserted = await db
        .insert(categories)
        .values({
          name: body.name,
          slug,
          parentId: body.parentId,
          description: body.description,
          imageUrl: normalizeImageUrl(body.image),
          sortOrder: body.sortOrder,
          showInHeader: body.showInHeader,
          status: "active",
        })
        .returning();
      const created = inserted[0];
      if (!created) return c.json({ error: "Failed to create category" }, 500);
      row = created;
    } catch (err) {
      const mapped = categoryWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }
    const category = mapCategory(row);

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.create",
      resourceType: "category",
      resourceId: String(category.id),
      changes: { after: category },
    });
    await invalidateCategoryCaches();
    return c.json(category, 201);
  });

  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const parsed = AdminCategoryPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not Found" }, 404);

    if (body.parentId !== undefined && body.parentId !== null) {
      const [parent] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, body.parentId))
        .limit(1);
      if (!parent) return c.json({ error: "Parent category not found" }, 400);
      if (body.parentId === id || (await wouldCreateCycle(db, id, body.parentId))) {
        return c.json({ error: "parentId would create a cycle in the category tree" }, 400);
      }
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.slug !== undefined) update.slug = await uniqueCategorySlug(db, body.slug, id);
    if (body.parentId !== undefined) update.parentId = body.parentId;
    if (body.description !== undefined) update.description = body.description;
    if (body.image !== undefined) update.imageUrl = normalizeImageUrl(body.image);
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;
    if (body.showInHeader !== undefined) update.showInHeader = body.showInHeader;

    let row: CategoryRow;
    try {
      const updated = await db.update(categories).set(update).where(eq(categories.id, id)).returning();
      const patched = updated[0];
      if (!patched) return c.json({ error: "Failed to update category" }, 500);
      row = patched;
    } catch (err) {
      const mapped = categoryWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }
    const after = mapCategory(row);

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.update",
      resourceType: "category",
      resourceId: String(id),
      changes: { before: mapCategory(existing), after },
    });
    await invalidateCategoryCaches();
    return c.json(after);
  });

  router.post("/:id/archive", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not Found" }, 404);

    const affected = await archiveCategorySubtree(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.archive",
      resourceType: "category",
      resourceId: String(id),
      changes: { before: mapCategory(existing), after: { affectedCategoryIds: affected } },
    });
    await invalidateCategoryCaches();
    return c.json({ success: true, id, status: "archived", affectedCategoryIds: affected });
  });

  router.post("/:id/restore", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not Found" }, 404);

    const affected = await restoreCategorySubtree(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.restore",
      resourceType: "category",
      resourceId: String(id),
      changes: { before: mapCategory(existing), after: { affectedCategoryIds: affected } },
    });
    await invalidateCategoryCaches();
    return c.json({ success: true, id, status: "active", affectedCategoryIds: affected });
  });

  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not Found" }, 404);

    const deletedIds = await deleteCategorySubtree(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.delete",
      resourceType: "category",
      resourceId: String(id),
      changes: { before: mapCategory(existing), after: { deletedCategoryIds: deletedIds } },
    });
    await invalidateCategoryCaches();
    return c.json({ success: true, id, deletedCategoryIds: deletedIds });
  });

  return router;
}
