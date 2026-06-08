import Link from "next/link";
import { SearchX, Home, Search } from "lucide-react";
import { getCategoryShortcuts } from "@/lib/category-shortcuts";

/** On-brand 404 for the storefront (renders with Header/Footer chrome). */
export default async function NotFound() {
  const categories = await getCategoryShortcuts(4);

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-brand-orange-light flex items-center justify-center mx-auto mb-6 text-brand-orange">
        <SearchX size={34} strokeWidth={1.5} />
      </div>
      <p className="text-5xl font-extrabold text-text-primary tracking-tight">404</p>
      <h1 className="text-xl font-bold text-text-primary mt-3 mb-2">This page wandered off</h1>
      <p className="text-sm text-text-secondary mb-8">
        The page you’re looking for doesn’t exist or may have moved. Let’s get you back on track.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <Link href="/" className="btn btn-primary">
          <Home size={16} /> Back home
        </Link>
        <Link href="/search" className="btn btn-secondary">
          <Search size={16} /> Search products
        </Link>
      </div>

      {categories.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-4">
            Or browse a category
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="px-4 py-2 text-sm font-medium rounded-full bg-surface-dim text-text-secondary hover:bg-brand-orange-light hover:text-brand-orange transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
