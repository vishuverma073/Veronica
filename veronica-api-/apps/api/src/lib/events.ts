import { inngest } from "../inngest/client.js";

/**
 * Fire the `order.paid` event, which drives the confirmation email (and future
 * async work). Best-effort: it never throws into the request path, and is
 * skipped under NODE_ENV=test so the suite doesn't reach Inngest's network.
 */
export async function emitOrderPaid(orderId: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await inngest.send({ name: "order.paid", data: { orderId } });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "inngest_send_failed",
        event: "order.paid",
        orderId,
        error: (err as Error).message,
      }),
    );
  }
}
