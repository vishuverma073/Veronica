import { Hono } from "hono";
import { PincodeLookupSchema, type PincodeLookup } from "@veronica/contracts";
import type { AppEnv } from "../lib/types.js";
import { cached } from "../lib/cache.js";

const PINCODE_TTL = 30 * 24 * 60 * 60; // 30 days — pincodes don't change

interface IndiaPostResponse {
  Status?: string;
  PostOffice?: { Name?: string; District?: string; State?: string; Country?: string }[] | null;
}

/**
 * GET /pincode/:pincode (public) — city/state autofill for the address form.
 * Backed by India Post's free API, cached 30 days (it's rate-limited; cache
 * aggressively). Falls back to a 404 on unknown codes.
 */
export function makePincodeRouter() {
  const router = new Hono<AppEnv>();

  router.get("/:pincode", async (c) => {
    const pincode = c.req.param("pincode");
    if (!/^\d{6}$/.test(pincode)) return c.json({ error: "Invalid pincode" }, 400);

    const { value } = await cached<PincodeLookup | null>(`pincode:${pincode}`, PINCODE_TTL, async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        if (!res.ok) return null;
        const data = (await res.json()) as IndiaPostResponse[];
        const entry = data?.[0];
        const po = entry?.PostOffice?.[0];
        if (!entry || entry.Status !== "Success" || !po) return null;
        return PincodeLookupSchema.parse({
          pincode,
          city: po.District || po.Name || "",
          state: po.State || "",
          country: po.Country || "India",
        });
      } catch {
        return null;
      }
    });

    if (!value) return c.json({ error: "Not Found" }, 404);
    return c.json(value);
  });

  return router;
}
