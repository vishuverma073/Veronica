"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useId, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingBag, Menu, X, User, LogOut, ChevronDown, Shield } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { backend } from "@/lib/backend";
import { useShopNav } from "@/lib/use-shop-nav";
import ThemeToggle from "./ThemeToggle";
import AnnouncementBar from "./AnnouncementBar";
import ShopMegaMenu from "./nav/ShopMegaMenu";
import MobileShopNav from "./nav/MobileShopNav";

const STATIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export default function StoreHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const shopMenuId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  const cartItems = useCartStore((state) => state.items);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const displayCount = isMounted ? cartCount : 0;

  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);

  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUIStore();
  const { tree, isLoading, isError, isEmpty, fetchWarning, refresh } = useShopNav();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setShopOpen(false);
    closeMobileMenu();
  }, [pathname, closeMobileMenu]);

  useEffect(() => {
    if (!shopOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShopOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shopOpen]);

  async function handleLogout() {
    setAccountOpen(false);
    await backend.logout();
    useCartStore.getState().clearCart();
    router.push("/");
  }

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname],
  );

  const shopActive = pathname.startsWith("/category/");
  const closeShop = () => setShopOpen(false);
  const closeAllMenus = () => {
    setShopOpen(false);
    closeMobileMenu();
  };

  return (
    <>
      <AnnouncementBar />

      <header className="site-header sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-400 mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/uploads/logo/logo.webp"
              alt="Veronica"
              width={36}
              height={36}
              className="rounded-lg transition-transform duration-300 group-hover:scale-105"
            />
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight text-brand-black leading-none">VERONICA</span>
              <span className="text-[9px] font-medium tracking-[0.2em] text-text-muted uppercase leading-none mt-0.5">
                Premium Sanitary
              </span>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            <Link
              href="/"
              className={`relative px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 rounded-lg ${
                isActive("/")
                  ? "text-brand-orange font-bold"
                  : "text-text-secondary hover:text-brand-black hover:bg-surface-dim/60"
              }`}
            >
              Home
              {isActive("/") && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-orange rounded-full" />
              )}
            </Link>

            <div
              className="relative"
              onMouseEnter={() => setShopOpen(true)}
              onMouseLeave={() => setShopOpen(false)}
              onFocus={() => setShopOpen(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setShopOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={shopOpen}
                aria-controls={shopMenuId}
                onClick={() => setShopOpen((v) => !v)}
                className={`relative flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 rounded-lg ${
                  shopActive
                    ? "text-brand-orange font-bold"
                    : "text-text-secondary hover:text-brand-black hover:bg-surface-dim/60"
                }`}
              >
                Shop
                <ChevronDown
                  size={13}
                  className={`text-text-muted transition-transform duration-200 ${shopOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
                {shopActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-orange rounded-full" />
                )}
              </button>

              <ShopMegaMenu
                open={shopOpen}
                tree={tree}
                isLoading={isLoading}
                isError={isError}
                isEmpty={isEmpty}
                fetchWarning={fetchWarning}
                onRetry={() => void refresh()}
                pathname={pathname}
                onNavigate={closeShop}
                menuId={shopMenuId}
              />
            </div>

            {STATIC_NAV.slice(1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 rounded-lg ${
                  isActive(link.href)
                    ? "text-brand-orange font-bold"
                    : "text-text-secondary hover:text-brand-black hover:bg-surface-dim/60"
                }`}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-orange rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {isMounted && authStatus === "authenticated" && authUser?.isAdmin && (
              <Link
                href="/admin/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-brand-orange font-semibold text-sm hover:bg-brand-orange/10 transition-all duration-200"
                aria-label="Admin panel"
              >
                <Shield size={18} strokeWidth={2} /> <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            <Link
              href="/search"
              className="p-2.5 rounded-xl text-text-secondary hover:text-brand-black hover:bg-surface-dim transition-all duration-200"
              aria-label="Search"
            >
              <Search size={20} strokeWidth={2} />
            </Link>

            {!isMounted || authStatus === "idle" || authStatus === "authenticating" ? (
              <div className="w-9 h-9 rounded-xl bg-surface-dim animate-pulse" aria-hidden />
            ) : authStatus === "authenticated" ? (
              <div className="relative">
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  className="flex items-center gap-1 p-2.5 rounded-xl text-text-secondary hover:text-brand-black hover:bg-surface-dim transition-all duration-200"
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                >
                  <User size={20} strokeWidth={2} />
                  <span className="hidden sm:inline text-sm font-medium max-w-[90px] truncate">
                    {authUser?.name?.trim() || "Account"}
                  </span>
                  <ChevronDown size={14} className={accountOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
                {accountOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} aria-hidden />
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl border border-border-light shadow-lg py-1 z-50">
                      <Link href="/account" onClick={() => setAccountOpen(false)} className="block px-4 py-2.5 text-sm text-text-primary hover:bg-surface-dim">
                        Account
                      </Link>
                      <Link href="/orders" onClick={() => setAccountOpen(false)} className="block px-4 py-2.5 text-sm text-text-primary hover:bg-surface-dim">
                        My Orders
                      </Link>
                      <button onClick={handleLogout} className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-red-50">
                        <LogOut size={14} /> Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="p-2.5 rounded-xl text-text-secondary hover:text-brand-black hover:bg-surface-dim transition-all duration-200 flex items-center gap-1"
                aria-label="Sign in"
              >
                <User size={20} strokeWidth={2} />
                <span className="hidden sm:inline text-sm font-medium">Sign In</span>
              </Link>
            )}

            <Link
              href="/cart"
              className="p-2.5 rounded-xl text-text-secondary hover:text-brand-black hover:bg-surface-dim transition-all duration-200 relative"
              aria-label="Cart"
            >
              <ShoppingBag size={20} strokeWidth={2} />
              {displayCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-orange text-white text-[10px] font-bold leading-none px-1 shadow-sm animate-scale-in">
                  {displayCount > 99 ? "99+" : displayCount}
                </span>
              )}
            </Link>

            <ThemeToggle />

            <button
              className="md:hidden p-2.5 rounded-xl text-text-secondary hover:text-brand-black hover:bg-surface-dim transition-all duration-200"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            </button>
          </div>
        </div>

        <div
          className={`md:hidden border-t border-border/50 bg-white/95 backdrop-blur-xl overflow-y-auto transition-all duration-300 ease-out ${
            isMobileMenuOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <MobileShopNav
            open={isMobileMenuOpen}
            tree={tree}
            isLoading={isLoading}
            isError={isError}
            isEmpty={isEmpty}
            fetchWarning={fetchWarning}
            onRetry={() => void refresh()}
            pathname={pathname}
            onNavigate={closeAllMenus}
            staticLinks={[...STATIC_NAV]}
            isActive={isActive}
          />
        </div>
      </header>
    </>
  );
}
