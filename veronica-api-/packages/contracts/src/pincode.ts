import { z } from "zod";

/** Result of a pincode → city/state lookup (GET /pincode/:pincode). */
export const PincodeLookupSchema = z.object({
  pincode: z.string().regex(/^\d{6}$/),
  city: z.string(),
  state: z.string(),
  country: z.string(),
});
export type PincodeLookup = z.infer<typeof PincodeLookupSchema>;
