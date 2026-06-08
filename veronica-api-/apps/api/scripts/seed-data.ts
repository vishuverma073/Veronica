// ─── Interfaces ──────────────────────────────────────────────

export interface Category {
    id: number;
    name: string;
    slug: string;
    parentId: number | null; // self-referencing for subcategories
    description: string;
    image?: string; // optional — some intermediate nodes may not need images
    sortOrder: number;
}

export interface VariantDimension {
    id: number;
    name: string; // e.g. "Size", "Gauge", "Type"
    sortOrder: number;
    values: DimensionValue[];
}

export interface DimensionValue {
    id: number;
    value: string; // e.g. "24×18×9", "Heavy"
    label?: string; // optional display label
    sortOrder: number;
}

export interface ProductSKU {
    id: number;
    skuCode: string;
    price: number;
    salePrice: number | null;
    dimensionValues: Record<string, string>; // { "Size": "24×18×9", "Gauge": "Heavy" }
    attributes?: Record<string, string>; // e.g. { "Bowl Size": "22×16×9", "Thickness": "1.2mm" }
    stock?: number | null; // future use
}

export interface Product {
    id: number;
    name: string;
    slug: string;
    description: string;
    categoryId: number; // references category.id (leaf category)
    isBestseller: boolean;
    isNew: boolean;
    status: "active" | "draft";
    tags: string[];
    images: string[];
    dimensions: VariantDimension[];
    skus: ProductSKU[];
    specifications?: { name: string; value: string }[];
    includedAccessories?: string[];
}

// ─── Sample Data: Categories (self-referencing tree) ─────────

export const categories: Category[] = [
    // ─── Root Categories ───
    {
        id: 1,
        name: "Kitchen Sinks",
        slug: "kitchen-sinks",
        parentId: null,
        description: "Premium quartz and stainless steel kitchen sinks",
        image: "/uploads/products/sink-hero-1.png",
        sortOrder: 0,
    },
    {
        id: 2,
        name: "Health Faucet Sets",
        slug: "health-faucet-sets",
        parentId: null,
        description: "ABS and brass health faucet sets",
        image: "/uploads/products/faucet-health-set.png",
        sortOrder: 1,
    },
    {
        id: 3,
        name: "Bathroom Accessories",
        slug: "bathroom-accessories",
        parentId: null,
        description: "Floor drains, gratings, and bathroom essentials",
        image: "/uploads/products/accessory-set-1.png",
        sortOrder: 2,
    },
    {
        id: 4,
        name: "Plumbing & Fittings",
        slug: "plumbing-fittings",
        parentId: null,
        description: "Shower tubes, connection pipes, waste couplings",
        image: "/uploads/products/braided-pipe.png",
        sortOrder: 3,
    },

    // ─── Kitchen Sinks → Children ───
    {
        id: 10,
        name: "Single Bowl",
        slug: "single-bowl",
        parentId: 1,
        description: "Single bowl kitchen sinks in quartz and stainless steel",
        image: "/uploads/products/sink-1.webp",
        sortOrder: 0,
    },
    {
        id: 11,
        name: "Double Bowl",
        slug: "double-bowl",
        parentId: 1,
        description: "Double bowl kitchen sinks for maximum workspace",
        image: "/uploads/products/sink-3.webp",
        sortOrder: 1,
    },

    // ─── Health Faucet Sets → Children ───
    {
        id: 20,
        name: "ABS Faucets",
        slug: "abs-faucets",
        parentId: 2,
        description: "Lightweight ABS body health faucets",
        image: "/uploads/products/faucet-1.png",
        sortOrder: 0,
    },
    {
        id: 21,
        name: "Brass Faucets",
        slug: "brass-faucets",
        parentId: 2,
        description: "Heavy-duty solid brass health faucets",
        image: "/uploads/products/faucet-1.png",
        sortOrder: 1,
    },

    // ─── Third-level examples ───
    { id: 100, name: "18×16", slug: "18x16", parentId: 10, description: "Compact single bowl", sortOrder: 0 },
    { id: 101, name: "24×20", slug: "24x20", parentId: 10, description: "Medium single bowl", sortOrder: 1 },
    { id: 102, name: "32×20", slug: "32x20", parentId: 10, description: "Large single bowl", sortOrder: 2 },
    { id: 200, name: "Long Body", slug: "long-body", parentId: 20, description: "Long body ABS faucets", sortOrder: 0 },
    { id: 201, name: "Short Body", slug: "short-body", parentId: 20, description: "Short body ABS faucets", sortOrder: 1 },
    { id: 202, name: "Heavy", slug: "heavy", parentId: 20, description: "Heavy ABS faucets", sortOrder: 2 },
];

// ─── Sample Data: Products ───────────────────────────────────

export const products: Product[] = [
    // ── Kitchen Sink → Single Bowl (category 10) ──
    {
        id: 1,
        name: "Lavender Imported Range Single Bowl",
        slug: "lavender-imported-range-single-bowl",
        description:
            "Premium imported single bowl sink from the Lavender series.",
        categoryId: 10,
        isBestseller: true,
        isNew: false,
        status: "active",
        tags: ["Imported", "Premium", "DeepBowl"],
        images: ["/uploads/products/sink-hero-1.png", "/uploads/products/sink-1.webp", "/uploads/products/sink-angle-1.png", "/uploads/products/sink-detail-drain.png"],
        dimensions: [
            {
                id: 1,
                name: "Overall Size",
                sortOrder: 0,
                values: [
                    { id: 1, value: "18×16", sortOrder: 0 },
                    { id: 2, value: "24×20", sortOrder: 1 },
                    { id: 3, value: "32×20", sortOrder: 2 },
                ],
            },
        ],
        skus: [
            { id: 1, skuCode: "LAV-1816", price: 3060, salePrice: 2100, dimensionValues: { "Overall Size": "18×16" }, attributes: { "Bowl Size": "15.5×13.5", "mm": "460 x 410" } },
            { id: 2, skuCode: "LAV-2420", price: 4200, salePrice: null, dimensionValues: { "Overall Size": "24×20" }, attributes: { "Bowl Size": "22×16×8", "mm": "610 x 510" } },
            { id: 3, skuCode: "LAV-3220", price: 8180, salePrice: null, dimensionValues: { "Overall Size": "32×20" }, attributes: { "Bowl Size": "27×17×8", "mm": "810 x 510" } },
        ],
        specifications: [
            { name: "Series", value: "Lavender Imported Range" },
            { name: "Style", value: "Single Bowl" }
        ],
        includedAccessories: ["Waste Coupling"],
    },

    {
        id: 2,
        name: "Jasmine Single Bowl Sink",
        slug: "jasmine-single-bowl-sink",
        description:
            "Classic single bowl sink from the Jasmine series. Available in a wide variety of sizes for any kitchen space.",
        categoryId: 10,
        isBestseller: false,
        isNew: false,
        status: "active",
        tags: ["Classic", "Versatile", "Durable"],
        images: ["/uploads/products/sink-hero-1.png", "/uploads/products/sink-4.webp", "/uploads/products/sink-installed-1.png"],
        dimensions: [
            {
                id: 3,
                name: "Overall Size",
                sortOrder: 0,
                values: [
                    { id: 7, value: "18×16", sortOrder: 0 },
                    { id: 8, value: "24×18", sortOrder: 1 },
                ],
            },
            {
                id: 4,
                name: "Weight",
                sortOrder: 1,
                values: [
                    { id: 10, value: "Light", sortOrder: 0 },
                    { id: 11, value: "Medium", sortOrder: 1 },
                    { id: 12, value: "Classic", sortOrder: 2 },
                    { id: 13, value: "Heavy", sortOrder: 3 },
                ],
            }
        ],
        skus: [
            // 18x16
            { id: 9, skuCode: "JAS-1816-L", price: 2100, salePrice: null, dimensionValues: { "Overall Size": "18×16", "Weight": "Light" }, attributes: { "Bowl Size": "16×14×8", "mm": "460 x 410", "Thickness": "0.8mm" } },
            { id: 10, skuCode: "JAS-1816-M", price: 2400, salePrice: null, dimensionValues: { "Overall Size": "18×16", "Weight": "Medium" }, attributes: { "Bowl Size": "16×14×8", "mm": "460 x 410", "Thickness": "1.0mm" } },
            { id: 11, skuCode: "JAS-1816-C", price: 2800, salePrice: null, dimensionValues: { "Overall Size": "18×16", "Weight": "Classic" }, attributes: { "Bowl Size": "16×14×8", "mm": "460 x 410", "Thickness": "1.2mm" } },
            { id: 12, skuCode: "JAS-1816-H", price: 3200, salePrice: null, dimensionValues: { "Overall Size": "18×16", "Weight": "Heavy" }, attributes: { "Bowl Size": "16×14×8", "mm": "460 x 410", "Thickness": "1.5mm" } },

            // 24x18
            { id: 13, skuCode: "JAS-2418-L", price: 2800, salePrice: null, dimensionValues: { "Overall Size": "24×18", "Weight": "Light" }, attributes: { "Bowl Size": "20×16×8", "mm": "610 x 460", "Thickness": "0.8mm" } },
            { id: 14, skuCode: "JAS-2418-M", price: 3200, salePrice: null, dimensionValues: { "Overall Size": "24×18", "Weight": "Medium" }, attributes: { "Bowl Size": "20×16×8", "mm": "610 x 460", "Thickness": "1.0mm" } },
            { id: 15, skuCode: "JAS-2418-C", price: 3800, salePrice: null, dimensionValues: { "Overall Size": "24×18", "Weight": "Classic" }, attributes: { "Bowl Size": "20×16×8", "mm": "610 x 460", "Thickness": "1.2mm" } },
            { id: 16, skuCode: "JAS-2418-H", price: 4400, salePrice: null, dimensionValues: { "Overall Size": "24×18", "Weight": "Heavy" }, attributes: { "Bowl Size": "20×16×8", "mm": "610 x 460", "Thickness": "1.5mm" } },
        ],
        specifications: [
            { name: "Series", value: "Jasmine" },
        ],
    },

    {
        id: 3,
        name: "Veronica Drain Board Quartz Sink",
        slug: "veronica-drain-board-quartz-sink",
        description:
            "Spacious quartz sink with integrated drain board. Designed for Indian kitchens with maximum workspace.",
        categoryId: 11,
        isBestseller: false,
        isNew: true,
        status: "active",
        tags: ["DrainBoard", "QuartzStone", "UV-Resistant", "AcidResistant"],
        images: ["/uploads/products/sink-hero-2.png", "/uploads/products/sink-drainboard.png", "/uploads/products/sink-5.webp", "/uploads/products/sink-detail-drain.png"],
        dimensions: [
            {
                id: 5,
                name: "Size",
                sortOrder: 0,
                values: [
                    { id: 12, value: "36×20", sortOrder: 0 },
                    { id: 13, value: "40×20", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 14, skuCode: "VDBQ-36", price: 28000, salePrice: 14499, dimensionValues: { Size: "36×20" } },
            { id: 15, skuCode: "VDBQ-40", price: 32000, salePrice: 17499, dimensionValues: { Size: "40×20" } },
        ],
    },

    // ── Health Faucets → ABS (category 20) ──
    {
        id: 4,
        name: "Milano A.B.S. Health Faucet Set",
        slug: "milano-abs-health-faucet",
        description:
            "Premium A.B.S. Body & Hook with focused and straight flow. Easy to open and clean. Includes 1 Meter Plus Shower Tube with Brass Glassi and Nuts.",
        categoryId: 20,
        isBestseller: true,
        isNew: false,
        status: "active",
        tags: ["ABS", "FocusedFlow", "EasyClean"],
        images: ["/uploads/products/faucet-set-1.png", "/uploads/products/faucet-1.webp", "/uploads/products/faucet-2.webp", "/uploads/products/faucet-detail-1.png"],
        dimensions: [
            {
                id: 5,
                name: "Color",
                sortOrder: 0,
                values: [
                    { id: 14, value: "Chrome", sortOrder: 0 },
                    { id: 15, value: "Black", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 14, skuCode: "MLN-CHR", price: 850, salePrice: 599, dimensionValues: { Color: "Chrome" }, attributes: { "Tube": "1 Meter Plus" } },
            { id: 15, skuCode: "MLN-BLK", price: 950, salePrice: 699, dimensionValues: { Color: "Black" }, attributes: { "Tube": "1 Meter Plus" } },
        ],
        specifications: [
            { name: "Material", value: "A.B.S. Body & Hook" },
            { name: "Flow Type", value: "Focused and Straight Flow" },
            { name: "Fittings", value: "Brass Glassi and Nuts" }
        ],
        includedAccessories: ["Health Faucet Head", "1 Meter Plus Shower Tube", "Wall Hook", "Screws & Fasteners"],
    },

    {
        id: 5,
        name: "Sumo A.B.S. Health Faucet Set",
        slug: "sumo-abs-health-faucet",
        description:
            "Robust A.B.S. Body & Hook. Designed for longevity with a focused flow. All shower tubes come with premium brass fittings.",
        categoryId: 20,
        isBestseller: false,
        isNew: true,
        status: "active",
        tags: ["ABS", "Durable", "BrassFittings"],
        images: ["/uploads/products/faucet-health-set.png", "/uploads/products/faucet-2.webp", "/uploads/products/faucet-spray-detail.png"],
        dimensions: [
            {
                id: 6,
                name: "Tube Type",
                sortOrder: 0,
                values: [
                    { id: 16, value: "Standard Tube", sortOrder: 0 },
                    { id: 17, value: "Nozzle Tube", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 16, skuCode: "SUM-STD", price: 790, salePrice: 550, dimensionValues: { "Tube Type": "Standard Tube" }, attributes: { "Tube Length": "1 Meter Plus" } },
            { id: 17, skuCode: "SUM-NOZ", price: 820, salePrice: 590, dimensionValues: { "Tube Type": "Nozzle Tube" }, attributes: { "Tube Length": "1 Meter" } },
        ],
        specifications: [
            { name: "Material", value: "A.B.S. Body & Hook" },
            { name: "Maintenance", value: "Easy to Open and Clean" },
        ],
        includedAccessories: ["Sumo Faucet Head", "Shower Tube", "Wall Hook"],
    },

    {
        id: 6,
        name: "Splash-P A.B.S. Health Faucet",
        slug: "splash-p-abs-health-faucet",
        description:
            "Sleek and highly functional A.B.S. health faucet with standard master packing. Perfect for commercial and residential use.",
        categoryId: 20,
        isBestseller: false,
        isNew: false,
        status: "active",
        tags: ["ABS", "Commercial", "Value"],
        images: ["/uploads/products/faucet-set-1.png", "/uploads/products/shower-1.webp", "/uploads/products/faucet-detail-1.png"],
        dimensions: [
            {
                id: 7,
                name: "Pack Size",
                sortOrder: 0,
                values: [
                    { id: 18, value: "Single Unit", sortOrder: 0 },
                    { id: 19, value: "Master Pack (64 Pcs)", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 18, skuCode: "SPL-1", price: 650, salePrice: 450, dimensionValues: { "Pack Size": "Single Unit" }, attributes: { "Tube Length": "1 Meter" } },
            { id: 19, skuCode: "SPL-64", price: 41600, salePrice: 24000, dimensionValues: { "Pack Size": "Master Pack (64 Pcs)" }, attributes: { "Tube Length": "1 Meter" } },
        ],
        specifications: [
            { name: "Material", value: "A.B.S. Body & Hook" },
            { name: "Flow Type", value: "Focused and Straight Flow" },
        ],
        includedAccessories: ["Health Faucet Head", "1 Meter Shower Tube", "Wall Hook"],
    },

    // ── Health Faucets → Brass (category 21) ──
    {
        id: 7,
        name: "Veronica Brass Health Faucet Set",
        slug: "veronica-brass-health-faucet-set",
        description:
            "Heavy-duty brass health faucet with braided tube and angle valve. Built for durability in high-use bathrooms.",
        categoryId: 21,
        isBestseller: false,
        isNew: true,
        status: "active",
        tags: ["SolidBrass", "BraidedTube", "AngleValve", "HeavyDuty"],
        images: ["/uploads/products/faucet-brass-1.png", "/uploads/products/shower-2.webp", "/uploads/products/faucet-detail-1.png"],
        dimensions: [],
        skus: [
            { id: 18, skuCode: "VBHF-01", price: 2800, salePrice: 1399, dimensionValues: {} },
        ],
    },

    // ── Bathroom Accessories (category 3, no subcategories) ──
    {
        id: 8,
        name: "Veronica Square Floor Drain (Cockroach Trap)",
        slug: "veronica-square-floor-drain-cockroach-trap",
        description:
            "Anti-cockroach floor drain with removable trap. Keeps pests out while ensuring smooth water flow.",
        categoryId: 3,
        isBestseller: true,
        isNew: false,
        status: "active",
        tags: ["AntiCockroach", "StainlessSteel", "RemovableTrap", "EasyClean"],
        images: ["/uploads/products/floor-drain-square.png", "/uploads/products/accessory-1.webp", "/uploads/products/floor-drain-detail.png"],
        dimensions: [
            {
                id: 7,
                name: "Size",
                sortOrder: 0,
                values: [
                    { id: 16, value: "5 inch", sortOrder: 0 },
                    { id: 17, value: "6 inch", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 19, skuCode: "VSFD-5", price: 850, salePrice: 399, dimensionValues: { Size: "5 inch" } },
            { id: 20, skuCode: "VSFD-6", price: 950, salePrice: 499, dimensionValues: { Size: "6 inch" } },
        ],
    },

    {
        id: 9,
        name: "Veronica Stainless Steel Grating",
        slug: "veronica-stainless-steel-grating",
        description:
            "Heavy-duty bathroom floor grating in premium stainless steel. Anti-slip surface with precision holes.",
        categoryId: 3,
        isBestseller: false,
        isNew: false,
        status: "active",
        tags: ["StainlessSteel", "AntiSlip", "HeavyDuty", "PrecisionCut"],
        images: ["/uploads/products/drain-hero-1.png", "/uploads/products/accessory-2.webp", "/uploads/products/drain-detail-1.png"],
        dimensions: [
            {
                id: 8,
                name: "Size",
                sortOrder: 0,
                values: [
                    { id: 18, value: "5 inch", sortOrder: 0 },
                    { id: 19, value: "6 inch", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 21, skuCode: "VSSG-5", price: 650, salePrice: 299, dimensionValues: { Size: "5 inch" } },
            { id: 22, skuCode: "VSSG-6", price: 750, salePrice: 379, dimensionValues: { Size: "6 inch" } },
        ],
    },

    {
        id: 10,
        name: "Veronica Bathroom Accessories Set (6-Piece)",
        slug: "veronica-bathroom-accessories-set-6-piece",
        description:
            "Complete bathroom accessories set including towel rod, soap dish, tumbler holder, robe hook, toilet paper holder, and shelf.",
        categoryId: 3,
        isBestseller: false,
        isNew: true,
        status: "active",
        tags: ["CompleteSet", "ChromeFinish", "WallMount", "Modern"],
        images: ["/uploads/products/accessory-set-1.png", "/uploads/products/accessory-3.webp", "/uploads/products/bathroom-accessories-set.png"],
        dimensions: [
            {
                id: 9,
                name: "Finish",
                sortOrder: 0,
                values: [
                    { id: 20, value: "Chrome", sortOrder: 0 },
                    { id: 21, value: "Matte Black", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 23, skuCode: "VBAS-CR", price: 3500, salePrice: 1799, dimensionValues: { Finish: "Chrome" } },
            { id: 24, skuCode: "VBAS-MB", price: 4000, salePrice: 2199, dimensionValues: { Finish: "Matte Black" } },
        ],
    },

    // ── Plumbing & Fittings (category 4, no subcategories) ──
    {
        id: 11,
        name: "S.S. Braided Connection Pipe",
        slug: "ss-braided-connection-pipe",
        description:
            "AISI-304 (18/8) Stainless Steel Braided Connection Hose. No Blast E.P.D.M Tube inside. Designed for both Hot and Cold Water with Heavy Brass Nuts.",
        categoryId: 4,
        isBestseller: true,
        isNew: false,
        status: "active",
        tags: ["StainlessSteel", "BrassNuts", "HotAndCold", "NoBlast"],
        images: ["/uploads/products/braided-pipe.png", "/uploads/products/plumbing-1.webp", "/uploads/products/pipe-coupling-1.png"],
        dimensions: [
            {
                id: 10,
                name: "Length",
                sortOrder: 0,
                values: [
                    { id: 22, value: "1.0 Meter", sortOrder: 0 },
                    { id: 23, value: "1.5 Meter", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 25, skuCode: "SSB-10", price: 340, salePrice: 220, dimensionValues: { Length: "1.0 Meter" } },
            { id: 26, skuCode: "SSB-15", price: 420, salePrice: 290, dimensionValues: { Length: "1.5 Meter" } },
        ],
        specifications: [
            { name: "Material", value: "AISI-304 (18/8) Stainless Steel" },
            { name: "Inner Tube", value: "E.P.D.M Tube" },
            { name: "Fittings", value: "Heavy Brass Nuts, AISI-304 Punch" }
        ],
    },

    {
        id: 12,
        name: "PVC Thread Braided Connection Hose",
        slug: "pvc-thread-braided-connection-hose",
        description:
            "Three layers PVC thread braided hose. No blast design suitable for hot and cold water. Features AISI-304(18/8) punch and brass nuts.",
        categoryId: 4,
        isBestseller: false,
        isNew: true,
        status: "active",
        tags: ["PVC", "ThreeLayers", "BrassNuts"],
        images: ["/uploads/products/shower-tube-pvc.png", "/uploads/products/drain-1.webp", "/uploads/products/pipe-braided-1.png"],
        dimensions: [
            {
                id: 11,
                name: "Length",
                sortOrder: 0,
                values: [
                    { id: 24, value: "1.0 Meter", sortOrder: 0 },
                    { id: 25, value: "1.5 Meter", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 27, skuCode: "PVCB-10", price: 280, salePrice: 190, dimensionValues: { Length: "1.0 Meter" } },
            { id: 28, skuCode: "PVCB-15", price: 350, salePrice: 240, dimensionValues: { Length: "1.5 Meter" } },
        ],
        specifications: [
            { name: "Material", value: "PVC Three Layers" },
            { name: "Fittings", value: "Brass Nuts, AISI-304 Punch" }
        ],
    },

    {
        id: 13,
        name: "Stainless Steel Wash Basin Coupling",
        slug: "ss-wash-basin-coupling",
        description:
            "Premium 3 inch Wash Basin Coupling. Upper part made of AISI 304-18/8 Stainless Steel. J-4 Quality Heavy Pipe with Heavy Brass Nuts and Proper Threading.",
        categoryId: 4,
        isBestseller: true,
        isNew: false,
        status: "active",
        tags: ["StainlessSteel", "HeavyDuty", "ProperThreading"],
        images: ["/uploads/products/waste-coupling.png", "/uploads/products/drain-2.webp", "/uploads/products/pipe-coupling-1.png"],
        dimensions: [
            {
                id: 12,
                name: "Type",
                sortOrder: 0,
                values: [
                    { id: 26, value: "Stainless Steel 3\"", sortOrder: 0 },
                    { id: 27, value: "Full Brass (C.P.)", sortOrder: 1 },
                ],
            },
        ],
        skus: [
            { id: 29, skuCode: "WBC-SS-3", price: 450, salePrice: 310, dimensionValues: { Type: "Stainless Steel 3\"" } },
            { id: 30, skuCode: "WBC-BRS-5", price: 850, salePrice: 590, dimensionValues: { Type: "Full Brass (C.P.)" }, attributes: { "Size": "5\"x5\" Approx" } },
        ],
        specifications: [
            { name: "Material", value: "AISI 304(18/8) / Full Brass" },
            { name: "Finish", value: "Sparkling Flawless High Gloss" },
            { name: "Fittings", value: "Heavy Brass Nuts" }
        ],
    },
];

// ─── Exports consumed by the seeder (one-time copy of FE data.ts) ───
export const categoriesData = categories;
export const productsData = products;
