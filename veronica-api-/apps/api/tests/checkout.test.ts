import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.NODE_ENV = "test"; // forces Razorpay stub mode

import { createApp } from "../src/app.js";
import { signAccess } from "../src/lib/jwt.js";
import { computePaymentSignature } from "../src/lib/razorpay.js";
import { users, carts, addresses, orders } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const USER = { id: USER_ID, phone: "+919350529717", name: "Asha", email: "asha@example.com" };

interface State {
  user?: unknown;
  cart?: { id: string };
  address?: unknown;
  order?: unknown;
  items?: unknown[];
}

function makeDb(state: State): DbClient {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === users) return state.user ? [state.user] : [];
            if (table === carts) return state.cart ? [state.cart] : [];
            if (table === addresses) return state.address ? [state.address] : [];
            if (table === orders) return state.order ? [state.order] : [];
            return [];
          },
        }),
      }),
    }),
    query: { cartItems: { findMany: async () => state.items ?? [] } },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ insert: () => ({ values: async () => {} }) }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
  } as unknown as DbClient;
}

const cartItem = {
  id: 1,
  skuId: 10,
  qty: 2,
  sku: {
    id: 10,
    skuCode: "LAV-1",
    price: "1500.00",
    salePrice: null,
    dimensionValues: { Size: "18x16" },
    product: { name: "Lavender Sink", images: [{ url: "/a.png" }] },
  },
};
const ADDRESS = { line1: "123 Test St", city: "Delhi", state: "DL", pincode: "110001" };

async function token(sub = USER_ID) {
  return signAccess({ sub, isAdmin: false });
}

describe("POST /checkout/order", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: makeDb({}) }).request("/checkout/order", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("400 when neither addressId nor address is supplied", async () => {
    const res = await createApp({ db: makeDb({ user: USER }) }).request("/checkout/order", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("400 when the cart is empty", async () => {
    const res = await createApp({ db: makeDb({ user: USER, items: [] }) }).request("/checkout/order", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ address: ADDRESS }),
    });
    expect(res.status).toBe(400);
  });

  it("happy path → creates order, returns Razorpay handoff", async () => {
    const res = await createApp({
      db: makeDb({ user: USER, cart: { id: "c1" }, items: [cartItem] }),
    }).request(
      "/checkout/order",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ address: ADDRESS }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // GST-inclusive pricing: subtotal 3000 + ₹99 shipping = total 3099 → 309900
    // paise (GST is already inside the price, not added on top).
    expect(body).toMatchObject({ amount: 309900, currency: "INR" });
    expect(String(body.orderNumber)).toMatch(/^VE[0-9A-Z]{10}$/);
    expect(String(body.razorpayOrderId)).toContain("order_stub_");
  });
});

describe("POST /checkout/verify", () => {
  const RZP_ORDER_ID = "order_stub_VE0000000000";
  const PAYMENT_ID = "pay_test_123";
  const pendingOrder = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    orderNumber: "VE0000000000",
    userId: USER_ID,
    razorpayOrderId: RZP_ORDER_ID,
    status: "pending",
  };

  it("404 when no order matches the razorpay order id", async () => {
    const res = await createApp({ db: makeDb({ order: undefined }) }).request("/checkout/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: RZP_ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: "deadbeef",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("403 when the order belongs to another user", async () => {
    const res = await createApp({
      db: makeDb({ order: { ...pendingOrder, userId: OTHER_ID } }),
    }).request("/checkout/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: RZP_ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: computePaymentSignature(RZP_ORDER_ID, PAYMENT_ID),
      }),
    });
    expect(res.status).toBe(403);
  });

  it("400 on an invalid signature", async () => {
    const res = await createApp({ db: makeDb({ order: pendingOrder, cart: { id: "c1" } }) }).request(
      "/checkout/verify",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpayOrderId: RZP_ORDER_ID,
          razorpayPaymentId: PAYMENT_ID,
          razorpaySignature: "0".repeat(64),
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("200 on a valid signature → order paid", async () => {
    const res = await createApp({ db: makeDb({ order: pendingOrder, cart: { id: "c1" } }) }).request(
      "/checkout/verify",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpayOrderId: RZP_ORDER_ID,
          razorpayPaymentId: PAYMENT_ID,
          razorpaySignature: computePaymentSignature(RZP_ORDER_ID, PAYMENT_ID),
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, orderNumber: "VE0000000000" });
  });

  it("200 idempotent when the order is already paid", async () => {
    const res = await createApp({
      db: makeDb({ order: { ...pendingOrder, status: "paid" } }),
    }).request("/checkout/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: RZP_ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: "irrelevant-not-checked",
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /checkout/order/:orderNumber/pay (retry)", () => {
  const pending = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    orderNumber: "VE0000000000",
    userId: USER_ID,
    total: "679.00",
    status: "pending",
    razorpayOrderId: "order_stub_old",
  };

  it("401 without a token", async () => {
    const res = await createApp({ db: makeDb({}) }).request("/checkout/order/VE0000000000/pay", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("404 when the order belongs to another user", async () => {
    const res = await createApp({
      db: makeDb({ order: { ...pending, userId: OTHER_ID } }),
    }).request("/checkout/order/VE0000000000/pay", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(404);
  });

  it("409 when the order is already paid (nothing to retry)", async () => {
    const res = await createApp({
      db: makeDb({ order: { ...pending, status: "paid" } }),
    }).request("/checkout/order/VE0000000000/pay", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(409);
  });

  it("200 → fresh Razorpay handoff for a pending order", async () => {
    const res = await createApp({ db: makeDb({ order: pending }) }).request(
      "/checkout/order/VE0000000000/pay",
      { method: "POST", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.orderNumber).toBe("VE0000000000");
    expect(String(body.razorpayOrderId)).toContain("order_stub_");
    expect(body.razorpayKeyId).toBeTruthy();
    expect(body.amount).toBe(67900); // ₹679 → paise
  });
});
