import { describe, expect, it } from "vitest";
import type { Category } from "@veronica/contracts";
import {
  buildCategoryParentOptions,
  buildCategoryTree,
  buildHeaderNavTree,
  getDescendantCount,
  getSubtreeIds,
  isDescendantOf,
  filterProductsForCategorySubtree,
} from "@/lib/category-tree";

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

describe("buildCategoryTree", () => {
  const flat = [
    cat(1, "Kitchen Sinks", null, { showInHeader: true }),
    cat(10, "Single Bowl", 1),
    cat(100, "18x16", 10),
    cat(101, "24x20", 10),
    cat(2, "Health Faucets", null),
    cat(20, "ABS Faucets", 2),
    cat(200, "Long Body", 20),
  ];

  it("builds arbitrary depth", () => {
    const tree = buildCategoryTree(flat);
    expect(tree).toHaveLength(2);
    expect(tree[0].children[0].children.map((c) => c.id)).toEqual([100, 101]);
    expect(tree[1].children[0].children[0].id).toBe(200);
  });

  it("computes subtree ids and descendant counts", () => {
    expect(getSubtreeIds(flat, 1)).toEqual([1, 10, 100, 101]);
    expect(getDescendantCount(flat, 10)).toBe(2);
    expect(isDescendantOf(flat, 100, 1)).toBe(true);
    expect(isDescendantOf(flat, 1, 100)).toBe(false);
  });

  it("excludes self and descendants from parent options when editing", () => {
    const options = buildCategoryParentOptions(flat, 10);
    expect(options.map((o) => o.id)).not.toContain(10);
    expect(options.map((o) => o.id)).not.toContain(100);
    expect(options.some((o) => o.id === 1)).toBe(true);
  });

  it("filters products by category subtree ids", () => {
    const products = [
      { id: 1, categoryId: 10, name: "A" },
      { id: 2, categoryId: 20, name: "B" },
      { id: 3, categoryId: 100, name: "C" },
    ];
    expect(filterProductsForCategorySubtree(products, flat, 1).map((p) => p.id)).toEqual([1, 3]);
  });
});

describe("buildHeaderNavTree", () => {
  const flat = [
    cat(1, "Kitchen", null, { showInHeader: true }),
    cat(10, "Single Bowl", 1, { showInHeader: true }),
    cat(100, "18x16", 10, { showInHeader: true }),
    cat(101, "24x20", 10, { showInHeader: false }),
  ];

  it("nests showInHeader categories under showcase roots", () => {
    const nav = buildHeaderNavTree(flat, [1]);
    expect(nav).toHaveLength(1);
    expect(nav[0].children[0].id).toBe(10);
    expect(nav[0].children[0].children.map((c) => c.id)).toEqual([100]);
  });
});
