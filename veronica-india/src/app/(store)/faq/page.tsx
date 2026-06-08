import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ — Veronica India",
  description: "Frequently asked questions about orders, delivery, returns, and products.",
  alternates: { canonical: absoluteUrl("/faq") },
};

const FAQ = [
  {
    q: "How do I place an order?",
    a: "Browse products, add items to your cart, and checkout with your delivery address. Pay securely via UPI, card, or other methods supported at checkout.",
  },
  {
    q: "When will my order arrive?",
    a: "Most orders ship within 1–2 business days. Delivery time depends on your location and the courier. Track progress from My Orders once signed in.",
  },
  {
    q: "What are your shipping charges?",
    a: "Shipping fees and free-delivery thresholds are shown at checkout and on the cart page. See our Shipping page for full details.",
  },
  {
    q: "Can I return a product?",
    a: "Yes — eligible items can be returned within our return window. See the Refund & Return Policy for conditions and how to start a return.",
  },
  {
    q: "Are prices inclusive of GST?",
    a: "Yes. Product prices on the site include applicable GST. Your invoice breakdown is shown at checkout.",
  },
  {
    q: "How do I contact support?",
    a: "Call +91 93505 29717, email support@veronicaindia.com, or use the Contact page / WhatsApp link on any product page.",
  },
] as const;

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-14">
      <header className="mb-10">
        <span className="badge badge-bestseller mb-4">Help</span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight mb-2">
          Frequently Asked Questions
        </h1>
        <p className="text-sm text-text-muted">
          Quick answers — or{" "}
          <Link href="/contact" className="text-brand-orange hover:underline">
            get in touch
          </Link>
          .
        </p>
      </header>

      <div className="space-y-6">
        {FAQ.map(({ q, a }) => (
          <section
            key={q}
            className="bg-white rounded-xl border border-border-light shadow-sm p-5"
          >
            <h2 className="text-base font-bold text-text-primary mb-2">{q}</h2>
            <p className="text-[15px] text-text-secondary leading-relaxed">{a}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-text-muted text-center">
        <Link href="/shipping" className="text-brand-orange hover:underline">
          Shipping
        </Link>
        {" · "}
        <Link href="/refund" className="text-brand-orange hover:underline">
          Returns
        </Link>
        {" · "}
        <Link href="/terms" className="text-brand-orange hover:underline">
          Terms
        </Link>
      </p>
    </div>
  );
}
