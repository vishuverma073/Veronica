/**
 * Authenticated admin API client.
 *
 * Every call hits `${API_BASE}/admin/*` (MSW-backed in dev, the real API in
 * prod) with a `Authorization: Bearer <token>` header sourced from the admin
 * auth store, and validates the response against a `@veronica/contracts` schema
 * so shape drift fails loudly here rather than deep in a component.
 *
 * A 401 clears the session so the layout bounces the user back to /login.
 */
import { z } from "zod";
import { getApiBase, USE_MOCKS } from "@/lib/api-config";
import { logApiFetch } from "@/lib/api-debug";
import { mocksReady } from "@/lib/mocks-ready";
import { getAdminToken, useAdminAuthStore } from "@/store/adminAuthStore";
import {
  AdminLoginResponseSchema,
  ProductSchema,
  CategorySchema,
  AdminCategoryListSchema,
  HomeConfigSchema,
  SettingsSchema,
  UploadResultSchema,
  type AdminLoginResponse,
  type Product,
  type ProductListItem,
  type Category,
  type HomeConfig,
  type Settings,
  type AdminProductCreate,
  type AdminProductUpdate,
  type AdminCategoryCreate,
  type AdminCategoryUpdate,
} from "@veronica/contracts";

// ── Anti-corruption layer ───────────────────────────────────────────────────
// The deployed admin API returns slightly different shapes than these frontend
// contracts (an {items} envelope, `primaryImage` instead of `image`). These
// local schemas + mappers translate so the admin pages stay unchanged.
const BeAdminProductListItem = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["active", "draft", "archived"]),
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  isFeatured: z.boolean().default(false),
  categoryId: z.number().int().positive(),
  categoryName: z.string().optional(),
  primaryImage: z.string().nullable().optional(),
  minPrice: z.number().default(0),
  maxBasePrice: z.number().default(0),
  bestDiscount: z.number().default(0),
  skuCount: z.number().default(0),
});
const BeAdminProductList = z.object({
  items: z.array(BeAdminProductListItem),
  nextCursor: z.string().nullable().optional(),
});

/** Admin list item = the storefront list shape plus the category name (for the
 * admin's category filter; the backend includes it on the admin list). */
export type AdminListProduct = ProductListItem & { categoryName: string };

function mapAdminProduct(p: z.infer<typeof BeAdminProductListItem>): AdminListProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    categoryName: p.categoryName ?? "",
    image: p.primaryImage ?? "",
    minPrice: p.minPrice,
    maxBasePrice: p.maxBasePrice,
    bestDiscount: p.bestDiscount,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    status: p.status,
    skuCount: p.skuCount,
    tags: [],
    sizes: [],
  };
}

// Admin order list row (backend GET /admin/orders).
const AdminOrderItemSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  customerName: z.string().nullish().transform((v) => v ?? ""),
  customerPhone: z.string().nullish().transform((v) => v ?? ""),
  total: z.number(),
  status: z.string(),
  itemCount: z.number(),
  createdAt: z.string(),
});
const AdminOrderListSchema = z.object({
  items: z.array(AdminOrderItemSchema),
  nextCursor: z.string().nullable().optional(),
});
export type AdminOrderItem = z.infer<typeof AdminOrderItemSchema>;

const BeAuditEntrySchema = z.object({
  id: z.number(),
  actorUserId: z.string().nullish(),
  actorEmail: z.string().nullish(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  createdAt: z.string(),
  changes: z.unknown().nullable(),
});
const BeAuditListSchema = z.object({
  items: z.array(BeAuditEntrySchema),
  nextCursor: z.string().nullable().optional(),
});
export type AdminAuditEntry = {
  id: number;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  changes: unknown | null;
};
export type AdminAuditListParams = {
  cursor?: string;
  resource_type?: string;
  actor_user_id?: string;
};
export type PaginatedResult<T> = { items: T[]; nextCursor: string | null };

const optStr = z.string().nullish().transform((v) => v ?? "");
const AdminOrderDetailSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  customerName: optStr,
  customerPhone: optStr,
  customerEmail: optStr,
  shippingAddress: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  subtotal: z.number(),
  shippingFee: z.number(),
  gstAmount: z.number(),
  total: z.number(),
  razorpayPaymentId: optStr,
  createdAt: z.string(),
  items: z.array(
    z.object({
      productName: z.string(),
      skuCode: optStr,
      variantLabel: optStr,
      imageUrl: optStr,
      unitPrice: z.number(),
      qty: z.number(),
      lineTotal: z.number(),
    }),
  ),
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;

const AdminOrderEventSchema = z.object({
  id: z.number(),
  eventType: z.string(),
  note: optStr,
  createdAt: z.string(),
});
const AdminOrderEventsSchema = z.object({ events: z.array(AdminOrderEventSchema) });
export type AdminOrderEvent = z.infer<typeof AdminOrderEventSchema>;

// Home config: the backend uses a discriminated-union section list with a nested
// `config` per key; the frontend composer uses a flat {sections, hero, promo,
// featured, categories} shape. These translate between the two.
const BeHomeSection = z.object({
  key: z.string(),
  enabled: z.boolean(),
  order: z.number(),
  config: z.record(z.string(), z.unknown()).default({}),
});
const BeHomeSchema = z.object({ sections: z.array(BeHomeSection) });

function cfgStr(c: Record<string, unknown>, k: string): string {
  return typeof c[k] === "string" ? (c[k] as string) : "";
}
function cfgIds(c: Record<string, unknown>, k: string): number[] {
  return Array.isArray(c[k]) ? (c[k] as number[]) : [];
}

function mapHomeFromBackend(be: z.infer<typeof BeHomeSchema>): HomeConfig {
  const byKey = new Map(be.sections.map((s) => [s.key, s.config]));
  const hero = byKey.get("hero") ?? {};
  const promo = byKey.get("promo") ?? {};
  const featured = byKey.get("featured") ?? {};
  const categories = byKey.get("categories") ?? {};
  return HomeConfigSchema.parse({
    sections: [...be.sections].sort((a, b) => a.order - b.order).map((s) => ({ key: s.key, enabled: s.enabled })),
    hero: {
      image: cfgStr(hero, "imageUrl"),
      title: cfgStr(hero, "title"),
      subtitle: cfgStr(hero, "subtitle"),
      ctaText: cfgStr(hero, "ctaText"),
      ctaLink: cfgStr(hero, "ctaHref"),
      showFrom: cfgStr(hero, "showFrom") || null,
      showTo: cfgStr(hero, "showTo") || null,
    },
    promo: {
      image: cfgStr(promo, "imageUrl"),
      title: cfgStr(promo, "headline"),
      subtitle: "",
      ctaText: cfgStr(promo, "ctaText"),
      ctaLink: cfgStr(promo, "ctaHref"),
      showFrom: null,
      showTo: null,
    },
    featured: { productIds: cfgIds(featured, "productIds") },
    categories: { categoryIds: cfgIds(categories, "categoryIds") },
  });
}

function mapHomeToBackend(c: HomeConfig) {
  return {
    sections: c.sections.map((s, i) => {
      const base = { key: s.key, enabled: s.enabled, order: i };
      switch (s.key) {
        case "hero":
          return {
            ...base,
            config: {
              imageUrl: c.hero.image,
              title: c.hero.title,
              subtitle: c.hero.subtitle,
              ctaText: c.hero.ctaText,
              ctaHref: c.hero.ctaLink,
              ...(c.hero.showFrom ? { showFrom: c.hero.showFrom } : {}),
              ...(c.hero.showTo ? { showTo: c.hero.showTo } : {}),
            },
          };
        case "promo":
          return {
            ...base,
            config: { imageUrl: c.promo.image, headline: c.promo.title, ctaText: c.promo.ctaText, ctaHref: c.promo.ctaLink },
          };
        case "categories":
          return { ...base, config: { categoryIds: c.categories.categoryIds } };
        case "featured":
          return { ...base, config: { productIds: c.featured.productIds } };
        default:
          return { ...base, config: {} }; // bestsellers, new — no editable config
      }
    }),
  };
}

/** Thrown on any non-2xx admin response; carries the parsed error code. */
export class AdminApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

interface ReqOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Validates the parsed JSON body. Omit for endpoints that return no body. */
  schema?: z.ZodType<T>;
  /** Set false for the login call (no token yet). */
  auth?: boolean;
}

async function req<T>(path: string, opts: ReqOptions<T> = {}): Promise<T> {
  const { method = "GET", body, schema, auth = true } = opts;

  // Hold the request until the MSW worker is intercepting (resolves instantly
  // when mocks are off or already ready) so on-mount fetches never escape.
  if (USE_MOCKS) await mocksReady;

  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAdminToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${getApiBase()}${path}`;
  logApiFetch("start", { method, url });

  const res = await fetch(url, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (res.status === 401) {
    // Session is dead/invalid — drop it so the layout redirects to /login.
    useAdminAuthStore.getState().clear();
  }

  if (!res.ok) {
    logApiFetch("http_error", { url, method, status: res.status, statusText: res.statusText });
    let code = res.statusText || "error";
    let message: string | undefined;
    try {
      const errBody = await res.json();
      code = errBody.error ?? code;
      message = errBody.message;
      const fieldErrors = errBody.issues?.fieldErrors as Record<string, string[]> | undefined;
      const firstField = fieldErrors && Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors![firstField]?.[0]) {
        message = `${firstField}: ${fieldErrors![firstField][0]}`;
      }
    } catch {
      /* non-JSON error body — keep the status text */
    }
    throw new AdminApiError(res.status, code, message);
  }

  if (!schema) return undefined as T;
  const json = await res.json();
  logApiFetch("response", { url, method, status: res.status });
  try {
    return schema.parse(json);
  } catch (err) {
    logApiFetch("parse_error", {
      url,
      method,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export interface ProductListParams {
  q?: string;
  status?: "active" | "draft" | "archived";
  flag?: "bestseller" | "new" | "featured";
  categoryTreeId?: number;
  cursor?: string;
  limit?: number;
}

function toProductQuery(params: ProductListParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.flag) sp.set("flag", params.flag);
  if (params.categoryTreeId != null) sp.set("categoryTreeId", String(params.categoryTreeId));
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.limit != null) sp.set("limit", String(params.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function mapAuditEntry(e: z.infer<typeof BeAuditEntrySchema>): AdminAuditEntry {
  return {
    id: e.id,
    actorEmail: e.actorEmail?.trim() || e.actorUserId || "system",
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    createdAt: e.createdAt,
    changes: e.changes ?? null,
  };
}

/**
 * Translate the admin editor's product shape into the backend create/patch payload.
 * The real API rejects empty slugs and bare image URL strings as "Invalid request".
 */
function mapProductPayloadToBackend(
  data: AdminProductCreate | AdminProductUpdate,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...data };

  if ("slug" in data) {
    const slug = data.slug?.trim();
    if (slug) body.slug = slug;
    else delete body.slug;
  }

  if (data.images !== undefined) {
    body.images = data.images.map((img, i) =>
      typeof img === "string" ? { url: img, sortOrder: i } : img,
    );
  }

  if (data.skus !== undefined) {
    body.skus = data.skus.map(
      ({ skuCode, price, salePrice, dimensionValues, attributes, stock }) => ({
        skuCode,
        price,
        salePrice,
        dimensionValues,
        attributes,
        stock,
      }),
    );
  }

  if (data.dimensions !== undefined) {
    body.dimensions = data.dimensions.map(({ name, sortOrder, values }) => ({
      name,
      sortOrder,
      values: values.map(({ value, label, sortOrder: vSort }) => ({
        value,
        label,
        sortOrder: vSort,
      })),
    }));
  }

  return body;
}

export const adminApi = {
  // ── Auth ──
  async login(email: string, password: string): Promise<AdminLoginResponse> {
    const res = await req("/admin/auth/login", {
      method: "POST",
      body: { email, password },
      schema: AdminLoginResponseSchema,
      auth: false,
    });
    useAdminAuthStore.getState().setSession(res.accessToken, res.admin);
    return res;
  },
  logout(): void {
    useAdminAuthStore.getState().clear();
  },
  /** Cheap authenticated ping used to validate a restored session on mount. */
  async validateSession(): Promise<boolean> {
    try {
      await req("/admin/settings", { schema: SettingsSchema });
      return true;
    } catch {
      return false;
    }
  },

  // ── Products ──
  listProductsPage(params: ProductListParams = {}): Promise<PaginatedResult<AdminListProduct>> {
    return req(`/admin/products${toProductQuery(params)}`, { schema: BeAdminProductList }).then(
      (r) => ({
        items: r.items.map(mapAdminProduct),
        nextCursor: r.nextCursor ?? null,
      }),
    );
  },
  /** Fetches every page matching the filters (for dashboard totals, pickers, etc.). */
  async listAllProducts(params: Omit<ProductListParams, "cursor" | "limit"> = {}): Promise<AdminListProduct[]> {
    const items: AdminListProduct[] = [];
    let cursor: string | null | undefined;
    for (;;) {
      const page = await this.listProductsPage({ ...params, cursor: cursor ?? undefined, limit: 100 });
      items.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return items;
  },
  listProducts(params: ProductListParams = {}): Promise<AdminListProduct[]> {
    return this.listAllProducts(params);
  },
  /** All non-archived products in a category subtree (paginates until exhausted). */
  async listProductsForCategoryTree(categoryTreeId: number): Promise<AdminListProduct[]> {
    const items: AdminListProduct[] = [];
    let cursor: string | null | undefined;
    for (;;) {
      const sp = new URLSearchParams();
      sp.set("categoryTreeId", String(categoryTreeId));
      sp.set("limit", "100");
      if (cursor) sp.set("cursor", cursor);
      const page = await req(`/admin/products?${sp}`, { schema: BeAdminProductList });
      items.push(...page.items.map(mapAdminProduct));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return items;
  },
  getProduct(id: number): Promise<Product> {
    return req(`/admin/products/${id}`, { schema: ProductSchema });
  },
  createProduct(data: AdminProductCreate): Promise<Product> {
    return req("/admin/products", {
      method: "POST",
      body: mapProductPayloadToBackend(data),
      schema: ProductSchema,
    });
  },
  updateProduct(id: number, patch: AdminProductUpdate): Promise<Product> {
    return req(`/admin/products/${id}`, {
      method: "PATCH",
      body: mapProductPayloadToBackend(patch),
      schema: ProductSchema,
    });
  },
  deleteProduct(id: number): Promise<void> {
    return req(`/admin/products/${id}`, { method: "DELETE" });
  },
  archiveProduct(id: number): Promise<void> {
    return req(`/admin/products/${id}/archive`, { method: "POST" });
  },
  restoreProduct(id: number): Promise<void> {
    return req(`/admin/products/${id}/restore`, { method: "POST" });
  },

  // ── Categories ──
  listCategories(): Promise<Category[]> {
    return req("/admin/categories", { schema: AdminCategoryListSchema });
  },
  createCategory(data: AdminCategoryCreate): Promise<Category> {
    return req("/admin/categories", { method: "POST", body: data, schema: CategorySchema });
  },
  updateCategory(id: number, patch: AdminCategoryUpdate): Promise<Category> {
    return req(`/admin/categories/${id}`, { method: "PATCH", body: patch, schema: CategorySchema });
  },
  deleteCategory(id: number): Promise<void> {
    return req(`/admin/categories/${id}`, { method: "DELETE" });
  },
  archiveCategory(id: number): Promise<void> {
    return req(`/admin/categories/${id}/archive`, { method: "POST" });
  },
  restoreCategory(id: number): Promise<void> {
    return req(`/admin/categories/${id}/restore`, { method: "POST" });
  },

  // ── Home composer ── (translates the backend's discriminated-union layout)
  getHome(): Promise<HomeConfig> {
    return req("/admin/home", { schema: BeHomeSchema }).then(mapHomeFromBackend);
  },
  putHome(config: HomeConfig): Promise<HomeConfig> {
    return req("/admin/home", { method: "PUT", body: mapHomeToBackend(config), schema: BeHomeSchema }).then(
      mapHomeFromBackend,
    );
  },

  // ── Settings ──
  getSettings(): Promise<Settings> {
    return req("/admin/settings", { schema: SettingsSchema });
  },
  updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return req("/admin/settings", { method: "PATCH", body: patch, schema: SettingsSchema });
  },

  // ── Orders ──
  listOrders(status?: string, q?: string): Promise<AdminOrderItem[]> {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (q?.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    return req(`/admin/orders${qs ? `?${qs}` : ""}`, { schema: AdminOrderListSchema }).then((r) => r.items);
  },
  getOrder(id: string): Promise<AdminOrderDetail> {
    return req(`/admin/orders/${id}`, { schema: AdminOrderDetailSchema });
  },
  getOrderEvents(id: string): Promise<AdminOrderEvent[]> {
    return req(`/admin/orders/${id}/events`, { schema: AdminOrderEventsSchema }).then((r) => r.events);
  },
  /**
   * Append a tracking event; status-type events advance the order status.
   * `occurredAt` (ISO string) backdates/forward-dates when the step happened —
   * omit to use the server's "now".
   */
  addOrderEvent(
    orderId: string,
    eventType: string,
    opts: { note?: string; occurredAt?: string } = {},
  ): Promise<void> {
    return req(`/admin/orders/${orderId}/events`, {
      method: "POST",
      body: {
        eventType,
        ...(opts.note ? { note: opts.note } : {}),
        ...(opts.occurredAt ? { occurredAt: opts.occurredAt } : {}),
      },
    });
  },

  // ── Uploads ──
  async uploadImage(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await req("/admin/uploads", {
      method: "POST",
      body: form,
      schema: UploadResultSchema,
    });
    return res.url;
  },

  // ── Audit log ──
  listAuditLog(params: AdminAuditListParams = {}): Promise<PaginatedResult<AdminAuditEntry>> {
    const sp = new URLSearchParams();
    if (params.cursor) sp.set("cursor", params.cursor);
    if (params.resource_type) sp.set("resource_type", params.resource_type);
    if (params.actor_user_id) sp.set("actor_user_id", params.actor_user_id);
    const qs = sp.toString();
    return req(`/admin/audit-log${qs ? `?${qs}` : ""}`, { schema: BeAuditListSchema }).then((r) => ({
      items: r.items.map(mapAuditEntry),
      nextCursor: r.nextCursor ?? null,
    }));
  },
};
