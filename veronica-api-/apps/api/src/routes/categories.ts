import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  CategoryListSchema,
  CategoryWithBreadcrumbSchema,
  type Category,
} from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { categories } from "../db/schema.js";
import type { AppEnv } from "../lib/types.js";
import { cached } from "../lib/cache.js";
import { normalizeImageUrl } from "../lib/normalize-image.js";

const CATEGORY_TTL = 600; // 10 min

type CategoryRow = typeof categories.$inferSelect;

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    image: normalizeImageUrl(row.imageUrl) ?? undefined,
    sortOrder: row.sortOrder,
    showInHeader: row.showInHeader,
    status: row.status,
  };
}

/** Build a category's root-first breadcrumb chain + direct children. */
async function buildCategoryDetail(db: DbClient, category: CategoryRow) {
  // Walk parent_id up to root (capped at 10 hops to guard against bad-data cycles).
  const chain: CategoryRow[] = [category];
  let current = category;
  for (let hops = 0; current.parentId !== null && hops < 10; hops++) {
    const [parent] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, current.parentId))
      .limit(1);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }

  const children = await db
    .select()
    .from(categories)
    .where(and(eq(categories.parentId, category.id), eq(categories.status, "active")))
    .orderBy(asc(categories.sortOrder));

  return CategoryWithBreadcrumbSchema.parse({
    ...mapCategory(category),
    breadcrumb: chain.map(mapCategory),
    children: children.map(mapCategory),
  });
}

export function makeCategoriesRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /categories — root categories (parent_id IS NULL), ordered by sort_order.
  router.get("/", async (c) => {
    const { value, hit } = await cached("categories:root", CATEGORY_TTL, async () => {
      const rows = await db
        .select()
        .from(categories)
        .where(and(isNull(categories.parentId), eq(categories.status, "active")))
        .orderBy(asc(categories.sortOrder));
      return CategoryListSchema.parse(rows.map(mapCategory));
    });
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  // GET /categories/all — flat list of every active category (for nav trees, sitemap).
  router.get("/all", async (c) => {
    const { value, hit } = await cached("categories:all", CATEGORY_TTL, async () => {
      const rows = await db
        .select()
        .from(categories)
        .where(eq(categories.status, "active"))
        .orderBy(asc(categories.sortOrder));
      return CategoryListSchema.parse(rows.map(mapCategory));
    });
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  // GET /categories/by-id/:id — same detail as /:slug but by numeric id. The PDP
  // only knows a product's categoryId, so it needs this to build breadcrumbs.
  // Registered before /:slug so "by-id" isn't swallowed as a slug.
  router.get("/by-id/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const { value, hit } = await cached(`category:id:${id}`, CATEGORY_TTL, async () => {
      const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
      if (!category || category.status === "archived") return null;
      return buildCategoryDetail(db, category);
    });

    if (!value) return c.json({ error: "Not Found" }, 404);
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  // GET /categories/:slug — single category with root-first breadcrumb + direct children.
  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const { value, hit } = await cached(`category:${slug}`, CATEGORY_TTL, async () => {
      const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
      if (!category || category.status === "archived") return null;
      return buildCategoryDetail(db, category);
    });

    if (!value) return c.json({ error: "Not Found" }, 404);
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  return router;
}
