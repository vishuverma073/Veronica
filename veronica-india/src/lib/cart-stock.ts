import { backend } from "@/lib/backend";
import { isPurchasable, maxPurchasableQty } from "@/lib/stock";
import type { CartItem } from "@/store/cartStore";

export type CartStockIssue = {
  cartKey: string;
  name: string;
  reason: "out_of_stock" | "insufficient";
  available: number | null;
  requested: number;
};

/** Validate cart lines against live SKU stock on the PDP product payload. */
export async function validateCartStock(items: CartItem[]): Promise<CartStockIssue[]> {
  const issues: CartStockIssue[] = [];
  const bySlug = new Map<string, CartItem[]>();
  for (const item of items) {
    const list = bySlug.get(item.slug) ?? [];
    list.push(item);
    bySlug.set(item.slug, list);
  }

  await Promise.all(
    [...bySlug.entries()].map(async ([slug, lines]) => {
      let product;
      try {
        product = await backend.getProductBySlug(slug);
      } catch {
        return;
      }
      for (const line of lines) {
        const sku = product.skus.find((s) => s.id === line.id);
        if (!sku) continue;
        const max = maxPurchasableQty(sku.stock);
        if (!isPurchasable(sku.stock)) {
          issues.push({
            cartKey: line.cartKey,
            name: line.name,
            reason: "out_of_stock",
            available: max,
            requested: line.qty,
          });
        } else if (max != null && line.qty > max) {
          issues.push({
            cartKey: line.cartKey,
            name: line.name,
            reason: "insufficient",
            available: max,
            requested: line.qty,
          });
        }
      }
    }),
  );

  return issues;
}
