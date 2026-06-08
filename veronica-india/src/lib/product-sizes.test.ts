import { describe, expect, it } from "vitest";
import {
  SIZE_DIMENSION_RE,
  collectAvailableSizes,
  extractProductSizes,
} from "@/lib/product-sizes";

describe("SIZE_DIMENSION_RE", () => {
  it("matches common size dimension names", () => {
    expect(SIZE_DIMENSION_RE.test("Size")).toBe(true);
    expect(SIZE_DIMENSION_RE.test("Overall Size")).toBe(true);
    expect(SIZE_DIMENSION_RE.test("Color")).toBe(false);
  });
});

describe("extractProductSizes", () => {
  it("collects unique values from size-like SKU dimensions", () => {
    expect(
      extractProductSizes(
        [
          { dimensionValues: { "Overall Size": "24×20" } },
          { dimensionValues: { "Overall Size": "18×16" } },
          { dimensionValues: { "Overall Size": "24×20" } },
        ],
        [
          {
            name: "Overall Size",
            values: [
              { value: "18×16", sortOrder: 0 },
              { value: "24×20", sortOrder: 1 },
            ],
          },
        ],
      ),
    ).toEqual(["18×16", "24×20"]);
  });

  it("returns empty when no size dimensions exist", () => {
    expect(
      extractProductSizes([{ dimensionValues: { Color: "Chrome" } }], []),
    ).toEqual([]);
  });
});

describe("collectAvailableSizes", () => {
  it("merges sizes across products in stable order", () => {
    expect(
      collectAvailableSizes([
        { sizes: ["24×20", "18×16"] },
        { sizes: ["32×20", "18×16"] },
      ]),
    ).toEqual(["24×20", "18×16", "32×20"]);
  });
});
