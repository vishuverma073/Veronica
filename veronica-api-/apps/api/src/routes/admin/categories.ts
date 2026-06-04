import { Hono } from "hono";
import { asc, count, eq, isNotNull } from "drizzle-orm";
import {
  AdminCategoryCreateSchema,
  AdminCategoryListSchema,
  AdminCategoryPatchSchema,
  CategorySchema,
} from "@veronica/contracts";
import type { DbClient } from "../../db/client.js";
import { categories, products } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { invalidateCategoryCaches } from "../../lib/cache.js";
import { slugify } from "../../lib/slug.js";
import type { AppEnv } from "../../lib/types.js";

type CategoryRow = typeof categories.$inferSelect;

function mapCategory(row: CategoryRow) {
  return CategorySchema.parse({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    image: row.imageUrl ?? undefined,
    sortOrder: row.sortOrder,
    showInHeader: row.showInHeader,
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

/** Walk up from proposedParentId; a cycle exists if we reach editId. */
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

export function makeAdminCategoriesRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/categories — flat list + childCount + productCount per node.
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
      .groupBy(products.categoryId);

    const childMap = new Map(childRows.map((r) => [r.parentId, Number(r.n)]));
    const prodMap = new Map(prodRows.map((r) => [r.categoryId, Number(r.n)]));

    const items = cats.map((row) => ({
      ...mapCategory(row),
      childCount: childMap.get(row.id) ?? 0,
      productCount: prodMap.get(row.id) ?? 0,
    }));
    return c.json(AdminCategoryListSchema.parse(items));
  });

  // POST /admin/categories
  router.post("/", async (c) => {
    const parsed = AdminCategoryCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    if (body.parentId !== null) {
      const [parent] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, body.parentId)).limit(1);
      if (!parent) return c.json({ error: "Parent category not found" }, 400);
    }

    const slug = body.slug ?? (await uniqueCategorySlug(db, slugify(body.name)));
    const [row] = await db
      .insert(categories)
      .values({
        name: body.name,
        slug,
        parentId: body.parentId,
        description: body.description,
        imageUrl: body.image ?? null,
        sortOrder: body.sortOrder,
        showInHeader: body.showInHeader,
      })
      .returning();
    const category = mapCategory(row!);

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

  // PATCH /admin/categories/:id
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
    if (body.slug !== undefined) update.slug = body.slug;
    if (body.parentId !== undefined) update.parentId = body.parentId;
    if (body.description !== undefined) update.description = body.description;
    if (body.image !== undefined) update.imageUrl = body.image;
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;
    if (body.showInHeader !== undefined) update.showInHeader = body.showInHeader;

    const [row] = await db.update(categories).set(update).where(eq(categories.id, id)).returning();
    const after = mapCategory(row!);

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

  // DELETE /admin/categories/:id — blocked if it has children OR products.
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not Found" }, 404);

    const childRows = await db
      .select({ n: count() })
      .from(categories)
      .where(eq(categories.parentId, id));
    const productRows = await db
      .select({ n: count() })
      .from(products)
      .where(eq(products.categoryId, id));
    const childCount = Number(childRows[0]?.n ?? 0);
    const productCount = Number(productRows[0]?.n ?? 0);

    if (childCount > 0 || productCount > 0) {
      // 409 Conflict (not 400): the request is well-formed but blocked by
      // dependencies. The admin UI keys off 409 to show a helpful message.
      return c.json(
        {
          error: "Category cannot be deleted while it has subcategories or products",
          childCount: Number(childCount),
          productCount: Number(productCount),
        },
        409,
      );
    }

    await db.delete(categories).where(eq(categories.id, id));
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "category.delete",
      resourceType: "category",
      resourceId: String(id),
      changes: { before: mapCategory(existing) },
    });
    await invalidateCategoryCaches();
    return c.json({ success: true, id });
  });

  return router;
}
