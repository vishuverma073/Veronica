import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { orders } from "../db/schema.js";
import type { AppEnv } from "../lib/types.js";
import { verifyWebhookSignature } from "../lib/razorpay.js";
import { markProcessedOnce } from "../lib/idempotency.js";
import { emitOrderPaid } from "../lib/events.js";
import { log } from "../lib/logger.js";
import { alertSlack } from "../lib/alerts.js";
import { logOrderEvent } from "../lib/order-events.js";

export function makeWebhooksRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /webhooks/razorpay-health — no-op 200 for the uptime monitor (Phase 5).
  // Lets BetterStack ping the webhook surface without sending a fake event.
  router.get("/razorpay-health", (c) => c.json({ status: "ok" }));

  // POST /webhooks/razorpay — no auth; authenticated by the webhook signature.
  // Razorpay retries non-200 for up to 24h, so this MUST be idempotent and
  // return 200 for anything that isn't a signature failure.
  router.post("/razorpay", async (c) => {
    // Signature is computed over the RAW bytes — never the re-serialized JSON.
    const rawBody = await c.req.text();
    const signature = c.req.header("x-razorpay-signature") ?? "";
    if (!verifyWebhookSignature(rawBody, signature)) {
      log("warn", "razorpay_webhook_bad_signature", { request_id: c.get("requestId") });
      void alertSlack("critical", "Razorpay webhook signature failure", "A webhook arrived with an invalid signature — possible misconfiguration or spoofing.");
      return c.json({ error: "Invalid signature" }, 401);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Our bug or a malformed body — 200 so Razorpay doesn't retry forever.
      log("error", "razorpay_webhook_unparseable", { request_id: c.get("requestId") });
      return c.json({ ok: true }, 200);
    }

    const event: string = payload?.event ?? "unknown";
    // Razorpay sends a unique `x-razorpay-event-id` header; fall back to a
    // composite if absent so we still dedupe meaningfully.
    const eventId =
      c.req.header("x-razorpay-event-id") ??
      `${event}:${payload?.payload?.payment?.entity?.id ?? ""}`;

    if (!(await markProcessedOnce(`rzp:webhook:${eventId}`))) {
      log("info", "razorpay_webhook_duplicate", { event, eventId });
      return c.json({ ok: true }, 200);
    }

    try {
      switch (event) {
        case "payment.captured": {
          const orderId: string | undefined = payload?.payload?.payment?.entity?.order_id;
          const paymentId: string | undefined = payload?.payload?.payment?.entity?.id;
          if (!orderId) break;
          const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.razorpayOrderId, orderId))
            .limit(1);
          if (!order) {
            log("warn", "razorpay_webhook_order_not_found", { event, orderId });
            break;
          }
          if (order.status === "pending") {
            await db
              .update(orders)
              .set({ razorpayPaymentId: paymentId, status: "paid", updatedAt: new Date() })
              .where(eq(orders.id, order.id));
            await logOrderEvent(db, { orderId: order.id, eventType: "paid" });
            await emitOrderPaid(order.id);
            log("info", "razorpay_webhook_order_paid", { orderNumber: order.orderNumber });
          }
          // already paid/confirmed → no-op (idempotent)
          break;
        }
        case "payment.failed": {
          // Customer may retry — don't change order state here.
          const failedOrderId = payload?.payload?.payment?.entity?.order_id;
          log("warn", "razorpay_webhook_payment_failed", { orderId: failedOrderId });
          void alertSlack("warning", "Razorpay payment failed", "A customer payment failed.", {
            razorpay_order_id: String(failedOrderId ?? "unknown"),
          });
          break;
        }
        case "refund.processed": {
          const paymentId: string | undefined =
            payload?.payload?.refund?.entity?.payment_id ??
            payload?.payload?.payment?.entity?.id;
          if (!paymentId) break;
          const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.razorpayPaymentId, paymentId))
            .limit(1);
          if (order) {
            await db
              .update(orders)
              .set({ status: "refunded", updatedAt: new Date() })
              .where(eq(orders.id, order.id));
            await logOrderEvent(db, { orderId: order.id, eventType: "refunded" });
            log("info", "razorpay_webhook_order_refunded", { orderNumber: order.orderNumber });
          }
          break;
        }
        default:
          log("info", "razorpay_webhook_unhandled_event", { event });
      }
    } catch (err) {
      // Don't surface processing errors as non-200 (avoids retry storms on bugs).
      log("error", "razorpay_webhook_processing_error", { event, error: (err as Error).message });
    }

    return c.json({ ok: true }, 200);
  });

  return router;
}
