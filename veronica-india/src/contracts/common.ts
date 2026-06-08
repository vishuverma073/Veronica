import { z } from "zod";

/**
 * Shared primitives for the Veronica contracts.
 *
 * These local schemas stand in for the future `@veronica/contracts` npm package.
 * Everything in the app imports them via the `@veronica/contracts` path alias
 * (see tsconfig.json), so swapping to the published package later is a one-line
 * change with zero import-site edits.
 */

/** Numeric primary key (serial in Postgres / autoincrement in the mocks). */
export const IdSchema = z.number().int().positive();
export type Id = z.infer<typeof IdSchema>;

/** Matches Postgres `numeric(10, 2)` — max ₹99,999,999.99. */
export const MAX_MONEY_RUPEES = 99_999_999.99;

/** Money in INR, expressed in rupees (not paise). Non-negative, within DB range. */
export const MoneySchema = z
  .number()
  .nonnegative()
  .max(MAX_MONEY_RUPEES, `Price must be at most ₹${MAX_MONEY_RUPEES.toLocaleString("en-IN")}`);
export type Money = z.infer<typeof MoneySchema>;

/** An authenticated admin/merchant user. */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  // API returns null for admins without a name set; coerce to "".
  name: z.string().nullish().transform((v) => v ?? ""),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** Login request/response for the admin panel. */
export const AdminLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;

export const AdminLoginResponseSchema = z.object({
  accessToken: z.string(),
  admin: AdminUserSchema,
});
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;

/** Standard API error body. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Result of an image upload. */
export const UploadResultSchema = z.object({
  url: z.string().url(),
});
export type UploadResult = z.infer<typeof UploadResultSchema>;

/**
 * Cursor-paginated list envelope. Pass the inner item schema:
 *   const ProductListSchema = paginated(ProductListItemSchema)
 */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.number().int().nullable(),
  });
}
