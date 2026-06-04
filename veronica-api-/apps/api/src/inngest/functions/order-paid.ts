import { eq } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import type { DbClient } from "../../db/client.js";
import { orders } from "../../db/schema.js";
import { sendOrderConfirmation } from "../../lib/email.js";
import { sendOrderConfirmationSms, orderTrackingUrl } from "../../lib/sms.js";
import { backupOrder } from "../../lib/order-backup.js";
import { alertSlack } from "../../lib/alerts.js";
import type { ShippingAddress } from "@veronica/contracts";

/**
 * order.paid handler (Phase 4). Runs async after checkout/verify (or the
 * webhook) marks an order paid. Sends the confirmation email; future work
 * (admin WhatsApp/Slack ping) hangs off the same event.
 */
export function makeOrderPaid(db: DbClient): InngestFunction.Like {
  return inngest.createFunction(
    { id: "order-paid", triggers: [{ event: "order.paid" }] },
    async ({ event, step }) => {
      const orderId = event.data?.orderId as string | undefined;
      if (!orderId) return { skipped: "no-order-id" };

      const order = await step.run("load-order", async () => {
        const row = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          with: { items: { orderBy: (oi, { asc }) => [asc(oi.id)] } },
        });
        return row ?? null;
      });
      if (!order) return { skipped: "order-not-found", orderId };

      // step.run gives at-least-once execution with backoff retries — a flaky
      // Resend call is retried without re-charging or duplicating the order.
      await step.run("send-confirmation-email", async () => {
        const addr = order.shippingAddress as ShippingAddress;
        await sendOrderConfirmation({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          subtotal: Number(order.subtotal),
          shippingFee: Number(order.shippingFee),
          gstAmount: Number(order.gstAmount),
          total: Number(order.total),
          shippingAddress: addr,
          trackingUrl: orderTrackingUrl(order.orderNumber),
          items: order.items.map((it) => ({
            productName: it.productName,
            variantLabel: it.variantLabel,
            qty: it.qty,
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
            imageUrl: it.imageUrl,
          })),
        });
      });

      // Text the customer their confirmation + a tracking link. Separate step so
      // a flaky SMS provider retries independently of the email (at-least-once),
      // and a no-op (stub) until MSG91 transactional SMS is configured.
      await step.run("send-confirmation-sms", async () => {
        await sendOrderConfirmationSms(order.customerPhone, order.orderNumber);
      });

      // Durable backup of the fully-paid order (best-effort; never fails the job).
      await step.run("backup-paid-order", async () => {
        await backupOrder(db, "paid", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          customer: {
            name: order.customerName,
            phone: order.customerPhone,
            email: order.customerEmail,
          },
          shippingAddress: order.shippingAddress,
          totals: {
            subtotal: Number(order.subtotal),
            shippingFee: Number(order.shippingFee),
            gstAmount: Number(order.gstAmount),
            total: Number(order.total),
          },
          items: order.items.map((it) => ({
            skuId: it.skuId,
            productName: it.productName,
            skuCode: it.skuCode,
            variantLabel: it.variantLabel,
            qty: it.qty,
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
          })),
          status: order.status,
          notes: order.notes,
          razorpayOrderId: order.razorpayOrderId,
          razorpayPaymentId: order.razorpayPaymentId,
          capturedAt: new Date().toISOString(),
        });
      });

      // Ping the team channel so a merchant sees the sale without watching the
      // admin. No-ops when SLACK_WEBHOOK_URL is unset; the order number in the
      // title keeps each order's alert distinct from the 5-min throttle.
      await step.run("notify-admin", async () => {
        await alertSlack(
          "info",
          `New paid order ${order.orderNumber}`,
          `${order.customerName} — ₹${Number(order.total).toFixed(2)}`,
          {
            order: order.orderNumber,
            customer: order.customerName,
            total: `₹${Number(order.total).toFixed(2)}`,
            items: order.items.length,
          },
        );
      });

      return { orderNumber: order.orderNumber };
    },
  );
}
