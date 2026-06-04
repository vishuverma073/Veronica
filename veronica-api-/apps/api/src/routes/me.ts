import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import {
  AddCartItemRequestSchema,
  CartSchema,
  OrderDetailSchema,
  OrderEventListResponseSchema,
  OrderListResponseSchema,
  UpdateCartItemRequestSchema,
  UserSchema,
  type Cart,
} from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { addresses, cartItems, carts, orderEvents, orders, skus, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../lib/types.js";

const ORDER_PAGE_SIZE = 20;

/** Resolve (or lazily create) the single cart for a user. */
async function getOrCreateCartId(db: DbClient, userId: string): Promise<string> {
  const [existing] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(carts)
    .values({ userId })
    .onConflictDoNothing()
    .returning({ id: carts.id });
  if (created) return created.id;
  // Lost a create race — re-read.
  const [again] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  return again!.id;
}

/** Build the populated cart (joins sku → product → primary image). */
async function buildCart(db: DbClient, cartId: string): Promise<Cart> {
  const rows = await db.query.cartItems.findMany({
    where: eq(cartItems.cartId, cartId),
    orderBy: (ci, { asc }) => [asc(ci.id)],
    with: {
      sku: {
        with: {
          product: {
            with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] } },
          },
        },
      },
    },
  });

  const items = rows.map((ci) => {
    const sku = ci.sku;
    const product = sku.product;
    const unitPrice = Number(sku.salePrice ?? sku.price);
    const dv = sku.dimensionValues ?? {};
    const variantLabel = Object.keys(dv).length ? Object.values(dv).join(" / ") : null;
    return {
      id: ci.id,
      skuId: ci.skuId,
      productName: product.name,
      variantLabel,
      imageUrl: product.images[0]?.url ?? null,
      unitPrice,
      qty: ci.qty,
    };
  });

  return CartSchema.parse({
    items,
    subtotal: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    itemCount: items.reduce((s, i) => s + i.qty, 0),
  });
}

// ─── Addresses ───────────────────────────────────────────────
// The storefront manages saved shipping addresses via /me/addresses. The shape
// here mirrors the frontend's Address contract (label enum + fullName/phone).
const ADDRESS_LABELS = ["Home", "Office", "Other"] as const;
// India-first input validation (matches the frontend Address contract): the
// contact must be exactly a 10-digit Indian mobile, PIN exactly 6 digits, etc.
const AddressInputSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default("Home"),
  fullName: z.string().trim().min(2).max(60),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(5).max(120),
  line2: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().min(2).max(50),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  landmark: z.string().trim().max(100).optional().default(""),
  isDefault: z.boolean().optional().default(false),
});

type AddressRow = typeof addresses.$inferSelect;
function toAddressDto(a: AddressRow) {
  return {
    id: a.id,
    label: (a.label ?? "Home") as (typeof ADDRESS_LABELS)[number],
    fullName: a.fullName ?? "",
    phone: a.phone ?? "",
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    landmark: a.landmark ?? "",
    isDefault: a.isDefault,
  };
}

export function makeMeRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // GET /me — the authenticated user.
  router.get("/", async (c) => {
    const userId = c.get("userId")!;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return c.json({ error: "Not Found" }, 404);
    return c.json(
      UserSchema.parse({
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      }),
    );
  });

  // PATCH /me — update the customer's profile (name / email).
  router.patch("/", async (c) => {
    const userId = c.get("userId")!;
    const parsed = z
      .object({
        name: z.string().max(120).optional(),
        email: z.string().email().or(z.literal("")).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const patch = parsed.data;
    const [user] = await db
      .update(users)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.email !== undefined ? { email: patch.email || null } : {}),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!user) return c.json({ error: "Not Found" }, 404);
    return c.json(
      UserSchema.parse({
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      }),
    );
  });

  // GET /me/cart
  router.get("/cart", async (c) => {
    const cartId = await getOrCreateCartId(db, c.get("userId")!);
    return c.json(await buildCart(db, cartId));
  });

  // POST /me/cart/items — add (or increment) a line.
  router.post("/cart/items", async (c) => {
    const parsed = AddCartItemRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { skuId, qty } = parsed.data;

    const [sku] = await db.select({ id: skus.id }).from(skus).where(eq(skus.id, skuId)).limit(1);
    if (!sku) return c.json({ error: "SKU not found" }, 404);

    const cartId = await getOrCreateCartId(db, c.get("userId")!);
    await db
      .insert(cartItems)
      .values({ cartId, skuId, qty })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.skuId],
        set: { qty: sql`${cartItems.qty} + ${qty}` },
      });

    return c.json(await buildCart(db, cartId));
  });

  // PATCH /me/cart/items/:id — set qty (0 deletes). Scoped to the caller's cart.
  router.patch("/cart/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const parsed = UpdateCartItemRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const cartId = await getOrCreateCartId(db, c.get("userId")!);
    const where = and(eq(cartItems.id, id), eq(cartItems.cartId, cartId));

    const result =
      parsed.data.qty === 0
        ? await db.delete(cartItems).where(where).returning({ id: cartItems.id })
        : await db.update(cartItems).set({ qty: parsed.data.qty }).where(where).returning({ id: cartItems.id });
    if (result.length === 0) return c.json({ error: "Not Found" }, 404);

    return c.json(await buildCart(db, cartId));
  });

  // DELETE /me/cart/items/:id — scoped to the caller's cart.
  router.delete("/cart/items/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const cartId = await getOrCreateCartId(db, c.get("userId")!);
    const deleted = await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, id), eq(cartItems.cartId, cartId)))
      .returning({ id: cartItems.id });
    if (deleted.length === 0) return c.json({ error: "Not Found" }, 404);
    return c.json(await buildCart(db, cartId));
  });

  // GET /me/addresses — the caller's saved addresses (default first).
  router.get("/addresses", async (c) => {
    const userId = c.get("userId")!;
    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.isDefault), asc(addresses.id));
    return c.json(rows.map(toAddressDto));
  });

  // POST /me/addresses — create. First address (or isDefault) becomes the default.
  router.post("/addresses", async (c) => {
    const userId = c.get("userId")!;
    const parsed = AddressInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(addresses)
      .where(eq(addresses.userId, userId));
    const makeDefault = body.isDefault || (countRow?.count ?? 0) === 0;
    if (makeDefault) {
      await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    }
    const [row] = await db
      .insert(addresses)
      .values({
        userId,
        label: body.label,
        fullName: body.fullName,
        phone: body.phone,
        line1: body.line1,
        line2: body.line2 || null,
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        landmark: body.landmark || null,
        isDefault: makeDefault,
      })
      .returning();
    return c.json(toAddressDto(row!), 201);
  });

  // PATCH /me/addresses/:id — update (scoped to the caller). Setting isDefault
  // true demotes the others.
  router.patch("/addresses/:id", async (c) => {
    const userId = c.get("userId")!;
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const parsed = AddressInputSchema.partial().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const [owned] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .limit(1);
    if (!owned) return c.json({ error: "Not Found" }, 404);

    const p = parsed.data;
    if (p.isDefault) {
      await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    }
    const [row] = await db
      .update(addresses)
      .set({
        ...(p.label !== undefined ? { label: p.label } : {}),
        ...(p.fullName !== undefined ? { fullName: p.fullName } : {}),
        ...(p.phone !== undefined ? { phone: p.phone } : {}),
        ...(p.line1 !== undefined ? { line1: p.line1 } : {}),
        ...(p.line2 !== undefined ? { line2: p.line2 || null } : {}),
        ...(p.city !== undefined ? { city: p.city } : {}),
        ...(p.state !== undefined ? { state: p.state } : {}),
        ...(p.pincode !== undefined ? { pincode: p.pincode } : {}),
        ...(p.landmark !== undefined ? { landmark: p.landmark || null } : {}),
        ...(p.isDefault !== undefined ? { isDefault: p.isDefault } : {}),
      })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();
    return c.json(toAddressDto(row!));
  });

  // DELETE /me/addresses/:id — scoped to the caller.
  router.delete("/addresses/:id", async (c) => {
    const userId = c.get("userId")!;
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const deleted = await db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ id: addresses.id });
    if (deleted.length === 0) return c.json({ error: "Not Found" }, 404);
    return c.json({ ok: true });
  });

  // GET /me/orders — the caller's orders, newest first, cursor-paginated by createdAt.
  router.get("/orders", async (c) => {
    const userId = c.get("userId")!;
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam ? new Date(cursorParam) : null;
    if (cursor && Number.isNaN(cursor.getTime())) {
      return c.json({ error: "Invalid cursor" }, 400);
    }

    // Fetch one extra row to know whether there's a next page.
    const rows = await db.query.orders.findMany({
      where: cursor
        ? and(eq(orders.userId, userId), lt(orders.createdAt, cursor))
        : eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      limit: ORDER_PAGE_SIZE + 1,
      with: { items: { columns: { qty: true } } },
    });

    const hasMore = rows.length > ORDER_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, ORDER_PAGE_SIZE) : rows;
    const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;

    return c.json(
      OrderListResponseSchema.parse({
        items: page.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          total: Number(o.total),
          status: o.status,
          itemCount: o.items.reduce((s, it) => s + it.qty, 0),
          createdAt: o.createdAt.toISOString(),
        })),
        nextCursor,
      }),
    );
  });

  // GET /me/orders/:orderNumber — full detail. 404 if missing OR not owned.
  router.get("/orders/:orderNumber", async (c) => {
    const userId = c.get("userId")!;
    const orderNumber = c.req.param("orderNumber");

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)),
      with: { items: { orderBy: (oi, { asc }) => [asc(oi.id)] } },
    });
    if (!order) return c.json({ error: "Not Found" }, 404);

    return c.json(
      OrderDetailSchema.parse({
        id: order.id,
        orderNumber: order.orderNumber,
        total: Number(order.total),
        status: order.status,
        itemCount: order.items.reduce((s, it) => s + it.qty, 0),
        createdAt: order.createdAt.toISOString(),
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shippingFee),
        gstAmount: Number(order.gstAmount),
        shippingAddress: order.shippingAddress,
        items: order.items.map((it) => ({
          productName: it.productName,
          skuCode: it.skuCode,
          variantLabel: it.variantLabel,
          imageUrl: it.imageUrl,
          unitPrice: Number(it.unitPrice),
          qty: it.qty,
          lineTotal: Number(it.lineTotal),
        })),
        razorpayPaymentId: order.razorpayPaymentId,
      }),
    );
  });

  // GET /me/orders/:orderNumber/events — the order's tracking timeline.
  router.get("/orders/:orderNumber/events", async (c) => {
    const userId = c.get("userId")!;
    const orderNumber = c.req.param("orderNumber");

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)),
      columns: { id: true },
    });
    if (!order) return c.json({ error: "Not Found" }, 404);

    const events = await db
      .select({
        id: orderEvents.id,
        eventType: orderEvents.eventType,
        note: orderEvents.note,
        createdAt: orderEvents.createdAt,
      })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt));

    return c.json(
      OrderEventListResponseSchema.parse({
        events: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        })),
      }),
    );
  });

  return router;
}
