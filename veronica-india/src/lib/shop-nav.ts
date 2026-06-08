import type { Category } from "@veronica/contracts";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/category-tree";

export type ShopNavNode = CategoryTreeNode;

/** Full active category tree for the Shop mega menu (no showInHeader filter). */
export function buildShopNavTree(categories: Category[]): ShopNavNode[] {
  return buildCategoryTree(categories);
}

/** Featured categories from home composer ids; falls back to first four roots. */
export function resolveFeaturedCategories(
  tree: ShopNavNode[],
  featuredIds: number[],
): ShopNavNode[] {
  if (tree.length === 0) return [];

  const byId = new Map<number, ShopNavNode>();
  function walk(nodes: ShopNavNode[]) {
    for (const node of nodes) {
      byId.set(node.id, node);
      walk(node.children);
    }
  }
  walk(tree);

  if (featuredIds.length > 0) {
    return featuredIds
      .map((id) => byId.get(id))
      .filter((n): n is ShopNavNode => n != null);
  }

  return tree.slice(0, 4);
}

/** Primary browse-all target — first root category or sitewide search. */
export function getShopBrowseHref(tree: ShopNavNode[]): string {
  return tree[0] ? `/category/${tree[0].slug}` : "/search";
}

/** Display count badge: product count when API provides it, else subcategory count. */
export function getCategoryCountLabel(node: ShopNavNode): string | null {
  if (node.productCount != null && node.productCount > 0) {
    return `${node.productCount}`;
  }
  if (node.children.length > 0) {
    return `${node.children.length}`;
  }
  return null;
}

export function isCategoryPathActive(pathname: string, slug: string): boolean {
  return pathname === `/category/${slug}` || pathname.startsWith(`/category/${slug}/`);
}
