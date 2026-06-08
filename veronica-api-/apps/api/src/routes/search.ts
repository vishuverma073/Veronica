import { Hono } from "hono";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ProductListItemSchema } from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { products } from "../db/schema.js";
import { toListItem } from "./products.js";
import type { AppEnv } from "../lib/types.js";

const ResponseSchema = z.object({
  items: z.array(ProductListItemSchema),
  nextCursor: z.number().nullable(),
});

/** Full-text product search over the generated search_vector (top 20 by ts_rank). */
export function makeSearchRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /search?q= — empty/missing q returns an empty result (200), not an error.
  router.get("/", async (c) => {
    // Cap length to bound the FTS query cost (the value is already parameterized,
    // so this is about resource use, not injection).
    const q = c.req.query("q")?.trim().slice(0, 100);
    if (!q) return c.json(ResponseSchema.parse({ items: [], nextCursor: null }));

    const ranked = await db.execute<{ id: number }>(sql`
      SELECT id FROM products
      WHERE status = 'active' AND search_vector @@ websearch_to_tsquery('english', ${q})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${q})) DESC
      LIMIT 20
    `);
    const ids = (ranked as unknown as { id: number }[]).map((r) => Number(r.id));
    if (ids.length === 0) return c.json(ResponseSchema.parse({ items: [], nextCursor: null }));

    const rows = await db.query.products.findMany({
      where: inArray(products.id, ids),
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    // Preserve ts_rank ordering from the FTS query.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => toListItem(p, p.skus, p.images, p.dimensions));

    return c.json(ResponseSchema.parse({ items, nextCursor: null }));
  });

  return router;
}
