import type { Category } from "@veronica/contracts";
import { compareHeaderCategories } from "@/lib/navbar-categories";

export type CategoryTreeNode = Category & { children: CategoryTreeNode[] };

/** Sort siblings by admin sortOrder, then name. */
export function compareCategorySiblings(a: Category, b: Category): number {
  return compareHeaderCategories(a, b);
}

/** Build a forest of root nodes from a flat category list. */
export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const active = categories.filter((c) => c.status !== "archived");
  const byParent = new Map<number | null, Category[]>();
  for (const cat of active) {
    const key = cat.parentId;
    const list = byParent.get(key) ?? [];
    list.push(cat);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort(compareCategorySiblings);
  }

  function attach(parentId: number | null): CategoryTreeNode[] {
    return (byParent.get(parentId) ?? []).map((cat) => ({
      ...cat,
      children: attach(cat.id),
    }));
  }

  return attach(null);
}

/** Flatten tree pre-order with depth for indented selects. */
export function flattenCategoryTree(
  tree: CategoryTreeNode[],
  depth = 0,
): { category: Category; depth: number }[] {
  const out: { category: Category; depth: number }[] = [];
  for (const node of tree) {
    out.push({ category: node, depth });
    out.push(...flattenCategoryTree(node.children, depth + 1));
  }
  return out;
}

/** Options for parent `<select>` — excludes self and descendants when editing. */
export function buildCategoryParentOptions(
  categories: Category[],
  excludeId?: number,
): { id: number; label: string; depth: number }[] {
  const exclude = new Set<number>();
  if (excludeId != null) {
    for (const id of getSubtreeIds(categories, excludeId)) exclude.add(id);
  }
  const tree = buildCategoryTree(categories);
  return flattenCategoryTree(tree)
    .filter(({ category }) => !exclude.has(category.id))
    .map(({ category, depth }) => ({
      id: category.id,
      depth,
      label: `${depth > 0 ? "— ".repeat(depth) : ""}${category.name}`,
    }));
}

export function getChildren(categories: Category[], parentId: number | null): Category[] {
  return categories
    .filter((c) => c.parentId === parentId && c.status !== "archived")
    .sort(compareCategorySiblings);
}

/** All category ids in the subtree rooted at `rootId` (inclusive). */
export function getSubtreeIds(categories: Category[], rootId: number): number[] {
  const ids = [rootId];
  for (const child of getChildren(categories, rootId)) {
    ids.push(...getSubtreeIds(categories, child.id));
  }
  return ids;
}

export function getDescendantCount(categories: Category[], rootId: number): number {
  return getSubtreeIds(categories, rootId).length - 1;
}

export function getSubtreeCategoryNames(categories: Category[], rootId: number): string[] {
  return getSubtreeIds(categories, rootId)
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
}

/** Products whose categoryId falls in the selected category subtree. */
export function filterProductsForCategorySubtree<T extends { categoryId: number }>(
  products: T[],
  categories: Category[],
  rootId: number,
): T[] {
  const ids = new Set(getSubtreeIds(categories, rootId));
  return products.filter((p) => ids.has(p.categoryId));
}

export function getSubtreeProductCount(
  categories: Category[],
  rootId: number,
  productCountByCategoryId: Map<number, number>,
): number {
  const fromNode = categories.find((c) => c.id === rootId)?.subtreeProductCount;
  if (fromNode != null) return fromNode;
  return getSubtreeIds(categories, rootId).reduce(
    (sum, id) => sum + (productCountByCategoryId.get(id) ?? categories.find((c) => c.id === id)?.productCount ?? 0),
    0,
  );
}

/** Direct + subtree product counts for admin category list (mirrors API). */
export function buildCategoryProductCounts(
  categories: Category[],
  directByCategoryId: Map<number, number>,
): { direct: Map<number, number>; subtree: Map<number, number> } {
  const childrenByParent = new Map<number | null, number[]>();
  for (const cat of categories) {
    const list = childrenByParent.get(cat.parentId) ?? [];
    list.push(cat.id);
    childrenByParent.set(cat.parentId, list);
  }

  const subtree = new Map<number, number>();
  function walk(id: number): number {
    const cached = subtree.get(id);
    if (cached != null) return cached;
    let total = directByCategoryId.get(id) ?? 0;
    for (const childId of childrenByParent.get(id) ?? []) {
      total += walk(childId);
    }
    subtree.set(id, total);
    return total;
  }
  for (const cat of categories) walk(cat.id);
  return { direct: directByCategoryId, subtree };
}

export function isDescendantOf(
  categories: Category[],
  candidateId: number,
  ancestorId: number,
): boolean {
  return getSubtreeIds(categories, ancestorId).includes(candidateId);
}

/** Build header nav tree: roots from showcase, children filtered by showInHeader recursively. */
export function buildHeaderNavTree(
  allCategories: Category[],
  rootIds: number[],
): CategoryTreeNode[] {
  const byId = new Map(allCategories.map((c) => [c.id, c]));

  function nodeFor(id: number): CategoryTreeNode | null {
    const cat = byId.get(id);
    if (!cat || cat.status === "archived") return null;
    const children = getChildren(allCategories, id)
      .filter((c) => c.showInHeader)
      .map((c) => nodeFor(c.id))
      .filter((n): n is CategoryTreeNode => n != null);
    return { ...cat, children };
  }

  if (rootIds.length > 0) {
    return rootIds.map((id) => nodeFor(id)).filter((n): n is CategoryTreeNode => n != null);
  }

  return getChildren(allCategories, null)
    .filter((c) => c.showInHeader)
    .map((c) => nodeFor(c.id))
    .filter((n): n is CategoryTreeNode => n != null);
}

/** Indented options for product category `<select>` fields. */
export function buildProductCategoryOptions(
  categories: Category[],
): { id: number; name: string; label: string }[] {
  return flattenCategoryTree(buildCategoryTree(categories)).map(({ category, depth }) => ({
    id: category.id,
    name: category.name,
    label: `${depth > 0 ? "— ".repeat(depth) : ""}${category.name}`,
  }));
}

/** Collect every active category slug (for sitemap). */
export function collectActiveCategorySlugs(categories: Category[]): string[] {
  return categories.filter((c) => c.status !== "archived").map((c) => c.slug);
}
