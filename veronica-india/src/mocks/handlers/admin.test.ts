import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { server } from "../node";
import { API_BASE } from "@/lib/api-config";
import {
  ProductListItemSchema,
  ProductSchema,
  CategoryListSchema,
  SettingsSchema,
} from "@veronica/contracts";

const AUTH = { Authorization: "Bearer mock-token" };

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

describe("admin mock handlers", () => {
  it("logs in with the mock credentials", async () => {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.local", password: "admin123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("mock-token");
    expect(body.admin.email).toBe("admin@test.local");
  });

  it("rejects bad credentials with 401", async () => {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@y.z", password: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("gates product listing behind the bearer token", async () => {
    const res = await fetch(`${API_BASE}/admin/products`);
    expect(res.status).toBe(401);
  });

  it("returns a contract-shaped product list envelope when authed", async () => {
    const res = await fetch(`${API_BASE}/admin/products`, { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The deployed admin API returns an { items, nextCursor } envelope.
    expect(Array.isArray(body.items)).toBe(true);
    z.array(ProductListItemSchema).parse(body.items);
    expect(body.items.length).toBeGreaterThanOrEqual(10);
    expect(body.items.every((p: { status: string }) => p.status !== "archived")).toBe(true);
  });

  it("returns a full product by id", async () => {
    const res = await fetch(`${API_BASE}/admin/products/1`, { headers: AUTH });
    expect(res.status).toBe(200);
    ProductSchema.parse(await res.json());
  });

  it("serves categories, settings and home config", async () => {
    const cats = await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json();
    CategoryListSchema.parse(cats);

    const settings = await (await fetch(`${API_BASE}/admin/settings`, { headers: AUTH })).json();
    SettingsSchema.parse(settings);

    // Home config is served in the backend wire shape: an ordered list of
    // { key, enabled, order, config } sections.
    const home = await (await fetch(`${API_BASE}/admin/home`, { headers: AUTH })).json();
    expect(Array.isArray(home.sections)).toBe(true);
    expect(home.sections).toHaveLength(6);
    for (const s of home.sections) {
      expect(typeof s.key).toBe("string");
      expect(typeof s.enabled).toBe("boolean");
      expect(typeof s.order).toBe("number");
    }
  });

  it("archives and restores a category subtree", async () => {
    const archiveRes = await fetch(`${API_BASE}/admin/categories/1/archive`, {
      method: "POST",
      headers: AUTH,
    });
    expect(archiveRes.status).toBe(200);

    const catsAfterArchive = CategoryListSchema.parse(
      await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json(),
    );
    expect(catsAfterArchive.find((c) => c.id === 1)?.status).toBe("archived");
    expect(catsAfterArchive.find((c) => c.id === 10)?.status).toBe("archived");

    const storefrontRoots = await (await fetch(`${API_BASE}/categories`)).json();
    expect(storefrontRoots.some((c: { id: number }) => c.id === 1)).toBe(false);

    const restoreRes = await fetch(`${API_BASE}/admin/categories/1/restore`, {
      method: "POST",
      headers: AUTH,
    });
    expect(restoreRes.status).toBe(200);

    const catsAfterRestore = CategoryListSchema.parse(
      await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json(),
    );
    expect(catsAfterRestore.find((c) => c.id === 1)?.status).toBe("active");
  });

  it("archives and restores a product", async () => {
    const archiveRes = await fetch(`${API_BASE}/admin/products/4/archive`, {
      method: "POST",
      headers: AUTH,
    });
    expect(archiveRes.status).toBe(200);

    const defaultList = await (
      await fetch(`${API_BASE}/admin/products`, { headers: AUTH })
    ).json();
    expect(defaultList.items.some((p: { id: number }) => p.id === 4)).toBe(false);

    const archivedList = await (
      await fetch(`${API_BASE}/admin/products?status=archived`, { headers: AUTH })
    ).json();
    expect(archivedList.items.some((p: { id: number }) => p.id === 4)).toBe(true);

    const restoreRes = await fetch(`${API_BASE}/admin/products/4/restore`, {
      method: "POST",
      headers: AUTH,
    });
    expect(restoreRes.status).toBe(200);

    const afterRestore = await (
      await fetch(`${API_BASE}/admin/products`, { headers: AUTH })
    ).json();
    expect(afterRestore.items.some((p: { id: number }) => p.id === 4)).toBe(true);
  });

  it("filters products by categoryTreeId and includes category counts", async () => {
    const cats = CategoryListSchema.parse(
      await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json(),
    );
    const health = cats.find((c) => c.slug === "health-faucet-sets");
    expect(health?.subtreeProductCount).toBeGreaterThan(0);

    const res = await fetch(`${API_BASE}/admin/products?categoryTreeId=${health!.id}`, {
      headers: AUTH,
    });
    const body = await res.json();
    expect(body.items.length).toBe(health!.subtreeProductCount);
    for (const item of body.items) {
      expect(item.categoryId).toBeGreaterThan(0);
    }
  });

  it("cascade-deletes a category with products", async () => {
    const before = CategoryListSchema.parse(
      await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json(),
    );
    const target = before.find((c) => c.id === 10);
    expect(target).toBeTruthy();

    const res = await fetch(`${API_BASE}/admin/categories/10`, {
      method: "DELETE",
      headers: AUTH,
    });
    expect(res.status).toBe(200);

    const after = CategoryListSchema.parse(
      await (await fetch(`${API_BASE}/admin/categories`, { headers: AUTH })).json(),
    );
    expect(after.find((c) => c.id === 10)).toBeUndefined();
  });
});
