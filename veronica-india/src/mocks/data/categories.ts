import type { Category } from "@veronica/contracts";

/**
 * Mock category tree, mirroring the production seed: 4 roots + 4 children.
 * IDs are stable so handlers and product mocks can reference them.
 * Images use placehold.co (serves real PNGs) so the storefront renders cleanly.
 */
export const categories: Category[] = [
  // ── Roots ── (shown in the header nav)
  { id: 1, parentId: null, name: "Kitchen Sinks", slug: "kitchen-sinks", description: "Premium quartz and stainless steel kitchen sinks", image: "/uploads/categories/kitchen-sinks.webp", sortOrder: 0, showInHeader: true, status: "active" },
  { id: 2, parentId: null, name: "Health Faucet Sets", slug: "health-faucet-sets", description: "ABS and brass health faucet sets", image: "/uploads/categories/health-faucets.webp", sortOrder: 1, showInHeader: true, status: "active" },
  { id: 3, parentId: null, name: "Bathroom Accessories", slug: "bathroom-accessories", description: "Floor drains, gratings, and bathroom essentials", image: "/uploads/categories/bathroom-accessories.webp", sortOrder: 2, showInHeader: true, status: "active" },
  { id: 4, parentId: null, name: "Plumbing & Fittings", slug: "plumbing-fittings", description: "Shower tubes, connection pipes, waste couplings", image: "/uploads/categories/plumbing-fittings.webp", sortOrder: 3, showInHeader: true, status: "active" },

  // ── Kitchen Sinks → children ── (shown in the Kitchen Sinks dropdown)
  { id: 10, parentId: 1, name: "Single Bowl", slug: "single-bowl", description: "Single bowl kitchen sinks in quartz and stainless steel", image: "/uploads/categories/kitchen-sinks.webp", sortOrder: 0, showInHeader: true, status: "active" },
  { id: 11, parentId: 1, name: "Double Bowl", slug: "double-bowl", description: "Double bowl kitchen sinks for maximum workspace", image: "/uploads/categories/cat-1.webp", sortOrder: 1, showInHeader: true, status: "active" },

  // ── Health Faucet Sets → children ── (shown in the Health Faucet Sets dropdown)
  { id: 20, parentId: 2, name: "ABS Faucets", slug: "abs-faucets", description: "Lightweight ABS body health faucets", image: "/uploads/categories/health-faucets.webp", sortOrder: 0, showInHeader: true, status: "active" },
  { id: 21, parentId: 2, name: "Brass Faucets", slug: "brass-faucets", description: "Heavy-duty solid brass health faucets", image: "/uploads/categories/cat-2.webp", sortOrder: 1, showInHeader: true, status: "active" },

  // ── Third-level examples (nested tree) ──
  { id: 100, parentId: 10, name: "18×16", slug: "18x16", description: "Compact single bowl size", image: "/uploads/categories/kitchen-sinks.webp", sortOrder: 0, showInHeader: true, status: "active" },
  { id: 101, parentId: 10, name: "24×20", slug: "24x20", description: "Medium single bowl size", image: "/uploads/categories/kitchen-sinks.webp", sortOrder: 1, showInHeader: true, status: "active" },
  { id: 102, parentId: 10, name: "32×20", slug: "32x20", description: "Large single bowl size", image: "/uploads/categories/kitchen-sinks.webp", sortOrder: 2, showInHeader: false, status: "active" },
  { id: 200, parentId: 20, name: "Long Body", slug: "long-body", description: "Long body ABS health faucets", image: "/uploads/categories/health-faucets.webp", sortOrder: 0, showInHeader: true, status: "active" },
  { id: 201, parentId: 20, name: "Short Body", slug: "short-body", description: "Short body ABS health faucets", image: "/uploads/categories/health-faucets.webp", sortOrder: 1, showInHeader: true, status: "active" },
  { id: 202, parentId: 20, name: "Heavy", slug: "heavy", description: "Heavy-duty ABS health faucets", image: "/uploads/categories/health-faucets.webp", sortOrder: 2, showInHeader: true, status: "active" },
];

/** Root categories (parentId === null), sorted — the storefront's primary nav. */
export const rootCategories = categories
  .filter((c) => c.parentId === null && c.status !== "archived")
  .sort((a, b) => a.sortOrder - b.sortOrder);
