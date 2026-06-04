import type { OrderEventType } from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { orderEvents } from "../db/schema.js";

/**
 * Append an event to an order's timeline (Phase 6). System transitions pass no
 * `createdBy`; admin actions pass the admin's user id. Best-effort — a logging
 * failure must never break the checkout/webhook path that triggered it.
 */
export async function logOrderEvent(
  db: DbClient,
  input: { orderId: string; eventType: OrderEventType; note?: string | null; createdBy?: string | null },
): Promise<void> {
  try {
    await db.insert(orderEvents).values({
      orderId: input.orderId,
      eventType: input.eventType,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "order_event_log_failed",
        order_id: input.orderId,
        event_type: input.eventType,
        error: (err as Error).message,
      }),
    );
  }
}
