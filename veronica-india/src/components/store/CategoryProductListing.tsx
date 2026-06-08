"use client";

import { useEffect, useMemo, useState } from "react";
import CategoryProductGrid from "./CategoryProductGrid";
import { collectAvailableSizes } from "@/lib/product-sizes";
import { formatPrice } from "@/lib/utils";

export interface CategoryListingProduct {
  slug: string;
  name: string;
  image: string;
  minPrice: number;
  maxBasePrice: number;
  discount: number;
  isBestseller: boolean;
  isNew: boolean;
  sizes: string[];
}

type PriceFilter = "all" | "under-2000" | "2000-5000" | "5000-plus";

const PRICE_FILTERS: { key: PriceFilter; label: string }[] = [
  { key: "all", label: "All prices" },
  { key: "under-2000", label: "Under ₹2,000" },
  { key: "2000-5000", label: "₹2,000 – ₹5,000" },
  { key: "5000-plus", label: "₹5,000+" },
];

function matchesPrice(minPrice: number, filter: PriceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "under-2000") return minPrice < 2000;
  if (filter === "2000-5000") return minPrice >= 2000 && minPrice <= 5000;
  return minPrice > 5000;
}

export default function CategoryProductListing({
  categorySlug,
  products,
}: {
  categorySlug: string;
  products: CategoryListingProduct[];
}) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  useEffect(() => {
    setSelectedSize(null);
    setPriceFilter("all");
  }, [categorySlug]);

  const availableSizes = useMemo(() => collectAvailableSizes(products), [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          matchesPrice(p.minPrice, priceFilter) &&
          (selectedSize ? p.sizes.includes(selectedSize) : true),
      ),
    [products, selectedSize, priceFilter],
  );

  const hasActiveFilters = selectedSize !== null || priceFilter !== "all";

  return (
    <>
      <div
        className="flex gap-2 overflow-x-auto scroll-x-hidden pb-4 mb-2 -mx-1 px-1"
        role="group"
        aria-label="Filter by price"
      >
        {PRICE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setPriceFilter(f.key)}
            className={`subcat-pill ${priceFilter === f.key ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {availableSizes.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto scroll-x-hidden pb-4 mb-4 -mx-1 px-1"
          role="group"
          aria-label="Filter by size"
        >
          <button
            type="button"
            onClick={() => setSelectedSize(null)}
            className={`subcat-pill ${selectedSize === null ? "active" : ""}`}
          >
            All Sizes
          </button>
          {availableSizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
              className={`subcat-pill ${selectedSize === size ? "active" : ""}`}
            >
              {size}
            </button>
          ))}
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="empty-state py-12">
          <p className="text-text-secondary font-medium mb-1">No products match these filters</p>
          <p className="text-sm text-text-muted mb-4">
            {hasActiveFilters
              ? "Try clearing filters or browse all products in this category."
              : "No products to show."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedSize(null);
                setPriceFilter("all");
              }}
              className="btn btn-secondary text-sm"
            >
              Clear all filters
            </button>
          )}
          {!hasActiveFilters && products.length > 0 && (
            <p className="text-xs text-text-muted mt-2">
              Showing {products.length} product{products.length === 1 ? "" : "s"} from{" "}
              {formatPrice(Math.min(...products.map((p) => p.minPrice)))} onwards
            </p>
          )}
        </div>
      ) : (
        <>
          {hasActiveFilters && (
            <p className="text-xs text-text-muted mb-3">
              Showing {filteredProducts.length} of {products.length} loaded products
            </p>
          )}
          <CategoryProductGrid products={filteredProducts} />
        </>
      )}
    </>
  );
}
