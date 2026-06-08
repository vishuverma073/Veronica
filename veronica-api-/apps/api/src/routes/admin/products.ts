import { Hono } from "hono";
import { and, eq, ilike, inArray, lt, ne, or } from "drizzle-orm";
import {
  AdminProductCreateSchema,
  AdminProductDetailSchema,
  AdminProductListSchema,
  AdminProductPatchSchema,
  ProductStatusSchema,
  type AdminProductDetail,
} from "@veronica/contracts";
import type { DbClient } from "../../db/client.js";
import {
  products,
  productImages,
  dimensions as dimensionsTable,
  dimensionValues as dimensionValuesTable,
  skus as skusTable,
} from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { invalidateProductCaches } from "../../lib/cache.js";
import { slugify } from "../../lib/slug.js";
import { getProductCategoryIdsForTree } from "../../lib/category-products.js";
import type { AppEnv } from "../../lib/types.js";

type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type ProductChildren = {
  images?: { url: string; alt?: string; sortOrder: number }[];
  dimensions?: { name: string; sortOrder: number; values: { value: string; label?: string; sortOrder: number }[] }[];
  skus?: {
    skuCode: string;
    price: number;
    salePrice: number | null;
    dimensionValues: Record<string, string>;
    attributes?: Record<string, string>;
    stock?: number | null;
  }[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function encodeCursor(updatedAt: Date, id: number): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { updatedAt: Date; id: number } | null {
  try {
    const [iso, idStr] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const id = Number(idStr);
    if (!iso || !Number.isInteger(id)) return null;
    return { updatedAt: new Date(iso), id };
  } catch {
    return null;
  }
}

async function uniqueSlug(db: DbClient | Tx, base: string, excludeId?: number): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, candidate))
      .limit(1);
    if (!existing.length || existing[0]!.id === excludeId) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now()}`;
}

async function ensureUniqueSkuCode(
  tx: Tx,
  base: string,
  reserved: Set<string> = new Set(),
): Promise<string> {
  const trimmed = base.trim() || "SKU";
  let candidate = trimmed.slice(0, 80);
  for (let n = 0; n < 100; n++) {
    const [row] = await tx
      .select({ id: skusTable.id })
      .from(skusTable)
      .where(eq(skusTable.skuCode, candidate))
      .limit(1);
    if (!row && !reserved.has(candidate)) return candidate;
    const suffix = n === 0 ? "-2" : `-${n + 2}`;
    candidate = `${trimmed.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
  }
  return `${trimmed.slice(0, 60)}-${Date.now()}`;
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

function productWriteError(c: { json: (body: unknown, status?: number) => Response }, err: unknown) {
  const text = postgresErrorText(err);
  if (/numeric field overflow|22003/i.test(text)) {
    return c.json(
      { error: "Invalid price", message: "Price must be at most ₹99,999,999.99" },
      400,
    );
  }
  if (/skus_sku_code_unique|duplicate key.*sku_code/i.test(text)) {
    return c.json(
      {
        error: "Duplicate SKU code",
        message: "Each SKU code must be unique across the store",
      },
      400,
    );
  }
  if (/products_category_id_fkey|foreign key.*category/i.test(text)) {
    return c.json({ error: "Invalid category", message: "Choose a valid category" }, 400);
  }
  return null;
}

async function replaceChildren(tx: Tx, productId: number, body: ProductChildren): Promise<void> {
  const existingDims = await tx
    .select({ id: dimensionsTable.id })
    .from(dimensionsTable)
    .where(eq(dimensionsTable.productId, productId));
  const dimIds = existingDims.map((d) => d.id);
  if (dimIds.length) {
    await tx.delete(dimensionValuesTable).where(
      or(...dimIds.map((id) => eq(dimensionValuesTable.dimensionId, id))),
    );
  }
  await tx.delete(dimensionsTable).where(eq(dimensionsTable.productId, productId));
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  await tx.delete(skusTable).where(eq(skusTable.productId, productId));

  if (body.images?.length) {
    await tx.insert(productImages).values(
      body.images.map((img) => ({
        productId,
        url: img.url,
        alt: img.alt ?? null,
        sortOrder: img.sortOrder,
      })),
    );
  }
  for (const d of body.dimensions ?? []) {
    const [drow] = await tx
      .insert(dimensionsTable)
      .values({ productId, name: d.name, sortOrder: d.sortOrder })
      .returning({ id: dimensionsTable.id });
    if (d.values.length) {
      await tx.insert(dimensionValuesTable).values(
        d.values.map((v) => ({
          dimensionId: drow!.id,
          value: v.value,
          label: v.label ?? null,
          sortOrder: v.sortOrder,
        })),
      );
    }
  }
  if (body.skus?.length) {
    const reserved = new Set<string>();
    const rows = [];
    for (const s of body.skus) {
      const skuCode = await ensureUniqueSkuCode(tx, s.skuCode, reserved);
      reserved.add(skuCode);
      rows.push({
        productId,
        skuCode,
        price: String(s.price),
        salePrice: s.salePrice === null || s.salePrice === undefined ? null : String(s.salePrice),
        dimensionValues: s.dimensionValues,
        attributes: s.attributes ?? null,
        stock: s.stock ?? null,
      });
    }
    await tx.insert(skusTable).values(rows);
  }
}

async function getProductDetail(db: DbClient, id: number): Promise<AdminProductDetail | null> {
  const p = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      category: { columns: { name: true } },
      images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
      dimensions: {
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: { values: { orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
      },
      skus: { orderBy: (s, { asc }) => [asc(s.id)] },
    },
  });
  if (!p) return null;

  const detail = {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    status: p.status,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    categoryPinOrder: p.categoryPinOrder ?? null,
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
    categoryName: p.category?.name ?? "",
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
  return AdminProductDetailSchema.parse(detail);
}

export function makeAdminProductsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/products — cursor-paginated. Default list excludes archived
  // (active + draft only); pass ?status=archived|active|draft to narrow further.
  router.get("/", async (c) => {
    const q = c.req.query();
    const conditions = [];

    const status = ProductStatusSchema.safeParse(q.status);
    if (status.success) {
      conditions.push(eq(products.status, status.data));
    } else {
      conditions.push(ne(products.status, "archived"));
    }
    if (q.isBestseller === "1") conditions.push(eq(products.isBestseller, true));
    if (q.isNew === "1") conditions.push(eq(products.isNew, true));
    if (q.isFeatured === "1") conditions.push(eq(products.isFeatured, true));
    if (q.categoryId && Number.isInteger(Number(q.categoryId))) {
      conditions.push(eq(products.categoryId, Number(q.categoryId)));
    }
    if (q.categoryTreeId && Number.isInteger(Number(q.categoryTreeId))) {
      const subtreeIds = await getProductCategoryIdsForTree(db, Number(q.categoryTreeId));
      if (subtreeIds.length === 0) {
        return c.json(AdminProductListSchema.parse({ items: [], nextCursor: null }));
      }
      conditions.push(inArray(products.categoryId, subtreeIds));
    }
    if (q.q) conditions.push(ilike(products.name, `%${q.q}%`));

    if (q.cursor) {
      const cur = decodeCursor(q.cursor);
      if (cur) {
        conditions.push(
          or(
            lt(products.updatedAt, cur.updatedAt),
            and(eq(products.updatedAt, cur.updatedAt), lt(products.id, cur.id)),
          )!,
        );
      }
    }

    const limit = Math.min(Math.max(Number(q.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const rows = await db.query.products.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: (p, { desc }) => [desc(p.updatedAt), desc(p.id)],
      limit: limit + 1,
      with: {
        category: { columns: { name: true } },
        skus: { columns: { price: true, salePrice: true } },
        images: { columns: { url: true, sortOrder: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items = page.map((p) => {
      const effective = p.skus.map((s) => (s.salePrice !== null ? Number(s.salePrice) : Number(s.price)));
      const bases = p.skus.map((s) => Number(s.price));
      let bestDiscount = 0;
      for (const s of p.skus) {
        if (s.salePrice !== null) {
          const base = Number(s.price);
          if (base > 0) bestDiscount = Math.max(bestDiscount, Math.round((1 - Number(s.salePrice) / base) * 100));
        }
      }
      const primaryImage = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        isBestseller: p.isBestseller,
        isNew: p.isNew,
        isFeatured: p.isFeatured,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? "",
        primaryImage,
        minPrice: effective.length ? Math.min(...effective) : 0,
        maxBasePrice: bases.length ? Math.max(...bases) : 0,
        bestDiscount,
        skuCount: p.skus.length,
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.updatedAt, last.id) : null;

    return c.json(AdminProductListSchema.parse({ items, nextCursor }));
  });

  // GET /admin/products/:id
  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const detail = await getProductDetail(db, id);
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  });

  // POST /admin/products
  router.post("/", async (c) => {
    const parsed = AdminProductCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    let newId: number;
    try {
      newId = await db.transaction(async (tx) => {
        const slug = body.slug ?? (await uniqueSlug(tx, slugify(body.name)));
        const [prod] = await tx
          .insert(products)
          .values({
            categoryId: body.categoryId,
            name: body.name,
            slug,
            description: body.description,
            status: body.status,
            isBestseller: body.isBestseller,
            isNew: body.isNew,
            isFeatured: body.isFeatured,
            categoryPinOrder: body.categoryPinOrder ?? null,
            tags: body.tags,
            specifications: body.specifications ?? null,
            includedAccessories: body.includedAccessories ?? null,
          })
          .returning({ id: products.id });
        await replaceChildren(tx, prod!.id, body);
        return prod!.id;
      });
    } catch (err) {
      const mapped = productWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }

    const detail = await getProductDetail(db, newId);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.create",
      resourceType: "product",
      resourceId: String(newId),
      changes: { after: detail },
    });
    if (detail) await invalidateProductCaches(detail.slug);
    return c.json(detail, 201);
  });

  // PATCH /admin/products/:id
  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const parsed = AdminProductPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    try {
      await db.transaction(async (tx) => {
        const topLevel: Record<string, unknown> = { updatedAt: new Date() };
        if (body.categoryId !== undefined) topLevel.categoryId = body.categoryId;
        if (body.name !== undefined) topLevel.name = body.name;
        if (body.slug !== undefined) topLevel.slug = body.slug;
        if (body.description !== undefined) topLevel.description = body.description;
        if (body.status !== undefined) topLevel.status = body.status;
        if (body.isBestseller !== undefined) topLevel.isBestseller = body.isBestseller;
        if (body.isNew !== undefined) topLevel.isNew = body.isNew;
        if (body.isFeatured !== undefined) topLevel.isFeatured = body.isFeatured;
        if (body.categoryPinOrder !== undefined) topLevel.categoryPinOrder = body.categoryPinOrder;
        if (body.tags !== undefined) topLevel.tags = body.tags;
        if (body.specifications !== undefined) topLevel.specifications = body.specifications;
        if (body.includedAccessories !== undefined) topLevel.includedAccessories = body.includedAccessories;
        await tx.update(products).set(topLevel).where(eq(products.id, id));

        // Nested arrays are replaced wholesale only when provided.
        if (body.images !== undefined || body.dimensions !== undefined || body.skus !== undefined) {
          await replaceChildren(tx, id, {
            images: body.images ?? before.images,
            dimensions: body.dimensions ?? before.dimensions.map((d) => ({
              name: d.name,
              sortOrder: d.sortOrder,
              values: d.values.map((v) => ({ value: v.value, label: v.label, sortOrder: v.sortOrder })),
            })),
            skus: body.skus ?? before.skus.map((s) => ({
              skuCode: s.skuCode,
              price: s.price,
              salePrice: s.salePrice,
              dimensionValues: s.dimensionValues,
              attributes: s.attributes,
              stock: s.stock,
            })),
          });
        }
      });
    } catch (err) {
      const mapped = productWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }

    const after = await getProductDetail(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.update",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after },
    });
    // Slug may have changed — clear both old and new.
    await invalidateProductCaches(before.slug);
    if (after && after.slug !== before.slug) await invalidateProductCaches(after.slug);
    return c.json(after);
  });

  // POST /admin/products/:id/archive — hide from storefront (soft delete).
  router.post("/:id/archive", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    await db
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(products.id, id));

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.archive",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after: { ...before, status: "archived" } },
    });
    await invalidateProductCaches(before.slug);
    return c.json({ success: true, id, status: "archived" });
  });

  // POST /admin/products/:id/restore — return to the storefront as active.
  router.post("/:id/restore", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    await db
      .update(products)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(products.id, id));

    const after = await getProductDetail(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.restore",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after },
    });
    if (after) await invalidateProductCaches(after.slug);
    return c.json({ success: true, id, status: "active" });
  });

  // DELETE /admin/products/:id — permanent removal from the database.
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    await db.delete(products).where(eq(products.id, id));

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.delete",
      resourceType: "product",
      resourceId: String(id),
      changes: { before },
    });
    await invalidateProductCaches(before.slug);
    return c.json({ success: true, id });
  });

  return router;
}
