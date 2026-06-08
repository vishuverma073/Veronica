"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import { backend } from "@/lib/backend";
import ApiErrorState from "@/components/store/ApiErrorState";
import CategoryProductListing from "@/components/store/CategoryProductListing";
import type { CategoryListingProduct } from "@/components/store/CategoryProductListing";
import { ProductGridSkeleton } from "@/components/store/Skeletons";

const PAGE_SIZE = 24;

function mapItem(p: Awaited<ReturnType<typeof backend.listProductsByCategory>>["items"][number]): CategoryListingProduct {
  return {
    slug: p.slug,
    name: p.name,
    image: p.image,
    minPrice: p.minPrice,
    maxBasePrice: p.maxBasePrice,
    discount: p.bestDiscount,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    sizes: p.sizes ?? [],
  };
}

export default function CategoryProductLoader({ slug }: { slug: string }) {
  const [products, setProducts] = useState<CategoryListingProduct[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextCursor?: number | null, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(false);
      try {
        const page = await backend.listProductsByCategory(slug, {
          limit: PAGE_SIZE,
          cursor: nextCursor ?? undefined,
        });
        setProducts((prev) => (append ? [...prev, ...page.items.map(mapItem)] : page.items.map(mapItem)));
        setCursor(page.nextCursor);
        if (page.total != null) setTotal(page.total);
      } catch {
        setError(true);
        if (!append) setProducts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    setProducts([]);
    setCursor(null);
    setTotal(null);
    void load(null, false);
  }, [slug, load]);

  if (loading) {
    return (
      <div className="mt-8">
        <ProductGridSkeleton count={6} />
      </div>
    );
  }

  if (error) {
    return <ApiErrorState title="Couldn't load products" onRetry={() => load(null, false)} />;
  }

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Package size={28} strokeWidth={1.5} />
        </div>
        <p className="text-text-secondary font-medium mb-1">No products found</p>
        <p className="text-sm text-text-muted mb-6">Check back soon for new arrivals in this category.</p>
        <Link href="/" className="btn btn-primary">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {total != null && (
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
          {total} product{total === 1 ? "" : "s"}
        </p>
      )}
      <CategoryProductListing categorySlug={slug} products={products} />
      {cursor != null && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => load(cursor, true)}
            disabled={loadingMore}
            className="btn btn-secondary text-sm min-w-[10rem] disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Loading…
              </>
            ) : (
              "Load more products"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
