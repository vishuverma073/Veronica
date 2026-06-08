import { Hono } from "hono";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ProductListItemSchema,
  ProductSchema,
  type Product,
  type ProductListItem,
  type ProductStructuredData,
} from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { products, categories } from "../db/schema.js";
import type { AppEnv } from "../lib/types.js";
import { cached } from "../lib/cache.js";
import { extractProductSizes } from "../lib/product-sizes.js";

const PRODUCT_TTL = 300; // 5 min

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type SkuPrice = { price: string; salePrice: string | null; dimensionValues?: Record<string, string> | null };
type ImageRef = { url: string; sortOrder: number };
type DimRef = { name: string; values: { value: string; sortOrder: number }[] };

/** Compute the light list-item shape (price range + best discount + primary image). */
export function toListItem(
  p: {
    id: number;
    categoryId: number;
    name: string;
    slug: string;
    status: "active" | "draft" | "archived";
    isBestseller: boolean;
    isNew: boolean;
    tags: string[];
  },
  skus: SkuPrice[],
  images: ImageRef[],
  dimensions: DimRef[] = [],
): ProductListItem {
  const effective = skus.map((s) => (s.salePrice !== null ? Number(s.salePrice) : Number(s.price)));
  const bases = skus.map((s) => Number(s.price));
  let bestDiscount = 0;
  for (const s of skus) {
    if (s.salePrice !== null) {
      const base = Number(s.price);
      if (base > 0) bestDiscount = Math.max(bestDiscount, Math.round((1 - Number(s.salePrice) / base) * 100));
    }
  }
  const primaryImage = [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
  return {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    status: p.status,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    tags: p.tags,
    image: primaryImage,
    minPrice: effective.length ? Math.min(...effective) : 0,
    maxBasePrice: bases.length ? Math.max(...bases) : 0,
    bestDiscount,
    sizes: extractProductSizes(skus, dimensions),
  };
}

/** Pre-compute schema.org/Product JSON-LD so the FE can render it as-is. */
function buildStructuredData(p: Product): ProductStructuredData {
  const effective = p.skus.map((s) => s.salePrice ?? s.price);
  const minPrice = effective.length ? Math.min(...effective) : 0;
  const inStock = p.skus.some((s) => s.stock === undefined || s.stock === null || s.stock > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: p.images.map((i) => i.url),
    description: p.description,
    brand: { "@type": "Brand", name: "Veronica India" },
    sku: p.skus[0]?.skuCode ?? p.slug,
    offers: {
      "@type": "Offer",
      price: minPrice,
      priceCurrency: "INR",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

const ListQuerySchema = z.object({
  category: z.string().min(1).optional(),
  bestseller: z.string().optional(),
  new: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.coerce.number().int().positive().optional(),
});

export function makeProductsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /products — active products, filterable, id-cursor paginated.
  router.get("/", async (c) => {
    const parsed = ListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", issues: parsed.error.flatten() }, 400);
    }
    const q = parsed.data;

    const conditions = [eq(products.status, "active")];

    // Resolve category slug → id (direct category only; tree expansion is /by-category).
    let categoryId: number | undefined;
    if (q.category) {
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM categories WHERE slug = ${q.category} LIMIT 1`,
      );
      const row = (rows as unknown as { id: number }[])[0];
      if (!row) return c.json({ items: [], nextCursor: null });
      categoryId = Number(row.id);
    }
    if (categoryId !== undefined) conditions.push(eq(products.categoryId, categoryId));
    if (q.bestseller === "1") conditions.push(eq(products.isBestseller, true));
    if (q.new === "1") conditions.push(eq(products.isNew, true));
    if (q.cursor !== undefined) conditions.push(gt(products.id, q.cursor));

    const rows = await db.query.products.findMany({
      where: and(...conditions),
      orderBy: (p, { asc }) => [asc(p.id)],
      limit: q.limit + 1,
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const items = page.map((p) => toListItem(p, p.skus, p.images, p.dimensions));
    const nextCursor = hasMore && page.length ? page[page.length - 1]!.id : null;

    return c.json(
      z
        .object({ items: z.array(ProductListItemSchema), nextCursor: z.number().nullable() })
        .parse({ items, nextCursor }),
    );
  });

  // GET /products/by-category/:slug — active products in the category's whole subtree.
  // (Defined before /:slug; an unknown slug yields an empty list.)
  router.get("/by-category/:slug", async (c) => {
    const slug = c.req.param("slug");
    const q = ListQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

    const [root] = await db
      .select({ id: categories.id, status: categories.status })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (!root || root.status === "archived") {
      return c.json({ items: [], nextCursor: null, total: 0 });
    }

    const treeRows = await db.execute<{ id: number }>(sql`
      WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE slug = ${slug}
        UNION ALL
        SELECT c.id FROM categories c JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT id FROM category_tree
    `);
    const ids = (treeRows as unknown as { id: number }[]).map((r) => Number(r.id));
    if (ids.length === 0) return c.json({ items: [], nextCursor: null, total: 0 });

    const baseWhere = and(eq(products.status, "active"), inArray(products.categoryId, ids));
    const where =
      q.cursor !== undefined ? and(baseWhere, gt(products.id, q.cursor)) : baseWhere;

    const rows = await db.query.products.findMany({
      where,
      orderBy: (p, { asc }) => [asc(p.id)],
      limit: q.limit + 1,
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const items = page.map((p) => toListItem(p, p.skus, p.images, p.dimensions));
    const nextCursor = hasMore && page.length ? page[page.length - 1]!.id : null;

    let total: number | undefined;
    if (q.cursor === undefined) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(baseWhere);
      total = Number(countRow?.count ?? 0);
    }

    return c.json(
      z
        .object({
          items: z.array(ProductListItemSchema),
          nextCursor: z.number().nullable(),
          total: z.number().int().nonnegative().optional(),
        })
        .parse({ items, nextCursor, total }),
    );
  });

  // GET /products/:slug — full active product detail.
  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const { value, hit } = await cached<Product | null>(`product:${slug}`, PRODUCT_TTL, async () => {
      const p = await db.query.products.findFirst({
        where: and(eq(products.slug, slug), eq(products.status, "active")),
        with: {
          images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
          dimensions: {
            orderBy: (d, { asc }) => [asc(d.sortOrder)],
            with: { values: { orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
          },
          skus: { orderBy: (s, { asc }) => [asc(s.id)] },
        },
      });
      if (!p) return null;

      const detail: Product = {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      slug: p.slug,
      description: p.description ?? "",
      status: p.status,
      isBestseller: p.isBestseller,
      isNew: p.isNew,
      tags: p.tags,
      specifications: p.specifications ?? undefined,
      includedAccessories: p.includedAccessories ?? undefined,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? undefined, sortOrder: i.sortOrder })),
      dimensions: p.dimensions.map((d) => ({
        id: d.id,
        name: d.name,
        sortOrder: d.sortOrder,
        values: d.values.map((v) => ({
          id: v.id,
          value: v.value,
          label: v.label ?? undefined,
          sortOrder: v.sortOrder,
        })),
      })),
      skus: p.skus.map((s) => ({
        id: s.id,
        skuCode: s.skuCode,
        price: Number(s.price),
        salePrice: s.salePrice === null ? null : Number(s.salePrice),
        dimensionValues: s.dimensionValues,
        attributes: s.attributes ?? undefined,
        stock: s.stock ?? undefined,
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      };
      return ProductSchema.parse({ ...detail, structuredData: buildStructuredData(detail) });
    });

    if (!value) return c.json({ error: "Not Found" }, 404);
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  return router;
}
