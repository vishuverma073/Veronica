"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { adminNav, isNavActive } from "./nav-items";

/**
 * Mobile bottom tab bar (hidden ≥ lg). Each tab is a ≥44px touch target with
 * an orange active state; respects the iOS safe-area inset.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const items = adminNav.filter((i) => i.mobile);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-brand-black border-t border-white/10 flex overflow-x-auto"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-none min-w-[4.25rem] flex flex-col items-center justify-center gap-1 px-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
              active ? "text-brand-orange" : "text-white/50",
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
