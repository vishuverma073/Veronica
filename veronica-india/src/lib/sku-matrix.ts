import type { VariantDimension, ProductSKU } from "@veronica/contracts";

/** Admin editor SKU row — price is null until entered (0 is valid once set). */
export type EditableSku = Omit<ProductSKU, "price"> & { price: number | null };

/**
 * Pure helpers backing the admin {@link VariantsEditor}: build the cartesian
 * SKU matrix from variant dimensions and re-sync it on change while preserving
 * already-entered prices/codes for combinations that still exist.
 */

let counter = 1_000_000;
/** Client-side temporary numeric id (unique within an editing session). */
export function tempId(): number {
  return ++counter;
}

/** All value-combinations across the dimensions (e.g. Size × Weight). */
export function cartesian(dimensions: VariantDimension[]): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const dim of dimensions) {
    if (dim.values.length === 0) continue;
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const v of dim.values) next.push({ ...combo, [dim.name]: v.value });
    }
    combos = next;
  }
  return combos;
}

/** Stable key for a value-combination, ordered by the dimension list. */
export function comboKey(
  dimensionValues: Record<string, string>,
  dimensions: VariantDimension[],
): string {
  return dimensions.map((d) => `${d.name}=${dimensionValues[d.name] ?? ""}`).join("|");
}

function codeSuffix(dimensionValues: Record<string, string>): string {
  return Object.values(dimensionValues)
    .map((v) => v.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase())
    .join("-");
}

/**
 * Regenerate the SKU list for the current dimensions. Existing SKUs whose
 * combination still exists keep their id/code/price/salePrice; new combos get
 * a generated code and zero price. With no dimensions, collapses to one SKU.
 */
export function syncSkus(
  dimensions: VariantDimension[],
  existing: EditableSku[],
  codePrefix: string,
): EditableSku[] {
  const prefix = codePrefix || "SKU";
  const combos = cartesian(dimensions);
  const hasVariants = combos.length > 1 || (combos[0] && Object.keys(combos[0]).length > 0);

  if (!hasVariants) {
    const base = existing[0];
    return [
      {
        id: base?.id ?? tempId(),
        skuCode: base?.skuCode || prefix,
        price: base?.price ?? null,
        salePrice: base?.salePrice ?? null,
        dimensionValues: {},
        attributes: base?.attributes,
        stock: base?.stock,
      },
    ];
  }

  const byKey = new Map(existing.map((s) => [comboKey(s.dimensionValues, dimensions), s]));
  return combos.map((dimensionValues) => {
    const prev = byKey.get(comboKey(dimensionValues, dimensions));
    const suffix = codeSuffix(dimensionValues);
    return {
      id: prev?.id ?? tempId(),
      skuCode: prev?.skuCode || (suffix ? `${prefix}-${suffix}` : prefix),
      price: prev?.price ?? null,
      salePrice: prev?.salePrice ?? null,
      dimensionValues,
      attributes: prev?.attributes,
      stock: prev?.stock,
    };
  });
}
