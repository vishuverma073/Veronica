import type { DbClient } from "../db/client.js";
import { orderBackups } from "../db/schema.js";

/** A full, self-contained snapshot of an order at a point in its lifecycle. */
export interface OrderSnapshot {
  orderId: string;
  orderNumber: string;
  userId?: string | null;
  customer: { name: string; phone: string; email?: string | null };
  shippingAddress: unknown;
  totals: { subtotal: number; shippingFee: number; gstAmount: number; total: number };
  items: Array<{
    skuId?: number | null;
    productName: string;
    skuCode?: string | null;
    variantLabel?: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  status: string;
  notes?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  capturedAt: string;
}

/**
 * Write a durable backup of an order. Called when an order is placed
 * (`"created"`) and again when it's paid (`"paid"`), so the full order is
 * recoverable from `order_backups` even if the live row is later changed or
 * lost.
 *
 * Best-effort by design: a backup failure (e.g. the migration hasn't been
 * applied yet, or the DB is briefly unavailable) is logged but NEVER thrown —
 * it must not break the checkout/payment path that triggered it.
 */
export async function backupOrder(
  db: DbClient,
  reason: "created" | "paid",
  snapshot: OrderSnapshot,
): Promise<void> {
  try {
    await db.insert(orderBackups).values({
      orderId: snapshot.orderId,
      orderNumber: snapshot.orderNumber,
      reason,
      snapshot,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "order_backup_failed",
        order_id: snapshot.orderId,
        order_number: snapshot.orderNumber,
        reason,
        error: (err as Error).message,
      }),
    );
  }
}
