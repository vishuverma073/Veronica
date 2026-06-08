import { describe, expect, it } from "vitest";
import type { Category } from "@veronica/contracts";
import {
  buildShopNavTree,
  getCategoryCountLabel,
  getShopBrowseHref,
  isCategoryPathActive,
  resolveFeaturedCategories,
} from "@/lib/shop-nav";

const cat = (
  id: number,
  name: string,
  parentId: number | null,
  opts: Partial<Category> = {},
): Category => ({
  id,
  parentId,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  description: "",
  sortOrder: id,
  showInHeader: false,
  status: "active",
  ...opts,
});

describe("buildShopNavTree", () => {
  it("includes all active categories regardless of showInHeader", () => {
    const flat = [
      cat(1, "Kitchen", null),
      cat(10, "Single Bowl", 1),
      cat(100, "18x16", 10),
      cat(2, "Faucets", null, { showInHeader: false }),
    ];
    const tree = buildShopNavTree(flat);
    expect(tree).toHaveLength(2);
    expect(tree[0].children[0].children[0].slug).toBe("18x16");
  });
});

describe("resolveFeaturedCategories", () => {
  const flat = [
    cat(1, "Kitchen", null),
    cat(2, "Faucets", null),
    cat(3, "Showers", null),
  ];
  const tree = buildShopNavTree(flat);

  it("uses home composer ids when provided", () => {
    expect(resolveFeaturedCategories(tree, [3, 1]).map((c) => c.id)).toEqual([3, 1]);
  });

  it("falls back to first four roots", () => {
    expect(resolveFeaturedCategories(tree, []).map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe("getShopBrowseHref", () => {
  it("links to first root or search fallback", () => {
    const tree = buildShopNavTree([cat(1, "Kitchen", null)]);
    expect(getShopBrowseHref(tree)).toBe("/category/kitchen");
    expect(getShopBrowseHref([])).toBe("/search");
  });
});

describe("getCategoryCountLabel", () => {
  it("prefers product count over child count", () => {
    const node = { ...cat(1, "Kitchen", null), children: [cat(10, "Bowl", 1)], productCount: 12 };
    expect(getCategoryCountLabel(node as never)).toBe("12");
  });

  it("shows subcategory count when no product count", () => {
    const node = { ...cat(1, "Kitchen", null), children: [cat(10, "Bowl", 1), cat(11, "Double", 1)] };
    expect(getCategoryCountLabel(node as never)).toBe("2");
  });
});

describe("isCategoryPathActive", () => {
  it("matches category slug paths", () => {
    expect(isCategoryPathActive("/category/kitchen-sinks", "kitchen-sinks")).toBe(true);
    expect(isCategoryPathActive("/cart", "kitchen-sinks")).toBe(false);
  });
});
