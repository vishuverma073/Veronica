import { describe, expect, it } from "vitest";
import { scrub, scrubEvent } from "../src/lib/sentry.js";

describe("scrub()", () => {
  it("redacts sensitive keys, keeps the rest", () => {
    const out = scrub({
      orderId: "abc",
      password: "hunter2",
      token: "jwt",
      code: "123456",
      signature: "sig",
      razorpay_payment_id: "pay_1",
      nested: { authorization: "Bearer x", total: 1416 },
    }) as Record<string, any>;

    expect(out.orderId).toBe("abc");
    expect(out.nested.total).toBe(1416);
    expect(out.password).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.code).toBe("[redacted]");
    expect(out.signature).toBe("[redacted]");
    expect(out.razorpay_payment_id).toBe("[redacted]");
    expect(out.nested.authorization).toBe("[redacted]");
  });

  it("handles arrays and primitives without throwing", () => {
    expect(scrub([{ token: "x" }, 1, "s"]) as any).toEqual([{ token: "[redacted]" }, 1, "s"]);
    expect(scrub(null)).toBeNull();
    expect(scrub(42)).toBe(42);
  });
});

describe("scrubEvent()", () => {
  it("scrubs request + extra on the event", () => {
    const ev = {
      request: { headers: { authorization: "Bearer secret" } },
      extra: { razorpay_signature: "sig", path: "/checkout/verify" },
    } as any;
    const cleaned = scrubEvent(ev);
    expect(cleaned.request.headers.authorization).toBe("[redacted]");
    expect(cleaned.extra.razorpay_signature).toBe("[redacted]");
    expect(cleaned.extra.path).toBe("/checkout/verify");
  });
});
