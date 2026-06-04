import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug"; // skip the requireAdmin cache

import { createApp } from "../src/app.js";
import { signAccess, signAdminAccess } from "../src/lib/jwt.js";
import { orders, orderEvents } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const ORDER_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const EVENTS = [
  { id: 1, eventType: "placed", note: null, createdAt: new Date("2026-05-01T10:00:00Z") },
  { id: 2, eventType: "paid", note: null, createdAt: new Date("2026-05-01T10:05:00Z") },
];

interface Opts {
  order?: unknown;
  admin?: boolean;
  statusUpdates?: { status: string }[];
}

function mockDb(opts: Opts): DbClient {
  const adminRow = opts.admin === false ? null : { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  return {
    // requireAdmin lookup + admin order existence check both use select().from(...).where().limit()
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === orders) return opts.order ? [opts.order] : [];
            return adminRow ? [adminRow] : [];
          },
          orderBy: async () => EVENTS, // /events listing
        }),
      }),
    }),
    query: {
      orders: { findFirst: async () => opts.order },
    },
    insert: () => ({
      values: () => ({
        returning: async () => [
          { id: 3, eventType: "shipped", note: "AWB#123", createdAt: new Date("2026-05-02T09:00:00Z") },
        ],
      }),
    }),
    update: () => ({
      set: (s: { status: string }) => ({
        where: async () => {
          opts.statusUpdates?.push(s);
        },
      }),
    }),
  } as unknown as DbClient;
}

const userToken = () => signAccess({ sub: USER_ID, isAdmin: false });
const adminToken = () => signAdminAccess({ sub: ADMIN_ID });

describe("GET /me/orders/:orderNumber/events", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb({}) }).request("/me/orders/VE0000000000/events");
    expect(res.status).toBe(401);
  });

  it("404 when the order is not owned / not found", async () => {
    const res = await createApp({ db: mockDb({ order: undefined }) }).request(
      "/me/orders/VE0000000000/events",
      { headers: { Authorization: `Bearer ${await userToken()}` } },
    );
    expect(res.status).toBe(404);
  });

  it("returns the chronological timeline for an owned order", async () => {
    const res = await createApp({ db: mockDb({ order: { id: ORDER_UUID } }) }).request(
      "/me/orders/VE0000000000/events",
      { headers: { Authorization: `Bearer ${await userToken()}` } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { eventType: string }[] };
    expect(body.events.map((e) => e.eventType)).toEqual(["placed", "paid"]);
  });
});

describe("POST /admin/orders/:id/events", () => {
  it("401 without an admin token", async () => {
    const res = await createApp({ db: mockDb({}) }).request(`/admin/orders/${ORDER_UUID}/events`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("400 on an invalid event type", async () => {
    const res = await createApp({ db: mockDb({ admin: true }) }).request(
      `/admin/orders/${ORDER_UUID}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await adminToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "teleported" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("404 when the order doesn't exist", async () => {
    const res = await createApp({ db: mockDb({ admin: true, order: undefined }) }).request(
      `/admin/orders/${ORDER_UUID}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await adminToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "shipped", note: "AWB#123" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("201 adds the event and advances order status for a status event", async () => {
    const statusUpdates: { status: string }[] = [];
    const res = await createApp({
      db: mockDb({ admin: true, order: { id: ORDER_UUID }, statusUpdates }),
    }).request(`/admin/orders/${ORDER_UUID}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await adminToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "shipped", note: "AWB#123" }),
    });
    expect(res.status).toBe(201);
    expect(statusUpdates.some((u) => u.status === "shipped")).toBe(true);
  });
});
