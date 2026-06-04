import type { HomeSection } from "@veronica/contracts";

/**
 * Out-of-the-box storefront home layout, used until an admin saves a custom
 * config. The admin composer opens on this, the public /home serves it, and the
 * Next.js homepage mirrors it as a final fallback — so all three agree.
 */
export const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  {
    key: "hero",
    enabled: true,
    order: 0,
    config: {
      imageUrl: "/uploads/categories/kitchen-sinks.webp",
      title: "Crafted for Modern Living",
      subtitle:
        "Premium kitchen sinks, faucets & bathroom solutions. Built to last with uncompromising quality.",
      ctaText: "Explore Collection",
      ctaHref: "/category/kitchen-sinks",
    },
  },
  { key: "categories", enabled: true, order: 1, config: { categoryIds: [] } },
  { key: "bestsellers", enabled: true, order: 2, config: {} },
  {
    key: "promo",
    enabled: true,
    order: 3,
    config: {
      imageUrl: "/uploads/categories/plumbing-fittings.webp",
      headline: "Premium Quality, Honest Prices",
      ctaText: "Browse All Products",
      ctaHref: "/category/kitchen-sinks",
    },
  },
  { key: "new", enabled: true, order: 4, config: {} },
  { key: "featured", enabled: false, order: 5, config: { productIds: [] } },
];
