import { z } from "zod";
import { UrlSchema } from "./common.js";

export const CartItemSchema = z.object({
  id: z.number(),
  skuId: z.number(),
  productName: z.string(),
  variantLabel: z.string().nullable(),
  imageUrl: UrlSchema.nullable(),
  unitPrice: z.number(),
  qty: z.number().int().positive(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.object({
  items: z.array(CartItemSchema),
  subtotal: z.number(),
  itemCount: z.number().int().nonnegative(),
});
export type Cart = z.infer<typeof CartSchema>;

export const AddCartItemRequestSchema = z.object({
  skuId: z.number().int().positive(),
  qty: z.number().int().positive().default(1),
});
export type AddCartItemRequest = z.infer<typeof AddCartItemRequestSchema>;

/** qty 0 means delete the line. */
export const UpdateCartItemRequestSchema = z.object({
  qty: z.number().int().nonnegative(),
});
export type UpdateCartItemRequest = z.infer<typeof UpdateCartItemRequestSchema>;
