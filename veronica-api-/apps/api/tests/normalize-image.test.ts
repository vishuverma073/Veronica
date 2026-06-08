import { describe, expect, it } from "vitest";
import { normalizeImageUrl } from "../src/lib/normalize-image.js";

describe("normalizeImageUrl", () => {
  it("returns null for empty or whitespace-only values", () => {
    expect(normalizeImageUrl("")).toBeNull();
    expect(normalizeImageUrl("   ")).toBeNull();
    expect(normalizeImageUrl(null)).toBeNull();
    expect(normalizeImageUrl(undefined)).toBeNull();
  });

  it("returns trimmed relative and absolute urls", () => {
    expect(normalizeImageUrl("  /uploads/a.webp  ")).toBe("/uploads/a.webp");
    expect(normalizeImageUrl("https://cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp");
  });

  it("rejects invalid protocols", () => {
    expect(normalizeImageUrl("javascript:alert(1)")).toBeNull();
  });
});
