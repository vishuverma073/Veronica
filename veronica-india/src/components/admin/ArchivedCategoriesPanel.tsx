"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, FolderTree } from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@veronica/contracts";
import { useCategories } from "@/lib/admin-hooks";
import { adminApi } from "@/lib/admin-api";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useSWRConfig } from "swr";

export default function ArchivedCategoriesPanel() {
  const { data: categories, isLoading } = useCategories();
  const { mutate } = useSWRConfig();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);

  const archived = useMemo(
    () => (categories ?? []).filter((c) => c.status === "archived").sort(byName),
    [categories],
  );

  const parentName = (cat: Category) => {
    if (!cat.parentId) return null;
    return (categories ?? []).find((c) => c.id === cat.parentId)?.name ?? null;
  };

  async function refresh() {
    await mutate(["admin/categories"]);
    await mutate(
      (key) => Array.isArray(key) && key[0] === "admin/products",
      undefined,
      { revalidate: true },
    );
  }

  async function handleRestore(id: number) {
    setPendingId(id);
    try {
      await adminApi.restoreCategory(id);
      toast.success("Category restored");
      setConfirm(null);
      await refresh();
    } catch {
      toast.error("Restore failed");
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-text-muted py-4">Loading archived categories…</p>;
  }

  if (archived.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted mb-3">
          Archived categories
        </h2>
        <div className="rounded-xl border border-dashed border-border-light bg-surface-dim/30 py-10 text-center text-text-muted text-sm">
          No archived categories.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted mb-3">
        Archived categories
      </h2>
      <div className="rounded-xl border border-border-light bg-white shadow-sm divide-y divide-border-light">
        {archived.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
            <FolderTree size={18} className="text-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{cat.name}</p>
              <p className="text-[11px] text-text-muted truncate">
                /{cat.slug}
                {parentName(cat) ? ` · sub of ${parentName(cat)}` : " · root category"}
              </p>
            </div>
            <button
              type="button"
              title="Restore Category"
              onClick={() => setConfirm({ id: cat.id, name: cat.name })}
              disabled={pendingId === cat.id}
              className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim"
            >
              <ArchiveRestore size={16} />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirm != null}
        title="Restore category?"
        message={
          confirm
            ? `Restore "${confirm.name}" and all subcategories and products archived with it? They will reappear on the storefront.`
            : ""
        }
        confirmLabel="Restore"
        loading={pendingId != null}
        onCancel={() => !pendingId && setConfirm(null)}
        onConfirm={() => confirm && handleRestore(confirm.id)}
      />
    </section>
  );
}

function byName(a: Category, b: Category) {
  return a.name.localeCompare(b.name);
}
