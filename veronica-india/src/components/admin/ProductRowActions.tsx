"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { adminApi } from "@/lib/admin-api";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { cn } from "@/lib/utils";

export type ProductRowActionTarget = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

const ARCHIVE_COPY = {
  title: "Archive Product?",
  message:
    "This product will be hidden from the storefront but can be restored later from Archive.",
  confirmLabel: "Archive",
} as const;

const DELETE_COPY = {
  title: "Delete Product Permanently?",
  message: "This action cannot be undone. The product will be permanently removed.",
  confirmLabel: "Delete",
} as const;

/** Revalidate every admin product list cache (dashboard, product grids, etc.). */
export async function refreshAdminProductCaches(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  await mutate(
    (key) => Array.isArray(key) && key[0] === "admin/products",
    undefined,
    { revalidate: true },
  );
}

function ActionIconButton({
  href,
  external,
  onClick,
  label,
  children,
  className,
}: {
  href?: string;
  external?: boolean;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = cn(
    "p-1.5 rounded-lg border border-border-light text-text-muted transition-colors inline-flex",
    className,
  );
  if (href && external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        title={label}
        aria-label={label}
      >
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} title={label} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} title={label} aria-label={label}>
      {children}
    </button>
  );
}

/**
 * Inline + overflow product actions shared across admin surfaces (dashboard rows, etc.).
 * Uses the same archive/delete APIs and ConfirmDialog as the rest of the panel.
 */
export default function ProductRowActions({
  product,
  onChanged,
}: {
  product: ProductRowActionTarget;
  onChanged?: () => void | Promise<void>;
}) {
  const { mutate } = useSWRConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const editHref = `/admin/products/${product.id}/edit`;
  const canView = Boolean(product.slug) && product.status !== "archived";
  const canArchive = product.status !== "archived";

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function afterMutation(successMessage: string) {
    await refreshAdminProductCaches(mutate);
    await onChanged?.();
    toast.success(successMessage);
    setConfirm(null);
    setMenuOpen(false);
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await adminApi.archiveProduct(product.id);
      await afterMutation(`“${product.name}” archived`);
    } catch {
      toast.error("Archive failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await adminApi.deleteProduct(product.id);
      await afterMutation(`“${product.name}” deleted`);
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function openConfirm(kind: "archive" | "delete") {
    setMenuOpen(false);
    setConfirm(kind);
  }

  const menuItems = (
    <>
      {canView && (
        <a
          href={`/product/${product.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-dim"
        >
          <ExternalLink size={15} /> View product
        </a>
      )}
      <Link
        href={editHref}
        onClick={() => setMenuOpen(false)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-dim"
      >
        <Pencil size={15} /> Edit
      </Link>
      {canArchive && (
        <button
          type="button"
          onClick={() => openConfirm("archive")}
          className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-dim w-full text-left"
        >
          <Archive size={15} /> Archive
        </button>
      )}
      <button
        type="button"
        onClick={() => openConfirm("delete")}
        className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-red-50 w-full text-left"
      >
        <Trash2 size={15} /> Delete
      </button>
    </>
  );

  return (
    <>
      {/* Desktop / tablet: icon row */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {canView && (
          <ActionIconButton
            href={`/product/${product.slug}`}
            external
            label="View product"
            className="hover:text-brand-orange hover:border-brand-orange/40"
          >
            <ExternalLink size={15} />
          </ActionIconButton>
        )}
        <ActionIconButton
          href={editHref}
          label="Edit product"
          className="hover:text-brand-orange hover:border-brand-orange/40"
        >
          <Pencil size={15} />
        </ActionIconButton>
        {canArchive && (
          <ActionIconButton
            onClick={() => setConfirm("archive")}
            label="Archive product"
            className="hover:text-brand-orange hover:border-brand-orange/40"
          >
            <Archive size={15} />
          </ActionIconButton>
        )}
        <ActionIconButton
          onClick={() => setConfirm("delete")}
          label="Delete product"
          className="hover:text-danger hover:border-danger/40 hover:bg-red-50"
        >
          <Trash2 size={15} />
        </ActionIconButton>
      </div>

      {/* Mobile: overflow menu */}
      <div className="relative sm:hidden shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1.5 rounded-lg border border-border-light text-text-muted hover:text-brand-orange hover:border-brand-orange/40"
          aria-label="Product actions"
          aria-expanded={menuOpen}
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-border-light shadow-lg py-1 z-20">
            {menuItems}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "archive"}
        title={ARCHIVE_COPY.title}
        message={ARCHIVE_COPY.message}
        confirmLabel={ARCHIVE_COPY.confirmLabel}
        loading={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() => void handleArchive()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={DELETE_COPY.title}
        message={DELETE_COPY.message}
        confirmLabel={DELETE_COPY.confirmLabel}
        danger
        loading={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
