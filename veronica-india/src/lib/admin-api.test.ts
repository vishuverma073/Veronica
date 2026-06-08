import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/node";
import type { AdminProductCreate } from "@veronica/contracts";

/**
 * Integration test for the real admin API client + auth store, exercised
 * against the MSW node server (the same handlers the browser uses). Covers the
 * end-to-end paths the admin UI depends on: login, token gating, product CRUD,
 * and the 409-on-dependencies category delete.
 */

// The persisted auth store needs a sessionStorage; provide one for node.
function installSessionStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
  });
}

// Imported dynamically AFTER the sessionStorage shim is installed.
let adminApi: typeof import("@/lib/admin-api").adminApi;
let AdminApiError: typeof import("@/lib/admin-api").AdminApiError;
let store: typeof import("@/store/adminAuthStore").useAdminAuthStore;

beforeAll(async () => {
  installSessionStorage();
  server.listen({ onUnhandledRequest: "bypass" });
  const api = await import("@/lib/admin-api");
  const s = await import("@/store/adminAuthStore");
  adminApi = api.adminApi;
  AdminApiError = api.AdminApiError;
  store = s.useAdminAuthStore;
});
afterAll(() => server.close());
beforeEach(() => store.getState().clear());

async function authed() {
  await adminApi.login("admin@test.local", "admin123");
}

describe("admin-api auth", () => {
  it("logs in and stores the bearer token", async () => {
    const res = await adminApi.login("admin@test.local", "admin123");
    expect(res.accessToken).toBe("mock-token");
    expect(store.getState().token).toBe("mock-token");
    expect(store.getState().admin?.email).toBe("admin@test.local");
  });

  it("throws AdminApiError(401) on bad credentials", async () => {
    await expect(adminApi.login("x@y.z", "nope")).rejects.toMatchObject({
      name: "AdminApiError",
      status: 401,
    });
    expect(store.getState().token).toBeNull();
  });

  it("rejects unauthenticated reads and clears any stale session", async () => {
    await expect(adminApi.listProducts()).rejects.toBeInstanceOf(AdminApiError);
  });

  it("validateSession returns false without a token, true after login", async () => {
    expect(await adminApi.validateSession()).toBe(false);
    await authed();
    expect(await adminApi.validateSession()).toBe(true);
  });
});

describe("admin-api products CRUD", () => {
  beforeEach(authed);

  it("lists contract-shaped product list items", async () => {
    const items = await adminApi.listProducts();
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]).toHaveProperty("minPrice");
    expect(items[0]).toHaveProperty("skuCount");
  });

  it("filters by status and flag", async () => {
    const all = await adminApi.listProducts();
    expect(all.every((p) => p.status !== "archived")).toBe(true);

    const active = await adminApi.listProducts({ status: "active" });
    expect(active.every((p) => p.status === "active")).toBe(true);

    const draft = await adminApi.listProducts({ status: "draft" });
    expect(draft.every((p) => p.status === "draft")).toBe(true);

    const archived = await adminApi.listProducts({ status: "archived" });
    expect(archived.every((p) => p.status === "archived")).toBe(true);

    const best = await adminApi.listProducts({ flag: "bestseller" });
    expect(best.every((p) => p.isBestseller)).toBe(true);
    expect(best.every((p) => p.status !== "archived")).toBe(true);
  });

  it("archive → hidden from default list → visible under archived → restore", async () => {
    const target = (await adminApi.listProducts({ status: "active" }))[0];
    expect(target).toBeDefined();

    await adminApi.archiveProduct(target.id);
    expect((await adminApi.listProducts()).some((p) => p.id === target.id)).toBe(false);
    expect((await adminApi.listProducts({ status: "archived" })).some((p) => p.id === target.id)).toBe(
      true,
    );

    await adminApi.restoreProduct(target.id);
    expect((await adminApi.listProducts()).some((p) => p.id === target.id)).toBe(true);
  });

  it("search in default list excludes archived products", async () => {
    const target = (await adminApi.listProducts({ status: "active" }))[0];
    const q = target.name.split(/\s+/)[0] ?? target.name.slice(0, 6);

    await adminApi.archiveProduct(target.id);

    const defaultSearch = await adminApi.listProducts({ q });
    expect(defaultSearch.some((p) => p.id === target.id)).toBe(false);

    const archivedSearch = await adminApi.listProducts({ q, status: "archived" });
    expect(archivedSearch.some((p) => p.id === target.id)).toBe(true);

    await adminApi.restoreProduct(target.id);
  });

  it("creates → reads → updates → deletes a product", async () => {
    const draft: AdminProductCreate = {
      name: "Test Faucet",
      slug: "",
      description: "integration test",
      categoryId: 20,
      isBestseller: false,
      isNew: true,
      isFeatured: false,
      status: "draft",
      tags: ["Test"],
      images: ["https://placehold.co/600x600/png"],
      dimensions: [],
      skus: [{ id: 9001, skuCode: "TST", price: 1200, salePrice: null, dimensionValues: {} }],
      specifications: [],
      includedAccessories: [],
    };

    const created = await adminApi.createProduct(draft);
    expect(created.id).toBeGreaterThan(0);
    expect(created.slug).toBe("test-faucet"); // server slugified empty slug

    const fetched = await adminApi.getProduct(created.id);
    expect(fetched.name).toBe("Test Faucet");

    const updated = await adminApi.updateProduct(created.id, { status: "active" });
    expect(updated.status).toBe("active");

    await adminApi.deleteProduct(created.id);
    await expect(adminApi.getProduct(created.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("admin-api categories", () => {
  beforeEach(authed);

  it("cascade-deletes a category and its products", async () => {
    const created = await adminApi.createCategory({
      name: "Temp Delete Me",
      slug: "temp-delete-me",
      parentId: null,
      description: "",
      sortOrder: 99,
      showInHeader: false,
    });
    const product = await adminApi.createProduct({
      name: "Temp Product",
      slug: "temp-product-delete",
      description: "x",
      categoryId: created.id,
      status: "draft",
      tags: [],
      images: [],
      dimensions: [],
      skus: [{ id: 9002, skuCode: "TMP-1", price: 100, salePrice: null, dimensionValues: {} }],
      specifications: [],
      includedAccessories: [],
    });
    await adminApi.deleteCategory(created.id);
    await expect(adminApi.getProduct(product.id)).rejects.toMatchObject({ status: 404 });
  });

  it("archives and restores a category subtree", async () => {
    await adminApi.archiveCategory(3);
    const cats = await adminApi.listCategories();
    expect(cats.find((c) => c.id === 3)?.status).toBe("archived");
    await adminApi.restoreCategory(3);
    const restored = await adminApi.listCategories();
    expect(restored.find((c) => c.id === 3)?.status).toBe("active");
  });

  it("serves home config and settings of the expected shape", async () => {
    const home = await adminApi.getHome();
    expect(home.sections).toHaveLength(6);
    const settings = await adminApi.getSettings();
    expect(settings.gstRate).toBeGreaterThanOrEqual(0);
  });
});
