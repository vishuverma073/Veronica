import { z } from "zod";

/**
 * schema.org/Product JSON-LD shape (Phase 6). The backend pre-computes this on
 * the product detail response so the frontend can render it verbatim in a
 * <script type="application/ld+json"> tag without reconstructing it.
 */
export const ProductOfferSchema = z.object({
  "@type": z.literal("Offer"),
  price: z.number(),
  priceCurrency: z.literal("INR"),
  // schema.org availability URL, e.g. https://schema.org/InStock
  availability: z.string(),
});
export type ProductOffer = z.infer<typeof ProductOfferSchema>;

export const ProductStructuredDataSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("Product"),
  name: z.string(),
  image: z.array(z.string()),
  description: z.string(),
  brand: z.object({ "@type": z.literal("Brand"), name: z.string() }),
  sku: z.string(),
  offers: ProductOfferSchema,
});
export type ProductStructuredData = z.infer<typeof ProductStructuredDataSchema>;
