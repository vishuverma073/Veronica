import { describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";

import { createApp } from "../src/app.js";
import { computeWebhookSignature } from "../src/lib/razorpay.js";
import type { DbClient } from "../src/db/client.js";

interface Counters {
  updates: number;
  lastSet?: Record<string, unknown>;
}

function makeDb(order: unknown, counters: Counters): DbClient {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (order ? [order] : []) }) }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          counters.updates++;
          counters.lastSet = vals;
        },
      }),
    }),
  } as unknown as DbClient;
}

const ORDER = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "VE0000000000",
  razorpayOrderId: "order_stub_VE0000000000",
  razorpayPaymentId: "pay_test_1",
  status: "pending",
};

function capturedEvent(orderId: string, paymentId = "pay_test_1") {
  return JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
}

async function post(db: DbClient, body: string, headers: Record<string, string>) {
  return createApp({ db }).request("/webhooks/razorpay", { method: "POST", body, headers });
}

describe("GET /webhooks/razorpay-health", () => {
  it("returns 200 for the uptime monitor", async () => {
    const res = await createApp({ db: makeDb(null, { updates: 0 }) }).request(
      "/webhooks/razorpay-health",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("POST /webhooks/razorpay", () => {
  it("401 on an invalid signature", async () => {
    const counters: Counters = { updates: 0 };
    const body = capturedEvent(ORDER.razorpayOrderId);
    const res = await post(makeDb(ORDER, counters), body, {
      "x-razorpay-signature": "badsignature",
      "x-razorpay-event-id": "evt_bad_1",
    });
    expect(res.status).toBe(401);
    expect(counters.updates).toBe(0);
  });

  it("payment.captured → marks the order paid", async () => {
    const counters: Counters = { updates: 0 };
    const body = capturedEvent(ORDER.razorpayOrderId);
    const res = await post(makeDb(ORDER, counters), body, {
      "x-razorpay-signature": computeWebhookSignature(body),
      "x-razorpay-event-id": "evt_captured_1",
    });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(1);
    expect(counters.lastSet).toMatchObject({ status: "paid" });
  });

  it("duplicate event id → 200 and no second state change", async () => {
    const counters: Counters = { updates: 0 };
    const body = capturedEvent(ORDER.razorpayOrderId);
    const headers = {
      "x-razorpay-signature": computeWebhookSignature(body),
      "x-razorpay-event-id": "evt_dup_1",
    };
    const first = await post(makeDb(ORDER, counters), body, headers);
    const second = await post(makeDb(ORDER, counters), body, headers);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(counters.updates).toBe(1); // second request short-circuited
  });

  it("payment.failed → 200 with no state change", async () => {
    const counters: Counters = { updates: 0 };
    const body = JSON.stringify({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_x", order_id: ORDER.razorpayOrderId } } },
    });
    const res = await post(makeDb(ORDER, counters), body, {
      "x-razorpay-signature": computeWebhookSignature(body),
      "x-razorpay-event-id": "evt_failed_1",
    });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(0);
  });

  it("refund.processed → marks the order refunded", async () => {
    const counters: Counters = { updates: 0 };
    const body = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: "pay_test_1" } } },
    });
    const res = await post(makeDb(ORDER, counters), body, {
      "x-razorpay-signature": computeWebhookSignature(body),
      "x-razorpay-event-id": "evt_refund_1",
    });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(1);
    expect(counters.lastSet).toMatchObject({ status: "refunded" });
  });

  it("unknown event type → 200 without crashing", async () => {
    const counters: Counters = { updates: 0 };
    const body = JSON.stringify({ event: "subscription.charged", payload: {} });
    const res = await post(makeDb(ORDER, counters), body, {
      "x-razorpay-signature": computeWebhookSignature(body),
      "x-razorpay-event-id": "evt_unknown_1",
    });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(0);
  });
});
