"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { LogOut, Store } from "lucide-react";
import { useAdminAuthStore } from "@/store/adminAuthStore";
import ThemeToggle from "@/components/store/ThemeToggle";

/**
 * Admin top bar. On mobile the avatar opens a menu with logout (sidebar logout
 * is desktop-only). Brand logo shows here only on mobile.
 */
export default function TopBar({ onLogout }: { onLogout: () => void }) {
  const admin = useAdminAuthStore((s) => s.admin);
  const initial = (admin?.name ?? "A").charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="bg-white border-b border-border h-14 px-4 lg:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30">
      <Link href="/admin" className="lg:hidden flex items-center">
        <Image src="/uploads/logo/logo.webp" alt="Veronica" width={30} height={30} className="rounded-lg" />
      </Link>
      <span className="hidden lg:block" aria-hidden />

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-full bg-brand-orange text-white flex items-center justify-center text-sm font-bold lg:cursor-default"
            aria-label="Admin menu"
            aria-expanded={menuOpen}
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-border-light shadow-lg py-1 z-50 lg:hidden">
              {admin?.email && (
                <p className="px-3 py-2 text-[11px] text-text-muted truncate border-b border-border-light">
                  {admin.email}
                </p>
              )}
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-dim"
              >
                <Store size={16} /> View store
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-red-50 w-full text-left"
              >
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
