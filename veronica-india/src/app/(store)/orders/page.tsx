"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Package, ChevronRight } from "lucide-react";
import { backend } from "@/lib/backend";
import { useAuthStore } from "@/store/authStore";
import { formatPrice, getSafeImageSrc } from "@/lib/utils";
import { statusBadgeClass, statusLabel } from "@/lib/order-status";
import ApiErrorState from "@/components/store/ApiErrorState";
import type { OrderListItem } from "@veronica/contracts";

export default function OrdersPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?returnTo=/orders");
  }, [status, router]);

  const loadOrders = useCallback(async () => {
    setFetchError(false);
    try {
      const page = await backend.getOrders();
      setOrders(page.items);
      setCursor(page.nextCursor);
    } catch {
      setFetchError(true);
      setOrders([]);
      setCursor(null);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    backend
      .getOrders()
      .then((page) => {
        if (!active) return;
        setOrders(page.items);
        setCursor(page.nextCursor);
        setFetchError(false);
      })
      .catch(() => {
        if (active) {
          setFetchError(true);
          setOrders([]);
        }
      });
    return () => {
      active = false;
    };
  }, [status]);

  async function loadMore() {
    if (cursor == null) return;
    setLoadingMore(true);
    try {
      const page = await backend.getOrders(cursor);
      setOrders((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setFetchError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (status !== "authenticated" || orders === null) {
    return (
      <div className="flex items-center justify-center py-32 text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <ApiErrorState
          title="Couldn't load your orders"
          message="We couldn't fetch your order history. Your orders are still safe — please try again."
          onRetry={loadOrders}
        />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-4">
          <Package className="text-text-muted" />
        </div>
        <h1 className="text-xl font-bold text-brand-black mb-2">No orders yet</h1>
        <p className="text-sm text-text-muted mb-6">Your orders will appear here once you’ve placed one.</p>
        <Link href="/" className="btn btn-primary">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mb-6">My Orders</h1>

      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.orderNumber}`}
            className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-border-light shadow-card hover:border-border transition-colors"
          >
            <div className="w-14 h-14 bg-surface-dim rounded-xl overflow-hidden shrink-0 border border-border-light">
              {(() => {
                const thumb = getSafeImageSrc(o.firstItemImage);
                return thumb ? (
                  <Image src={thumb} alt="" width={56} height={56} className="object-contain w-full h-full p-1.5" />
                ) : null;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-text-primary">{o.orderNumber}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusBadgeClass(o.status)}`}>
                  {statusLabel(o.status)}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1">
                {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {o.itemCount} item{o.itemCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-text-primary">{formatPrice(o.total)}</p>
              <ChevronRight size={16} className="text-text-muted ml-auto mt-1" />
            </div>
          </Link>
        ))}
      </div>

      {cursor != null && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="btn btn-ghost text-sm w-full mt-4 border border-border disabled:opacity-50"
        >
          {loadingMore ? <Loader2 size={16} className="animate-spin" /> : "Load more"}
        </button>
      )}
    </div>
  );
}
