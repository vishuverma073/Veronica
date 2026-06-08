import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";

import { createApp } from "../src/app.js";
import { createDbClient } from "../src/db/client.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import { products, skus } from "../src/db/schema.js";

const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)("admin products list status filtering (integration)", () => {
  it("default list excludes archived; status=archived only returns archived", async () => {
    const sql = (await import("postgres")).default;
    const conn = sql(dbUrl!, { prepare: false, max: 1, connect_timeout: 15 });
    const db = createDbClient(dbUrl!);
    const app = createApp({ db });

    const [admin] = await conn`SELECT id FROM users WHERE is_admin = true LIMIT 1`;
    if (!admin) {
      await conn.end();
      return;
    }

    const slug = `list-filter-test-${Date.now()}`;
    const [cat] = await conn`SELECT id FROM categories WHERE status = 'active' LIMIT 1`;
    if (!cat) {
      await conn.end();
      return;
    }

    const headers = { Authorization: `Bearer ${await signAdminAccess({ sub: admin.id })}` };

    const [row] = await db
      .insert(products)
      .values({
        categoryId: cat.id,
        name: "List Filter Test",
        slug,
        description: "",
        status: "draft",
        isBestseller: false,
        isNew: false,
        isFeatured: false,
        tags: [],
      })
      .returning({ id: products.id });

    await db.insert(skus).values({
      productId: row!.id,
      skuCode: `LFT-${row!.id}`,
      price: "100",
      salePrice: null,
      dimensionValues: {},
    });

    try {
      const defaultRes = await app.request("/admin/products?limit=100", { headers });
      expect(defaultRes.status).toBe(200);
      const defaultBody = await defaultRes.json();
      expect(defaultBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(true);

      await db.update(products).set({ status: "archived" }).where(eq(products.id, row!.id));

      const afterArchive = await app.request("/admin/products?limit=100", { headers });
      const afterArchiveBody = await afterArchive.json();
      expect(afterArchiveBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(false);

      const archivedOnly = await app.request("/admin/products?status=archived&limit=100", { headers });
      const archivedBody = await archivedOnly.json();
      expect(archivedBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(true);
      expect(archivedBody.items.every((p: { status: string }) => p.status === "archived")).toBe(true);

      const searchDefault = await app.request(
        `/admin/products?q=${encodeURIComponent("List Filter")}&limit=100`,
        { headers },
      );
      const searchDefaultBody = await searchDefault.json();
      expect(searchDefaultBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(false);

      const searchArchived = await app.request(
        `/admin/products?q=${encodeURIComponent("List Filter")}&status=archived&limit=100`,
        { headers },
      );
      const searchArchivedBody = await searchArchived.json();
      expect(searchArchivedBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(true);

      await db.update(products).set({ status: "active" }).where(eq(products.id, row!.id));

      const afterRestore = await app.request("/admin/products?limit=100", { headers });
      const afterRestoreBody = await afterRestore.json();
      expect(afterRestoreBody.items.some((p: { id: number }) => p.id === row!.id)).toBe(true);
    } finally {
      await db.delete(products).where(eq(products.id, row!.id));
      await conn.end();
    }
  });
});
