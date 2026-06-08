"use client";

import { useState } from "react";
import ProductCard from "./ProductCard";
import { ArrowUpDown } from "lucide-react";
import type { CategoryListingProduct } from "./CategoryProductListing";

type SortOption = "default" | "price-asc" | "price-desc" | "discount" | "newest";

export default function CategoryProductGrid({ products }: { products: CategoryListingProduct[] }) {
    const [sort, setSort] = useState<SortOption>("default");

    const sorted = [...products].sort((a, b) => {
        switch (sort) {
            case "price-asc":
                return a.minPrice - b.minPrice;
            case "price-desc":
                return b.minPrice - a.minPrice;
            case "discount":
                return b.discount - a.discount;
            case "newest":
                return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
            default:
                return 0;
        }
    });

    return (
        <>
            {/* Sort bar */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-text-muted bg-surface-dim px-3 py-1.5 rounded-full">
                    {products.length} product{products.length !== 1 ? "s" : ""}
                </span>
                <div className="relative">
                    <ArrowUpDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortOption)}
                        className="appearance-none pl-8 pr-8 py-2 text-xs font-medium rounded-xl bg-surface-card border border-border-light text-text-secondary cursor-pointer hover:border-border focus:border-brand-orange focus:outline-none transition-colors"
                    >
                        <option value="default">Sort: Default</option>
                        <option value="price-asc">Price: Low → High</option>
                        <option value="price-desc">Price: High → Low</option>
                        <option value="discount">Best Discount</option>
                        <option value="newest">Newest First</option>
                    </select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 stagger-children">
                {sorted.map((product) => (
                    <div key={product.slug} className="animate-fade-in" style={{ opacity: 0 }}>
                        <ProductCard
                            slug={product.slug}
                            name={product.name}
                            image={product.image}
                            minPrice={product.minPrice}
                            maxBasePrice={product.maxBasePrice}
                            discount={product.discount}
                            isBestseller={product.isBestseller}
                            isNew={product.isNew}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}
