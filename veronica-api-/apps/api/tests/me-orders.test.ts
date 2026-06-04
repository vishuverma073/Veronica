import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";

import { createApp } from "../src/app.js";
import { signAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function mockDb(opts: { findMany?: unknown[]; findFirst?: unknown } = {}): DbClient {
  return {
    query: {
      orders: {
        findMany: async () => opts.findMany ?? [],
        findFirst: async () => opts.findFirst,
      },
    },
  } as unknown as DbClient;
}

async function token() {
  return signAccess({ sub: USER_ID, isAdmin: false });
}

function listRow(n: number) {
  return {
    id: `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`,
    orderNumber: `VE000000000${n % 10}`,
    total: "1416.00",
    status: "paid" as const,
    createdAt: new Date(2026, 4, 1, 12, 0, n), // distinct timestamps
    items: [{ qty: 2 }, { qty: 1 }],
  };
}

const detailRow = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "VE0000000000",
  total: "1416.00",
  status: "paid" as const,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  subtotal: "1000.00",
  shippingFee: "200.00",
  gstAmount: "216.00",
  shippingAddress: { line1: "123 Test St", city: "Delhi", state: "DL", pincode: "110001" },
  razorpayPaymentId: "pay_test_1",
  items: [
    {
      productName: "Lavender Sink",
      skuCode: "LAV-1",
      variantLabel: "18x16",
      imageUrl: "/a.png",
      unitPrice: "1000.00",
      qty: 1,
      lineTotal: "1000.00",
    },
  ],
};

describe("GET /me/orders", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb() }).request("/me/orders");
    expect(res.status).toBe(401);
  });

  it("returns list items with computed itemCount; nextCursor null on the last page", async () => {
    const res = await createApp({ db: mockDb({ findMany: [listRow(1), listRow(2)] }) }).request(
      "/me/orders",
      { headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: any[]; nextCursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ total: 1416, status: "paid", itemCount: 3 });
    expect(body.nextCursor).toBeNull();
  });

  it("paginates: 21 rows → 20 items + a nextCursor", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => listRow(i + 1));
    const res = await createApp({ db: mockDb({ findMany: rows }) }).request("/me/orders", {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    const body = (await res.json()) as { items: any[]; nextCursor: string | null };
    expect(body.items).toHaveLength(20);
    expect(typeof body.nextCursor).toBe("string");
  });
});

describe("GET /me/orders/:orderNumber", () => {
  it("returns full detail for an owned order", async () => {
    const res = await createApp({ db: mockDb({ findFirst: detailRow }) }).request(
      "/me/orders/VE0000000000",
      { headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      orderNumber: "VE0000000000",
      subtotal: 1000,
      shippingFee: 200,
      gstAmount: 216,
      razorpayPaymentId: "pay_test_1",
    });
    expect((body.items as unknown[]).length).toBe(1);
  });

  it("404 when not found or owned by another user", async () => {
    const res = await createApp({ db: mockDb({ findFirst: undefined }) }).request(
      "/me/orders/VE-nope",
      { headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(404);
  });
});
