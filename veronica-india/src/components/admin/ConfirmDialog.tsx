"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={loading ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-2xl border border-border-light bg-white shadow-xl p-5"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-text-primary mb-2">
          {title}
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn btn-ghost text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "btn text-sm min-w-[6rem]",
              danger ? "bg-danger text-white hover:bg-danger/90" : "btn-primary",
              loading && "opacity-60",
            )}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Working…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
