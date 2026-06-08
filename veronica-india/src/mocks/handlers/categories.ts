import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import { categories } from "../data/categories";

/**
 * Category endpoints. Phase 0 ships only the list endpoint; later phases
 * add `/categories/:slug` (with breadcrumb + children) and admin CRUD.
 */
export const categoriesHandlers = [
  http.get(`${API_BASE}/categories/all`, () => {
    const active = categories.filter((c) => c.status !== "archived");
    return HttpResponse.json(active);
  }),

  http.get(`${API_BASE}/categories`, () => {
    // Compute roots live from the shared `categories` array (which the admin
    // mutates) so adding/renaming/removing a root category is reflected in the
    // storefront nav, rather than serving a snapshot frozen at module load.
    const roots = categories
      .filter((c) => c.parentId === null && c.status !== "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return HttpResponse.json(roots);
  }),
];
