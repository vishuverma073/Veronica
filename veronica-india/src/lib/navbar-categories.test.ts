import { describe, expect, it } from "vitest";
import type { Category } from "@veronica/contracts";
import {
  compareHeaderCategories,
  headerDropdownChildren,
  resolveNavbarRoots,
} from "@/lib/navbar-categories";

const root = (id: number, name: string, showInHeader = false, sortOrder = id): Category => ({
  id,
  parentId: null,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  description: "",
  image: "",
  sortOrder,
  showInHeader,
});

const child = (id: number, parentId: number, name: string, showInHeader = false): Category => ({
  ...root(id, name, showInHeader),
  parentId,
});

describe("resolveNavbarRoots", () => {
  const roots = [
    root(1, "Alpha", true, 0),
    root(2, "Beta", true, 1),
    root(3, "Gamma", false, 2),
  ];

  it("uses home showcase ids in admin-chosen order when present", () => {
    expect(resolveNavbarRoots(roots, [3, 1]).map((c) => c.id)).toEqual([3, 1]);
  });

  it("ignores unknown or non-root ids in the showcase list", () => {
    expect(resolveNavbarRoots(roots, [99, 1, 3]).map((c) => c.id)).toEqual([1, 3]);
  });

  it("falls back to showInHeader roots when showcase is empty", () => {
    expect(resolveNavbarRoots(roots, []).map((c) => c.id)).toEqual([1, 2]);
  });
});

describe("headerDropdownChildren", () => {
  it("keeps only showInHeader children in sort order", () => {
    const kids = [
      child(10, 1, "Zed", true),
      child(11, 1, "Ace", false),
      child(12, 1, "Mid", true),
    ];
    expect(headerDropdownChildren(kids).map((c) => c.id)).toEqual([10, 12]);
  });
});

describe("compareHeaderCategories", () => {
  it("sorts by sortOrder then name", () => {
    const a = root(1, "B", false, 1);
    const b = root(2, "A", false, 1);
    expect(compareHeaderCategories(a, b)).toBeGreaterThan(0);
  });
});
