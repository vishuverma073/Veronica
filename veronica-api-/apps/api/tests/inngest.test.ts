import { describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";

import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

const db = {} as DbClient;

describe("Inngest serve endpoint", () => {
  it("is mounted at /api/inngest (route matches; not a 404)", async () => {
    // The Inngest handler runs (it errors only because there's no signing key in
    // the test env) — the point here is that the route is wired, not a 404.
    const res = await createApp({ db }).request("/api/inngest", { method: "GET" });
    expect(res.status).not.toBe(404);
  });
});
