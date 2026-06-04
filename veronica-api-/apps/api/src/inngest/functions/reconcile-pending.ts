import { and, eq, lt } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import type { DbClient } from "../../db/client.js";
import { orders } from "../../db/schema.js";
import { fetchRazorpayOrder } from "../../lib/razorpay.js";
import { emitOrderPaid } from "../../lib/events.js";

const STALE_AFTER_MS = 30 * 60 * 1000; // reconcile pending orders older than 30 min
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000; // cancel still-unpaid orders after 24h

/**
 * Stale-pending reconciliation (per agent-council review, 2026-05-28).
 *
 * Customers who close the tab after creating an order but before the
 * verify/webhook can leave rows stuck in `pending`. Every 15 minutes this asks
 * Razorpay for the truth: if the payment captured, mark paid (and fire
 * order.paid so the email still goes out); if it's been abandoned for 24h,
 * cancel it. In Razorpay stub mode this is a safe no-op (status reads "created").
 */
export function makeReconcilePending(db: DbClient): InngestFunction.Like {
  return inngest.createFunction(
    { id: "reconcile-stale-pending", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
      const now = Date.now();
      const staleCutoff = new Date(now - STALE_AFTER_MS);
      const abandonCutoff = new Date(now - ABANDON_AFTER_MS);

      const stale = await step.run("find-stale-pending", async () =>
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            razorpayOrderId: orders.razorpayOrderId,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(and(eq(orders.status, "pending"), lt(orders.createdAt, staleCutoff)))
          .limit(100),
      );

      let reconciled = 0;
      let cancelled = 0;
      for (const o of stale) {
        const rzp = o.razorpayOrderId ? await fetchRazorpayOrder(o.razorpayOrderId) : null;
        if (rzp?.status === "paid") {
          await db.update(orders).set({ status: "paid", updatedAt: new Date() }).where(eq(orders.id, o.id));
          await emitOrderPaid(o.id);
          reconciled++;
        } else if (new Date(o.createdAt).getTime() < abandonCutoff.getTime()) {
          await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, o.id));
          cancelled++;
        }
      }

      return { scanned: stale.length, reconciled, cancelled };
    },
  );
}
