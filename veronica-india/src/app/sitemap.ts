import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { backend } from "@/lib/backend";
import type { ProductListItem } from "@veronica/contracts";
import { collectActiveCategorySlugs } from "@/lib/category-tree";

/**
 * Sitemap = static pages + every category (roots + children) + every active
 * product. The backend fetches are wrapped in try/catch: during a mock-mode
 * build the API isn't reachable in build workers, so we degrade to the static
 * pages rather than failing the build. With the real API (or `next dev`) the
 * full sitemap is produced.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/search`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/shipping`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = [];
  const productEntries: MetadataRoute.Sitemap = [];

  try {
    const allCategories = await backend.getAllCategories();
    for (const slug of collectActiveCategorySlugs(allCategories)) {
      categoryEntries.push({
        url: `${SITE_URL}/category/${slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
      });
    }

    // Products: page through the list, active only.
    const seen = new Set<number>();
    let cursor: number | undefined = undefined;
    for (let guard = 0; guard < 50; guard++) {
      const page = await backend.listProducts({ limit: 100, cursor });
      for (const p of page.items as ProductListItem[]) {
        if (p.status === "active" && !seen.has(p.id)) {
          seen.add(p.id);
          productEntries.push({
            url: `${SITE_URL}/product/${p.slug}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
  } catch {
    // API unreachable (mock-mode build) — ship the static pages only.
  }

  return [...staticPages, ...categoryEntries, ...productEntries];
}
