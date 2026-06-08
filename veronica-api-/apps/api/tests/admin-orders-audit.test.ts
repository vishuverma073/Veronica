import { describe, expect, it } from "vitest";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug";

import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";

const auditRows = [
  {
    id: 2,
    actorUserId: ADMIN_ID,
    action: "product.create",
    resourceType: "product",
    resourceId: "40",
    changes: null,
    createdAt: new Date(),
  },
  {
    id: 1,
    actorUserId: ADMIN_ID,
    action: "admin.login.success",
    resourceType: "user",
    resourceId: ADMIN_ID,
    changes: null,
    createdAt: new Date(),
  },
];

function adminDb(): DbClient {
  const adminRow = { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  const actorLookup = Promise.resolve([adminRow]);
  return {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(actorLookup, {
            orderBy: () => ({
              limit: async () => auditRows,
            }),
            limit: async () => [adminRow],
          }),
      }),
    }),
    query: { orders: { findMany: async () => [] } },
  } as unknown as DbClient;
}

const token = () => signAdminAccess({ sub: ADMIN_ID });

describe("GET /admin/orders", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/orders");
    expect(res.status).toBe(401);
  });

  it("returns an empty page when there are no orders", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/orders", {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });
});

describe("GET /admin/audit-log", () => {
  it("returns recent entries for an admin", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/audit-log", {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { action: string }[]; nextCursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.action).toBe("product.create");
    expect(body.items[0]!.actorEmail).toBe("a@b.com");
    expect(body.nextCursor).toBeNull();
  });

  it("401 without a token", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/audit-log");
    expect(res.status).toBe(401);
  });
});
