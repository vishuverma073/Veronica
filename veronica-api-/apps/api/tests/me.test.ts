import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";

import { createApp } from "../src/app.js";
import { signAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  phone: "+919350529717",
  name: "Asha",
  email: null,
  isAdmin: false,
};

function mockDb(user: unknown): DbClient {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (user ? [user] : []) }) }) }),
  } as unknown as DbClient;
}

describe("GET /me", () => {
  it("401 without Authorization", async () => {
    const res = await createApp({ db: mockDb(USER) }).request("/me");
    expect(res.status).toBe(401);
  });

  it("401 with a malformed token", async () => {
    const res = await createApp({ db: mockDb(USER) }).request("/me", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("200 with a valid token → returns the user", async () => {
    const token = await signAccess({ sub: USER.id, isAdmin: false });
    const res = await createApp({ db: mockDb(USER) }).request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: USER.id, phone: USER.phone, name: "Asha", isAdmin: false });
  });
});

describe("/me/cart auth + validation", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb(USER) }).request("/me/cart");
    expect(res.status).toBe(401);
  });

  it("POST /me/cart/items 400 with a missing skuId", async () => {
    const token = await signAccess({ sub: USER.id, isAdmin: false });
    const res = await createApp({ db: mockDb(USER) }).request("/me/cart/items", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ qty: 2 }),
    });
    expect(res.status).toBe(400);
  });
});
