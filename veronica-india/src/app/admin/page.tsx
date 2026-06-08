"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Package, FolderTree, Plus, AlertCircle } from "lucide-react";
import { useProducts } from "@/lib/admin-hooks";
import { useCategories } from "@/lib/admin-hooks";
import StatusPill from "@/components/admin/StatusPill";
import AdminProductThumb from "@/components/admin/AdminProductThumb";
import ProductRowActions from "@/components/admin/ProductRowActions";

/**
 * Admin dashboard — product/category counts and the five most recently added
 * products (by id, excluding archived). Refetches on mount so create/delete
 * elsewhere is reflected when you return here.
 */
export default function AdminDashboard() {
  const { data: products, isLoading: pLoading, error: pError, mutate } = useProducts();
  const { data: categories, isLoading: cLoading } = useCategories();

  useEffect(() => {
    void mutate();
  }, [mutate]);

  const catalog = products ?? [];
  const active = catalog.filter((p) => p.status === "active").length;
  const draft = catalog.filter((p) => p.status === "draft").length;
  const total = active + draft;
  const rootCats = categories?.filter((c) => c.parentId === null).length ?? 0;
  const recent = [...catalog].sort((a, b) => b.id - a.id).slice(0, 5);

  const stats = [
    {
      label: "Total Products",
      value: total,
      sub: `${active} active · ${draft} draft`,
      border: "border-l-brand-orange",
      Icon: Package,
    },
    {
      label: "Categories",
      value: categories?.length ?? 0,
      sub: `${rootCats} root`,
      border: "border-l-brand-blue",
      Icon: FolderTree,
    },
  ];

  if (pError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-text-secondary">
        <AlertCircle className="text-danger" />
        <p className="text-sm">Couldn’t load dashboard data.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-text-primary mb-5 lg:hidden">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map(({ label, value, sub, border, Icon }) => (
          <div key={label} className={`bg-white rounded-xl p-4 border-l-4 ${border} shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-text-secondary font-medium uppercase tracking-wider">
                  {label}
                </p>
                <p className="text-2xl font-bold text-text-primary mt-0.5">
                  {pLoading || cLoading ? "—" : value}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
              </div>
              <Icon className="text-text-muted" size={28} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/admin/products/new" className="btn btn-primary text-sm">
          <Plus size={16} /> Add Product
        </Link>
        <Link href="/admin/products" className="btn btn-secondary text-sm">
          All Products
        </Link>
        <Link href="/admin/categories" className="btn btn-secondary text-sm">
          Categories
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-border-light">
        <div className="px-4 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-primary">Recently Added Products</h2>
        </div>
        {pLoading ? (
          <p className="px-4 py-6 text-text-muted text-sm text-center">Loading…</p>
        ) : recent.length > 0 ? (
          <div className="divide-y divide-border-light">
            {recent.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-surface-dim/50 transition-colors"
              >
                <Link
                  href={`/admin/products/${product.id}/edit`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-dim overflow-hidden shrink-0 flex items-center justify-center">
                    <AdminProductThumb src={product.image} className="p-1" iconSize={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{product.name}</p>
                    <p className="text-[11px] text-text-muted">
                      {product.skuCount} SKU{product.skuCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </Link>
                <StatusPill status={product.status} />
                <ProductRowActions
                  product={{
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    status: product.status,
                  }}
                  onChanged={() => {
                    void mutate();
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-text-muted text-sm text-center">
            No products yet. Start by adding one!
          </p>
        )}
      </div>
    </div>
  );
}
