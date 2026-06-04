import crypto from "node:crypto";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  CreateOrderRequestSchema,
  CreateOrderResponseSchema,
  VerifyOrderRequestSchema,
} from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { addresses, cartItems, carts, orderItems, orders, settings, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../lib/types.js";
import { calculatePricing } from "../lib/pricing.js";
import { orderNumberFromId } from "../lib/order-number.js";
import { createRazorpayOrder, getPublicKeyId, verifyPaymentSignature } from "../lib/razorpay.js";
import { emitOrderPaid } from "../lib/events.js";
import { log } from "../lib/logger.js";
import { logOrderEvent } from "../lib/order-events.js";
import { backupOrder } from "../lib/order-backup.js";

export function makeCheckoutRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // POST /checkout/order — validate cart, compute totals, create Razorpay order.
  router.post("/order", async (c) => {
    const userId = c.get("userId")!;
    const parsed = CreateOrderRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    // Order rows require customer name/phone — load the user.
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Load the cart with current SKU + product + primary image.
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);
    const items = cart
      ? await db.query.cartItems.findMany({
          where: eq(cartItems.cartId, cart.id),
          orderBy: (ci, { asc }) => [asc(ci.id)],
          with: {
            sku: {
              with: {
                product: { with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] } } },
              },
            },
          },
        })
      : [];
    if (items.length === 0) return c.json({ error: "Cart is empty" }, 400);

    // Re-validate against the DB: fail fast if a SKU vanished (don't drop it).
    const gone = items.find((ci) => !ci.sku);
    if (gone) return c.json({ error: `SKU ${gone.skuId} is no longer available` }, 400);

    // Build lines at *current* prices (never trust the cart's reported price).
    const lines = items.map((ci) => {
      const sku = ci.sku;
      const product = sku.product;
      const unitPrice = Number(sku.salePrice ?? sku.price);
      const dv = sku.dimensionValues ?? {};
      const variantLabel = Object.keys(dv).length ? Object.values(dv).join(" / ") : null;
      return {
        skuId: ci.skuId,
        productName: product.name,
        skuCode: sku.skuCode,
        variantLabel,
        imageUrl: product.images[0]?.url ?? null,
        unitPrice,
        qty: ci.qty,
      };
    });

    // Pricing knobs come from the admin Settings (free-shipping threshold, flat
    // fee, GST rate) so checkout charges what the admin configured.
    const [settingsRow] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    const pricingConfig = settingsRow
      ? {
          freeShippingThreshold: Number(settingsRow.shippingFreeAbove),
          flatShippingFee: Number(settingsRow.shippingFlatFee),
          gstRate: Number(settingsRow.gstRate) / 100, // stored as a percentage
        }
      : undefined;
    const pricing = calculatePricing(
      lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty })),
      pricingConfig,
    );

    // Resolve the shipping address (saved id → verify ownership, else inline).
    let shippingAddress;
    if (body.addressId !== undefined) {
      const [addr] = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, body.addressId), eq(addresses.userId, userId)))
        .limit(1);
      if (!addr) return c.json({ error: "Address not found" }, 400);
      shippingAddress = {
        fullName: addr.fullName ?? undefined,
        phone: addr.phone ?? undefined,
        label: addr.label ?? undefined,
        line1: addr.line1,
        line2: addr.line2 ?? undefined,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        landmark: addr.landmark ?? undefined,
      };
    } else {
      shippingAddress = body.address!;
    }

    // Order number is hashed from the row UUID — atomic, no sequence, no volume leak.
    const orderId = crypto.randomUUID();
    const orderNumber = orderNumberFromId(orderId);

    // Persist order + items atomically.
    await db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        orderNumber,
        userId,
        customerName: user.name ?? "Customer",
        customerPhone: user.phone,
        customerEmail: user.email,
        shippingAddress,
        subtotal: String(pricing.subtotal),
        shippingFee: String(pricing.shippingFee),
        gstAmount: String(pricing.gstAmount),
        total: String(pricing.total),
        status: "pending",
        notes: body.notes,
      });
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId,
          skuId: l.skuId,
          productName: l.productName,
          skuCode: l.skuCode,
          variantLabel: l.variantLabel,
          imageUrl: l.imageUrl,
          unitPrice: String(l.unitPrice),
          qty: l.qty,
          lineTotal: String(l.unitPrice * l.qty),
        })),
      );
    });

    // Create the Razorpay order outside the tx. If it fails our order stays
    // `pending` and the reconciliation cron cleans it up later.
    const rzpOrder = await createRazorpayOrder({
      amount: Math.round(pricing.total * 100),
      currency: "INR",
      receipt: orderNumber,
      notes: { user_id: userId, order_number: orderNumber },
    });

    await db.update(orders).set({ razorpayOrderId: rzpOrder.id }).where(eq(orders.id, orderId));
    await logOrderEvent(db, { orderId, eventType: "placed" });

    // Durable backup of the order the moment it's placed (best-effort; never
    // blocks checkout). A second snapshot is written when it's paid.
    await backupOrder(db, "created", {
      orderId,
      orderNumber,
      userId,
      customer: { name: user.name ?? "Customer", phone: user.phone, email: user.email },
      shippingAddress,
      totals: {
        subtotal: pricing.subtotal,
        shippingFee: pricing.shippingFee,
        gstAmount: pricing.gstAmount,
        total: pricing.total,
      },
      items: lines.map((l) => ({
        skuId: l.skuId,
        productName: l.productName,
        skuCode: l.skuCode,
        variantLabel: l.variantLabel,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.unitPrice * l.qty,
      })),
      status: "pending",
      notes: body.notes,
      razorpayOrderId: rzpOrder.id,
      capturedAt: new Date().toISOString(),
    });

    log("info", "checkout.order_created", {
      order_id: orderId,
      order_number: orderNumber,
      total: pricing.total,
      request_id: c.get("requestId"),
    });

    // Cart is intentionally NOT cleared here — only on verify success.
    return c.json(
      CreateOrderResponseSchema.parse({
        orderId,
        orderNumber,
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getPublicKeyId(),
        amount: rzpOrder.amount,
        currency: "INR",
      }),
    );
  });

  // POST /checkout/verify — verify the modal signature, mark paid, clear cart.
  router.post("/verify", async (c) => {
    const userId = c.get("userId")!;
    const parsed = VerifyOrderRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.razorpayOrderId, razorpayOrderId))
      .limit(1);
    if (!order) return c.json({ error: "Order not found" }, 404);
    if (order.userId !== userId) return c.json({ error: "Forbidden" }, 403);

    // Idempotent: a retried verify on an already-paid order is a no-op success.
    if (order.status === "paid" || order.status === "confirmed") {
      return c.json({ ok: true, orderNumber: order.orderNumber });
    }

    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      await db
        .update(orders)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "razorpay_signature_invalid",
          order_id: order.id,
          order_number: order.orderNumber,
          request_id: c.get("requestId"),
        }),
      );
      return c.json({ error: "Invalid signature" }, 400);
    }

    await db
      .update(orders)
      .set({ razorpayPaymentId, razorpaySignature, status: "paid", updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // Clear the cart now that payment is confirmed.
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);
    if (cart) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    await logOrderEvent(db, { orderId: order.id, eventType: "paid" });
    await emitOrderPaid(order.id);

    return c.json({ ok: true, orderNumber: order.orderNumber });
  });

  // POST /checkout/order/:orderNumber/pay — re-initiate payment for an existing
  // unpaid order (the customer's earlier attempt failed or was dismissed).
  // Creates a fresh Razorpay order for it and points the order row at the new
  // Razorpay id, so the normal /checkout/verify path then confirms it.
  router.post("/order/:orderNumber/pay", async (c) => {
    const userId = c.get("userId")!;
    const orderNumber = c.req.param("orderNumber");

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order || order.userId !== userId) return c.json({ error: "Not Found" }, 404);
    if (order.status !== "pending") {
      // Already paid / shipped / cancelled — nothing to retry.
      return c.json({ error: "Order is not awaiting payment", status: order.status }, 409);
    }

    const rzpOrder = await createRazorpayOrder({
      amount: Math.round(Number(order.total) * 100),
      currency: "INR",
      receipt: order.orderNumber,
      notes: { user_id: userId, order_number: order.orderNumber, retry: "1" },
    });

    await db
      .update(orders)
      .set({ razorpayOrderId: rzpOrder.id, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    return c.json(
      CreateOrderResponseSchema.parse({
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getPublicKeyId(),
        amount: rzpOrder.amount,
        currency: "INR",
      }),
    );
  });

  return router;
}
