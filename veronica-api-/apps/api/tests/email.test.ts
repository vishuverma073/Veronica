import { describe, expect, it } from "vitest";

process.env.NODE_ENV = "test"; // forces email stub mode

import {
  renderOrderConfirmationHtml,
  sendOrderConfirmation,
  type OrderConfirmationData,
} from "../src/lib/email.js";

const ORDER: OrderConfirmationData = {
  orderNumber: "VE7K3PQ2M8AB",
  customerName: "Asha",
  customerEmail: "asha@example.com",
  subtotal: 1000,
  shippingFee: 200,
  gstAmount: 216,
  total: 1416,
  shippingAddress: { line1: "123 Test St", city: "Delhi", state: "DL", pincode: "110001" },
  items: [
    {
      productName: "Lavender Sink",
      variantLabel: "18x16",
      qty: 1,
      unitPrice: 1000,
      lineTotal: 1000,
      imageUrl: "/a.png",
    },
  ],
};

describe("renderOrderConfirmationHtml", () => {
  it("includes order number, item, and formatted total", () => {
    const html = renderOrderConfirmationHtml(ORDER);
    expect(html).toContain("VE7K3PQ2M8AB");
    expect(html).toContain("Lavender Sink");
    expect(html).toContain("₹1,416.00");
    expect(html).toContain("110001");
  });

  it("shows FREE when shipping is waived", () => {
    expect(renderOrderConfirmationHtml({ ...ORDER, shippingFee: 0 })).toContain("FREE");
  });

  it("escapes HTML in user-provided fields", () => {
    const html = renderOrderConfirmationHtml({ ...ORDER, customerName: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a tracking-link CTA when a trackingUrl is provided", () => {
    const url = "https://veronicaindia.com/orders/VE7K3PQ2M8AB";
    const html = renderOrderConfirmationHtml({ ...ORDER, trackingUrl: url });
    expect(html).toContain("Track your order");
    expect(html).toContain(url);
  });

  it("omits the tracking CTA when no trackingUrl is set", () => {
    expect(renderOrderConfirmationHtml(ORDER)).not.toContain("Track your order");
  });
});

describe("sendOrderConfirmation", () => {
  it("resolves (stub) for a valid order without throwing", async () => {
    await expect(sendOrderConfirmation(ORDER)).resolves.toBeUndefined();
  });

  it("skips silently when there is no email on record", async () => {
    await expect(
      sendOrderConfirmation({ ...ORDER, customerEmail: null }),
    ).resolves.toBeUndefined();
  });
});
