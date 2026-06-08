import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBrowseAllHref, getCategoryShortcuts } from "./category-shortcuts";

vi.mock("@/lib/backend", () => ({
  backend: {
    getShopNav: vi.fn(),
    getCategories: vi.fn(),
  },
}));

import { backend } from "@/lib/backend";

describe("category-shortcuts", () => {
  beforeEach(() => {
    vi.mocked(backend.getShopNav).mockReset();
    vi.mocked(backend.getCategories).mockReset();
  });

  it("prefers shop nav roots in order", async () => {
    vi.mocked(backend.getShopNav).mockResolvedValue({
      tree: [
        { id: 2, slug: "bathroom-accessories", name: "Bathroom", parentId: null, children: [] },
        { id: 1, slug: "kitchen-sinks", name: "Kitchen Sinks", parentId: null, children: [] },
      ],
      featuredIds: [],
      flatCount: 2,
      usedFallback: false,
    } as never);

    await expect(getCategoryShortcuts(2)).resolves.toEqual([
      { slug: "bathroom-accessories", name: "Bathroom" },
      { slug: "kitchen-sinks", name: "Kitchen Sinks" },
    ]);
  });

  it("falls back to search when no categories", async () => {
    vi.mocked(backend.getShopNav).mockResolvedValue({
      tree: [],
      featuredIds: [],
      flatCount: 0,
      usedFallback: false,
    });
    vi.mocked(backend.getCategories).mockResolvedValue([]);

    await expect(getBrowseAllHref()).resolves.toBe("/search");
  });
});
