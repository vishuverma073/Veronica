import { z } from "zod";
import { IdSchema, MoneySchema } from "./common";

/** Product lifecycle status. */
export const ProductStatusSchema = z.enum(["active", "draft", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

/** One selectable value on a variant axis, e.g. "24×18" on the "Size" dimension. */
export const DimensionValueSchema = z.object({
  id: IdSchema,
  value: z.string().min(1),
  label: z.string().optional(),
  sortOrder: z.number().int().default(0),
});
export type DimensionValue = z.infer<typeof DimensionValueSchema>;

/** A named variant axis on a product, e.g. "Size" / "Weight" / "Color". */
export const VariantDimensionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  values: z.array(DimensionValueSchema),
});
export type VariantDimension = z.infer<typeof VariantDimensionSchema>;

/** A purchasable unit: a product × a specific combination of dimension values. */
export const ProductSKUSchema = z.object({
  id: IdSchema,
  skuCode: z.string().min(1),
  price: MoneySchema,
  salePrice: MoneySchema.nullable(),
  /** e.g. { "Size": "24×18", "Weight": "Heavy" } */
  dimensionValues: z.record(z.string(), z.string()),
  /** Free-form per-SKU details, e.g. { "Bowl Size": "22×16", "mm": "610×510" } */
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.number().int().nullable().optional(),
});
export type ProductSKU = z.infer<typeof ProductSKUSchema>;

export const SpecificationSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type Specification = z.infer<typeof SpecificationSchema>;

/** Full product detail — what the PDP and admin editor consume. */
export const ProductSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(""),
  categoryId: IdSchema,
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  status: ProductStatusSchema.default("draft"),
  tags: z.array(z.string()).default([]),
  // The real API returns image objects ({ url, sortOrder }); the MSW mocks use
  // bare URL strings. Accept both and normalize to string[] so the UI (next/image
  // src) is unchanged. Without this the PDP threw on parse and 404'd silently.
  images: z
    .array(
      z.union([
        z.string(),
        z.object({ url: z.string(), sortOrder: z.number().int().optional() }),
      ]),
    )
    .transform((arr) =>
      arr
        .map((img) => (typeof img === "string" ? img : img.url))
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  dimensions: z.array(VariantDimensionSchema).default([]),
  skus: z.array(ProductSKUSchema),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Lightweight product shape for grids/carousels/search. Pricing is
 * pre-computed server-side so the client never recomputes from SKUs.
 */
export const ProductListItemSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: z.string(),
  categoryId: IdSchema,
  // Real API returns null when there is no primary image; normalize to "" so
  // grids still render and thumbnail helpers can show a placeholder.
  image: z
    .string()
    .nullish()
    .transform((v) => v?.trim() ?? ""),
  minPrice: MoneySchema,
  maxBasePrice: MoneySchema,
  bestDiscount: z.number().int().min(0).max(100),
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  isFeatured: z.boolean().default(false),
  status: ProductStatusSchema,
  // Optional: the public /products list omits skuCount (only /admin/products
  // returns it, where the admin UI shows "N SKUs"). Keeping it required broke
  // every storefront grid (bestsellers/new arrivals/category) against the real API.
  skuCount: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  /** Size values from variant dimensions (Size / Overall Size) for category filters. */
  sizes: z.array(z.string()).default([]),
});
export type ProductListItem = z.infer<typeof ProductListItemSchema>;

// ─── Admin product write payloads (server assigns ids) ─────────────────────

export const ProductImageInputSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const DimensionValueInputSchema = z.object({
  value: z.string().min(1),
  label: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const DimensionInputSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  values: z.array(DimensionValueInputSchema).default([]),
});

export const SkuInputSchema = z.object({
  skuCode: z.string().min(1),
  price: MoneySchema,
  salePrice: MoneySchema.nullable().default(null),
  dimensionValues: z.record(z.string(), z.string()).default({}),
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.number().int().nullable().optional(),
});

/** Admin create payload — product, SKU, and dimension ids are server-assigned. */
export const AdminProductCreateSchema = z.object({
  categoryId: IdSchema,
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(""),
  status: ProductStatusSchema.default("draft"),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
  images: z
    .array(z.union([z.string(), ProductImageInputSchema]))
    .default([]),
  dimensions: z.array(DimensionInputSchema).default([]),
  skus: z.array(SkuInputSchema).default([]),
});
export type AdminProductCreate = z.infer<typeof AdminProductCreateSchema>;

export const AdminProductUpdateSchema = AdminProductCreateSchema.partial();
export type AdminProductUpdate = z.infer<typeof AdminProductUpdateSchema>;
