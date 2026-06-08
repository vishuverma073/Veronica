import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test"; // forces SMS stub mode (no real MSG91 call)

import {
  orderTrackingUrl,
  sendOrderConfirmationSms,
  sendOtp,
  sendTransactionalSms,
} from "../src/lib/sms.js";

describe("orderTrackingUrl", () => {
  it("builds a tracking link under the configured storefront origin", () => {
    process.env.STOREFRONT_URL = "https://shop.example.com";
    expect(orderTrackingUrl("VE7K3PQ2M8AB")).toBe(
      "https://shop.example.com/orders/VE7K3PQ2M8AB",
    );
  });

  it("trims a trailing slash on the origin", () => {
    process.env.STOREFRONT_URL = "https://shop.example.com/";
    expect(orderTrackingUrl("VEABC")).toBe("https://shop.example.com/orders/VEABC");
  });

  it("falls back to the production domain when unset", () => {
    delete process.env.STOREFRONT_URL;
    expect(orderTrackingUrl("VEXYZ")).toBe("https://veronicaindia.com/orders/VEXYZ");
  });
});

describe("OTP SMS (stub mode)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("prints a visible dev OTP line and structured otp_stub log", async () => {
    await sendOtp("+919876543210", "123456");

    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("🔐 DEV OTP"))).toBe(true);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("123456"))).toBe(true);

    const line = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("otp_stub"));
    expect(line).toBeTruthy();
    expect(JSON.parse(line!).code).toBe("123456");
  });
});

describe("order SMS (stub mode)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.STOREFRONT_URL = "https://veronicaindia.com";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it("logs (does not throw) the confirmation SMS with order number + tracking link", async () => {
    await expect(
      sendOrderConfirmationSms("+919350529717", "VE7K3PQ2M8AB"),
    ).resolves.toBeUndefined();

    const line = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.includes("order_sms_stub"));
    expect(line).toBeTruthy();
    const payload = JSON.parse(line!);
    expect(payload.phone).toBe("+919350529717");
    expect(payload.body).toContain("VE7K3PQ2M8AB");
    expect(payload.body).toContain("https://veronicaindia.com/orders/VE7K3PQ2M8AB");
  });

  it("sendTransactionalSms resolves in stub mode", async () => {
    await expect(
      sendTransactionalSms(
        "+919350529717",
        { orderNumber: "VE1", trackingUrl: "https://x/orders/VE1" },
        "hello VE1",
      ),
    ).resolves.toBeUndefined();
  });
});
