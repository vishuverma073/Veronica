"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, LayoutDashboard, RefreshCw } from "lucide-react";

export default function AdminError({
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
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4 text-danger">
        <AlertCircle size={28} strokeWidth={1.5} />
      </div>
      <h1 className="text-lg font-bold text-text-primary mb-2">Admin page error</h1>
      <p className="text-sm text-text-secondary mb-6">
        This screen failed to load. Your data is safe — try again or return to the dashboard.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary text-sm inline-flex gap-2">
          <RefreshCw size={15} /> Try again
        </button>
        <Link href="/admin" className="btn btn-secondary text-sm inline-flex gap-2">
          <LayoutDashboard size={15} /> Dashboard
        </Link>
      </div>
    </div>
  );
}
