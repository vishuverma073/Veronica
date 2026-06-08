/** Low-stock threshold for urgency messaging on PDP/cart. */
export const LOW_STOCK_THRESHOLD = 5;

export type StockState = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

/** null/undefined stock = not tracked (treat as available). */
export function getStockState(stock: number | null | undefined): StockState {
  if (stock === null || stock === undefined) return "unknown";
  if (stock <= 0) return "out_of_stock";
  if (stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

export function isPurchasable(stock: number | null | undefined): boolean {
  const state = getStockState(stock);
  return state !== "out_of_stock";
}

export function maxPurchasableQty(stock: number | null | undefined): number | null {
  if (stock === null || stock === undefined) return null;
  return Math.max(0, stock);
}

export function stockBadgeLabel(stock: number | null | undefined): string | null {
  const state = getStockState(stock);
  if (state === "out_of_stock") return "Out of stock";
  if (state === "low_stock" && stock != null) return `Only ${stock} left`;
  return null;
}
