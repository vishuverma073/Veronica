import { describe, expect, it } from "vitest";
import { calculatePricing, GST_RATE } from "../src/lib/pricing.js";

describe("calculatePricing", () => {
  it("empty cart → all zeros", () => {
    expect(calculatePricing([])).toEqual({
      subtotal: 0,
      shippingFee: 0,
      gstRate: GST_RATE,
      gstAmount: 0,
      total: 0,
    });
  });

  it("₹1000 subtotal → ₹99 shipping, GST included in ₹1000 = ₹152.54, total ₹1099", () => {
    const r = calculatePricing([{ unitPrice: 1000, qty: 1 }]);
    expect(r).toMatchObject({ subtotal: 1000, shippingFee: 99, gstAmount: 152.54, total: 1099 });
  });

  it("₹6000 subtotal → free shipping, GST included in ₹6000 = ₹915.25, total ₹6000", () => {
    const r = calculatePricing([{ unitPrice: 3000, qty: 2 }]);
    expect(r).toMatchObject({ subtotal: 6000, shippingFee: 0, gstAmount: 915.25, total: 6000 });
  });

  it("exactly ₹5000 subtotal → free shipping (threshold is inclusive)", () => {
    const r = calculatePricing([{ unitPrice: 5000, qty: 1 }]);
    expect(r).toMatchObject({ subtotal: 5000, shippingFee: 0, gstAmount: 762.71, total: 5000 });
  });

  it("multiple lines sum correctly", () => {
    const r = calculatePricing([
      { unitPrice: 1200, qty: 2 }, // 2400
      { unitPrice: 800, qty: 1 }, // 800
    ]);
    // subtotal 3200, shipping 99, gst already inside 3200 = 488.14, total 3299
    expect(r).toMatchObject({ subtotal: 3200, shippingFee: 99, gstAmount: 488.14, total: 3299 });
  });

  it("fractional price (₹999.50) rounds half-up with no float drift", () => {
    const r = calculatePricing([{ unitPrice: 999.5, qty: 1 }]);
    // subtotal 999.50, shipping 99, gst inside 999.50 = 152.47, total 1098.50
    expect(r).toMatchObject({ subtotal: 999.5, shippingFee: 99, gstAmount: 152.47, total: 1098.5 });
  });
});
