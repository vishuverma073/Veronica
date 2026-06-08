/**
 * Audit category ↔ product relationships in the database.
 * Run: pnpm exec tsx --env-file=.env scripts/audit-category-products.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const categories = await sql<{
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  direct_count: number;
  subtree_count: number;
}>`
  WITH RECURSIVE category_tree AS (
    SELECT id, id AS root_id FROM categories
    UNION ALL
    SELECT c.id, t.root_id
    FROM categories c
    INNER JOIN category_tree t ON c.parent_id = t.id
  ),
  direct AS (
    SELECT category_id, count(*)::int AS n
    FROM products
    WHERE status != 'archived'
    GROUP BY category_id
  ),
  subtree AS (
    SELECT t.root_id, count(p.id)::int AS n
    FROM category_tree t
    LEFT JOIN products p ON p.category_id = t.id AND p.status != 'archived'
    GROUP BY t.root_id
  )
  SELECT c.id, c.name, c.slug, c.parent_id,
    coalesce(d.n, 0) AS direct_count,
    coalesce(s.n, 0) AS subtree_count
  FROM categories c
  LEFT JOIN direct d ON d.category_id = c.id
  LEFT JOIN subtree s ON s.root_id = c.id
  ORDER BY c.sort_order, c.id
`;

console.log("Category Product Audit");
console.log("=".repeat(72));
for (const c of categories) {
  if (c.direct_count === 0 && c.subtree_count === 0) continue;
  console.log(
    `${c.name} (id=${c.id}, slug=${c.slug}) · direct=${c.direct_count} · subtree=${c.subtree_count}`,
  );
}

await sql.end();
