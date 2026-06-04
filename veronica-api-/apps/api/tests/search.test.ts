import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

const productRow = {
  id: 1,
  categoryId: 1,
  name: "Lavender Single Bowl",
  slug: "lavender-single-bowl",
  status: "active" as const,
  isBestseller: true,
  isNew: false,
  tags: ["Imported"],
  skus: [{ price: "3060", salePrice: "2100" }],
  images: [{ url: "/a.png", sortOrder: 0 }],
};

function mockDb(opts: { rankedIds?: number[]; findMany?: unknown[] } = {}): DbClient {
  return {
    execute: async () => (opts.rankedIds ?? []).map((id) => ({ id })),
    query: { products: { findMany: async () => opts.findMany ?? [] } },
  } as unknown as DbClient;
}

describe("GET /search", () => {
  it("returns empty items for a missing query", async () => {
    const res = await createApp({ db: mockDb() }).request("/search");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("returns ranked matches as list items", async () => {
    const res = await createApp({ db: mockDb({ rankedIds: [1], findMany: [productRow] }) }).request(
      "/search?q=sink",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { slug: string; minPrice: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ slug: "lavender-single-bowl", minPrice: 2100 });
  });

  it("returns [] when nothing matches", async () => {
    const res = await createApp({ db: mockDb({ rankedIds: [] }) }).request("/search?q=zzzzz");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});
