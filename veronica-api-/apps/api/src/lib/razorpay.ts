/**
 * Razorpay integration (Phase 4).
 *
 * Follows this codebase's "REST over SDK" convention (see lib/sms.ts and the
 * Storage REST upload in Phase 1) — we call Razorpay's HTTP API with `fetch`
 * and verify signatures with node:crypto, instead of pulling in the `razorpay`
 * npm package.
 *
 * STUB MODE: when Razorpay isn't configured (any of KEY_ID / KEY_SECRET /
 * WEBHOOK_SECRET missing) or NODE_ENV=test, network calls are faked with dummy
 * data so the whole checkout flow works without a real Razorpay account.
 * Signature verification still runs real HMAC — against the configured secret,
 * or a built-in DUMMY secret in stub mode — so dev/tests can produce valid
 * signatures deterministically.
 */
import crypto from "node:crypto";
import { isDevAuthBypass } from "./dev-bypass.js";

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** Dummy creds used in stub mode so the flow is runnable end-to-end. */
const DUMMY_KEY_ID = "rzp_test_DUMMYKEYID0001";
const DUMMY_KEY_SECRET = "dummyrzpsecret0000000000";
const DUMMY_WEBHOOK_SECRET = "dummywebhooksecret000000";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/** Full real config, or null when not all three vars are set. */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret || !webhookSecret) return null;
  return { keyId, keySecret, webhookSecret };
}

/**
 * True when we should fake Razorpay network calls: no real config, or running
 * tests, or the configured key is the documented dummy placeholder.
 */
export function isRazorpayStub(): boolean {
  if (process.env.NODE_ENV === "test") return true;
  const cfg = getRazorpayConfig();
  if (!cfg) return true;
  return cfg.keyId === DUMMY_KEY_ID;
}

/** Publishable key id handed to the frontend checkout modal. */
export function getPublicKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || DUMMY_KEY_ID;
}

/** Secret used to verify the checkout `razorpay_signature`. */
function paymentSecret(): string {
  return process.env.RAZORPAY_KEY_SECRET || DUMMY_KEY_SECRET;
}

/** Secret used to verify inbound webhook signatures. */
function webhookSecret(): string {
  return process.env.RAZORPAY_WEBHOOK_SECRET || DUMMY_WEBHOOK_SECRET;
}

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  receipt: string;
  status: string;
}

export interface CreateOrderInput {
  amount: number; // paise — Razorpay requires >= 100 (₹1)
  currency: "INR";
  receipt: string;
  notes?: Record<string, string>;
}

/**
 * Create a Razorpay order. In stub mode, returns a deterministic fake order id
 * derived from the receipt (so it's inspectable and stable across retries).
 */
export async function createRazorpayOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  if (isRazorpayStub()) {
    return {
      id: `order_stub_${input.receipt}`,
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: "created",
    };
  }
  const cfg = getRazorpayConfig()!;
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(cfg.keyId, cfg.keySecret),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order create failed: ${res.status} ${body}`);
  }
  return (await res.json()) as RazorpayOrder;
}

/**
 * Fetch a Razorpay order's current status (used by the stale-pending
 * reconciliation cron). Stub mode reports "created".
 */
export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder | null> {
  if (isRazorpayStub()) {
    return { id: orderId, amount: 0, currency: "INR", receipt: "", status: "created" };
  }
  const cfg = getRazorpayConfig()!;
  const res = await fetch(`${RAZORPAY_API}/orders/${orderId}`, {
    headers: { Authorization: basicAuth(cfg.keyId, cfg.keySecret) },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order fetch failed: ${res.status} ${body}`);
  }
  return (await res.json()) as RazorpayOrder;
}

function basicAuth(id: string, secret: string): string {
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/**
 * Verify the checkout signature returned by Razorpay's modal:
 *   HMAC_SHA256(orderId + "|" + paymentId, KEY_SECRET) === signature
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  // The simulated checkout modal (NEXT_PUBLIC_MOCK_PAYMENTS) can't compute a real
  // HMAC — it has no secret in the browser — so it sends a `sig_mock_*`
  // placeholder. Accept it ONLY under the explicit dev-auth bypass (never in
  // production; see lib/dev-bypass.ts). Real signatures (incl. test-suite ones
  // via computePaymentSignature) always verify normally.
  if (signature.startsWith("sig_mock_") && isDevAuthBypass()) {
    return true;
  }
  const expected = crypto
    .createHmac("sha256", paymentSecret())
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

/** Compute the checkout signature — used by tests / stubbed dev frontends. */
export function computePaymentSignature(orderId: string, paymentId: string): string {
  return crypto.createHmac("sha256", paymentSecret()).update(`${orderId}|${paymentId}`).digest("hex");
}

/** Verify an inbound webhook: HMAC_SHA256(rawBody, WEBHOOK_SECRET) === header. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Compute a webhook signature — used by tests. */
export function computeWebhookSignature(rawBody: string): string {
  return crypto.createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
}

/** Constant-time hex-string comparison. */
function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
