"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ShopNavNode } from "@/lib/shop-nav";
import { isCategoryPathActive } from "@/lib/shop-nav";

function MobileCategoryTree({
  nodes,
  depth,
  pathname,
  onNavigate,
  expandedIds,
  toggleExpanded,
}: {
  nodes: ShopNavNode[];
  depth: number;
  pathname: string;
  onNavigate: () => void;
  expandedIds: Set<number>;
  toggleExpanded: (id: number) => void;
}) {
  return (
    <ul
      className={
        depth === 0
          ? "space-y-1"
          : "ml-4 mt-1 space-y-0.5 border-l border-border/40 pl-4"
      }
    >
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const expanded = expandedIds.has(node.id);
        const active = isCategoryPathActive(pathname, node.slug);
        const isRoot = depth === 0;

        return (
          <li key={node.id}>
            <div className="flex items-stretch gap-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpanded(node.id)}
                  className="flex shrink-0 items-center justify-center rounded-lg px-1.5 text-text-muted hover:bg-surface-dim"
                  aria-expanded={expanded}
                  aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                >
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
                  />
                </button>
              ) : (
                <span className="w-7 shrink-0" aria-hidden />
              )}
              <Link
                href={`/category/${node.slug}`}
                onClick={onNavigate}
                className={`flex flex-1 items-center rounded-lg px-2.5 transition-colors duration-150 ${
                  isRoot
                    ? "py-2.5 text-[15px] font-bold tracking-tight"
                    : "py-1.5 text-[13px] font-normal"
                } ${
                  active
                    ? isRoot
                      ? "bg-brand-orange-light text-brand-orange"
                      : "bg-brand-orange-light/70 text-brand-orange/80 font-medium"
                    : isRoot
                      ? "text-text-primary hover:bg-surface-dim"
                      : "text-text-secondary/70 hover:bg-surface-dim hover:text-text-secondary"
                }`}
              >
                <span className="truncate">{node.name}</span>
              </Link>
            </div>
            {hasChildren && expanded && (
              <MobileCategoryTree
                nodes={node.children}
                depth={depth + 1}
                pathname={pathname}
                onNavigate={onNavigate}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MobileShopSkeleton() {
  return (
    <div className="space-y-1.5 px-1 py-1 animate-pulse">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-9 rounded-lg bg-surface-dim" />
      ))}
    </div>
  );
}

export default function MobileShopNav({
  open,
  tree,
  isLoading,
  isError,
  isEmpty,
  fetchWarning,
  onRetry,
  pathname,
  onNavigate,
  staticLinks,
  isActive,
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
  staticLinks: { href: string; label: string }[];
  isActive: (href: string) => boolean;
}) {
  const [shopExpanded, setShopExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  const shopActive = pathname.startsWith("/category/");

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!open) return null;

  const homeLink = staticLinks.find((l) => l.href === "/");
  const otherLinks = staticLinks.filter((l) => l.href !== "/");

  return (
    <nav className="flex flex-col gap-0.5 p-4" aria-label="Mobile navigation">
      {homeLink && (
        <Link
          href={homeLink.href}
          onClick={onNavigate}
          className={`block rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
            isActive(homeLink.href)
              ? "bg-brand-orange-light text-brand-orange font-semibold"
              : "text-text-secondary hover:bg-surface-dim hover:text-text-primary"
          }`}
        >
          {homeLink.label}
        </Link>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShopExpanded((v) => !v)}
          className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
            shopActive
              ? "bg-brand-orange-light text-brand-orange font-semibold"
              : "text-text-secondary hover:bg-surface-dim hover:text-text-primary"
          }`}
          aria-expanded={shopExpanded}
          aria-controls="mobile-shop-panel"
        >
          Shop
          <ChevronDown
            size={17}
            className={`transition-transform duration-200 ${shopExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {shopExpanded && (
          <div id="mobile-shop-panel" className="mt-1 pl-1">
            {isLoading && tree.length === 0 ? (
              <MobileShopSkeleton />
            ) : tree.length > 0 ? (
              <>
                {fetchWarning && (
                  <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                    Showing partial category list.
                  </p>
                )}
                <MobileCategoryTree
                  nodes={tree}
                  depth={0}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                />
              </>
            ) : isError ? (
              <div className="px-3 py-2 text-sm text-text-muted">
                <p className="mb-2">Could not load categories.</p>
                <button type="button" onClick={onRetry} className="mr-3 font-semibold text-brand-orange">
                  Retry
                </button>
                <Link href="/search" onClick={onNavigate} className="font-semibold text-brand-orange">
                  Search
                </Link>
              </div>
            ) : isEmpty ? (
              <div className="px-3 py-2 text-sm text-text-muted">
                <p className="mb-2">No categories yet.</p>
                <Link href="/search" onClick={onNavigate} className="font-semibold text-brand-orange">
                  Search products
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {otherLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={`block rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
            isActive(link.href)
              ? "bg-brand-orange-light text-brand-orange font-semibold"
              : "text-text-secondary hover:bg-surface-dim hover:text-text-primary"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
