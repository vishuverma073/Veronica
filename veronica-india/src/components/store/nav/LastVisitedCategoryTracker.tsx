"use client";

import { useEffect } from "react";
import { saveLastVisitedCategory } from "@/lib/last-visited-category";

/** Persists the current category for quick access in the Shop menu. */
export default function LastVisitedCategoryTracker({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  useEffect(() => {
    saveLastVisitedCategory(slug, name);
  }, [slug, name]);

  return null;
}
