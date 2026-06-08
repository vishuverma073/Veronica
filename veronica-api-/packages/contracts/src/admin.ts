import { z } from "zod";
import { IdSchema, PriceSchema, SlugSchema, TimestampSchema, UrlSchema } from "./common.js";
import { ProductSchema, ProductStatusSchema, SpecificationSchema } from "./product.js";
import { CategorySchema } from "./category.js";

export const AdminLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;

export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  isAdmin: z.literal(true),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminLoginResponseSchema = z.object({
  accessToken: z.string(),
  admin: AdminUserSchema,
});
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;

// ─── Admin product CRUD ──────────────────────────────────────
// Input shapes omit server-assigned ids (Postgres assigns them).

export const ProductImageInputSchema = z.object({
  url: UrlSchema,
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
  price: PriceSchema,
  salePrice: PriceSchema.nullable().default(null),
  dimensionValues: z.record(z.string(), z.string()).default({}),
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.number().int().nullable().optional(),
});

export const AdminProductCreateSchema = z.object({
  categoryId: IdSchema,
  name: z.string().min(1),
  slug: SlugSchema.optional(),
  description: z.string().default(""),
  status: ProductStatusSchema.default("draft"),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  categoryPinOrder: z.number().int().nullable().optional(),
  tags: z.array(z.string()).default([]),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
  images: z.array(ProductImageInputSchema).default([]),
  dimensions: z.array(DimensionInputSchema).default([]),
  skus: z.array(SkuInputSchema).default([]),
});
export type AdminProductCreate = z.infer<typeof AdminProductCreateSchema>;

export const AdminProductPatchSchema = AdminProductCreateSchema.partial();
export type AdminProductPatch = z.infer<typeof AdminProductPatchSchema>;

export const AdminProductDetailSchema = ProductSchema.extend({
  isFeatured: z.boolean(),
  categoryPinOrder: z.number().int().nullable(),
  categoryName: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type AdminProductDetail = z.infer<typeof AdminProductDetailSchema>;

export const AdminProductListItemSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: SlugSchema,
  status: ProductStatusSchema,
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  isFeatured: z.boolean(),
  categoryId: IdSchema,
  categoryName: z.string(),
  primaryImage: UrlSchema.nullable(),
  minPrice: PriceSchema,
  maxBasePrice: PriceSchema,
  /** Best discount across SKUs, as a whole-number percentage. */
  bestDiscount: z.number().int(),
  skuCount: z.number().int(),
  updatedAt: TimestampSchema,
});
export type AdminProductListItem = z.infer<typeof AdminProductListItemSchema>;

export const AdminProductListSchema = z.object({
  items: z.array(AdminProductListItemSchema),
  nextCursor: z.string().nullable(),
});
export type AdminProductList = z.infer<typeof AdminProductListSchema>;

// ─── Admin category CRUD ─────────────────────────────────────

export const AdminCategoryCreateSchema = z.object({
  name: z.string().min(1),
  slug: SlugSchema.optional(),
  parentId: IdSchema.nullable().default(null),
  description: z.string().default(""),
  image: UrlSchema.optional(),
  sortOrder: z.number().int().default(0),
  showInHeader: z.boolean().default(false),
});
export type AdminCategoryCreate = z.infer<typeof AdminCategoryCreateSchema>;

export const AdminCategoryPatchSchema = AdminCategoryCreateSchema.partial();
export type AdminCategoryPatch = z.infer<typeof AdminCategoryPatchSchema>;

export const AdminCategoryListItemSchema = CategorySchema.extend({
  childCount: z.number().int(),
  /** Non-archived products assigned directly to this category. */
  productCount: z.number().int(),
  /** Non-archived products in this category and all descendants. */
  subtreeProductCount: z.number().int(),
});
export type AdminCategoryListItem = z.infer<typeof AdminCategoryListItemSchema>;

export const AdminCategoryListSchema = z.array(AdminCategoryListItemSchema);
export type AdminCategoryList = z.infer<typeof AdminCategoryListSchema>;

// ─── Settings ────────────────────────────────────────────────

export const StoreAddressSchema = z.object({
  label: z.string().optional(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  landmark: z.string().optional(),
});
export type StoreAddress = z.infer<typeof StoreAddressSchema>;

export const SettingsSchema = z.object({
  storeName: z.string(),
  supportPhone: z.string(),
  supportEmail: z.string(),
  storeAddress: StoreAddressSchema,
  gstRate: z.number(),
  shippingFreeAbove: z.number(),
  shippingFlatFee: z.number(),
  whatsappNumber: z.string(),
  updatedAt: TimestampSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Subset safe to expose on the public storefront (no store address / timestamps). */
export const SettingsPublicSchema = SettingsSchema.pick({
  storeName: true,
  supportPhone: true,
  supportEmail: true,
  gstRate: true,
  shippingFreeAbove: true,
  shippingFlatFee: true,
  whatsappNumber: true,
});
export type SettingsPublic = z.infer<typeof SettingsPublicSchema>;

export const SettingsPatchSchema = z.object({
  storeName: z.string().min(1).optional(),
  supportPhone: z.string().min(1).optional(),
  supportEmail: z.string().email().optional(),
  storeAddress: StoreAddressSchema.optional(),
  gstRate: z.number().min(0).max(100).optional(),
  shippingFreeAbove: z.number().nonnegative().optional(),
  shippingFlatFee: z.number().nonnegative().optional(),
  whatsappNumber: z.string().min(1).optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
