import { describe, expect, it } from "vitest";
import { ProductListItemSchema, ProductSchema, paginated } from "@veronica/contracts";

const ProductPageSchema = paginated(ProductListItemSchema);

const listItemBase = {
  id: 1,
  name: "Test",
  slug: "test",
  categoryId: 10,
  minPrice: 100,
  maxBasePrice: 200,
  bestDiscount: 10,
  isBestseller: false,
  isNew: false,
  status: "active" as const,
};

describe("ProductListItemSchema", () => {
  it("coerces null primaryImage to an empty string", () => {
    const item = ProductListItemSchema.parse({ ...listItemBase, image: null });
    expect(item.image).toBe("");
  });

  it("parses paginated lists that include null images", () => {
    const page = ProductPageSchema.parse({
      items: [
        { ...listItemBase, image: "https://example.com/a.webp", sizes: ["18×16"] },
        { ...listItemBase, id: 2, slug: "no-img", image: null, sizes: [] },
      ],
      nextCursor: null,
    });
    expect(page.items[1].image).toBe("");
    expect(page.items[0].sizes).toEqual(["18×16"]);
  });
});

describe("ProductSchema images", () => {
  it("normalizes image objects and drops empty urls", () => {
    const product = ProductSchema.parse({
      id: 1,
      name: "Test",
      slug: "test",
      description: "",
      categoryId: 10,
      isBestseller: false,
      isNew: false,
      status: "active",
      tags: [],
      images: [
        { url: "https://example.com/a.webp", sortOrder: 0 },
        { url: "  ", sortOrder: 1 },
        "",
      ],
      dimensions: [],
      skus: [
        {
          id: 1,
          skuCode: "A",
          price: 100,
          salePrice: null,
          dimensionValues: {},
        },
      ],
    });
    expect(product.images).toEqual(["https://example.com/a.webp"]);
  });
});
