import { and, count, inArray, ne } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { products } from "../db/schema.js";
import { getSubtreeIds } from "./category-tree.js";

/** Non-archived products whose `category_id` is in `categoryIds`. */
export async function countProductsInCategories(db: DbClient, categoryIds: number[]): Promise<number> {
  if (categoryIds.length === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(products)
    .where(and(inArray(products.categoryId, categoryIds), ne(products.status, "archived")));
  return Number(row?.n ?? 0);
}

/** All non-archived products in a category subtree (root inclusive). */
export async function countProductsInSubtree(db: DbClient, rootCategoryId: number): Promise<number> {
  const ids = await getSubtreeIds(db, rootCategoryId);
  return countProductsInCategories(db, ids);
}

/** Category ids whose products should appear when browsing a category subtree. */
export async function getProductCategoryIdsForTree(
  db: DbClient,
  rootCategoryId: number,
): Promise<number[]> {
  return getSubtreeIds(db, rootCategoryId);
}

/** Build direct and subtree product counts for every category row (admin tree badges). */
export function buildCategoryProductCounts(
  categories: { id: number; parentId: number | null }[],
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
