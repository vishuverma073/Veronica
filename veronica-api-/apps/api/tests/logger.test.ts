import { describe, expect, it, vi } from "vitest";
import { log, maskFields } from "../src/lib/logger.js";

describe("maskFields()", () => {
  it("masks phone numbers and redacts secrets", () => {
    const out = maskFields({
      phone: "+919350529717",
      otp: "123456",
      token: "jwt",
      order_id: "abc",
    });
    expect(out.phone).toBe("+91935****");
    expect(out.otp).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.order_id).toBe("abc");
  });

  it("leaves short / non-string phones alone", () => {
    expect(maskFields({ phone: "12345" }).phone).toBe("12345");
    expect(maskFields({ phone: 42 as unknown as string }).phone).toBe(42);
  });
});

describe("log()", () => {
  it("writes one structured JSON line with standard fields to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "request", { path: "/x", phone: "+919350529717" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "info", msg: "request", service: "veronica-api", path: "/x" });
    expect(line.phone).toBe("+91935****"); // masked
    expect(typeof line.ts).toBe("string");
    spy.mockRestore();
  });
});
