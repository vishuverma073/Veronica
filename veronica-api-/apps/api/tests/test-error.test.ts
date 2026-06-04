import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

const db = {} as DbClient;

describe("Phase 5 failure drill route", () => {
  afterAll(() => {
    delete process.env.ENABLE_TEST_ERROR;
  });

  it("is absent by default (404)", async () => {
    delete process.env.ENABLE_TEST_ERROR;
    const res = await createApp({ db }).request("/test-error");
    expect(res.status).toBe(404);
  });

  it("throws → 500 when ENABLE_TEST_ERROR=1 (exercises onError → Sentry/Slack)", async () => {
    process.env.ENABLE_TEST_ERROR = "1";
    const res = await createApp({ db }).request("/test-error");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
  });
});
