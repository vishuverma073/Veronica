import { describe, expect, it } from "vitest";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug";

import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

const heroFuture = {
  key: "hero",
  enabled: true,
  order: 0,
  config: { imageUrl: "/x.jpg", title: "t", subtitle: "s", ctaText: "Go", ctaHref: "/c", showFrom: FUTURE },
};
const bestsellersDisabled = { key: "bestsellers", enabled: false, order: 1, config: {} };
const categoriesEnabled = { key: "categories", enabled: true, order: 2, config: { categoryIds: [1, 2] } };

function publicDb(sections: unknown[]): DbClient {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 1, sections }] }) }) }),
  } as unknown as DbClient;
}

function adminDb(): DbClient {
  const adminRow = { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [adminRow] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  } as unknown as DbClient;
}

const token = () => signAdminAccess({ sub: ADMIN_ID });

describe("GET /home (public)", () => {
  it("omits disabled sections and out-of-schedule hero, sorted by order", async () => {
    const res = await createApp({
      db: publicDb([heroFuture, bestsellersDisabled, categoriesEnabled]),
    }).request("/home");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sections: { key: string }[] };
    expect(body.sections.map((s) => s.key)).toEqual(["categories"]); // hero scheduled out, bestsellers disabled
  });
});

describe("PUT /admin/home", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/home", { method: "PUT" });
    expect(res.status).toBe(401);
  });

  it("400 for an invalid section key", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/home", {
      method: "PUT",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sections: [{ key: "bogus", enabled: true, order: 0, config: {} }] }),
    });
    expect(res.status).toBe(400);
  });

  it("200 for a valid config replace", async () => {
    const res = await createApp({ db: adminDb() }).request("/admin/home", {
      method: "PUT",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sections: [categoriesEnabled] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).sections).toHaveLength(1);
  });
});
