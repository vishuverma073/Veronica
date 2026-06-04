/**
 * Order pricing (Phase 4) — GST + shipping math.
 *
 * Deterministic and explained line by line (customers see this breakdown in the
 * order summary and confirmation email). All intermediate math is done in PAISE
 * (integers) to avoid floating-point drift, then converted back to rupees.
 */

export interface CartLine {
  unitPrice: number; // rupees
  qty: number;
}

export interface PricingResult {
  subtotal: number; // sum of unitPrice * qty
  shippingFee: number; // flat fee below threshold, else 0
  gstRate: number; // e.g. 0.18
  gstAmount: number; // round((subtotal + shipping) * gstRate)
  total: number; // subtotal + shipping + gst
}

/**
 * Standard GST rate for sanitaryware (HSN 7324 / 8481 / 3922). 18%.
 * [TODO confirm with Ketan / CA before go-live.] Kept as a single constant so
 * it's trivial to change (or later read from the `settings` row).
 */
export const GST_RATE = 0.18;

/** Flat shipping fee (₹) applied when the subtotal is below the free threshold. */
export const SHIPPING_FLAT_FEE = 99;

/** Order subtotals at or above this (₹) ship free. */
export const FREE_SHIPPING_THRESHOLD = 5000;

/** Round half-up to the nearest paise (Math.round rounds .5 toward +∞). */
function roundHalfUp(paise: number): number {
  return Math.round(paise);
}

/** Pricing knobs — sourced from the admin Settings (with these as fallbacks). */
export interface PricingConfig {
  freeShippingThreshold: number; // ₹ — subtotal at/above which shipping is free
  flatShippingFee: number; // ₹ — flat fee below the threshold
  gstRate: number; // fraction, e.g. 0.18
}

const DEFAULT_PRICING: PricingConfig = {
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  flatShippingFee: SHIPPING_FLAT_FEE,
  gstRate: GST_RATE,
};

export function calculatePricing(lines: CartLine[], config: PricingConfig = DEFAULT_PRICING): PricingResult {
  // Subtotal in paise. Round each unit price to paise before multiplying so a
  // price like 999.50 can't accumulate binary-float error across quantities.
  const subtotalPaise = lines.reduce((sum, l) => sum + Math.round(l.unitPrice * 100) * l.qty, 0);

  const shippingPaise =
    subtotalPaise === 0 || subtotalPaise >= config.freeShippingThreshold * 100
      ? 0
      : config.flatShippingFee * 100;

  // Catalog prices are GST-INCLUSIVE: the tax is already inside the subtotal, so
  // it's surfaced for the invoice breakdown but NEVER added on top. The portion
  // of the subtotal that is GST = subtotal − subtotal / (1 + rate).
  const gstPaise = roundHalfUp(subtotalPaise - subtotalPaise / (1 + config.gstRate));
  const totalPaise = subtotalPaise + shippingPaise; // gst already inside subtotal

  return {
    subtotal: subtotalPaise / 100,
    shippingFee: shippingPaise / 100,
    gstRate: config.gstRate,
    gstAmount: gstPaise / 100,
    total: totalPaise / 100,
  };
}
