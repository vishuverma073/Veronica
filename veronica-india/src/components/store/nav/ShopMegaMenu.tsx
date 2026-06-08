"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ShopNavNode } from "@/lib/shop-nav";
import { isCategoryPathActive } from "@/lib/shop-nav";

function SubcategoryLinks({
  nodes,
  depth,
  pathname,
  onNavigate,
}: {
  nodes: ShopNavNode[];
  depth: number;
  pathname: string;
  onNavigate: () => void;
}) {
  if (nodes.length === 0) return null;

  return (
    <ul
      className={
        depth > 0
          ? "mt-1 ml-4 space-y-1 border-l border-white/10 pl-4"
          : "mt-1.5 space-y-1"
      }
    >
      {nodes.map((node) => {
        const active = isCategoryPathActive(pathname, node.slug);
        return (
          <li key={node.id}>
            <Link
              href={`/category/${node.slug}`}
              onClick={onNavigate}
              className={`block py-0.5 leading-snug transition-colors duration-150 ${
                depth === 0
                  ? "text-[12px] font-medium"
                  : "text-[11px] font-normal"
              } ${
                active
                  ? "text-brand-orange/75 font-medium"
                  : depth === 0
                    ? "text-white/70 hover:text-white/85"
                    : "text-white/60 hover:text-white/75"
              }`}
            >
              {node.name}
            </Link>
            {node.children.length > 0 && (
              <SubcategoryLinks
                nodes={node.children}
                depth={depth + 1}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CategoryColumn({
  root,
  pathname,
  onNavigate,
}: {
  root: ShopNavNode;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isCategoryPathActive(pathname, root.slug);

  return (
    <div className="min-w-0 break-inside-avoid pb-1">
      <Link
        href={`/category/${root.slug}`}
        onClick={onNavigate}
        className={`mb-2.5 block text-[15px] font-bold leading-tight tracking-tight transition-colors duration-150 ${
          active ? "text-brand-orange" : "text-white/95 hover:text-white"
        }`}
      >
        {root.name}
      </Link>
      <SubcategoryLinks
        nodes={root.children}
        depth={0}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function MegaMenuSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-5 py-4 md:grid-cols-3 lg:grid-cols-4 animate-pulse">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3.5 w-28 rounded bg-white/12" />
          <div className="h-2.5 w-20 rounded bg-white/8" />
          <div className="h-2.5 w-24 rounded bg-white/8" />
        </div>
      ))}
    </div>
  );
}

export default function ShopMegaMenu({
  open,
  tree,
  isLoading,
  isError,
  isEmpty,
  fetchWarning,
  onRetry,
  pathname,
  onNavigate,
  menuId,
}: {
  open: boolean;
  tree: ShopNavNode[];
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  fetchWarning?: string;
  onRetry: () => void;
  pathname: string;
  onNavigate: () => void;
  menuId: string;
}) {
  if (!open) return null;

  return (
    <div
      id={menuId}
      role="region"
      aria-label="Shop categories"
      className="absolute left-1/2 top-full z-50 w-[min(100vw-2rem,56rem)] -translate-x-1/2 pt-2"
    >
      <div className="overflow-hidden rounded-xl bg-brand-black shadow-xl shadow-black/30">
        {isLoading && tree.length === 0 ? (
          <MegaMenuSkeleton />
        ) : tree.length > 0 ? (
          <>
            {fetchWarning && (
              <p className="border-b border-white/8 px-5 py-2 text-[11px] text-amber-200/80">
                Showing partial category list.
              </p>
            )}
            <div className="max-h-[min(480px,70vh)] overflow-y-auto overscroll-contain px-5 py-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-7 md:grid-cols-3 lg:grid-cols-4">
                {tree.map((root) => (
                  <CategoryColumn
                    key={root.id}
                    root={root}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          </>
        ) : isError ? (
          <div className="px-5 py-8 text-center">
            <p className="mb-1 text-sm font-medium text-white">Could not load categories</p>
            <p className="mb-4 text-[13px] text-white/50">Try again or search the catalog.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
              >
                Retry
              </button>
              <Link
                href="/search"
                onClick={onNavigate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange/90"
              >
                Search products
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="px-5 py-8 text-center">
            <p className="mb-1 text-sm font-medium text-white">No categories yet</p>
            <p className="mb-4 text-[13px] text-white/50">Browse products or check back soon.</p>
            <Link
              href="/search"
              onClick={onNavigate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange/90"
            >
              Search products
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
