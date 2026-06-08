import { describe, expect, it } from "vitest";
import type { AdminUser } from "@veronica/contracts";
import { displayAdminName, safeAdminReturnTo } from "@/lib/admin-welcome";

describe("safeAdminReturnTo", () => {
  it("allows admin dashboard paths", () => {
    expect(safeAdminReturnTo("/admin/products")).toBe("/admin/products");
  });

  it("blocks login and welcome loops", () => {
    expect(safeAdminReturnTo("/admin/login")).toBe("/admin");
    expect(safeAdminReturnTo("/admin/welcome")).toBe("/admin");
  });

  it("blocks external redirects", () => {
    expect(safeAdminReturnTo("https://evil.test")).toBe("/admin");
    expect(safeAdminReturnTo("/account")).toBe("/admin");
  });
});

describe("displayAdminName", () => {
  it("uses profile name when set", () => {
    const admin: AdminUser = { id: "1", email: "a@b.com", name: "Ketan (Admin)" };
    expect(displayAdminName(admin)).toBe("Ketan (Admin)");
  });

  it("falls back to email local part", () => {
    const admin: AdminUser = { id: "1", email: "admin@test.local", name: "" };
    expect(displayAdminName(admin)).toBe("Admin");
  });

  it("handles missing admin", () => {
    expect(displayAdminName(null)).toBe("Admin");
  });
});
