import { z } from "zod";
import { IdSchema, PriceSchema, SlugSchema, TimestampSchema, UrlSchema } from "./common.js";
import { SkuSchema } from "./sku.js";
import { ProductStructuredDataSchema } from "./seo.js";

/** One selectable value within a variant dimension (e.g. "24×18×9" under "Size"). */
export const DimensionValueSchema = z.object({
  id: IdSchema,
  value: z.string().min(1),
  label: z.string().optional(),
  sortOrder: z.number().int(),
});
export type DimensionValue = z.infer<typeof DimensionValueSchema>;

/** A variant axis for a product (e.g. "Size", "Gauge"). */
export const DimensionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  sortOrder: z.number().int(),
  values: z.array(DimensionValueSchema),
});
export type Dimension = z.infer<typeof DimensionSchema>;

/** A name/value spec row shown on the product page. */
export const SpecificationSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type Specification = z.infer<typeof SpecificationSchema>;

/** A product image with optional alt text and ordering. */
export const ProductImageSchema = z.object({
  url: UrlSchema,
  alt: z.string().optional(),
  sortOrder: z.number().int(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

export const ProductStatusSchema = z.enum(["active", "draft", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

/** Full product detail shape, including variant dimensions and SKUs. */
export const ProductSchema = z.object({
  id: IdSchema,
  categoryId: IdSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string(),
  status: ProductStatusSchema,
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  tags: z.array(z.string()),
  images: z.array(ProductImageSchema),
  dimensions: z.array(DimensionSchema),
  skus: z.array(SkuSchema),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  /** Pre-computed schema.org/Product JSON-LD (Phase 6) — present on detail responses. */
  structuredData: ProductStructuredDataSchema.optional(),
});
export type Product = z.infer<typeof ProductSchema>;

/** Light list shape for grids/search results, with computed price range and primary image. */
export const ProductListItemSchema = z.object({
  id: IdSchema,
  categoryId: IdSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  status: ProductStatusSchema,
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  tags: z.array(z.string()),
  image: UrlSchema.nullable(),
  minPrice: PriceSchema,
  maxBasePrice: PriceSchema,
  /** Best discount across SKUs, as a whole-number percentage. */
  bestDiscount: z.number().int(),
  /** Distinct size values (from Size / Overall Size variant axes) for category filters. */
  sizes: z.array(z.string()).default([]),
});
export type ProductListItem = z.infer<typeof ProductListItemSchema>;

export const ProductListSchema = z.array(ProductListItemSchema);
export type ProductList = z.infer<typeof ProductListSchema>;
