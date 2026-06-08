const STORAGE_KEY = "veronica:last-category";

export type LastVisitedCategory = { slug: string; name: string; visitedAt: number };

export function getLastVisitedCategory(): LastVisitedCategory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastVisitedCategory;
    if (typeof parsed.slug === "string" && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveLastVisitedCategory(slug: string, name: string): void {
  if (typeof window === "undefined") return;
  try {
    const entry: LastVisitedCategory = { slug, name, visitedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore quota / private mode errors.
  }
}
