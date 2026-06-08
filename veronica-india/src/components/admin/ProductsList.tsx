"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, Package, Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { useCategories } from "@/lib/admin-hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { formatPrice, cn } from "@/lib/utils";
import StatusPill from "@/components/admin/StatusPill";
import AdminProductThumb from "@/components/admin/AdminProductThumb";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { adminApi, type AdminListProduct, type ProductListParams } from "@/lib/admin-api";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { buildProductCategoryOptions } from "@/lib/category-tree";

type StatusFilter = "" | "active" | "draft" | "archived";
type FlagFilter = "" | "bestseller" | "new" | "featured";

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
];

const FLAG_CHIPS: { label: string; value: FlagFilter }[] = [
  { label: "Any", value: "" },
  { label: "Bestseller", value: "bestseller" },
  { label: "New", value: "new" },
  { label: "Featured", value: "featured" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors min-h-[34px]",
        active
          ? "bg-brand-orange text-white shadow-sm"
          : "bg-white text-text-secondary border border-border hover:border-brand-orange/50",
      )}
    >
      {children}
    </button>
  );
}

export default function ProductsList({
  title,
  lockedStatus,
  emptyMessage = "No products match your filters.",
  showRestore = false,
  showDelete,
}: {
  title: string;
  /** When set, always loads this status and hides the status filter chips. */
  lockedStatus?: StatusFilter;
  emptyMessage?: string;
  showRestore?: boolean;
  showDelete?: boolean;
}) {
  const archiveView = lockedStatus === "archived";
  const { mutate } = useSWRConfig();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>(lockedStatus ?? "");
  const [flag, setFlag] = useState<FlagFilter>("");
  const [products, setProducts] = useState<AdminListProduct[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<{ id: number; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const effectiveStatus = lockedStatus ?? status;

  const { data: categories } = useCategories();
  const [category, setCategory] = useState("");

  const categoryOptions = useMemo(
    () => buildProductCategoryOptions((categories ?? []).filter((c) => c.status !== "archived")),
    [categories],
  );

  const selectedCatId = categoryOptions.find((c) => c.name === category)?.id;

  const listParams = useMemo<ProductListParams>(
    () => ({
      q: debouncedSearch || undefined,
      status: effectiveStatus || undefined,
      flag: flag || undefined,
      categoryTreeId: selectedCatId,
    }),
    [debouncedSearch, effectiveStatus, flag, selectedCatId],
  );

  const paramsKey = JSON.stringify(listParams);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(false);
    void adminApi
      .listProductsPage(listParams)
      .then((page) => {
        if (cancelled) return;
        setProducts(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paramsKey, listParams]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminApi.listProductsPage({ ...listParams, cursor: nextCursor });
      setProducts((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      toast.error("Couldn’t load more products");
    } finally {
      setLoadingMore(false);
    }
  }

  const newProductHref = selectedCatId
    ? `/admin/products/new?category=${selectedCatId}`
    : "/admin/products/new";

  async function refreshLists() {
    await mutate(
      (key) => Array.isArray(key) && key[0] === "admin/products",
      undefined,
      { revalidate: true },
    );
    const page = await adminApi.listProductsPage(listParams);
    setProducts(page.items);
    setNextCursor(page.nextCursor);
  }

  async function handleRestore(id: number) {
    setRestoringId(id);
    try {
      await adminApi.restoreProduct(id);
      toast.success("Product restored");
      setConfirmRestore(null);
      await refreshLists();
    } catch {
      toast.error("Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await adminApi.deleteProduct(id);
      toast.success("Product permanently deleted");
      setConfirmDelete(null);
      await refreshLists();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-text-primary">{title}</h1>
        {!archiveView && (
          <Link href={newProductHref} className="hidden lg:inline-flex btn btn-primary text-sm">
            <Plus size={16} /> Add Product
          </Link>
        )}
      </div>
      {archiveView && (
        <p className="text-sm text-text-muted mb-4">
          Archived products are hidden from the storefront. Restore them here when needed.
        </p>
      )}

      <div className="relative mb-3">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products or tags…"
          className="input pl-10!"
          type="search"
        />
      </div>

      <div className="space-y-2 mb-5">
        {!lockedStatus && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {STATUS_CHIPS.map((c) => (
              <Chip key={c.value} active={status === c.value} onClick={() => setStatus(c.value)}>
                {c.label}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FLAG_CHIPS.map((c) => (
            <Chip key={c.value} active={flag === c.value} onClick={() => setFlag(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        {categoryOptions.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={cn(
              "rounded-full text-xs font-semibold min-h-[34px] px-3 py-1.5 cursor-pointer w-auto max-w-[240px] transition-colors",
              category
                ? "bg-brand-orange text-white border border-brand-orange"
                : "bg-white text-text-secondary border border-border hover:border-brand-orange/50",
            )}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? (
        <p className="py-16 text-center text-sm text-danger">Failed to load products.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl h-48 animate-pulse border border-border-light"
            />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="group bg-white rounded-xl border border-border-light shadow-sm overflow-hidden hover:shadow-md hover:border-border transition-all"
            >
              <Link href={`/admin/products/${p.id}/edit`} className="block">
                <div className="aspect-square bg-surface-dim relative flex items-center justify-center">
                  <AdminProductThumb src={p.image} className="p-3" iconSize={28} />
                  {p.bestDiscount > 0 && (
                    <span className="absolute top-2 left-2 badge badge-discount">
                      -{p.bestDiscount}%
                    </span>
                  )}
                  <span className="absolute top-2 right-2">
                    <StatusPill status={p.status} />
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-text-primary line-clamp-2 min-h-[2.5rem]">
                    {p.name}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-sm font-bold text-text-primary">
                      {formatPrice(p.minPrice)}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {p.skuCount} SKU{p.skuCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {p.isBestseller && <span className="badge badge-bestseller">Best</span>}
                    {p.isNew && <span className="badge badge-new">New</span>}
                  </div>
                </div>
              </Link>
              {showRestore && (
                <div className="px-3 pb-3 -mt-1 flex gap-1">
                  <button
                    type="button"
                    title="Restore Product"
                    disabled={restoringId === p.id || deletingId === p.id}
                    onClick={() => setConfirmRestore({ id: p.id, name: p.name })}
                    className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim border border-border-light"
                  >
                    <ArchiveRestore size={15} />
                  </button>
                  {(showDelete ?? archiveView) && (
                    <button
                      type="button"
                      title="Delete permanently"
                      disabled={restoringId === p.id || deletingId === p.id}
                      onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                      className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-red-50 border border-border-light"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-16 text-text-muted">
          {archiveView ? <Archive size={32} /> : <Package size={32} />}
          <p className="text-sm">{emptyMessage}</p>
          {archiveView && (
            <Link href="/admin/products" className="text-sm text-brand-orange font-medium mt-1">
              View all products
            </Link>
          )}
        </div>
      )}

      {!isLoading && nextCursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="btn btn-secondary text-sm w-full mt-4"
        >
          {loadingMore ? <Loader2 size={14} className="animate-spin" /> : "Load more products"}
        </button>
      )}

      {!archiveView && (
        <Link
          href="/admin/products/new"
          className="lg:hidden fixed right-4 bottom-20 z-30 w-14 h-14 rounded-full bg-brand-orange text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          aria-label="Add product"
        >
          <Plus size={26} />
        </Link>
      )}

      {showRestore && (
        <>
          <ConfirmDialog
            open={confirmRestore != null}
            title="Restore product?"
            message={
              confirmRestore
                ? `Restore "${confirmRestore.name}"? It will reappear on the storefront as active.`
                : ""
            }
            confirmLabel="Restore"
            loading={restoringId != null}
            onCancel={() => !restoringId && setConfirmRestore(null)}
            onConfirm={() => confirmRestore && handleRestore(confirmRestore.id)}
          />
          <ConfirmDialog
            open={confirmDelete != null}
            title="Delete product permanently?"
            message={
              confirmDelete
                ? `Permanently delete "${confirmDelete.name}"? This cannot be undone.`
                : ""
            }
            confirmLabel="Delete forever"
            danger
            loading={deletingId != null}
            onCancel={() => !deletingId && setConfirmDelete(null)}
            onConfirm={() => confirmDelete && handleDelete(confirmDelete.id)}
          />
        </>
      )}
    </div>
  );
}
