import {
  LayoutDashboard,
  Package,
  FolderTree,
  LayoutTemplate,
  Settings,
  ShoppingCart,
  Archive,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the mobile bottom nav (space-limited). */
  mobile: boolean;
}

/** Single source of truth for admin navigation (sidebar + bottom nav). */
export const adminNav: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/admin/products", label: "Products", icon: Package, mobile: true },
  { href: "/admin/products/archived", label: "Archive", icon: Archive, mobile: true },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, mobile: true },
  // Home composer — drives the storefront homepage (order, enabled sections,
  // hero/promo content, featured products, category showcase).
  { href: "/admin/home", label: "Home", icon: LayoutTemplate, mobile: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, mobile: true },
  { href: "/admin/audit", label: "Audit", icon: ScrollText, mobile: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, mobile: true },
];

/**
 * Active when the path matches exactly, or is a sub-route of a non-root item
 * (so /admin/products/3/edit highlights "Products" but everything doesn't
 * highlight "Dashboard").
 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/products/archived") {
    return pathname === "/admin/products/archived";
  }
  if (href === "/admin/products") {
    return (
      pathname === "/admin/products" ||
      (pathname.startsWith("/admin/products/") && !pathname.startsWith("/admin/products/archived"))
    );
  }
  if (href === "/admin/audit") {
    return pathname === "/admin/audit" || pathname.startsWith("/admin/audit/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
