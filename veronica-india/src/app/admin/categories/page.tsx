"use client";

import { useMemo, useState } from "react";
import { Plus, FolderTree, X } from "lucide-react";
import type { Category } from "@veronica/contracts";
import { useCategories, useCategoryProducts } from "@/lib/admin-hooks";
import { adminApi, AdminApiError, type AdminListProduct } from "@/lib/admin-api";
import { toast } from "sonner";
import { cn, slugify, normalizeImageInput } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { CategoryTreePanel, CategoryProductsPanel } from "@/components/admin/CategoryTree";
import {
  buildCategoryParentOptions,
  getDescendantCount,
  getSubtreeIds,
  getSubtreeProductCount,
} from "@/lib/category-tree";
import { useSWRConfig } from "swr";

interface DraftCategory {
  id?: number;
  name: string;
  slug: string;
  parentId: number | null;
  description: string;
  image: string;
  sortOrder: number;
  showInHeader: boolean;
}

type ConfirmAction =
  | { kind: "delete-category"; cat: Category }
  | { kind: "delete-product"; product: AdminListProduct }
  | { kind: "archive-category"; cat: Category }
  | { kind: "archive-product"; product: AdminListProduct };

function blankDraft(parentId: number | null = null): DraftCategory {
  return { name: "", slug: "", parentId, description: "", image: "", sortOrder: 0, showInHeader: false };
}

const DELETE_PRODUCT_MESSAGE =
  "This product will be permanently deleted and cannot be recovered.";

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const { mutate } = useSWRConfig();
  const [draft, setDraft] = useState<DraftCategory | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: categoryProducts, isLoading: productsLoading } = useCategoryProducts(selectedId);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [busy, setBusy] = useState(false);

  const activeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.status !== "archived"),
    [categories],
  );

  const selected = useMemo(
    () => activeCategories.find((c) => c.id === selectedId) ?? null,
    [activeCategories, selectedId],
  );

  const productCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of activeCategories) {
      if (c.productCount != null) map.set(c.id, c.productCount);
    }
    return map;
  }, [activeCategories]);

  async function refreshAll() {
    await mutate(["admin/categories"]);
    await mutate(
      (key) => Array.isArray(key) && key[0] === "admin/products",
      undefined,
      { revalidate: true },
    );
  }

  const toggleCollapse = (id: number) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function clearSelectionIfAffected(categoryId: number) {
    if (selectedId != null && getSubtreeIds(activeCategories, categoryId).includes(selectedId)) {
      setSelectedId(null);
    }
  }

  function requestArchiveCategory(cat: Category) {
    setConfirm({ kind: "archive-category", cat });
  }

  function requestArchiveProduct(product: AdminListProduct) {
    setConfirm({ kind: "archive-product", product });
  }

  async function handleArchiveCategory(cat: Category) {
    try {
      await adminApi.archiveCategory(cat.id);
      toast.success(`“${cat.name}” archived`, {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                await adminApi.restoreCategory(cat.id);
                await refreshAll();
                toast.success("Category restored");
              } catch {
                toast.error("Restore failed");
              }
            })();
          },
        },
      });
      clearSelectionIfAffected(cat.id);
      await refreshAll();
    } catch {
      toast.error("Archive failed");
    }
  }

  async function handleArchiveProduct(product: AdminListProduct) {
    try {
      await adminApi.archiveProduct(product.id);
      toast.success(`“${product.name}” archived`, {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                await adminApi.restoreProduct(product.id);
                await refreshAll();
                toast.success("Product restored");
              } catch {
                toast.error("Restore failed");
              }
            })();
          },
        },
      });
      await refreshAll();
    } catch {
      toast.error("Archive failed");
    }
  }

  function requestDeleteCategory(cat: Category) {
    setConfirm({ kind: "delete-category", cat });
  }

  async function handleConfirmDelete() {
    if (!confirm) return;
    if (confirm.kind === "archive-category") {
      setBusy(true);
      try {
        await handleArchiveCategory(confirm.cat);
        setConfirm(null);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (confirm.kind === "archive-product") {
      setBusy(true);
      try {
        await handleArchiveProduct(confirm.product);
        setConfirm(null);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (confirm.kind === "delete-category") {
        await adminApi.deleteCategory(confirm.cat.id);
        toast.success("Category deleted");
        clearSelectionIfAffected(confirm.cat.id);
      } else {
        await adminApi.deleteProduct(confirm.product.id);
        toast.success("Product deleted");
      }
      setConfirm(null);
      await refreshAll();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        toast.error("Delete failed — category has dependencies.");
      } else {
        toast.error("Delete failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReorderSiblings(parentId: number | null, orderedIds: number[]) {
    try {
      await Promise.all(
        orderedIds.map((id, index) => adminApi.updateCategory(id, { sortOrder: index })),
      );
      await refreshAll();
    } catch {
      toast.error("Reorder failed");
    }
  }

  const deleteCategoryMessage = useMemo(() => {
    if (confirm?.kind !== "delete-category") return "";
    const cat = confirm.cat;
    const childCount = getDescendantCount(activeCategories, cat.id);
    const productCount = getSubtreeProductCount(activeCategories, cat.id, productCountMap);
    return `This category contains ${childCount} child categor${childCount === 1 ? "y" : "ies"} and ${productCount} product${productCount === 1 ? "" : "s"}. Deleting it will permanently delete all related categories and products. This action cannot be undone.`;
  }, [confirm, activeCategories, productCountMap]);

  const hasRoots = activeCategories.some((c) => c.parentId === null);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-text-primary">Categories</h1>
        <button onClick={() => setDraft(blankDraft())} className="btn btn-primary text-sm">
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <div>
          {isLoading ? (
            <p className="text-text-muted text-sm py-10 text-center">Loading…</p>
          ) : !hasRoots ? (
            <div className="flex flex-col items-center gap-2 py-16 text-text-muted">
              <FolderTree size={32} />
              <p className="text-sm">No categories yet.</p>
            </div>
          ) : (
            <CategoryTreePanel
              categories={activeCategories}
              productCountMap={productCountMap}
              collapsed={collapsed}
              selectedId={selectedId}
              onToggleCollapse={toggleCollapse}
              onSelect={setSelectedId}
              onAddChild={(parentId) => setDraft(blankDraft(parentId))}
              onEdit={(cat) =>
                setDraft({
                  id: cat.id,
                  name: cat.name,
                  slug: cat.slug,
                  parentId: cat.parentId,
                  description: cat.description,
                  image: cat.image ?? "",
                  sortOrder: cat.sortOrder,
                  showInHeader: cat.showInHeader,
                })
              }
              onArchive={requestArchiveCategory}
              onDelete={requestDeleteCategory}
              onReorderSiblings={handleReorderSiblings}
            />
          )}
        </div>

        <div className="mt-5 lg:mt-0 lg:sticky lg:top-20">
          <CategoryProductsPanel
            selected={selected}
            products={categoryProducts ?? []}
            productsLoading={productsLoading}
            onArchive={(product) => requestArchiveProduct(product)}
            onDelete={(product) => setConfirm({ kind: "delete-product", product })}
          />
        </div>
      </div>

      {draft && (
        <CategoryDrawer
          draft={draft}
          categories={activeCategories}
          onClose={() => setDraft(null)}
          onSaved={async () => {
            setDraft(null);
            await refreshAll();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.kind === "archive-category"
            ? "Archive category?"
            : confirm?.kind === "archive-product"
              ? "Archive product?"
              : confirm?.kind === "delete-product"
                ? "Delete product?"
                : "Delete category?"
        }
        message={
          confirm?.kind === "archive-category"
            ? `Archive “${confirm.cat.name}” and hide it from the storefront? You can restore it from the Archive page.`
            : confirm?.kind === "archive-product"
              ? `Archive “${confirm.product.name}”? It will be hidden from the storefront until restored.`
              : confirm?.kind === "delete-product"
                ? DELETE_PRODUCT_MESSAGE
                : deleteCategoryMessage
        }
        confirmLabel={confirm?.kind?.startsWith("archive") ? "Archive" : "Delete"}
        danger={confirm?.kind === "delete-category" || confirm?.kind === "delete-product"}
        loading={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function CategoryDrawer({
  draft,
  categories,
  onClose,
  onSaved,
}: {
  draft: DraftCategory;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const isEdit = draft.id != null;
  const parentOptions = useMemo(
    () => buildCategoryParentOptions(categories, draft.id),
    [categories, draft.id],
  );

  function set<K extends keyof DraftCategory>(key: K, val: DraftCategory[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const name = form.name.trim();
    const slug = slugify(form.slug.trim() || name);
    if (!slug) {
      toast.error("Name must contain at least one letter or number");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        slug,
        parentId: form.parentId,
        description: form.description,
        image: normalizeImageInput(form.image) ?? undefined,
        sortOrder: form.sortOrder,
        showInHeader: form.showInHeader,
      };
      if (isEdit) {
        await adminApi.updateCategory(draft.id!, payload);
        toast.success("Category updated");
      } else {
        await adminApi.createCategory(payload);
        toast.success("Category created");
      }
      onSaved();
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message || err.code
          : err instanceof Error
            ? err.message
            : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {isEdit ? "Edit Category" : "New Category"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-dim">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="input-label">Name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input" />
          </div>
          <div>
            <label className="input-label">Slug (optional)</label>
            <input
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              className="input"
              placeholder="auto-generated from name"
            />
          </div>
          <div>
            <label className="input-label">Parent</label>
            <select
              value={form.parentId ?? ""}
              onChange={(e) => set("parentId", e.target.value ? Number(e.target.value) : null)}
              className="input"
            >
              <option value="">— None (root) —</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="input min-h-20 resize-y"
            />
          </div>
          <div>
            <label className="input-label">Image URL (optional)</label>
            <input value={form.image} onChange={(e) => set("image", e.target.value)} className="input" />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-border-light p-3 cursor-pointer hover:bg-surface-dim">
            <input
              type="checkbox"
              checked={form.showInHeader}
              onChange={(e) => set("showInHeader", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-orange"
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">Show in header</span>
              <span className="block text-xs text-text-muted">
                Display this category in the customer top navigation (nested under its parent).
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn btn-ghost text-sm flex-1">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={cn("btn btn-primary text-sm flex-1", saving && "opacity-50")}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
