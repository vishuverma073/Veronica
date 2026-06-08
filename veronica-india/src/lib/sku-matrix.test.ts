import { describe, it, expect } from "vitest";
import type { VariantDimension } from "@veronica/contracts";
import { cartesian, comboKey, syncSkus, type EditableSku } from "./sku-matrix";

function dim(id: number, name: string, values: string[]): VariantDimension {
  return {
    id,
    name,
    sortOrder: 0,
    values: values.map((v, i) => ({ id: id * 100 + i, value: v, sortOrder: i })),
  };
}

describe("cartesian", () => {
  it("returns a single empty combo with no dimensions", () => {
    expect(cartesian([])).toEqual([{}]);
  });

  it("produces the cross-product of dimension values", () => {
    const combos = cartesian([dim(1, "Size", ["S", "L"]), dim(2, "Color", ["Red", "Blue"])]);
    expect(combos).toHaveLength(4);
    expect(combos).toContainEqual({ Size: "S", Color: "Red" });
    expect(combos).toContainEqual({ Size: "L", Color: "Blue" });
  });

  it("skips dimensions that have no values yet", () => {
    expect(cartesian([dim(1, "Size", [])])).toEqual([{}]);
  });
});

describe("comboKey", () => {
  it("is stable regardless of object key order", () => {
    const dims = [dim(1, "Size", ["S"]), dim(2, "Color", ["Red"])];
    expect(comboKey({ Color: "Red", Size: "S" }, dims)).toBe(comboKey({ Size: "S", Color: "Red" }, dims));
  });
});

describe("syncSkus", () => {
  it("collapses to a single SKU when there are no variants", () => {
    const skus = syncSkus([], [], "ABC");
    expect(skus).toHaveLength(1);
    expect(skus[0].dimensionValues).toEqual({});
    expect(skus[0].skuCode).toBe("ABC");
  });

  it("preserves the existing price when collapsing to no variants", () => {
    const existing: EditableSku[] = [
      { id: 5, skuCode: "OLD", price: 999, salePrice: 799, dimensionValues: {} },
    ];
    const skus = syncSkus([], existing, "ABC");
    expect(skus[0].price).toBe(999);
    expect(skus[0].salePrice).toBe(799);
    expect(skus[0].id).toBe(5);
  });

  it("generates one SKU per combination", () => {
    const skus = syncSkus([dim(1, "Size", ["S", "L"])], [], "TS");
    expect(skus).toHaveLength(2);
    expect(skus.map((s) => s.dimensionValues.Size).sort()).toEqual(["L", "S"]);
  });

  it("retains prices for combinations that still exist when a value is added", () => {
    const dims1 = [dim(1, "Size", ["S"])];
    const first = syncSkus(dims1, [], "TS");
    first[0].price = 1500; // user enters a price

    const dims2 = [dim(1, "Size", ["S", "L"])];
    const second = syncSkus(dims2, first, "TS");

    const kept = second.find((s) => s.dimensionValues.Size === "S");
    const added = second.find((s) => s.dimensionValues.Size === "L");
    expect(kept?.price).toBe(1500);
    expect(added?.price).toBe(null);
    expect(second).toHaveLength(2);
  });

  it("drops SKUs for removed values", () => {
    const withTwo = syncSkus([dim(1, "Size", ["S", "L"])], [], "TS");
    const withOne = syncSkus([dim(1, "Size", ["S"])], withTwo, "TS");
    expect(withOne).toHaveLength(1);
    expect(withOne[0].dimensionValues.Size).toBe("S");
  });
});
