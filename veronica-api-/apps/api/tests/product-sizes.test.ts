import { describe, expect, it } from "vitest";
import { extractProductSizes } from "../src/lib/product-sizes.js";

describe("extractProductSizes", () => {
  it("orders values using dimension sortOrder", () => {
    expect(
      extractProductSizes(
        [{ dimensionValues: { Size: "32×20" } }, { dimensionValues: { Size: "18×16" } }],
        [{ name: "Size", values: [{ value: "18×16", sortOrder: 0 }, { value: "32×20", sortOrder: 1 }] }],
      ),
    ).toEqual(["18×16", "32×20"]);
  });
});
