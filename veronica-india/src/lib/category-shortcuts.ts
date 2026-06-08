import { backend } from "@/lib/backend";
import { getShopBrowseHref } from "@/lib/shop-nav";

export type CategoryShortcut = { slug: string; name: string };

/**
 * Root categories for shortcuts (404, search idle, browse-all links).
 * Uses full shop nav tree when available.
 */
export async function getCategoryShortcuts(limit = 4): Promise<CategoryShortcut[]> {
  const shopNav = await backend.getShopNav().catch(() => null);
  if (shopNav && shopNav.tree.length > 0) {
    return shopNav.tree.slice(0, limit).map((c) => ({ slug: c.slug, name: c.name }));
  }

  const all = await backend.getCategories().catch(() => []);
  return all
    .filter((c) => c.parentId == null)
    .slice(0, limit)
    .map((c) => ({ slug: c.slug, name: c.name }));
}

/** Primary browse-all target — first root category or sitewide search. */
export async function getBrowseAllHref(): Promise<string> {
  const shopNav = await backend.getShopNav().catch(() => null);
  if (shopNav) return getShopBrowseHref(shopNav.tree);
  const shortcuts = await getCategoryShortcuts(1);
  return shortcuts[0] ? `/category/${shortcuts[0].slug}` : "/search";
}
