/**
 * Transactional email via Resend (Phase 4).
 *
 * Uses `fetch` against Resend's REST API and a hand-rendered HTML template,
 * matching this repo's REST-over-SDK convention (lib/sms.ts) and keeping React
 * out of the backend. Stub mode (logs instead of sending) is used when
 * RESEND_API_KEY is unset or under NODE_ENV=test.
 */
const RESEND_API = "https://api.resend.com/emails";

export interface OrderConfirmationItem {
  productName: string;
  variantLabel: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}

export interface OrderConfirmationData {
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  subtotal: number;
  shippingFee: number;
  gstAmount: number;
  total: number;
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    landmark?: string | null;
  };
  items: OrderConfirmationItem[];
  /** Customer-facing order tracking link, shown as a CTA when present. */
  trackingUrl?: string | null;
}

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render the order-confirmation email body. Exported for tests. */
export function renderOrderConfirmationHtml(o: OrderConfirmationData): string {
  const rows = o.items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">
          ${escapeHtml(it.productName)}${it.variantLabel ? ` <span style="color:#888">(${escapeHtml(it.variantLabel)})</span>` : ""}
          <div style="color:#888;font-size:12px">Qty ${it.qty} × ${inr(it.unitPrice)}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${inr(it.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const addr = o.shippingAddress;
  const addressLines = [
    addr.line1,
    addr.line2 || null,
    addr.landmark ? `Near ${addr.landmark}` : null,
    `${addr.city}, ${addr.state} ${addr.pincode}`,
  ]
    .filter(Boolean)
    .map((l) => escapeHtml(String(l)))
    .join("<br/>");

  return `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Thanks for your order, ${escapeHtml(o.customerName)}!</h1>
  <p>Your order <strong>${escapeHtml(o.orderNumber)}</strong> is confirmed. We'll let you know when it ships
     (typically 5–7 business days).</p>

  <table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table>

  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <tr><td style="padding:2px 0">Subtotal</td><td style="text-align:right">${inr(o.subtotal)}</td></tr>
    <tr><td style="padding:2px 0">Shipping</td><td style="text-align:right">${o.shippingFee === 0 ? "FREE" : inr(o.shippingFee)}</td></tr>
    <tr><td style="padding:2px 0;color:#888">Incl. GST (18%)</td><td style="text-align:right;color:#888">${inr(o.gstAmount)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold;border-top:2px solid #222">Total</td>
        <td style="text-align:right;font-weight:bold;border-top:2px solid #222">${inr(o.total)}</td></tr>
  </table>

  <h3 style="font-size:14px;margin-top:24px">Shipping to</h3>
  <p style="color:#555">${addressLines}</p>
${
  o.trackingUrl
    ? `
  <p style="margin-top:24px">
    <a href="${escapeHtml(o.trackingUrl)}" style="display:inline-block;background:#E8822A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">Track your order</a>
  </p>`
    : ""
}
  <p style="color:#888;font-size:12px;margin-top:24px">Veronica India · Need help? Reply to this email.</p>
</body></html>`;
}

/**
 * Send the order confirmation. Skips silently when there's no email on record.
 * Throws on a non-2xx Resend response so the Inngest step retries with backoff.
 */
export async function sendOrderConfirmation(o: OrderConfirmationData): Promise<void> {
  if (!o.customerEmail) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "order_email_skipped_no_address",
        order_number: o.orderNumber,
      }),
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "orders@veronicaindia.com";
  const subject = `Order Confirmed — ${o.orderNumber}`;

  if (!apiKey || process.env.NODE_ENV === "test") {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "order_email_stub",
        to: o.customerEmail,
        subject,
      }),
    );
    return;
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: o.customerEmail, subject, html: renderOrderConfirmationHtml(o) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}
