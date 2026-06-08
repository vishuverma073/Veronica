function isOtpSmsStub(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.LOG_LEVEL === "debug" ||
    !process.env.MSG91_AUTH_KEY ||
    !process.env.MSG91_TEMPLATE_ID
  );
}

/** Echo OTP to the dev server terminal — never in production. */
function logDevOtp(phone: string, code: string): void {
  if (process.env.NODE_ENV === "production") return;
  // Yellow console.warn so it stands out among JSON request logs.
  console.warn(`\n🔐 DEV OTP for ${phone}: ${code}  (expires in 5 min — copy from this terminal)\n`);
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      msg: "otp_stub",
      phone,
      code,
    }),
  );
}

/**
 * SMS OTP dispatch via MSG91's v5 OTP API.
 *
 * Stub mode (logs the code instead of sending) is used when:
 *   - NODE_ENV=test or LOG_LEVEL=debug (local dev / tests), OR
 *   - MSG91 isn't configured (no auth key / template id).
 * This lets the whole OTP flow run without real SMS credits or a DLT template.
 *
 * In all non-production environments the OTP is also printed to the server
 * terminal so local login works without SMS or browser DevTools.
 */
export async function sendOtp(phone: string, code: string): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId = process.env.MSG91_SENDER_ID;

  const stub = isOtpSmsStub();

  if (process.env.NODE_ENV !== "production") {
    logDevOtp(phone, code);
  }

  if (stub) return;

  if (!authKey || !templateId) return;

  // MSG91 expects the mobile without a leading "+".
  const mobile = phone.replace(/^\+/, "");
  const res = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: authKey },
    body: JSON.stringify({
      template_id: templateId,
      mobile,
      otp: code,
      ...(senderId ? { sender: senderId } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MSG91 OTP send failed: ${res.status} ${body}`);
  }
}

/** Customer-facing storefront origin used to build order links (no trailing slash). */
function storefrontUrl(): string {
  return (process.env.STOREFRONT_URL || "https://veronicaindia.com").replace(/\/+$/, "");
}

/** The customer-facing tracking URL for an order (its detail + timeline page). */
export function orderTrackingUrl(orderNumber: string): string {
  return `${storefrontUrl()}/orders/${orderNumber}`;
}

/**
 * Send a transactional SMS via MSG91's Flow API (order updates etc.).
 *
 * Stub mode (logs the full message instead of sending) is used when:
 *   - NODE_ENV=test or LOG_LEVEL=debug, OR
 *   - MSG91 transactional SMS isn't configured (no auth key / order template id).
 *
 * In configured mode it posts to the Flow API with the order number + tracking
 * link as template variables (var1, var2). The DLT-approved template referenced
 * by MSG91_ORDER_TEMPLATE_ID must map ##var1## → order number, ##var2## → link.
 */
export async function sendTransactionalSms(
  phone: string,
  vars: { orderNumber: string; trackingUrl: string },
  message: string,
): Promise<void> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_ORDER_TEMPLATE_ID;

  const stub =
    process.env.NODE_ENV === "test" ||
    process.env.LOG_LEVEL === "debug" ||
    !authKey ||
    !templateId;

  if (stub) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "order_sms_stub",
        phone,
        body: message,
      }),
    );
    return;
  }

  // MSG91 expects the mobile without a leading "+".
  const mobile = phone.replace(/^\+/, "");
  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: authKey },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "1",
      recipients: [{ mobiles: mobile, var1: vars.orderNumber, var2: vars.trackingUrl }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MSG91 SMS send failed: ${res.status} ${body}`);
  }
}

/**
 * Notify the customer by SMS that their order is confirmed, with a tracking
 * link to the order page. Best-effort: callers run this inside a retried
 * Inngest step. No-ops gracefully (stub log) until MSG91 transactional SMS is
 * configured.
 */
export async function sendOrderConfirmationSms(phone: string, orderNumber: string): Promise<void> {
  const trackingUrl = orderTrackingUrl(orderNumber);
  const message = `Veronica: Your order ${orderNumber} is confirmed. Track it here: ${trackingUrl}`;
  await sendTransactionalSms(phone, { orderNumber, trackingUrl }, message);
}
