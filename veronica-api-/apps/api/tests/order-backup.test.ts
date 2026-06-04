import { describe, expect, it, vi } from "vitest";
import { backupOrder, type OrderSnapshot } from "../src/lib/order-backup.js";
import type { DbClient } from "../src/db/client.js";

const SNAPSHOT: OrderSnapshot = {
  orderId: "11111111-1111-1111-1111-111111111111",
  orderNumber: "VE7K3PQ2M8AB",
  userId: "u1",
  customer: { name: "Asha", phone: "+919350529717", email: "asha@example.com" },
  shippingAddress: { line1: "123 Test St", city: "Delhi", state: "DL", pincode: "110001" },
  totals: { subtotal: 1000, shippingFee: 99, gstAmount: 168, total: 1099 },
  items: [
    { skuId: 101, productName: "Lavender Sink", skuCode: "LS-1", variantLabel: "18x16", qty: 1, unitPrice: 1000, lineTotal: 1000 },
  ],
  status: "pending",
  notes: "leave at gate",
  razorpayOrderId: "order_VE7K3PQ2M8AB",
  capturedAt: "2026-06-03T00:00:00.000Z",
};

describe("backupOrder", () => {
  it("writes a backup row carrying the full snapshot", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: () => ({ values }) } as unknown as DbClient;

    await backupOrder(db, "created", SNAPSHOT);

    expect(values).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: SNAPSHOT.orderId,
        orderNumber: "VE7K3PQ2M8AB",
        reason: "created",
        snapshot: SNAPSHOT,
      }),
    );
  });

  it("swallows DB failures so it never blocks checkout/payment", async () => {
    const db = {
      insert: () => ({ values: () => Promise.reject(new Error("relation order_backups does not exist")) }),
    } as unknown as DbClient;

    await expect(backupOrder(db, "paid", SNAPSHOT)).resolves.toBeUndefined();
  });
});
