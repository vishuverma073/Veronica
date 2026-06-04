import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { __clearMemCache } from "../src/lib/cache.js";
import type { DbClient } from "../src/db/client.js";

const db = {} as DbClient;

beforeEach(() => __clearMemCache());
afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    json: async () => body,
  } as Response);
}

const SUCCESS = [
  {
    Status: "Success",
    PostOffice: [{ Name: "Sarita Vihar", District: "New Delhi", State: "Delhi", Country: "India" }],
  },
];

describe("GET /pincode/:pincode", () => {
  it("400 on an invalid format", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await createApp({ db }).request("/pincode/123");
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("200 with city/state for a valid pincode", async () => {
    mockFetchOnce(SUCCESS);
    const res = await createApp({ db }).request("/pincode/110076");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pincode: "110076",
      city: "New Delhi",
      state: "Delhi",
      country: "India",
    });
  });

  it("404 for an unknown pincode", async () => {
    mockFetchOnce([{ Status: "Error", PostOffice: null }]);
    const res = await createApp({ db }).request("/pincode/999999");
    expect(res.status).toBe(404);
  });

  it("caches results (second request does not re-fetch)", async () => {
    const spy = mockFetchOnce(SUCCESS);
    await createApp({ db }).request("/pincode/110076");
    await createApp({ db }).request("/pincode/110076");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
