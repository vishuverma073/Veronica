import { z } from "zod";

/** A shipping address, either supplied inline at checkout or from a saved one. */
export const ShippingAddressSchema = z.object({
  // Recipient details, snapshotted from the saved address so the order's
  // shipping address renders fully on the confirmation/history pages.
  fullName: z.string().optional(),
  phone: z.string().optional(),
  label: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, "must be a 6-digit pincode"),
  landmark: z.string().optional(),
});
export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

/**
 * POST /checkout/order request. Must carry either a saved `addressId` or an
 * inline `address` (enforced by the refine below).
 */
export const CreateOrderRequestSchema = z
  .object({
    addressId: z.number().int().positive().optional(),
    address: ShippingAddressSchema.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.addressId !== undefined || d.address !== undefined, {
    message: "Provide either addressId or an inline address",
    path: ["address"],
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

/** POST /checkout/order response — everything the frontend needs to open Razorpay. */
export const CreateOrderResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  razorpayOrderId: z.string(),
  razorpayKeyId: z.string(),
  amount: z.number(), // paise — the amount Razorpay's checkout modal expects
  currency: z.literal("INR"),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

/** POST /checkout/verify request — the three fields Razorpay's modal returns. */
export const VerifyOrderRequestSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyOrderRequest = z.infer<typeof VerifyOrderRequestSchema>;

export const VerifyOrderResponseSchema = z.object({
  ok: z.literal(true),
  orderNumber: z.string(),
});
export type VerifyOrderResponse = z.infer<typeof VerifyOrderResponseSchema>;
