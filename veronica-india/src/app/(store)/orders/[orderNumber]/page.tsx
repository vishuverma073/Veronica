"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, MessageCircle, Package, ChevronLeft, AlertCircle } from "lucide-react";
import StoreProductThumb from "@/components/store/StoreProductThumb";
import { backend, BackendAuthError } from "@/lib/backend";
import { useAuthStore } from "@/store/authStore";
import { formatPrice } from "@/lib/utils";
import { statusBadgeClass, statusLabel } from "@/lib/order-status";
import OrderTimeline from "@/components/checkout/OrderTimeline";
import RetryPaymentButton from "@/components/checkout/RetryPaymentButton";
import type { RawTrackingEvent } from "@/lib/order-tracking";
import type { Order } from "@veronica/contracts";

export default function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const status = useAuthStore((s) => s.status);

  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<RawTrackingEvent[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [celebrate, setCelebrate] = useState(search.get("just") === "paid");

  // Strip ?just=paid after first render so a refresh doesn't re-celebrate.
  useEffect(() => {
    if (search.get("just") === "paid") {
      router.replace(`/orders/${orderNumber}`, { scroll: false });
    }
  }, [search, router, orderNumber]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?returnTo=/orders/${orderNumber}`);
    }
  }, [status, router, orderNumber]);

  // Re-fetch the order + its timeline (used on mount and after a retry payment).
  const reload = useCallback(() => {
    return backend
      .getOrder(orderNumber)
      .then((o) => {
        setOrder(o);
        backend.getOrderEvents(orderNumber).then(setEvents).catch(() => {});
      })
      .catch(() => setNotFound(true));
  }, [orderNumber]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    backend
      .getOrder(orderNumber)
      .then((o) => {
        if (!active) return;
        setOrder(o);
        // Tracking timeline is best-effort — never block the order view on it.
        backend.getOrderEvents(orderNumber).then((e) => active && setEvents(e)).catch(() => {});
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof BackendAuthError && e.status === 404) setNotFound(true);
        else setNotFound(true);
      });
    return () => { active = false; };
  }, [status, orderNumber]);

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-4">
          <Package className="text-text-muted" />
        </div>
        <h1 className="text-xl font-bold text-brand-black mb-2">Order not found</h1>
        <p className="text-sm text-text-muted mb-6">We couldn’t find an order with that number.</p>
        <Link href="/orders" className="btn btn-primary">View my orders</Link>
      </div>
    );
  }

  if (status !== "authenticated" || !order) {
    return (
      <div className="flex items-center justify-center py-32 text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const a = order.address;
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  const whatsappHelp =
    "https://wa.me/919350529717?text=" +
    encodeURIComponent(`Hi, I need help with my Veronica order ${order.orderNumber}.`);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-brand-orange mb-5">
        <ChevronLeft size={15} /> My orders
      </Link>

      {celebrate && (
        <div className="mb-6 rounded-2xl bg-success/10 border border-success/20 p-5 flex items-start gap-3 animate-fade-in">
          <CheckCircle2 className="text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-text-primary">Order placed successfully!</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Thank you. We’ve received your order and will confirm shipping shortly.
            </p>
            <button onClick={() => setCelebrate(false)} className="text-xs text-text-muted hover:underline mt-2">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-text-primary tracking-tight">Order {order.orderNumber}</h1>
          <p className="text-sm text-text-muted mt-0.5">Placed {orderDate}</p>
        </div>
        <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${statusBadgeClass(order.status)}`}>
          {statusLabel(order.status)}
        </span>
      </div>

      {/* Payment pending → let the customer retry. A failed/dismissed payment
          leaves the order unpaid ("created"); retrying re-opens Razorpay and,
          on success, verifies + confirms the order in place. */}
      {(order.status === "created" || order.status === "failed") && (
        <section className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2.5 mb-3">
            <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-text-primary">Payment {order.status === "failed" ? "failed" : "pending"}</p>
              <p className="text-sm text-text-secondary mt-0.5">
                Your order is saved but payment wasn’t completed. Retry to confirm it — your items are reserved.
              </p>
            </div>
          </div>
          <RetryPaymentButton orderNumber={order.orderNumber} amount={order.totals.total} onPaid={reload} />
        </section>
      )}

      {/* Tracking timeline. isCod=false: all current orders are online (Razorpay).
          When a Cash-on-Delivery option is added at checkout, set this from the
          order's payment method and the COD pipeline renders automatically. */}
      <OrderTimeline events={events} status={order.status} createdAt={order.createdAt} isCod={false} />

      {/* Shipping address */}
      <section className="bg-white rounded-2xl border border-border-light shadow-card p-4 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-2">Shipping to</h2>
        <p className="text-sm font-semibold text-text-primary">{a.fullName} · {a.label}</p>
        <p className="text-sm text-text-secondary mt-1 leading-relaxed">
          {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
          {a.landmark ? ` · ${a.landmark}` : ""}
        </p>
        <p className="text-sm text-text-muted mt-0.5">{a.phone}</p>
      </section>

      {/* Items */}
      <section className="bg-white rounded-2xl border border-border-light shadow-card divide-y divide-border-light mb-4">
        {order.items.map((item) => (
          <div key={`${item.skuId}-${item.variant ?? ""}`} className="flex gap-3 p-3.5">
            <div className="w-16 h-16 bg-surface-dim rounded-xl overflow-hidden shrink-0 border border-border-light">
              <StoreProductThumb
                src={item.image}
                alt={item.name}
                width={64}
                height={64}
                className="object-contain w-full h-full p-1.5"
              />
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/product/${item.slug}`} className="text-sm font-semibold text-text-primary line-clamp-2 hover:text-brand-orange">
                {item.name}
              </Link>
              {item.variant && <p className="text-xs text-text-secondary mt-0.5">{item.variant}</p>}
              <p className="text-xs text-text-muted mt-1">Qty {item.qty} · {formatPrice(item.price)}</p>
            </div>
            <span className="text-sm font-bold text-text-primary whitespace-nowrap">
              {formatPrice(item.price * item.qty)}
            </span>
          </div>
        ))}
      </section>

      {/* Totals */}
      <section className="bg-surface-card rounded-2xl border border-border-light p-5 mb-6">
        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between"><span className="text-text-secondary">Subtotal</span><span className="font-semibold">{formatPrice(order.totals.subtotal)}</span></div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Delivery</span>
            <span className={`font-semibold ${order.totals.shippingFee === 0 ? "text-success" : ""}`}>
              {order.totals.shippingFee === 0 ? "Free" : formatPrice(order.totals.shippingFee)}
            </span>
          </div>
          <div className="flex justify-between text-[12px] text-text-muted"><span>Incl. GST (18%)</span><span>{formatPrice(order.totals.gstIncluded)}</span></div>
          <div className="border-t border-border-light pt-2.5 mt-2.5 flex justify-between items-baseline">
            <span className="font-bold text-base">Total</span>
            <span className="font-extrabold text-lg text-text-primary">{formatPrice(order.totals.total)}</span>
          </div>
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href={whatsappHelp} target="_blank" className="btn btn-secondary flex-1 text-sm">
          <MessageCircle size={15} /> Need help?
        </Link>
        <Link href="/" className="btn btn-primary flex-1 text-sm">Continue shopping</Link>
      </div>
    </div>
  );
}
