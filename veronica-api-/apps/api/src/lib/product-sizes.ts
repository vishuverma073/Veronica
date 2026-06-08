/** Variant dimension names treated as the storefront "Size" filter axis. */
export const SIZE_DIMENSION_RE = /^(overall\s*)?size$/i;

type SkuLike = { dimensionValues?: Record<string, string> | null };
type DimensionLike = {
  name: string;
  values: { value: string; sortOrder: number }[];
};

/** Unique size values from SKUs (e.g. Overall Size → 18×16), ordered when possible. */
export function extractProductSizes(skus: SkuLike[], dimensions: DimensionLike[] = []): string[] {
  const sizeDimNames = new Set(
    dimensions.filter((d) => SIZE_DIMENSION_RE.test(d.name.trim())).map((d) => d.name),
  );

  const values = new Set<string>();
  for (const sku of skus) {
    for (const [key, raw] of Object.entries(sku.dimensionValues ?? {})) {
      const value = raw?.trim();
      if (!value) continue;
      const matches =
        sizeDimNames.size > 0 ? sizeDimNames.has(key) : SIZE_DIMENSION_RE.test(key.trim());
      if (matches) values.add(value);
    }
  }

  if (values.size === 0) return [];

  const order = new Map<string, number>();
  for (const dim of dimensions) {
    if (!SIZE_DIMENSION_RE.test(dim.name.trim())) continue;
    for (const v of dim.values) order.set(v.value, v.sortOrder);
  }

  return [...values].sort((a, b) => {
    const oa = order.get(a);
    const ob = order.get(b);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
