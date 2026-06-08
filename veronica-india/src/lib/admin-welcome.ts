import type { AdminUser } from "@veronica/contracts";
import { mutate } from "swr";
import { adminApi } from "@/lib/admin-api";

const MIN_MS = 1500;
const TARGET_MS = 2500;

/** Safe admin post-login destination (prevents open redirects). */
export function safeAdminReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/admin")) return "/admin";
  if (raw.startsWith("/admin/login") || raw.startsWith("/admin/welcome")) return "/admin";
  return raw;
}

/** Display name for welcome copy — never exposes email domain in full. */
export function displayAdminName(admin: AdminUser | null | undefined): string {
  const name = admin?.name?.trim();
  if (name) return name;
  const local = admin?.email?.split("@")[0]?.trim();
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "Admin";
}

/** Prime SWR cache with dashboard list data before entering the shell. */
export async function prefetchAdminDashboard(): Promise<void> {
  const [products, categories] = await Promise.all([
    adminApi.listProducts(),
    adminApi.listCategories(),
  ]);
  await Promise.all([
    mutate(["admin/products", "", "", ""], products, { revalidate: false }),
    mutate(["admin/categories"], categories, { revalidate: false }),
  ]);
}

/**
 * Wait at least {@link MIN_MS}, aim for ~{@link TARGET_MS} when prefetch finishes
 * quickly, and never finish before prefetch completes.
 */
export async function runWelcomeTiming(prefetch: () => Promise<void>): Promise<void> {
  const started = Date.now();
  await Promise.all([prefetch(), new Promise<void>((r) => setTimeout(r, MIN_MS))]);
  const extra = Math.max(0, TARGET_MS - (Date.now() - started));
  if (extra > 0) {
    await new Promise<void>((r) => setTimeout(r, extra));
  }
}

export const ADMIN_WELCOME_DEFAULT_MESSAGES = [
  "Preparing your workspace…",
  "Loading dashboard…",
] as const;
