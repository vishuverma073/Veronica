"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, Search, ShoppingCart } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

/** Status filter tabs (key = backend status, "" = all). */
const FILTERS = [
  { key: "", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;

// Every status the admin can set from the list (override mode: any → any).
// `confirmed` is shown as "Processing"; `out_for_delivery` logs a timeline event.
const ALL_STATUSES = [
  "pending",
  "paid",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending payment",
  paid: "Payment confirmed",
  confirmed: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-blue-100 text-blue-700 border-blue-200",
  confirmed: "bg-indigo-100 text-indigo-700 border-indigo-200",
  shipped: "bg-purple-100 text-purple-700 border-purple-200",
  out_for_delivery: "bg-cyan-100 text-cyan-700 border-cyan-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  refunded: "bg-gray-200 text-gray-600 border-gray-300",
};

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export default function OrdersPage() {
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusConfirm, setStatusConfirm] = useState<{
    id: string;
    orderNumber: string;
    from: string;
    to: string;
  } | null>(null);
  const { data: orders, isLoading, mutate } = useSWR(
    ["admin/orders", filter, debouncedSearch],
    () => adminApi.listOrders(filter || undefined, debouncedSearch || undefined),
  );

  async function setStatus(id: string, status: string) {
    try {
      await adminApi.addOrderEvent(id, status);
      toast.success(`Order marked ${STATUS_LABEL[status] ?? status}`);
      mutate();
    } catch {
      toast.error("Couldn’t update the order");
    }
  }

  // Confirm before any status change (override mode: cancelled → shipped, etc.).
  function requestStatus(o: { id: string; orderNumber: string; status: string }, next: string) {
    if (!next || next === o.status) return;
    setStatusConfirm({
      id: o.id,
      orderNumber: o.orderNumber,
      from: o.status,
      to: next,
    });
  }

  return (
    <div className="max-w-5xl pb-20">
      <h1 className="text-xl font-bold text-text-primary mb-4">Orders</h1>

      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, phone, or name…"
          className="input pl-10!"
          type="search"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              filter === f.key
                ? "border-brand-orange text-brand-orange bg-brand-orange/5"
                : "border-border text-text-secondary hover:bg-surface-dim"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-dim flex items-center justify-center">
            <ShoppingCart className="text-text-muted" />
          </div>
          <p className="text-text-secondary font-medium">
            No orders{filter ? ` marked “${FILTERS.find((f) => f.key === filter)?.label}”` : ""} yet
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border-light shadow-sm divide-y divide-border-light overflow-hidden">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-surface-dim/40 transition-colors">
              <Link href={`/admin/orders/${o.id}`} className="flex-1 min-w-0 block">
                <span className="font-semibold text-text-primary">{o.orderNumber}</span>
                <p className="text-sm text-text-secondary mt-0.5 truncate">
                  {o.customerName || "Customer"} · {o.customerPhone} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {new Date(o.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-text-primary whitespace-nowrap">{inr(o.total)}</span>
                {/* Status badge IS the changer: shows current status, change it inline
                    (confirms first, then updates status + timeline + badge). */}
                <select
                  value={o.status}
                  onChange={(e) => requestStatus(o, e.target.value)}
                  className={`text-xs font-bold uppercase tracking-wide rounded-full border px-2.5 py-1.5 cursor-pointer ${
                    STATUS_STYLE[o.status] ?? "bg-surface-dim text-text-secondary border-border"
                  }`}
                  aria-label={`Order status: ${STATUS_LABEL[o.status] ?? o.status}`}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={statusConfirm != null}
        title="Change order status?"
        message={
          statusConfirm
            ? `Change ${statusConfirm.orderNumber} from “${STATUS_LABEL[statusConfirm.from] ?? statusConfirm.from}” to “${STATUS_LABEL[statusConfirm.to] ?? statusConfirm.to}”? This updates the order status and adds a timeline entry.`
            : ""
        }
        confirmLabel="Update status"
        onCancel={() => setStatusConfirm(null)}
        onConfirm={() => {
          if (statusConfirm) {
            void setStatus(statusConfirm.id, statusConfirm.to);
          }
          setStatusConfirm(null);
        }}
      />
    </div>
  );
}
