import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import type { Category } from "@veronica/contracts";
import { categories } from "../data/categories";
import { home } from "../data/home";
import { products, toListItem } from "../data/products";

/**
 * Public storefront read endpoints (consumed by the `backend` client in Server
 * Components, and search on the client). They serve the SAME in-memory
 * `products`/`categories` arrays the admin handlers mutate — so an admin edit is
 * reflected on the storefront within the mock session.
 */

const byId = (id: number) => categories.find((c) => c.id === id);
const childrenOf = (id: number) =>
  categories
    .filter((c) => c.parentId === id && c.status !== "archived")
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** Ancestors root→parent (exclusive of self). */
function ancestors(categoryId: number): Category[] {
  const out: Category[] = [];
  let current = byId(categoryId);
  while (current && current.parentId !== null) {
    const parent = byId(current.parentId);
    if (parent) out.unshift(parent);
    current = parent;
  }
  return out;
}

/** All category ids in the subtree rooted at categoryId (inclusive). */
function treeIds(categoryId: number): number[] {
  const cat = byId(categoryId);
  if (!cat || cat.status === "archived") return [];
  const ids = [categoryId];
  for (const child of childrenOf(categoryId)) ids.push(...treeIds(child.id));
  return ids;
}

export const storefrontHandlers = [
  http.get(`${API_BASE}/home`, () => HttpResponse.json(home)),

  // ── Category detail by id (PDP breadcrumb/related) ──
  // Registered before /categories/:slug so "by-id" isn't swallowed as a slug.
  http.get(`${API_BASE}/categories/by-id/:id`, ({ params }) => {
    const cat = byId(Number(params.id));
    if (!cat || cat.status === "archived") return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
      ...cat,
      children: childrenOf(cat.id),
      breadcrumb: [...ancestors(cat.id), cat],
    });
  }),

  // ── Category detail (children + breadcrumb) ──
  http.get(`${API_BASE}/categories/:slug`, ({ params }) => {
    const cat = categories.find((c) => c.slug === params.slug);
    if (!cat || cat.status === "archived") return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
      ...cat,
      children: childrenOf(cat.id),
      breadcrumb: [...ancestors(cat.id), cat],
    });
  }),

  // ── Product list (cursor-paginated, light items) ──
  http.get(`${API_BASE}/products/by-category/:slug`, ({ params, request }) => {
    const cat = categories.find((c) => c.slug === params.slug);
    if (!cat || cat.status === "archived") {
      return HttpResponse.json({ items: [], nextCursor: null, total: 0 });
    }
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 24), 50);
    const cursor = url.searchParams.get("cursor");
    const cursorId = cursor ? Number(cursor) : null;

    const ids = treeIds(cat.id);
    let list = products
      .filter((x) => x.status === "active" && ids.includes(x.categoryId))
      .sort((a, b) => a.id - b.id);
    const total = list.length;
    if (cursorId != null && !Number.isNaN(cursorId)) {
      list = list.filter((x) => x.id > cursorId);
    }
    const page = list.slice(0, limit);
    const hasMore = list.length > limit;
    const nextCursor = hasMore && page.length ? page[page.length - 1]!.id : null;
    return HttpResponse.json({
      items: page.map(toListItem),
      nextCursor,
      total: cursorId == null ? total : undefined,
    });
  }),

  http.get(`${API_BASE}/products`, ({ request }) => {
    const url = new URL(request.url);
    const p = url.searchParams;

    let list = products.filter((x) => x.status === "active");

    const categorySlug = p.get("category");
    if (categorySlug) {
      const cat = categories.find((c) => c.slug === categorySlug);
      if (!cat || cat.status === "archived") {
        return HttpResponse.json({ items: [], nextCursor: null });
      }
      const ids = treeIds(cat.id);
      list = list.filter((x) => ids.includes(x.categoryId));
    }
    if (p.get("bestseller") === "1") list = list.filter((x) => x.isBestseller);
    if (p.get("new") === "1") list = list.filter((x) => x.isNew);
    if (p.get("featured") === "1") list = list.filter((x) => x.isFeatured);

    const q = (p.get("q") ?? "").toLowerCase().trim();
    if (q) {
      list = list.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          x.tags.some((t) => t.toLowerCase().includes(q)) ||
          x.description.toLowerCase().includes(q),
      );
    }

    list = list.sort((a, b) => a.id - b.id);

    const cursor = Number(p.get("cursor") ?? 0);
    if (cursor) list = list.filter((x) => x.id > cursor);

    const limit = Math.min(Number(p.get("limit") ?? 24) || 24, 100);
    const page = list.slice(0, limit);
    const nextCursor = list.length > limit ? page[page.length - 1].id : null;

    return HttpResponse.json({ items: page.map(toListItem), nextCursor });
  }),

  // ── Product detail (full) ──
  http.get(`${API_BASE}/products/:slug`, ({ params }) => {
    const product = products.find((x) => x.slug === params.slug && x.status === "active");
    if (!product) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json(product);
  }),
];
