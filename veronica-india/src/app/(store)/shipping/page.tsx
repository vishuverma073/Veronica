import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Shipping & Delivery — Veronica India",
  description: "Delivery areas, timelines, and shipping fees for Veronica India orders.",
  alternates: { canonical: absoluteUrl("/shipping") },
};

const UPDATED = "7 June 2026";

export default function ShippingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <header className="mb-10">
        <span className="badge badge-bestseller mb-4">Help</span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight mb-2">
          Shipping &amp; Delivery
        </h1>
        <p className="text-sm text-text-muted">Last updated: {UPDATED}</p>
      </header>

      <div className="space-y-8 text-[15px] text-text-secondary leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
        <section>
          <h2>Where we deliver</h2>
          <p>
            We ship across India via trusted courier partners. Remote or restricted pin codes may
            take longer or require confirmation before dispatch.
          </p>
        </section>

        <section>
          <h2>Processing time</h2>
          <p>
            Orders are typically processed within <strong>1–2 business days</strong> after payment
            confirmation. You will receive tracking details once the order is shipped.
          </p>
        </section>

        <section>
          <h2>Shipping fees</h2>
          <ul>
            <li>A flat shipping fee applies on orders below our free-delivery threshold (shown at checkout).</li>
            <li>Free delivery applies when your order subtotal meets the threshold displayed on the site.</li>
            <li>Large or heavy items may incur additional handling — we will contact you if this applies.</li>
          </ul>
        </section>

        <section>
          <h2>Tracking</h2>
          <p>
            Signed-in customers can track orders under <strong>My Orders</strong>. Timeline updates
            appear as your order moves through processing, shipping, and delivery.
          </p>
        </section>

        <section>
          <h2>Need help?</h2>
          <p>
            WhatsApp us at +91 93505 29717 or visit our{" "}
            <a href="/contact" className="text-brand-orange hover:underline">
              Contact
            </a>{" "}
            page.
          </p>
        </section>
      </div>
    </div>
  );
}
