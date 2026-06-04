/**
 * Seeds ~100 random test orders spread across EVERY order status so the admin
 * order management + customer tracking timeline can be tested end to end:
 *   pending · paid · confirmed · shipped · delivered · cancelled · refunded
 * (plus timeline events incl. "out_for_delivery" with real timestamps).
 *
 * Items reference REAL SKUs from the catalog, so run the catalog seed first
 * (pnpm db:seed). Order numbers are derived from the row UUID like production.
 *
 * Run with:  pnpm tsx --env-file=.env scripts/seed-orders.ts
 * (or add a package.json script). Guarded against prod like the other seeds.
 */
import crypto from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEnv } from "../src/lib/env.js";
import {
  orders as ordersTable,
  orderItems as orderItemsTable,
  orderEvents as orderEventsTable,
  skus as skusTable,
  products as productsTable,
  productImages as productImagesTable,
} from "../src/db/schema.js";
import { orderNumberFromId } from "../src/lib/order-number.js";

// ─── Safety guard (mirrors seed-from-data.ts) ────────────────
const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl.includes("-dev") && process.env.I_AM_SURE_NOT_PROD !== "true") {
  console.error(
    "✗ Refusing to seed orders: DATABASE_URL doesn't contain '-dev' and I_AM_SURE_NOT_PROD !== 'true'.\n" +
      "  Set I_AM_SURE_NOT_PROD=true in apps/api/.env if this is your dev database.",
  );
  process.exit(1);
}

const TOTAL = 100;

// How many orders land in each status (sums to TOTAL).
const DISTRIBUTION: Record<string, number> = {
  pending: 12,
  paid: 14,
  confirmed: 14,
  shipped: 16,
  delivered: 22,
  cancelled: 12,
  refunded: 10,
};

const FIRST = ["Aarav", "Vihaan", "Ananya", "Diya", "Ishaan", "Kabir", "Saanvi", "Aditya", "Riya", "Arjun", "Meera", "Rohan", "Nisha", "Karan", "Pooja", "Vikram", "Sneha", "Rahul", "Tara", "Dev"];
const LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Mehta", "Singh", "Khan", "Das", "Bose", "Rao", "Joshi", "Malhotra"];
const PLACES: { city: string; state: string; pin: string }[] = [
  { city: "New Delhi", state: "Delhi", pin: "110061" },
  { city: "Mumbai", state: "Maharashtra", pin: "400001" },
  { city: "Bengaluru", state: "Karnataka", pin: "560001" },
  { city: "Chennai", state: "Tamil Nadu", pin: "600001" },
  { city: "Kolkata", state: "West Bengal", pin: "700001" },
  { city: "Hyderabad", state: "Telangana", pin: "500001" },
  { city: "Pune", state: "Maharashtra", pin: "411001" },
  { city: "Jaipur", state: "Rajasthan", pin: "302001" },
  { city: "Ahmedabad", state: "Gujarat", pin: "380001" },
  { city: "Lucknow", state: "Uttar Pradesh", pin: "226001" },
];
const STREETS = ["MG Road", "Bijwasan Road", "Nehru Nagar", "Gandhi Marg", "Park Street", "Brigade Road", "Linking Road", "Anna Salai"];
const LABELS = ["Home", "Office", "Other"] as const;
const GST_RATE = 0.18;

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const money = (n: number) => n.toFixed(2);
const randomPhone = () => `${pick([6, 7, 8, 9])}${Array.from({ length: 9 }, () => randInt(0, 9)).join("")}`;

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { prepare: false });
  const db = drizzle(sql);

  // Real SKUs → realistic order items.
  const skuRows = await db
    .select({
      id: skusTable.id,
      skuCode: skusTable.skuCode,
      price: skusTable.price,
      salePrice: skusTable.salePrice,
      dimensionValues: skusTable.dimensionValues,
      productId: skusTable.productId,
    })
    .from(skusTable);
  if (skuRows.length === 0) {
    console.error("✗ No SKUs found. Seed the catalog first: pnpm db:seed");
    await sql.end();
    process.exit(1);
  }
  const productRows = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable);
  const nameById = new Map(productRows.map((p) => [p.id, p.name]));
  const imgRows = await db
    .select({ productId: productImagesTable.productId, url: productImagesTable.url })
    .from(productImagesTable);
  const imageById = new Map<number, string>();
  for (const r of imgRows) if (!imageById.has(r.productId)) imageById.set(r.productId, r.url);

  const candidates = skuRows.map((s) => ({
    skuId: s.id,
    skuCode: s.skuCode,
    productName: nameById.get(s.productId) ?? "Product",
    imageUrl: imageById.get(s.productId) ?? null,
    unitPrice: Number(s.salePrice ?? s.price),
    variantLabel: Object.values(s.dimensionValues ?? {}).join(" / ") || null,
  }));

  // Build the flat list of statuses to assign.
  const statuses: string[] = [];
  for (const [status, n] of Object.entries(DISTRIBUTION)) {
    for (let i = 0; i < n; i++) statuses.push(status);
  }

  // The fulfilment events each status implies, in order.
  function eventsFor(status: string): string[] {
    switch (status) {
      case "pending": return ["placed"];
      case "paid": return ["placed", "paid"];
      case "confirmed": return ["placed", "paid", "confirmed"];
      case "shipped": return ["placed", "paid", "confirmed", "shipped"];
      case "delivered":
        // ~⅔ go through "out_for_delivery"; the rest jump straight to delivered
        // (exercises the timeline's timestamp fallback).
        return Math.random() < 0.66
          ? ["placed", "paid", "confirmed", "shipped", "out_for_delivery", "delivered"]
          : ["placed", "paid", "confirmed", "shipped", "delivered"];
      case "cancelled":
        return Math.random() < 0.5 ? ["placed", "cancelled"] : ["placed", "paid", "cancelled"];
      case "refunded": return ["placed", "paid", "confirmed", "shipped", "delivered", "refunded"];
      default: return ["placed"];
    }
  }
  const NOTE: Record<string, string> = {
    placed: "Order placed.",
    paid: "Payment received.",
    confirmed: "Order accepted and being packed.",
    shipped: "Handed to the courier.",
    out_for_delivery: "Out for delivery.",
    delivered: "Delivered to the customer.",
    cancelled: "Order cancelled.",
    refunded: "Refund processed.",
  };

  let made = 0;
  for (let i = 0; i < TOTAL; i++) {
    const status = statuses[i]!;
    const orderId = crypto.randomUUID();
    const orderNumber = orderNumberFromId(orderId);
    const paid = ["paid", "confirmed", "shipped", "delivered", "refunded"].includes(status);

    // 1–3 distinct items.
    const itemCount = randInt(1, 3);
    const chosen = Array.from({ length: itemCount }, () => pick(candidates));
    const items = chosen.map((c) => ({ ...c, qty: randInt(1, 3) }));
    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const shippingFee = subtotal >= 5000 ? 0 : 99;
    const gstAmount = Math.round((subtotal - subtotal / (1 + GST_RATE)) * 100) / 100;
    const total = subtotal + shippingFee;

    const place = pick(PLACES);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const phone = randomPhone();
    const createdAt = new Date(Date.now() - randInt(0, 45) * 86_400_000 - randInt(0, 86_400) * 1000);

    const evs = eventsFor(status);
    // Spread event times: placed at createdAt, each next +6–30h.
    let t = createdAt.getTime();
    const eventRows = evs.map((eventType) => {
      const at = new Date(t);
      t += randInt(6, 30) * 3_600_000;
      return { orderId, eventType: eventType as never, note: NOTE[eventType] ?? null, createdAt: at };
    });
    const updatedAt = eventRows[eventRows.length - 1]!.createdAt;

    await db.insert(ordersTable).values({
      id: orderId,
      orderNumber,
      userId: null, // guest test orders
      customerName: name,
      customerPhone: phone,
      customerEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      shippingAddress: {
        label: pick(LABELS),
        fullName: name,
        phone,
        line1: `${randInt(1, 999)} ${pick(STREETS)}`,
        line2: "",
        city: place.city,
        state: place.state,
        pincode: place.pin,
        landmark: "",
      },
      subtotal: money(subtotal),
      shippingFee: money(shippingFee),
      gstAmount: money(gstAmount),
      total: money(total),
      status: status as never,
      razorpayOrderId: `order_seed_${i}_${orderNumber}`,
      razorpayPaymentId: paid ? `pay_seed_${i}` : null,
      notes: null,
      createdAt,
      updatedAt,
    });

    await db.insert(orderItemsTable).values(
      items.map((it) => ({
        orderId,
        skuId: it.skuId,
        productName: it.productName,
        skuCode: it.skuCode,
        variantLabel: it.variantLabel,
        imageUrl: it.imageUrl,
        unitPrice: money(it.unitPrice),
        qty: it.qty,
        lineTotal: money(it.unitPrice * it.qty),
      })),
    );

    await db.insert(orderEventsTable).values(eventRows);
    made++;
  }

  console.log(`✓ Seeded ${made} test orders:`);
  for (const [status, n] of Object.entries(DISTRIBUTION)) console.log(`   ${status.padEnd(10)} ${n}`);
  await sql.end();
}

main().catch((err) => {
  console.error("✗ seed-orders failed:", err);
  process.exit(1);
});
