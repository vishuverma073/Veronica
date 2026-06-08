import type { Category } from "@veronica/contracts";

/** Sort header nav items by admin sort order, then name. */
export function compareHeaderCategories(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Root categories for the store header. When the home composer picks categories
 * for the showcase, that same list (in the same order) drives the header.
 * With no picks, fall back to legacy per-category `showInHeader` flags.
 */
export function resolveNavbarRoots(allRoots: Category[], showcaseIds: number[]): Category[] {
  if (showcaseIds.length > 0) {
    const byId = new Map(allRoots.map((r) => [r.id, r]));
    return showcaseIds
      .map((id) => byId.get(id))
      .filter((c): c is Category => c != null && c.parentId === null);
  }
  return [...allRoots].filter((c) => c.showInHeader).sort(compareHeaderCategories);
}

/** Subcategories eligible for a header dropdown. */
export function headerDropdownChildren(children: Category[]): Category[] {
  return children.filter((c) => c.showInHeader).sort(compareHeaderCategories);
}
