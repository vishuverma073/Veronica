import { eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { categories, products } from "../db/schema.js";

/** All category ids in the subtree rooted at `rootId` (inclusive). */
export async function getSubtreeIds(db: DbClient, rootId: number): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    WITH RECURSIVE category_tree AS (
      SELECT id FROM categories WHERE id = ${rootId}
      UNION ALL
      SELECT c.id FROM categories c
      INNER JOIN category_tree t ON c.parent_id = t.id
    )
    SELECT id FROM category_tree
  `);
  return (rows as unknown as { id: number }[]).map((r) => Number(r.id));
}

/** Archive a category/subcategory and every descendant category + product in its subtree. */
export async function archiveCategorySubtree(db: DbClient, rootId: number): Promise<number[]> {
  const ids = await getSubtreeIds(db, rootId);
  if (ids.length === 0) return ids;
  const now = new Date();
  await db
    .update(categories)
    .set({ status: "archived", updatedAt: now })
    .where(inArray(categories.id, ids));
  await db
    .update(products)
    .set({ status: "archived", updatedAt: now })
    .where(inArray(products.categoryId, ids));
  return ids;
}

/** Restore a category/subcategory and every descendant category + product in its subtree. */
export async function restoreCategorySubtree(db: DbClient, rootId: number): Promise<number[]> {
  const ids = await getSubtreeIds(db, rootId);
  if (ids.length === 0) return ids;
  const now = new Date();
  await db
    .update(categories)
    .set({ status: "active", updatedAt: now })
    .where(inArray(categories.id, ids));
  await db
    .update(products)
    .set({ status: "active", updatedAt: now })
    .where(inArray(products.categoryId, ids));
  return ids;
}

/** Permanently delete a category/subcategory, its descendants, and all products in the subtree. */
export async function deleteCategorySubtree(db: DbClient, rootId: number): Promise<number[]> {
  const rows = await db.execute<{ id: number; depth: number }>(sql`
    WITH RECURSIVE category_tree AS (
      SELECT id, 0 AS depth FROM categories WHERE id = ${rootId}
      UNION ALL
      SELECT c.id, t.depth + 1 FROM categories c
      INNER JOIN category_tree t ON c.parent_id = t.id
    )
    SELECT id, depth FROM category_tree ORDER BY depth DESC
  `);
  const ordered = (rows as unknown as { id: number; depth: number }[]).map((r) => Number(r.id));
  if (ordered.length === 0) return [];

  await db.delete(products).where(inArray(products.categoryId, ordered));
  for (const id of ordered) {
    await db.delete(categories).where(eq(categories.id, id));
  }
  return ordered;
}
