import { describe, it, expect } from "vitest";
import {
    formatPrice,
    slugify,
    calcDiscount,
    generateOrderNumber,
    generateWhatsAppUrl,
    cn,
    getSafeImageSrc,
    hasValidImage,
    productImageUrl,
} from "./utils";

// ─────────────────────────────────────────────────────────────
// formatPrice
// ─────────────────────────────────────────────────────────────
describe("formatPrice", () => {
    it("formats whole numbers as Indian rupees", () => {
        expect(formatPrice(1000)).toBe("₹1,000");
        expect(formatPrice(100000)).toBe("₹1,00,000");
        expect(formatPrice(8499)).toBe("₹8,499");
    });

    it("formats zero correctly", () => {
        expect(formatPrice(0)).toBe("₹0");
    });

    it("drops decimal places for whole numbers", () => {
        // minimumFractionDigits: 0 means no .00 suffix
        expect(formatPrice(1000)).not.toContain(".");
    });

    it("handles large catalogue-scale prices", () => {
        expect(formatPrice(24000)).toBe("₹24,000");
        expect(formatPrice(14499)).toBe("₹14,499");
    });
});

// ─────────────────────────────────────────────────────────────
// slugify
// ─────────────────────────────────────────────────────────────
describe("slugify", () => {
    it("lowercases and hyphenates words", () => {
        expect(slugify("Kitchen Sinks")).toBe("kitchen-sinks");
        expect(slugify("Health Faucets")).toBe("health-faucets");
    });

    it("strips special characters", () => {
        expect(slugify("S.S. Braided (Pipe)")).toBe("ss-braided-pipe");
        expect(slugify("6-Piece Set!")).toBe("6-piece-set");
    });

    it("collapses multiple spaces and hyphens", () => {
        expect(slugify("Veronica  India --  Sinks")).toBe("veronica-india-sinks");
    });

    it("trims leading and trailing hyphens", () => {
        expect(slugify("  --kitchen--  ")).toBe("kitchen");
    });

    it("handles real product names", () => {
        expect(slugify("Lavender Imported Range Single Bowl")).toBe(
            "lavender-imported-range-single-bowl"
        );
        expect(slugify("Veronica Square Floor Drain (Cockroach Trap)")).toBe(
            "veronica-square-floor-drain-cockroach-trap"
        );
    });
});

// ─────────────────────────────────────────────────────────────
// calcDiscount
// ─────────────────────────────────────────────────────────────
describe("calcDiscount", () => {
    it("calculates 50% discount correctly", () => {
        expect(calcDiscount(2000, 1000)).toBe(50);
    });

    it("rounds to nearest integer", () => {
        // (3060 - 2100) / 3060 = 31.37% → rounds to 31
        expect(calcDiscount(3060, 2100)).toBe(31);
    });

    it("returns 0 when sale equals base", () => {
        expect(calcDiscount(1000, 1000)).toBe(0);
    });

    it("handles real catalogue discounts", () => {
        expect(calcDiscount(18500, 8499)).toBe(54); // Orchid sink
        expect(calcDiscount(850, 399)).toBe(53);    // Floor drain
        expect(calcDiscount(2800, 1399)).toBe(50);  // Brass faucet
    });
});

// ─────────────────────────────────────────────────────────────
// generateOrderNumber
// ─────────────────────────────────────────────────────────────
describe("generateOrderNumber", () => {
    it("starts with VE prefix", () => {
        expect(generateOrderNumber()).toMatch(/^VE/);
    });

    it("generates unique order numbers", () => {
        const a = generateOrderNumber();
        const b = generateOrderNumber();
        const c = generateOrderNumber();
        expect(a).not.toBe(b);
        expect(b).not.toBe(c);
    });

    it("produces a non-empty string of reasonable length", () => {
        const num = generateOrderNumber();
        expect(num.length).toBeGreaterThan(4);
        expect(num.length).toBeLessThan(30);
    });
});

// ─────────────────────────────────────────────────────────────
// generateWhatsAppUrl
// ─────────────────────────────────────────────────────────────
describe("generateWhatsAppUrl", () => {
    const items = [
        { name: "Test Sink", qty: 1, price: 8499 },
        { name: "Waste Coupling", qty: 2, price: 398 },
    ];
    const total = 8897;

    it("targets the correct phone number", () => {
        const url = generateWhatsAppUrl("9350529717", items, total);
        expect(url).toContain("wa.me/919350529717");
    });

    it("includes the encoded message text", () => {
        const url = generateWhatsAppUrl("9350529717", items, total);
        expect(url).toContain("text=");
        expect(url).toContain("Veronica");
    });

    it("returns a valid HTTPS URL", () => {
        const url = generateWhatsAppUrl("9350529717", items, total);
        expect(url).toMatch(/^https:\/\/wa\.me\//);
    });

    it("encodes special characters in the message", () => {
        const url = generateWhatsAppUrl("9350529717", items, total);
        // Encoded spaces, rupee sign etc should be in the query string
        expect(url).not.toContain(" "); // no raw spaces in a URL
    });
});

// ─────────────────────────────────────────────────────────────
// getSafeImageSrc / hasValidImage
// ─────────────────────────────────────────────────────────────
describe("getSafeImageSrc", () => {
    it("returns null for empty, whitespace, null, or undefined", () => {
        expect(getSafeImageSrc("")).toBeNull();
        expect(getSafeImageSrc("   ")).toBeNull();
        expect(getSafeImageSrc(null)).toBeNull();
        expect(getSafeImageSrc(undefined)).toBeNull();
    });

    it("returns trimmed relative and absolute urls", () => {
        expect(getSafeImageSrc("  /uploads/a.webp  ")).toBe("/uploads/a.webp");
        expect(getSafeImageSrc("https://cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp");
    });

    it("rejects invalid protocols", () => {
        expect(getSafeImageSrc("javascript:alert(1)")).toBeNull();
        expect(getSafeImageSrc("data:image/png;base64,abc")).toBeNull();
    });
});

describe("hasValidImage", () => {
    it("mirrors getSafeImageSrc truthiness", () => {
        expect(hasValidImage("")).toBe(false);
        expect(hasValidImage("/uploads/a.webp")).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// productImageUrl (alias)
// ─────────────────────────────────────────────────────────────
describe("productImageUrl", () => {
    it("returns null for empty or whitespace-only urls", () => {
        expect(productImageUrl("")).toBeNull();
        expect(productImageUrl("   ")).toBeNull();
        expect(productImageUrl(null)).toBeNull();
        expect(productImageUrl(undefined)).toBeNull();
    });

    it("returns trimmed urls", () => {
        expect(productImageUrl("  /uploads/a.webp  ")).toBe("/uploads/a.webp");
    });
});

// ─────────────────────────────────────────────────────────────
// cn (classname merger)
// ─────────────────────────────────────────────────────────────
describe("cn", () => {
    it("joins class strings", () => {
        expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("filters out falsy values", () => {
        expect(cn("foo", false, undefined, "bar")).toBe("foo bar");
    });

    it("handles empty input", () => {
        expect(cn()).toBe("");
    });

    it("handles a single class", () => {
        expect(cn("btn")).toBe("btn");
    });

    it("handles conditional classes", () => {
        const isActive = true;
        const isDisabled = false;
        expect(cn("btn", isActive && "active", isDisabled && "disabled")).toBe(
            "btn active"
        );
    });
});
