/**
 * End-to-end checkout test — drives a complete paid order against a running API
 * with no browser. Seeds a fresh login + known OTP straight into the DB (skips
 * SMS), adds to cart, creates a real Razorpay order, forges a valid payment
 * signature (exactly what Razorpay's modal returns), verifies it, and checks the
 * order shows as paid with a tracking timeline.
 *
 * Usage (defaults to staging):
 *   node --env-file=.env <tsx> scripts/e2e-checkout.ts [BASE_URL]
 *   # e.g. ... scripts/e2e-checkout.ts http://localhost:8787
 *
 * Needs DATABASE_URL + RAZORPAY_KEY_SECRET in env (already in .env).
 * NOTE: run against STAGING to also exercise the async email/Slack (Inngest is
 * synced to the deployed URL, not localhost).
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BASE = process.argv[2] || "https://veronica-api-staging.fly.dev";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const j = (r: Response) => r.json() as Promise<any>;

let pass = 0,
  fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
  cond ? pass++ : fail++;
};

(async () => {
  console.log(`== E2E checkout against ${BASE} ==`);

  // 1) Seed a fresh user + known OTP directly in the DB (skips real SMS).
  const phone = "+9198" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const code = "123456";
  await sql`insert into otp_codes (phone, code_hash, expires_at)
            values (${phone}, ${bcrypt.hashSync(code, 10)}, now() + interval '5 minutes')`;

  // 2) Verify OTP -> access token + user.
  const vr = await fetch(`${BASE}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const v = await j(vr);
  check("OTP verify -> 200 + token", vr.status === 200 && !!v.accessToken);
  const token = v.accessToken as string;
  const userId = v.user?.id as string;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 3) Give the user a name + email so the confirmation email actually sends
  //    (delivered@resend.dev is Resend's safe test sink — no real inbox).
  await sql`update users set name = 'E2E Tester', email = 'delivered@resend.dev' where id = ${userId}`;

  // 4) Add an in-stock SKU to the cart.
  const [skuRow] = await sql`select id from skus limit 1`;
  const skuId = Number(skuRow.id);
  const cr = await fetch(`${BASE}/me/cart/items`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ skuId, qty: 1 }),
  });
  const cart = await j(cr);
  check("add to cart -> itemCount 1", cr.status === 200 && cart.itemCount === 1, `subtotal=${cart.subtotal}`);

  // 5) Create the checkout order -> real Razorpay test order.
  const or = await fetch(`${BASE}/checkout/order`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ address: { line1: "12 E2E St", city: "New Delhi", state: "Delhi", pincode: "110061" } }),
  });
  const order = await j(or);
  const realRzp = order.razorpayOrderId && !String(order.razorpayOrderId).startsWith("order_stub_");
  check("checkout/order -> real Razorpay order", or.status === 200 && !!realRzp, order.razorpayOrderId || JSON.stringify(order));

  // 6) Forge the payment signature (what Razorpay's modal returns) and verify.
  const paymentId = "pay_e2e_" + crypto.randomBytes(6).toString("hex");
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${order.razorpayOrderId}|${paymentId}`)
    .digest("hex");
  const ver = await fetch(`${BASE}/checkout/verify`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ razorpayOrderId: order.razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: signature }),
  });
  const verRes = await j(ver);
  check("checkout/verify -> order paid", ver.status === 200 && verRes.ok === true, verRes.orderNumber || JSON.stringify(verRes));

  // 7) Order shows as 'paid' in the customer's order list.
  const lr = await fetch(`${BASE}/me/orders`, { headers: auth });
  const list = await j(lr);
  const found = (list.items || []).find((o: any) => o.orderNumber === order.orderNumber);
  check("order in /me/orders as 'paid'", !!found && found.status === "paid", found ? `status=${found.status}` : "not found");

  // 8) Tracking timeline has placed + paid.
  const er = await fetch(`${BASE}/me/orders/${order.orderNumber}/events`, { headers: auth });
  const ev = await j(er);
  const types = (ev.events || []).map((e: any) => e.eventType);
  check("tracking timeline has placed + paid", types.includes("placed") && types.includes("paid"), `[${types.join(", ")}]`);

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  console.log(`\nOrder ${order.orderNumber} — also visible in /admin/orders.`);
  console.log("Async side-effects to eyeball in dashboards (fire within ~10s):");
  console.log("  • Inngest -> Runs: an 'order.paid' function run");
  console.log("  • Resend  -> Logs: an email to delivered@resend.dev");
  console.log("  • Slack   -> a 'New paid order " + order.orderNumber + "' message (if SLACK_WEBHOOK_URL set)");

  await sql.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error("E2E ERROR:", e.message);
  await sql.end();
  process.exit(1);
});
