"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function ApiErrorState({
  title = "Something went wrong",
  message = "We couldn't load this content. Please try again.",
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="empty-state py-12">
      <div className="empty-state-icon text-danger">
        <AlertCircle size={28} strokeWidth={1.5} />
      </div>
      <p className="text-text-secondary font-medium mb-1">{title}</p>
      <p className="text-sm text-text-muted mb-5 max-w-sm mx-auto">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary text-sm inline-flex gap-2">
          <RefreshCw size={15} /> {retryLabel}
        </button>
      )}
    </div>
  );
}
