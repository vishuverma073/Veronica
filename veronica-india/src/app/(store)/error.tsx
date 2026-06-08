"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6 text-danger">
        <AlertCircle size={34} strokeWidth={1.5} />
      </div>
      <h1 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h1>
      <p className="text-sm text-text-secondary mb-8">
        We hit an unexpected error loading this page. You can try again or head back home.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary inline-flex gap-2">
          <RefreshCw size={16} /> Try again
        </button>
        <Link href="/" className="btn btn-secondary inline-flex gap-2">
          <Home size={16} /> Back home
        </Link>
      </div>
    </div>
  );
}
