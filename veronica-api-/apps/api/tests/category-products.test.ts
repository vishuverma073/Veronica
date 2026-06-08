import { describe, expect, it } from "vitest";
import { buildCategoryProductCounts } from "../src/lib/category-products.js";

describe("buildCategoryProductCounts", () => {
  const categories = [
    { id: 1, parentId: null },
    { id: 10, parentId: 1 },
    { id: 11, parentId: 1 },
    { id: 100, parentId: 10 },
  ];

  it("sums direct counts into subtree totals", () => {
    const direct = new Map<number, number>([
      [1, 0],
      [10, 2],
      [11, 1],
      [100, 0],
    ]);
    const { direct: d, subtree } = buildCategoryProductCounts(categories, direct);
    expect(d.get(10)).toBe(2);
    expect(subtree.get(100)).toBe(0);
    expect(subtree.get(10)).toBe(2);
    expect(subtree.get(1)).toBe(3);
  });
});

describe("AdminProductListItemSchema categoryId", () => {
  it("preserves categoryId in parsed admin list items", async () => {
    const { AdminProductListSchema } = await import("@veronica/contracts");
    const parsed = AdminProductListSchema.parse({
      items: [
        {
          id: 1,
          name: "Sink",
          slug: "sink",
          status: "active",
          isBestseller: false,
          isNew: false,
          isFeatured: false,
          categoryId: 32,
          categoryName: "Verma",
          primaryImage: null,
          minPrice: 100,
          maxBasePrice: 100,
          bestDiscount: 0,
          skuCount: 1,
          updatedAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(parsed.items[0]?.categoryId).toBe(32);
  });
});
