"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, ChevronLeft, Check, ArrowRight, ArrowLeft, Clock } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import AdminProductThumb from "@/components/admin/AdminProductThumb";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

/** Move an order one fulfilment stage back. */
const PREV_STATUS: Record<string, string> = {
  confirmed: "paid",
  shipped: "confirmed",
  delivered: "shipped",
};

/**
 * Fulfilment pipeline the admin walks an order through. Each step logs a
 * timeline event (with a timestamp) the customer sees on their tracking page,
 * and advances the order status where the event maps to one (out_for_delivery
 * is timeline-only — it isn't an order_status — but still shows on the timeline).
 */
const FULFILMENT_STEPS = [
  { event: "confirmed", label: "Processing", hint: "Order accepted · packing" },
  { event: "shipped", label: "Shipped", hint: "Handed to courier" },
  { event: "out_for_delivery", label: "Out for Delivery", hint: "Courier delivering today" },
  { event: "delivered", label: "Delivered", hint: "Customer received it" },
] as const;

// Rank of an order status within the fulfilment pipeline (for marking past steps done).
const STATUS_RANK: Record<string, number> = {
  pending: 0, paid: 1, confirmed: 2, shipped: 3, delivered: 5, cancelled: -1, refunded: -1,
};
const STEP_RANK: Record<string, number> = {
  confirmed: 2, shipped: 3, out_for_delivery: 4, delivered: 5,
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
  refunded: "bg-gray-200 text-gray-600",
};

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}
function str(v: unknown) {
  return typeof v === "string" ? v : "";
}
function dt(s: string) {
  return new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, isLoading, mutate } = useSWR(["admin/order", id], () => adminApi.getOrder(id));
  const { data: events, mutate: mutateEvents } = useSWR(["admin/order-events", id], () =>
    adminApi.getOrderEvents(id),
  );

  // Event time the admin can set (datetime-local). Empty = use the server's "now".
  const [eventTime, setEventTime] = useState("");
  const [statusConfirm, setStatusConfirm] = useState<{ next: string; label: string } | null>(null);

  async function setStatus(status: string) {
    try {
      await adminApi.addOrderEvent(
        id,
        status,
        eventTime ? { occurredAt: new Date(eventTime).toISOString() } : {},
      );
      toast.success(`Order marked ${status}`);
      mutate();
      mutateEvents();
    } catch {
      toast.error("Couldn’t update the order");
    }
  }

  if (isLoading || !order) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const a = order.shippingAddress as Record<string, unknown>;

  return (
    <div className="max-w-3xl pb-20">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-brand-orange mb-4"
      >
        <ChevronLeft size={15} /> All orders
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-xl font-bold text-text-primary">{order.orderNumber}</h1>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            STATUS_STYLE[order.status] ?? "bg-surface-dim text-text-secondary"
          }`}
        >
          {order.status}
        </span>
        <span className="text-xs text-text-muted">{dt(order.createdAt)}</span>
      </div>

      {/* Fulfilment manager — where the order is in its timeline + how to advance it. */}
      {(() => {
        const cancelled = order.status === "cancelled" || order.status === "refunded";
        const loggedEvents = new Set((events ?? []).map((e) => e.eventType));
        const isStepDone = (ev: string) =>
          !cancelled && (loggedEvents.has(ev) || (STATUS_RANK[order.status] ?? 0) >= (STEP_RANK[ev] ?? 99));
        const nextStep = cancelled ? undefined : FULFILMENT_STEPS.find((s) => !isStepDone(s.event));
        const prevStatus = PREV_STATUS[order.status];

        // Confirm before override/correction changes (cancel, refund, going back,
        // or re-setting a stage). The guided "Mark as next" stays one-click.
        const change = (next: string) => {
          setStatusConfirm({
            next,
            label: next.replace(/_/g, " "),
          });
        };

        return (
          <div className="bg-white rounded-xl border border-border-light shadow-sm p-4 mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-3">Fulfilment</h2>

            {cancelled && (
              <p className="text-sm text-text-secondary mb-3">
                This order is <span className="font-semibold text-danger capitalize">{order.status}</span>. Pick a
                step below to reactivate it.
              </p>
            )}

            {/* Event time — defaults to now; set it to backdate/forward-date the step. */}
            <label className="flex items-center gap-2 mb-3 text-xs text-text-secondary">
              <Clock size={14} className="text-text-muted shrink-0" />
              <span className="font-medium">Step time</span>
              <input
                type="datetime-local"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="input py-1.5! text-sm flex-1 min-w-0"
              />
              {eventTime && (
                <button onClick={() => setEventTime("")} className="text-[11px] text-brand-orange hover:underline shrink-0">
                  now
                </button>
              )}
            </label>

            {/* Quick Prev / Next */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => prevStatus && change(prevStatus)}
                disabled={!prevStatus}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-text-secondary hover:border-brand-orange hover:text-brand-orange disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary"
              >
                <ArrowLeft size={14} /> Previous
              </button>
              <button
                onClick={() => nextStep && setStatus(nextStep.event)}
                disabled={!nextStep}
                className="btn btn-primary text-xs px-3 py-2 flex-1 justify-center disabled:opacity-40"
              >
                {nextStep ? `Mark as ${nextStep.label}` : "All steps done"} <ArrowRight size={14} />
              </button>
            </div>

            {/* Full stepper — every stage is clickable (advance, correct a time, or
                go back); clicking applies the chosen step time. */}
            <ol className="relative">
              {FULFILMENT_STEPS.map((step, i) => {
                const done = isStepDone(step.event);
                const current = step.event === nextStep?.event;
                const last = i === FULFILMENT_STEPS.length - 1;
                return (
                  <li key={step.event} className="flex gap-3 pb-4 last:pb-0 relative">
                    {!last && (
                      <span
                        className={`absolute left-[11px] top-6 bottom-0 w-px ${done ? "bg-brand-orange" : "bg-border-light"}`}
                        aria-hidden
                      />
                    )}
                    <span
                      className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        done
                          ? "bg-brand-orange text-white"
                          : current
                            ? "bg-white border-2 border-brand-orange"
                            : "bg-surface-dim border border-border-light"
                      }`}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : <span className={`w-1.5 h-1.5 rounded-full ${current ? "bg-brand-orange" : "bg-text-muted"}`} />}
                    </span>
                    <button onClick={() => change(step.event)} className="text-left -mt-0.5 group">
                      <p className={`text-sm font-semibold ${done || current ? "text-text-primary" : "text-text-muted"}`}>
                        {step.label}
                        <span className="ml-2 text-[11px] font-normal text-brand-orange opacity-0 group-hover:opacity-100">
                          {done ? "re-set" : "set"}
                        </span>
                      </p>
                      <p className="text-[11px] text-text-muted">{step.hint}</p>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* Side actions */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border-light">
              <button
                onClick={() => change("cancelled")}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-border text-danger hover:border-danger"
              >
                Cancel order
              </button>
              <button
                onClick={() => change("refunded")}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-border text-text-secondary hover:border-brand-orange hover:text-brand-orange"
              >
                Mark refunded
              </button>
            </div>
          </div>
        );
      })()}

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-border-light shadow-sm p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-2">Customer</h2>
          <p className="text-sm text-text-primary font-medium">{order.customerName || "—"}</p>
          <p className="text-sm text-text-secondary">{order.customerPhone}</p>
          {order.customerEmail && <p className="text-sm text-text-secondary">{order.customerEmail}</p>}
        </div>
        <div className="bg-white rounded-xl border border-border-light shadow-sm p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-2">Shipping address</h2>
          <p className="text-sm text-text-primary font-medium">{str(a.fullName) || order.customerName || "—"}</p>
          {str(a.phone) && <p className="text-sm text-text-secondary">{str(a.phone)}</p>}
          <p className="text-sm text-text-secondary mt-1">
            {[str(a.line1), str(a.line2), str(a.landmark)].filter(Boolean).join(", ")}
          </p>
          <p className="text-sm text-text-secondary">
            {[str(a.city), str(a.state), str(a.pincode)].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>

      {/* Items + totals */}
      <div className="bg-white rounded-xl border border-border-light shadow-sm overflow-hidden mb-4">
        <div className="divide-y divide-border-light">
          {order.items.map((it, i) => (
            <div key={i} className="flex gap-3 p-3.5">
              <div className="w-14 h-14 bg-surface-dim rounded-lg overflow-hidden shrink-0 border border-border-light flex items-center justify-center">
                <AdminProductThumb src={it.imageUrl} className="p-1" iconSize={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary line-clamp-2">{it.productName}</p>
                {it.variantLabel && <p className="text-xs text-text-secondary">{it.variantLabel}</p>}
                <p className="text-xs text-text-muted mt-0.5">
                  {inr(it.unitPrice)} × {it.qty}
                </p>
              </div>
              <span className="text-sm font-bold text-text-primary whitespace-nowrap">{inr(it.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border-light p-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>Subtotal</span>
            <span>{inr(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Shipping</span>
            <span>{order.shippingFee === 0 ? "FREE" : inr(order.shippingFee)}</span>
          </div>
          <div className="flex justify-between text-text-muted text-xs">
            <span>Incl. GST</span>
            <span>{inr(order.gstAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-text-primary pt-1.5 border-t border-border-light">
            <span>Total</span>
            <span>{inr(order.total)}</span>
          </div>
          {order.razorpayPaymentId && (
            <p className="text-[11px] text-text-muted pt-1">Payment ID: {order.razorpayPaymentId}</p>
          )}
        </div>
      </div>

      {/* Timeline */}
      {events && events.length > 0 && (
        <div className="bg-white rounded-xl border border-border-light shadow-sm p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-3">Timeline</h2>
          <div className="space-y-2.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-brand-orange mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-primary capitalize">{e.eventType.replace(/_/g, " ")}</p>
                  {e.note && <p className="text-xs text-text-secondary">{e.note}</p>}
                  <p className="text-[11px] text-text-muted">{dt(e.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={statusConfirm != null}
        title="Change order status?"
        message={
          statusConfirm
            ? `Change ${order.orderNumber} from “${order.status}” to “${statusConfirm.label}”? This updates the order status and adds a timeline entry.`
            : ""
        }
        confirmLabel="Update status"
        onCancel={() => setStatusConfirm(null)}
        onConfirm={() => {
          if (statusConfirm) void setStatus(statusConfirm.next);
          setStatusConfirm(null);
        }}
      />
    </div>
  );
}
