"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { formatPrice } from "@/lib/utils";
import StoreProductThumb from "@/components/store/StoreProductThumb";
import ApiErrorState from "@/components/store/ApiErrorState";
import { backend } from "@/lib/backend";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import { Search, ChevronRight, SearchX, Package } from "lucide-react";

interface SearchResult {
    id: number;
    name: string;
    slug: string;
    minPrice: number;
    maxBasePrice: number;
    discount: number;
    image: string;
}

function SearchPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialQuery = searchParams.get("q") ?? "";

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const reqRef = useRef(0);

    const { data: categoryShortcuts } = useSWR("search-category-shortcuts", async () => {
        const navbar = await backend.getNavbar().catch(() => []);
        if (navbar.length > 0) {
            return navbar.slice(0, 4).map((c) => ({ slug: c.slug, name: c.name }));
        }
        const all = await backend.getCategories().catch(() => []);
        return all
            .filter((c) => c.parentId == null)
            .slice(0, 4)
            .map((c) => ({ slug: c.slug, name: c.name }));
    });

    const browseAllHref =
        categoryShortcuts?.[0] != null
            ? `/category/${categoryShortcuts[0].slug}`
            : "/search";

    const search = useCallback(async (q: string) => {
        const reqId = ++reqRef.current;
        if (!q.trim()) {
            setResults([]);
            setLoading(false);
            setError(false);
            return;
        }

        setLoading(true);
        setError(false);
        try {
            const items = await backend.searchProducts(q);
            if (reqId !== reqRef.current) return;
            setResults(
                items.map((p) => ({
                    id: p.id,
                    name: p.name,
                    slug: p.slug,
                    minPrice: p.minPrice,
                    maxBasePrice: p.maxBasePrice,
                    discount: p.bestDiscount,
                    image: p.image,
                })),
            );
        } catch {
            if (reqId === reqRef.current) {
                setError(true);
                setResults([]);
            }
        } finally {
            if (reqId === reqRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const q = searchParams.get("q") ?? "";
        setQuery((prev) => (prev === q ? prev : q));
    }, [searchParams]);

    useEffect(() => {
        const timer = setTimeout(() => search(query), 300);
        return () => clearTimeout(timer);
    }, [query, search]);

    useEffect(() => {
        const trimmed = query.trim();
        const current = searchParams.get("q") ?? "";
        if (trimmed === current) return;

        const params = new URLSearchParams(searchParams.toString());
        if (trimmed) params.set("q", trimmed);
        else params.delete("q");
        const qs = params.toString();
        router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    }, [query, router, searchParams]);

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="sr-only">Search products</h1>
            <div className="relative mb-10">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search products..."
                    className="w-full pl-14 pr-5 py-4 text-base rounded-2xl bg-surface-card border border-border-light shadow-card focus:border-brand-orange focus:shadow-lg transition-all duration-300 outline-none font-medium"
                    autoFocus
                />
            </div>

            {loading && (
                <div className="py-4">
                    <ProductGridSkeleton count={6} />
                </div>
            )}

            {!loading && error && query && (
                <ApiErrorState
                    title="Search unavailable"
                    message="We couldn't reach the catalog. Check your connection and try again."
                    onRetry={() => search(query)}
                />
            )}

            {!loading && !error && query && results.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">
                        <SearchX size={28} strokeWidth={1.5} />
                    </div>
                    <p className="text-text-secondary font-medium mb-1">No results found</p>
                    <p className="text-sm text-text-muted">
                        Try searching for &quot;sink&quot;, &quot;faucet&quot;, or &quot;shower&quot;
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                        {results.length} result{results.length > 1 ? "s" : ""}
                    </p>
                    {results.map((item) => (
                        <Link
                            key={item.id}
                            href={`/product/${item.slug}`}
                            className="flex items-center gap-4 p-3.5 rounded-2xl hover:bg-surface-dim transition-all duration-200 group border border-transparent hover:border-border-light"
                        >
                            <div className="w-16 h-16 bg-surface-dim rounded-xl overflow-hidden shrink-0 border border-border-light group-hover:border-border transition-colors">
                                <StoreProductThumb
                                    src={item.image}
                                    alt={item.name}
                                    width={64}
                                    height={64}
                                    className="object-contain w-full h-full p-1.5"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-text-primary line-clamp-1 group-hover:text-brand-orange transition-colors">
                                    {item.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm font-bold text-text-primary">
                                        {item.minPrice < item.maxBasePrice ? "From " : ""}
                                        {formatPrice(item.minPrice)}
                                    </span>
                                    {item.discount > 0 && (
                                        <span className="text-xs text-text-muted line-through">
                                            {formatPrice(item.maxBasePrice)}
                                        </span>
                                    )}
                                    {item.discount > 0 && (
                                        <span className="text-xs font-semibold text-success">
                                            {item.discount}% off
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-text-muted shrink-0 group-hover:text-brand-orange transition-colors" />
                        </Link>
                    ))}
                </div>
            )}

            {!query && (
                <div className="animate-fade-in">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-5">
                        Popular Categories
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {(categoryShortcuts ?? []).map((cat) => (
                            <Link
                                key={cat.slug}
                                href={`/category/${cat.slug}`}
                                className="flex items-center gap-3.5 p-4 rounded-2xl bg-surface-card border border-border-light hover:border-border hover:shadow-card transition-all duration-200 group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-brand-orange-light flex items-center justify-center text-brand-orange">
                                    <Package size={18} strokeWidth={1.8} />
                                </div>
                                <div>
                                    <span className="text-sm font-semibold text-text-primary group-hover:text-brand-orange transition-colors">
                                        {cat.name}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>

                    <div className="mt-8">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-4">
                            Trending Searches
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {["Kitchen Sink", "Health Faucet", "Floor Drain", "Braided Pipe", "Wash Basin Coupling", "Shower Tube"].map((term) => (
                                <button
                                    key={term}
                                    type="button"
                                    onClick={() => setQuery(term)}
                                    className="px-4 py-2 text-sm font-medium rounded-full bg-surface-dim text-text-secondary hover:bg-brand-orange-light hover:text-brand-orange transition-all duration-200 cursor-pointer"
                                >
                                    {term}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 text-center">
                        <Link href={browseAllHref} className="btn btn-secondary inline-flex">
                            Browse All Products
                            <ChevronRight size={16} />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function SearchFallback() {
    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <ProductGridSkeleton count={4} />
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<SearchFallback />}>
            <SearchPageContent />
        </Suspense>
    );
}
