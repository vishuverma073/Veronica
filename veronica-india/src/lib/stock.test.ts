import { describe, it, expect } from "vitest";
import { getStockState, isPurchasable, maxPurchasableQty, stockBadgeLabel } from "./stock";

describe("stock helpers", () => {
  it("treats untracked stock as purchasable", () => {
    expect(getStockState(null)).toBe("unknown");
    expect(isPurchasable(null)).toBe(true);
    expect(maxPurchasableQty(null)).toBe(null);
  });

  it("detects out of stock", () => {
    expect(getStockState(0)).toBe("out_of_stock");
    expect(isPurchasable(0)).toBe(false);
    expect(stockBadgeLabel(0)).toBe("Out of stock");
  });

  it("detects low stock", () => {
    expect(getStockState(3)).toBe("low_stock");
    expect(stockBadgeLabel(3)).toBe("Only 3 left");
  });
});
