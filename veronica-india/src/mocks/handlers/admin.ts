import { http, HttpResponse } from "msw";
import { nanoid } from "nanoid";
import { API_BASE } from "@/lib/api-config";
import {
  AdminProductCreateSchema,
  AdminCategoryCreateSchema,
  SettingsUpdateSchema,
  type Product,
  type Category,
} from "@veronica/contracts";
import { products, toListItem } from "../data/products";
import { categories } from "../data/categories";
import { buildCategoryProductCounts } from "@/lib/category-tree";
import { home } from "../data/home";
import {
  settings,
  adminUser,
  MOCK_TOKEN,
  MOCK_EMAIL,
  MOCK_PASSWORD,
} from "../data/settings";

const A = API_BASE;

/** 401 if the request lacks the mock bearer token; otherwise null (proceed). */
function gate(request: Request): Response | null {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${MOCK_TOKEN}`) {
    return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function nextProductId(): number {
  return products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}
function nextCategoryId(): number {
  return categories.reduce((max, c) => Math.max(max, c.id), 0) + 1;
}
let childIdSeq = 50_000;
function allocChildId(): number {
  return ++childIdSeq;
}

function getSubtreeIds(rootId: number): number[] {
  const ids = [rootId];
  for (const child of categories.filter((c) => c.parentId === rootId)) {
    ids.push(...getSubtreeIds(child.id));
  }
  return ids;
}

function archiveCategorySubtree(rootId: number): number[] {
  const ids = getSubtreeIds(rootId);
  for (const id of ids) {
    const cat = categories.find((c) => c.id === id);
    if (cat) cat.status = "archived";
  }
  for (const p of products) {
    if (ids.includes(p.categoryId)) p.status = "archived";
  }
  return ids;
}

function restoreCategorySubtree(rootId: number): number[] {
  const ids = getSubtreeIds(rootId);
  for (const id of ids) {
    const cat = categories.find((c) => c.id === id);
    if (cat) cat.status = "active";
  }
  for (const p of products) {
    if (ids.includes(p.categoryId)) p.status = "active";
  }
  return ids;
}

function deleteCategorySubtree(rootId: number): number[] {
  const ids = getSubtreeIds(rootId);
  const idSet = new Set(ids);
  for (let i = products.length - 1; i >= 0; i--) {
    if (idSet.has(products[i].categoryId)) products.splice(i, 1);
  }
  for (let i = categories.length - 1; i >= 0; i--) {
    if (idSet.has(categories[i].id)) categories.splice(i, 1);
  }
  return ids;
}

export const adminHandlers = [
  // ── Auth ──
  http.post(`${A}/admin/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email === MOCK_EMAIL && body.password === MOCK_PASSWORD) {
      return HttpResponse.json({ accessToken: MOCK_TOKEN, admin: adminUser });
    }
    return HttpResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }),

  // ── Products ──
  http.get(`${A}/admin/products`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const status = url.searchParams.get("status"); // active|draft|archived
    const flag = url.searchParams.get("flag"); // bestseller|new|featured
    const categoryTreeId = url.searchParams.get("categoryTreeId");

    let result = [...products];
    if (categoryTreeId && Number.isInteger(Number(categoryTreeId))) {
      const ids = new Set(getSubtreeIds(Number(categoryTreeId)));
      result = result.filter((p) => ids.has(p.categoryId));
    }
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (status) {
      result = result.filter((p) => p.status === status);
    } else {
      result = result.filter((p) => p.status !== "archived");
    }
    if (flag === "bestseller") result = result.filter((p) => p.isBestseller);
    if (flag === "new") result = result.filter((p) => p.isNew);
    if (flag === "featured") result = result.filter((p) => p.isFeatured);

    // Mirror the deployed admin API: an `{ items, nextCursor }` envelope whose
    // rows carry `primaryImage`/`categoryName` (the admin client maps these).
    return HttpResponse.json({
      items: result.map((p) => ({
        ...toListItem(p),
        categoryId: p.categoryId,
        primaryImage: p.images[0] ?? null,
        categoryName: categories.find((c) => c.id === p.categoryId)?.name,
      })),
      nextCursor: null,
    });
  }),

  http.post(`${A}/admin/products`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const raw = await request.json();
    const parsed = AdminProductCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return HttpResponse.json(
        { error: "validation", message: parsed.error.message },
        { status: 422 },
      );
    }
    const data = parsed.data;
    const product: Product = {
      ...data,
      id: nextProductId(),
      slug: data.slug && data.slug.length > 0 ? data.slug : slugifyName(data.name),
      images: data.images.map((img) =>
        typeof img === "string" ? img : (img as { url: string }).url,
      ),
      dimensions: data.dimensions.map((d) => ({
        id: allocChildId(),
        name: d.name,
        sortOrder: d.sortOrder,
        values: d.values.map((v) => ({
          id: allocChildId(),
          value: v.value,
          label: v.label,
          sortOrder: v.sortOrder,
        })),
      })),
      skus: data.skus.map((s) => ({
        id: s.id ?? allocChildId(),
        skuCode: s.skuCode,
        price: s.price,
        salePrice: s.salePrice,
        dimensionValues: s.dimensionValues,
        attributes: s.attributes,
        stock: s.stock,
      })),
    };
    products.push(product);
    return HttpResponse.json(product, { status: 201 });
  }),

  http.get(`${A}/admin/products/:id`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const product = products.find((p) => p.id === Number(params.id));
    if (!product) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json(product);
  }),

  http.patch(`${A}/admin/products/:id`, async ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const idx = products.findIndex((p) => p.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    const patch = (await request.json()) as Partial<Product>;
    products[idx] = { ...products[idx], ...patch, id: products[idx].id };
    return HttpResponse.json(products[idx]);
  }),

  http.delete(`${A}/admin/products/:id`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const idx = products.findIndex((p) => p.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    products.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),

  http.post(`${A}/admin/products/:id/archive`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const product = products.find((p) => p.id === Number(params.id));
    if (!product) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    product.status = "archived";
    return HttpResponse.json({ success: true, id: product.id, status: "archived" });
  }),

  http.post(`${A}/admin/products/:id/restore`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const product = products.find((p) => p.id === Number(params.id));
    if (!product) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    product.status = "active";
    return HttpResponse.json({ success: true, id: product.id, status: "active" });
  }),

  // ── Categories ──
  http.get(`${A}/admin/categories`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const directMap = new Map<number, number>();
    for (const cat of sorted) {
      directMap.set(
        cat.id,
        products.filter((p) => p.categoryId === cat.id && p.status !== "archived").length,
      );
    }
    const { direct, subtree } = buildCategoryProductCounts(sorted, directMap);
    return HttpResponse.json(
      sorted.map((cat) => ({
        ...cat,
        childCount: sorted.filter((c) => c.parentId === cat.id).length,
        productCount: direct.get(cat.id) ?? 0,
        subtreeProductCount: subtree.get(cat.id) ?? 0,
      })),
    );
  }),

  http.post(`${A}/admin/categories`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const raw = await request.json();
    const parsed = AdminCategoryCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return HttpResponse.json(
        { error: "validation", message: parsed.error.message },
        { status: 422 },
      );
    }
    const d = parsed.data;
    const category: Category = {
      id: nextCategoryId(),
      parentId: d.parentId,
      name: d.name,
      slug: d.slug && d.slug.length > 0 ? d.slug : slugifyName(d.name),
      description: d.description ?? "",
      image: d.image,
      sortOrder: d.sortOrder ?? categories.length,
      showInHeader: d.showInHeader ?? false,
      status: "active",
    };
    categories.push(category);
    return HttpResponse.json(category, { status: 201 });
  }),

  http.patch(`${A}/admin/categories/:id`, async ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const idx = categories.findIndex((c) => c.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    const patch = (await request.json()) as Partial<Category>;
    categories[idx] = { ...categories[idx], ...patch, id: categories[idx].id };
    return HttpResponse.json(categories[idx]);
  }),

  http.delete(`${A}/admin/categories/:id`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const id = Number(params.id);
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) return HttpResponse.json({ error: "not_found" }, { status: 404 });

    deleteCategorySubtree(id);
    return HttpResponse.json({ success: true });
  }),

  http.post(`${A}/admin/categories/:id/archive`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const id = Number(params.id);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    const affected = archiveCategorySubtree(id);
    return HttpResponse.json({ success: true, id, status: "archived", affectedCategoryIds: affected });
  }),

  http.post(`${A}/admin/categories/:id/restore`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const id = Number(params.id);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    const affected = restoreCategorySubtree(id);
    return HttpResponse.json({ success: true, id, status: "active", affectedCategoryIds: affected });
  }),

  // ── Home composer ──
  http.get(`${A}/admin/home`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json(home);
  }),

  http.put(`${A}/admin/home`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    // The admin client sends the backend wire shape ({ sections:[{key,enabled,
    // order,config}] }), not the flat composer model — accept that.
    const raw = (await request.json()) as { sections?: unknown };
    if (!raw || !Array.isArray(raw.sections)) {
      return HttpResponse.json({ error: "validation" }, { status: 422 });
    }
    home.sections = raw.sections as typeof home.sections;
    return HttpResponse.json(home);
  }),

  // ── Settings ──
  http.get(`${A}/admin/settings`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json(settings);
  }),

  http.patch(`${A}/admin/settings`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const raw = await request.json();
    const parsed = SettingsUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return HttpResponse.json(
        { error: "validation", message: parsed.error.message },
        { status: 422 },
      );
    }
    Object.assign(settings, parsed.data);
    return HttpResponse.json(settings);
  }),

  // ── Uploads ──
  http.post(`${A}/admin/uploads`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json({ url: `https://placehold.co/600x600/EEEEEE/57534E/png?text=${nanoid(6)}` });
  }),

  // Legacy path kept so older clients don't 404 during rollout.
  http.post(`${A}/admin/upload`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json({ url: `https://placehold.co/600x600/EEEEEE/57534E/png?text=${nanoid(6)}` });
  }),

  // ── Stubs (full UI in Phase 4 / later) ──
  http.get(`${A}/admin/orders`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json({ items: [], nextCursor: null });
  }),

  http.get(`${A}/admin/audit-log`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json({
      items: [
        {
          id: 1,
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
          action: "product.update",
          resourceType: "product",
          resourceId: "1",
          createdAt: "2026-05-29T10:00:00.000Z",
          changes: { before: { status: "draft" }, after: { status: "active" } },
        },
        {
          id: 2,
          actorUserId: adminUser.id,
          actorEmail: adminUser.email,
          action: "category.create",
          resourceType: "category",
          resourceId: "21",
          createdAt: "2026-05-28T14:30:00.000Z",
          changes: null,
        },
      ],
      nextCursor: null,
    });
  }),
];

// Local slugify to avoid importing app utils into the mock bundle chain twice.
function slugifyName(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
