import { describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test"; // alerts are suppressed in test mode

import { alertSlack } from "../src/lib/alerts.js";

describe("alertSlack()", () => {
  it("no-ops (no fetch) when suppressed / unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      alertSlack("critical", "Test", "body", { path: "/x" }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
