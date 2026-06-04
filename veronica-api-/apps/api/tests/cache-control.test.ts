import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

// /healthz needs no db; /me just needs to 401 (no db access before requireAuth).
const db = {} as DbClient;

describe("Cache-Control headers", () => {
  it("/healthz → no-store", async () => {
    const res = await createApp({ db }).request("/healthz");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("authenticated /me/* → private, no-store (even on 401)", async () => {
    const res = await createApp({ db }).request("/me/orders");
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("/admin/* → private, no-store", async () => {
    const res = await createApp({ db }).request("/admin/products");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not set a public Cache-Control on a 404 product", async () => {
    const mockDb = {
      query: { products: { findFirst: async () => undefined, findMany: async () => [] } },
    } as unknown as DbClient;
    const res = await createApp({ db: mockDb }).request("/products/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});
