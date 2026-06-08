"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import AdminAuthProvider from "@/components/admin/AdminAuthProvider";
import AdminShell from "@/components/admin/AdminShell";

/**
 * Admin root layout. The legacy `admin-session` cookie gate is gone — auth now
 * lives in {@link useAdminAuthStore} (sessionStorage bearer token), enforced by
 * {@link AdminShell}. The /admin/login route renders bare (no chrome); every
 * other admin route is wrapped in the authenticated shell.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBareRoute =
    pathname === "/admin/login" || pathname === "/admin/welcome";

  return (
    <AdminAuthProvider>
      {isBareRoute ? children : <AdminShell>{children}</AdminShell>}
      <Toaster position="top-center" richColors closeButton />
    </AdminAuthProvider>
  );
}
