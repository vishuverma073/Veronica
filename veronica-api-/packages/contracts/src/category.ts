import { z } from "zod";
import { IdSchema, SlugSchema, UrlSchema } from "./common.js";

export const CategoryStatusSchema = z.enum(["active", "archived"]);
export type CategoryStatus = z.infer<typeof CategoryStatusSchema>;

export const CategorySchema = z.object({
  id: IdSchema,
  parentId: IdSchema.nullable(),
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string(),
  image: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    UrlSchema.optional(),
  ),
  sortOrder: z.number().int(),
  /** Whether this category appears in the storefront header nav (admin-curated). */
  showInHeader: z.boolean(),
  status: CategoryStatusSchema.default("active"),
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryListSchema = z.array(CategorySchema);
export type CategoryList = z.infer<typeof CategoryListSchema>;

/** A category enriched with its ancestor breadcrumb trail and direct children. */
export const CategoryWithBreadcrumbSchema = CategorySchema.extend({
  breadcrumb: z.array(CategorySchema),
  children: z.array(CategorySchema),
});
export type CategoryWithBreadcrumb = z.infer<typeof CategoryWithBreadcrumbSchema>;
