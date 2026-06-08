import { faker } from "@faker-js/faker";
import type {
  Product,
  ProductListItem,
  VariantDimension,
  ProductSKU,
} from "@veronica/contracts";
import { extractProductSizes } from "@/lib/product-sizes";
import { slugify } from "@/lib/utils";

// Deterministic mock data → no hydration drift between SSR and client.
faker.seed(20040);

let idSeq = 100;
const nextId = () => ++idSeq;

interface DimSpec {
  name: string;
  values: string[];
}

/**
 * Build a product's variant dimensions + the cartesian-product SKU list.
 * Prices step up per combination so the UI shows a realistic range.
 */
function buildVariants(
  codePrefix: string,
  dims: DimSpec[],
  basePrice: number,
  saleFraction: number | null,
): { dimensions: VariantDimension[]; skus: ProductSKU[] } {
  const dimensions: VariantDimension[] = dims.map((d, di) => ({
    id: nextId(),
    name: d.name,
    sortOrder: di,
    values: d.values.map((v, vi) => ({ id: nextId(), value: v, sortOrder: vi })),
  }));

  // Cartesian product of dimension values.
  let combos: Record<string, string>[] = [{}];
  for (const d of dims) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const v of d.values) next.push({ ...combo, [d.name]: v });
    }
    combos = next;
  }

  const skus: ProductSKU[] = combos.map((dimensionValues, i) => {
    const price = basePrice + i * Math.round(basePrice * 0.18);
    const suffix = Object.values(dimensionValues)
      .map((v) => v.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase())
      .join("-");
    return {
      id: nextId(),
      skuCode: suffix ? `${codePrefix}-${suffix}` : codePrefix,
      price,
      salePrice: saleFraction ? Math.round(price * saleFraction) : null,
      dimensionValues,
    };
  });

  return { dimensions, skus };
}

interface Seed {
  name: string;
  categoryId: number;
  tags: string[];
  basePrice: number;
  sale?: number; // fraction of price, e.g. 0.7
  dims?: DimSpec[];
  isBestseller?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
  status?: Product["status"];
  /** Real product photos under public/uploads/products/ (gallery order). */
  images: string[];
}

const seeds: Seed[] = [
  { name: "Lavender Imported Single Bowl", categoryId: 10, tags: ["Imported", "Premium", "DeepBowl"], basePrice: 3060, sale: 0.7, dims: [{ name: "Overall Size", values: ["18×16", "24×20", "32×20"] }], isBestseller: true, images: ["sink-1.webp", "sink-angle-1.png"] },
  { name: "Jasmine Single Bowl Sink", categoryId: 10, tags: ["Classic", "Versatile", "Durable"], basePrice: 2100, dims: [{ name: "Overall Size", values: ["18×16", "24×18"] }, { name: "Weight", values: ["Light", "Heavy"] }], images: ["sink-2.jpeg", "sink-installed-1.png"] },
  { name: "Orchid Quartz Single Bowl", categoryId: 10, tags: ["QuartzStone", "UV-Resistant", "AcidResistant"], basePrice: 14999, sale: 0.6, dims: [{ name: "Size", values: ["18×16", "24×18"] }], isNew: true, isFeatured: true, images: ["sink-3.webp", "sink-detail-drain.png"] },
  { name: "Veronica Double Bowl Sink", categoryId: 11, tags: ["DoubleBowl", "StainlessSteel"], basePrice: 6800, sale: 0.75, dims: [{ name: "Size", values: ["37×18", "45×20"] }], isBestseller: true, images: ["sink-4.webp", "sink-hero-1.png"] },
  { name: "Granite Drain Board Double Bowl", categoryId: 11, tags: ["DrainBoard", "QuartzStone"], basePrice: 28000, sale: 0.55, dims: [{ name: "Size", values: ["36×20", "40×20"] }], isNew: true, images: ["sink-drainboard.png", "sink-5.webp"] },
  { name: "Milano A.B.S. Health Faucet Set", categoryId: 20, tags: ["ABS", "FocusedFlow", "EasyClean"], basePrice: 850, sale: 0.7, dims: [{ name: "Color", values: ["Chrome", "Black"] }], isBestseller: true, images: ["faucet-1.webp", "faucet-detail-1.png"] },
  { name: "Sumo A.B.S. Health Faucet Set", categoryId: 20, tags: ["ABS", "Durable", "BrassFittings"], basePrice: 790, sale: 0.7, dims: [{ name: "Tube Type", values: ["Standard", "Nozzle"] }], isFeatured: true, images: ["faucet-2.webp", "faucet-spray-detail.png"] },
  { name: "Veronica Brass Health Faucet Set", categoryId: 21, tags: ["SolidBrass", "BraidedTube", "HeavyDuty"], basePrice: 2800, sale: 0.5, isNew: true, images: ["faucet-brass-1.png", "faucet-set-1.png"] },
  { name: "Royal Heavy Brass Faucet", categoryId: 21, tags: ["SolidBrass", "Premium"], basePrice: 3400, sale: 0.6, images: ["faucet-health-set.png", "faucet-1.png"] },
  { name: "Veronica Square Floor Drain", categoryId: 3, tags: ["AntiCockroach", "StainlessSteel", "RemovableTrap"], basePrice: 850, sale: 0.5, dims: [{ name: "Size", values: ["5 inch", "6 inch"] }], isBestseller: true, images: ["floor-drain-square.png", "drain-1.webp"] },
  { name: "Veronica Stainless Steel Grating", categoryId: 3, tags: ["StainlessSteel", "AntiSlip", "HeavyDuty"], basePrice: 650, sale: 0.55, dims: [{ name: "Size", values: ["5 inch", "6 inch"] }], images: ["floor-drain-detail.png", "drain-2.webp"] },
  { name: "S.S. Braided Connection Pipe", categoryId: 4, tags: ["StainlessSteel", "BrassNuts", "HotAndCold"], basePrice: 340, sale: 0.65, dims: [{ name: "Length", values: ["1.0 Meter", "1.5 Meter"] }], isFeatured: true, images: ["braided-pipe.png", "pipe-coupling-1.png"] },
];

function buildProduct(seed: Seed, index: number): Product {
  const codePrefix = seed.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase();
  const { dimensions, skus } = buildVariants(
    codePrefix,
    seed.dims ?? [],
    seed.basePrice,
    seed.sale ?? null,
  );

  return {
    id: index + 1,
    name: seed.name,
    slug: slugify(seed.name),
    description: faker.commerce.productDescription(),
    categoryId: seed.categoryId,
    isBestseller: seed.isBestseller ?? false,
    isNew: seed.isNew ?? false,
    isFeatured: seed.isFeatured ?? false,
    status: seed.status ?? "active",
    tags: seed.tags,
    images: seed.images.map((file) => `/uploads/products/${file}`),
    dimensions,
    skus,
    specifications: [
      { name: "Brand", value: "Veronica India" },
      { name: "Warranty", value: "1 Year" },
    ],
    includedAccessories: ["Waste Coupling"],
  };
}

/** Mutable in-memory product store (handlers mutate this for POST/PATCH/DELETE). */
export const products: Product[] = seeds.map(buildProduct);

// ── Derivations for list/search endpoints ──

export function getMinPrice(p: Product): number {
  if (p.skus.length === 0) return 0;
  return Math.min(...p.skus.map((s) => s.salePrice ?? s.price));
}

export function getMaxBasePrice(p: Product): number {
  if (p.skus.length === 0) return 0;
  return Math.max(...p.skus.map((s) => s.price));
}

export function getBestDiscount(p: Product): number {
  const discounts = p.skus
    .filter((s) => s.salePrice !== null && s.salePrice < s.price)
    .map((s) => Math.round(((s.price - s.salePrice!) / s.price) * 100));
  return discounts.length > 0 ? Math.max(...discounts) : 0;
}

/** Project a full Product down to the lightweight list/grid shape. */
export function toListItem(p: Product): ProductListItem {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    image: p.images[0] ?? "",
    minPrice: getMinPrice(p),
    maxBasePrice: getMaxBasePrice(p),
    bestDiscount: getBestDiscount(p),
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    status: p.status,
    skuCount: p.skus.length,
    tags: p.tags,
    sizes: extractProductSizes(p.skus, p.dimensions),
  };
}
