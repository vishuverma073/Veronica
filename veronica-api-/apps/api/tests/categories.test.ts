import { beforeEach, describe, expect, it } from "vitest";
import { CategoryListSchema, CategoryWithBreadcrumbSchema } from "@veronica/contracts";
import { createApp } from "../src/app.js";
import { __clearMemCache } from "../src/lib/cache.js";
import type { DbClient } from "../src/db/client.js";

// Cached routes share a process-global store; reset it so cases don't leak.
beforeEach(() => __clearMemCache());

const root = {
  id: 1,
  parentId: null,
  name: "Kitchen Sinks",
  slug: "kitchen-sinks",
  description: "Premium quartz and stainless steel kitchen sinks",
  imageUrl: "/uploads/products/sink-hero-1.png",
  sortOrder: 0,
  showInHeader: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const children = [
  { ...root, id: 5, parentId: 1, name: "Single Bowl", slug: "single-bowl", sortOrder: 0 },
  { ...root, id: 6, parentId: 1, name: "Double Bowl", slug: "double-bowl", sortOrder: 1 },
];

/** `orderBy` serves root list / children; `limit` serves slug + parent lookups. */
function mockDb(opts: { rootList?: unknown[]; allList?: unknown[]; bySlug?: unknown; children?: unknown[] } = {}): DbClient {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => opts.allList ?? opts.children ?? opts.rootList ?? [],
          limit: async () => (opts.bySlug ? [opts.bySlug] : []),
        }),
      }),
    }),
  } as unknown as DbClient;
}

describe("GET /categories", () => {
  it("returns root categories mapped to the contract schema", async () => {
    const res = await createApp({ db: mockDb({ rootList: [root] }) }).request("/categories");
    expect(res.status).toBe(200);
    const parsed = CategoryListSchema.parse(await res.json());
    expect(parsed[0]).toMatchObject({ id: 1, slug: "kitchen-sinks" });
  });

  it("returns [] when there are no root categories", async () => {
    const res = await createApp({ db: mockDb({ rootList: [] }) }).request("/categories");
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /categories/all", () => {
  it("returns every active category in a flat list", async () => {
    const res = await createApp({ db: mockDb({ allList: [root, ...children] }) }).request(
      "/categories/all",
    );
    expect(res.status).toBe(200);
    const parsed = CategoryListSchema.parse(await res.json());
    expect(parsed.length).toBe(3);
  });
});

describe("GET /categories/:slug", () => {
  it("returns a root category with self-only breadcrumb + children", async () => {
    const res = await createApp({ db: mockDb({ bySlug: root, children }) }).request(
      "/categories/kitchen-sinks",
    );
    expect(res.status).toBe(200);
    const body = CategoryWithBreadcrumbSchema.parse(await res.json());
    expect(body.breadcrumb).toHaveLength(1);
    expect(body.breadcrumb[0]!.slug).toBe("kitchen-sinks");
    expect(body.children.map((c) => c.slug)).toEqual(["single-bowl", "double-bowl"]);
  });

  it("404 for an unknown slug", async () => {
    const res = await createApp({ db: mockDb({ bySlug: undefined }) }).request(
      "/categories/does-not-exist",
    );
    expect(res.status).toBe(404);
  });
});
