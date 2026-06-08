/**
 * Format price in Indian Rupees
 */
export function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(price);
}

/**
 * Generate URL-friendly slug from text
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Calculate discount percentage
 */
export function calcDiscount(basePrice: number, salePrice: number): number {
    return Math.round(((basePrice - salePrice) / basePrice) * 100);
}

/**
 * Generate a unique order number
 */
export function generateOrderNumber(): string {
    const prefix = "VE";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}${timestamp}${random}`;
}

/**
 * Generate WhatsApp order URL
 */
export function generateWhatsAppUrl(
    phone: string,
    items: Array<{ name: string; qty: number; price: number }>,
    total: number
): string {
    const itemsList = items
        .map((item) => `• ${item.name} × ${item.qty} — ${formatPrice(item.price)}`)
        .join("\n");

    const message = encodeURIComponent(
        `🛒 *New Order from Veronica Website*\n\n${itemsList}\n\n*Total: ${formatPrice(total)}*\n\nPlease confirm my order. Thank you!`
    );

    return `https://wa.me/91${phone}?text=${message}`;
}

/**
 * cn - merge classnames (simple)
 */
/** True when `url` is a non-empty, usable image src for img/Image. */
export function hasValidImage(url: string | null | undefined): boolean {
  return getSafeImageSrc(url) !== null;
}

/**
 * Returns a trimmed image URL safe for img/Image `src`, or null when missing/invalid.
 * Rejects empty strings and whitespace-only values.
 */
export function getSafeImageSrc(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/** @deprecated Use getSafeImageSrc — kept for existing product thumbnail call sites. */
export function productImageUrl(url: string | null | undefined): string | null {
  return getSafeImageSrc(url);
}

/** Normalize optional image input for API payloads: empty/invalid → null. */
export function normalizeImageInput(url: string | null | undefined): string | null {
  return getSafeImageSrc(url);
}

export function cn(...classes: (string | undefined | false)[]): string {
    return classes.filter(Boolean).join(" ");
}
