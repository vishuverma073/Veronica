import { z } from "zod";
import { getApiBase, USE_MOCKS } from "@/lib/api-config";
import { logApiFetch } from "@/lib/api-debug";
import { mocksReady } from "@/lib/mocks-ready";
import { resolveNavbarRoots } from "@/lib/navbar-categories";
import { buildHeaderNavTree } from "@/lib/category-tree";
import { buildShopNavTree } from "@/lib/shop-nav";
import { logShopNav } from "@/lib/shop-nav-debug";
import {
  CategoryListSchema,
  CategoryWithBreadcrumbSchema,
  ProductSchema,
  ProductListItemSchema,
  AuthSessionSchema,
  UserSchema,
  AddressSchema,
  AddressListSchema,
  PincodeLookupSchema,
  paginated,
  type Category,
  type CategoryWithBreadcrumb,
  type Product,
  type ProductListItem,
  type AuthSession,
  type User,
  type Cart,
  type AddCartItem,
  type Address,
  type AddressInput,
  type AddressUpdate,
  type Order,
  type OrderPage,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type VerifyOrderRequest,
  type PincodeLookup,
} from "@veronica/contracts";
import { type RawTrackingEvent } from "@/lib/order-tracking";
import { useAuthStore, getAccessToken } from "@/store/authStore";

const ProductPageSchema = paginated(ProductListItemSchema);
export type ProductPage = z.infer<typeof ProductPageSchema>;

const CategoryProductPageSchema = ProductPageSchema.extend({
  total: z.number().int().nonnegative().optional(),
});
export type CategoryProductPage = z.infer<typeof CategoryProductPageSchema>;

const VisitsSchema = z.object({ total: z.number() });

const StoreSettingsSchema = z.object({
  storeName: z.string(),
  supportPhone: z.string(),
  supportEmail: z.string(),
  gstRate: z.number(),
  shippingFreeAbove: z.number(),
  shippingFlatFee: z.number(),
  whatsappNumber: z.string(),
});
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

// ── Storefront home config (admin-composed) ──────────────────────────
// The public /home endpoint returns only enabled sections, already sorted &
// schedule-filtered, in the backend's discriminated-union shape. We flatten it
// into a convenient shape for the homepage to consume.
export type HomeSectionKey = "hero" | "categories" | "bestsellers" | "new" | "featured" | "promo";

const HomeWireSchema = z.object({
  sections: z.array(
    z.object({
      key: z.enum(["hero", "categories", "bestsellers", "new", "featured", "promo"]),
      enabled: z.boolean(),
      order: z.number(),
      config: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
});

export interface HomeBanner {
  image: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
}
/** A header category with nested dropdown children (any depth). */
export interface NavCategory extends Category {
  children: NavCategory[];
}

/** Shop mega menu payload — full tree + featured ids from home composer. */
export interface ShopNavData {
  tree: NavCategory[];
  featuredIds: number[];
  flatCount: number;
  usedFallback: boolean;
  fetchWarning?: string;
}

export interface StoreHome {
  /** Enabled section keys, in display order. */
  order: HomeSectionKey[];
  hero: HomeBanner;
  promo: HomeBanner;
  featured: number[];
  categories: number[];
}

const homeStr = (c: Record<string, unknown>, k: string) =>
  typeof c[k] === "string" ? (c[k] as string) : "";
const homeImage = (c: Record<string, unknown>, k: string) => {
  const raw = typeof c[k] === "string" ? (c[k] as string) : "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
};
const homeIds = (c: Record<string, unknown>, k: string) =>
  Array.isArray(c[k]) ? (c[k] as unknown[]).filter((n): n is number => typeof n === "number") : [];

export interface ListProductsParams {
  category?: string;
  bestseller?: boolean;
  new?: boolean;
  featured?: boolean;
  q?: string;
  limit?: number;
  cursor?: number;
}

/**
 * Typed client for the Veronica API.
 *
 * Every method fetches `${API_BASE}/<path>` and validates the response against
 * a contracts schema before returning, so a shape mismatch fails loudly here
 * rather than surfacing as a confusing render bug downstream.
 *
 * In dev with NEXT_PUBLIC_USE_MOCKS=true these requests are intercepted by MSW
 * (browser worker for client components, node server for Server Components).
 * In prod they hit NEXT_PUBLIC_API_URL for real.
 *
 * Phase 0 ships only `getCategories()`; Phase 2 extends this with the rest of
 * the storefront read paths and Phase 1 adds the admin methods.
 */

interface FetchOptions {
  /** Next.js fetch cache controls (Server Components only). */
  next?: { revalidate?: number; tags?: string[] };
  /** Fetch cache mode, e.g. "no-store" to always read fresh (admin-edited data). */
  cache?: RequestCache;
  /** Validates the parsed JSON body. */
  schema: z.ZodType<unknown>;
}

async function apiFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  // On the client, hold until the MSW worker is intercepting (resolves
  // instantly on the server, where the node MSW server is already listening,
  // and when mocks are off). Prevents on-mount client fetches from escaping.
  if (USE_MOCKS) await mocksReady;

  const url = `${getApiBase()}${path}`;
  logApiFetch("start", { method: "GET", url });
  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {};
  if (opts.cache) init.cache = opts.cache;
  else if (opts.next) init.next = opts.next;
  const res = await fetch(url, init);

  if (!res.ok) {
    logApiFetch("http_error", { url, status: res.status, statusText: res.statusText });
    throw new Error(
      `Backend request failed: GET ${url} → ${res.status} ${res.statusText}`,
    );
  }

  const body = await res.json();
  logApiFetch("response", { url, status: res.status });
  try {
    return opts.schema.parse(body) as T;
  } catch (err) {
    logApiFetch("parse_error", {
      url,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function buildProductQuery(params: ListProductsParams): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.bestseller) sp.set("bestseller", "1");
  if (params.new) sp.set("new", "1");
  if (params.featured) sp.set("featured", "1");
  if (params.q) sp.set("q", params.q);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.cursor != null) sp.set("cursor", String(params.cursor));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Auth helpers ──────────────────────────────────────────────────────────
//
// Real auth: short-lived access token in memory + httpOnly refresh cookie
// (sent via credentials:"include"). Mocks can't set a cross-origin httpOnly
// cookie, so the client keeps a localStorage marker (the phone) as a stand-in
// and replays it to /auth/refresh. Dropping the marker = real-API behaviour.
const MOCK_REFRESH_MARKER = "veronica-mock-refresh";

function writeMarker(phone: string) {
  if (typeof window !== "undefined") localStorage.setItem(MOCK_REFRESH_MARKER, phone);
}
function readMarker(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(MOCK_REFRESH_MARKER) : null;
}
function clearMarker() {
  if (typeof window !== "undefined") localStorage.removeItem(MOCK_REFRESH_MARKER);
}

async function postJson<T>(path: string, body: unknown, schema?: z.ZodType<T>): Promise<T> {
  if (USE_MOCKS) await mocksReady;
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store", // auth flows must never be cached at the data layer
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new BackendAuthError(res.status, err.error ?? res.statusText);
  }
  const json = res.status === 204 ? null : await res.json();
  return (schema ? schema.parse(json) : json) as T;
}

export class BackendAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = "BackendAuthError";
    this.status = status;
    this.code = code;
  }
}

// Dedup concurrent refreshes: if several requests 401 at once, they all await the
// SAME in-flight refresh instead of each firing one (a refresh stampede that can
// rotate the token out from under the others).
let refreshInFlight: Promise<boolean> | null = null;

/** Attempt silent refresh. Returns true if a session was (re)established. */
function doRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      // Mock replays the marker as `phone`; real backend ignores it and uses the cookie.
      const body = USE_MOCKS ? { phone: readMarker() } : {};
      if (USE_MOCKS && !readMarker()) {
        useAuthStore.getState().setStatus("unauthenticated");
        return false;
      }
      const session = await postJson("/auth/refresh", body, AuthSessionSchema);
      useAuthStore.getState().setAuth(session.accessToken, session.user);
      return true;
    } catch {
      useAuthStore.getState().clearAuth();
      clearMarker();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Authenticated fetch: Bearer token, one refresh-and-retry on 401. */
async function authedFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; schema?: z.ZodType<T> } = {},
): Promise<T> {
  if (USE_MOCKS) await mocksReady;
  const { method = "GET", body, schema } = opts;

  const run = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store", // per-user data (cart/orders/profile) is never cached
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await run();
  if (res.status === 401 && (await doRefresh())) {
    res = await run(); // retry once with the refreshed token
    if (res.status === 401) {
      // Refresh succeeded but the fresh token is still rejected (revoked/expired
      // server-side) — drop the session so the app routes to login instead of
      // looping with a dead token.
      useAuthStore.getState().clearAuth();
      clearMarker();
    }
  }
  if (!res.ok) {
    throw new BackendAuthError(res.status, res.statusText || "request_failed");
  }
  const json = res.status === 204 ? null : await res.json();
  return (schema ? schema.parse(json) : json) as T;
}

// ── Anti-corruption mappers ─────────────────────────────────────────────────
// The deployed API (veronica-api-) and this storefront grew slightly different
// contracts — different field names on cart/order lines, and a couple of fields
// the API doesn't carry. These helpers translate the API's wire shapes into the
// frontend contract shapes the components expect, so the rest of the app is
// unchanged. (Addresses already match, so they pass through untouched.)

interface BeCartItem {
  id: number;
  skuId: number;
  productName: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  slug?: string;
}
interface BeCart {
  items: BeCartItem[];
  subtotal: number;
  itemCount: number;
}
function mapCart(be: BeCart): Cart {
  return {
    items: (be?.items ?? []).map((i) => ({
      id: i.id,
      skuId: i.skuId,
      name: i.productName,
      slug: i.slug ?? "",
      price: i.unitPrice,
      image: i.imageUrl ?? "",
      variant: i.variantLabel ?? undefined,
      qty: i.qty,
    })),
  };
}

const ORDER_STATUS_MAP: Record<string, Order["status"]> = {
  pending: "created",
  created: "created",
  placed: "created", // backend logs the first timeline event as "placed"
  paid: "paid",
  confirmed: "paid",
  shipped: "shipped",
  out_for_delivery: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "cancelled",
  failed: "failed",
};
function mapStatus(s: string): Order["status"] {
  return ORDER_STATUS_MAP[s] ?? "created";
}

type BeShippingAddress = {
  id?: number;
  label?: string;
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  isDefault?: boolean;
};
function mapAddress(a: BeShippingAddress | null | undefined): Address {
  const label = a?.label && ["Home", "Office", "Other"].includes(a.label) ? a.label : "Home";
  return {
    id: typeof a?.id === "number" ? a.id : 0,
    label: label as Address["label"],
    fullName: a?.fullName || "Customer",
    phone: a?.phone || "0000000000",
    line1: a?.line1 ?? "",
    line2: a?.line2 ?? "",
    city: a?.city ?? "",
    state: (a?.state ?? "Maharashtra") as Address["state"],
    pincode: a?.pincode ?? "000000",
    landmark: a?.landmark ?? "",
    isDefault: Boolean(a?.isDefault),
  };
}

interface BeOrderLine {
  productName: string;
  skuCode: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}
interface BeOrderDetail {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
  subtotal: number;
  shippingFee: number;
  gstAmount: number;
  shippingAddress: BeShippingAddress;
  items: BeOrderLine[];
  razorpayPaymentId: string | null;
}
function mapOrder(o: BeOrderDetail): Order {
  return {
    id: 0, // API order ids are UUIDs; the storefront keys orders by orderNumber
    orderNumber: o.orderNumber,
    status: mapStatus(o.status),
    items: (o.items ?? []).map((it) => ({
      skuId: 0,
      name: it.productName,
      slug: "",
      image: it.imageUrl ?? "",
      variant: it.variantLabel ?? undefined,
      qty: it.qty,
      price: it.unitPrice,
    })),
    totals: {
      subtotal: o.subtotal,
      shippingFee: o.shippingFee,
      gstIncluded: o.gstAmount,
      total: o.total,
    },
    address: mapAddress(o.shippingAddress),
    paymentId: o.razorpayPaymentId ?? null,
    notes: "",
    createdAt: o.createdAt,
  };
}

interface BeOrderEvent {
  eventType: string;
  note: string | null;
  createdAt: string;
}
/** Preserve the backend's granular event types for the tracking timeline. */
function mapEvents(be: { events: BeOrderEvent[] }): RawTrackingEvent[] {
  return (be?.events ?? []).map((e) =>
    e.note
      ? { eventType: e.eventType, at: e.createdAt, note: e.note }
      : { eventType: e.eventType, at: e.createdAt },
  );
}

export const backend = {
  /**
   * Root categories for the storefront. Always returned alphabetically by name
   * — categories should display A→Z everywhere they're shown (nav, footer,
   * homepage, sidebar). Sorting here keeps that consistent for every consumer.
   */
  getCategories(opts?: { fresh?: boolean }): Promise<Category[]> {
    return apiFetch<Category[]>("/categories", {
      schema: CategoryListSchema,
      ...(opts?.fresh || typeof window !== "undefined"
        ? { cache: "no-store" as const }
        : { next: { revalidate: 3600, tags: ["categories"] } }),
    }).then((cats) =>
      [...cats].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    );
  },

  /** Every active category (flat). Used to build nested nav trees without N+1 fetches. */
  getAllCategories(opts?: { fresh?: boolean }): Promise<Category[]> {
    return apiFetch<Category[]>("/categories/all", {
      schema: CategoryListSchema,
      ...(opts?.fresh || typeof window !== "undefined"
        ? { cache: "no-store" as const }
        : { next: { revalidate: 3600, tags: ["categories"] } }),
    });
  },

  /**
   * Store header nav: root buttons come from the home composer's category
   * showcase. Dropdown items are nested recursively via showInHeader flags.
   * @deprecated Prefer getShopNav() for the Shop mega menu.
   */
  async getNavbar(): Promise<NavCategory[]> {
    const [allCategories, home] = await Promise.all([
      backend.getAllCategories({ fresh: true }),
      backend.getHome().catch(() => null),
    ]);
    const roots = resolveNavbarRoots(
      allCategories.filter((c) => c.parentId === null),
      home?.categories ?? [],
    );
    return buildHeaderNavTree(allCategories, roots.map((r) => r.id));
  },

  /**
   * Shop mega menu: full category tree (unlimited depth) plus home-composer
   * featured category ids. New admin categories appear automatically.
   * Falls back to root-only `/categories` if `/categories/all` fails.
   */
  async getShopNav(): Promise<ShopNavData> {
    let flat: Category[] = [];
    let usedFallback = false;
    let fetchWarning: string | undefined;

    try {
      flat = await backend.getAllCategories({ fresh: true });
      logShopNav("GET /categories/all ok", { count: flat.length });
    } catch (err) {
      logShopNav("GET /categories/all failed", err);
      fetchWarning = err instanceof Error ? err.message : "Failed to load full category list";
      try {
        flat = await backend.getCategories({ fresh: true });
        usedFallback = true;
        logShopNav("GET /categories fallback ok", { count: flat.length });
      } catch (fallbackErr) {
        logShopNav("GET /categories fallback failed", fallbackErr);
        throw fallbackErr;
      }
    }

    const home = await backend.getHome().catch((err) => {
      logShopNav("GET /home failed (non-fatal)", err);
      return null;
    });

    const tree = buildShopNavTree(flat);
    logShopNav("tree built", {
      flat: flat.length,
      roots: tree.length,
      nested: flat.length - tree.length,
      usedFallback,
    });

    return {
      tree,
      featuredIds: home?.categories ?? [],
      flatCount: flat.length,
      usedFallback,
      fetchWarning,
    };
  },

  /** Admin-composed storefront home config (enabled sections, in order).
   * Read fresh (no-store) so an admin's saved Home changes show on the store
   * immediately — otherwise the data cache could serve a stale layout for
   * minutes after a save. (Same rationale as getStoreSettings.) */
  getHome(): Promise<StoreHome> {
    return apiFetch<z.infer<typeof HomeWireSchema>>("/home", {
      schema: HomeWireSchema,
      cache: "no-store",
    }).then((wire) => {
      const byKey = new Map(wire.sections.map((s) => [s.key, s.config]));
      const hero = byKey.get("hero") ?? {};
      const promo = byKey.get("promo") ?? {};
      const featured = byKey.get("featured") ?? {};
      const categories = byKey.get("categories") ?? {};
      return {
        order: wire.sections.map((s) => s.key),
        hero: {
          image: homeImage(hero, "imageUrl"),
          title: homeStr(hero, "title"),
          subtitle: homeStr(hero, "subtitle"),
          ctaText: homeStr(hero, "ctaText"),
          ctaLink: homeStr(hero, "ctaHref"),
        },
        promo: {
          image: homeImage(promo, "imageUrl"),
          title: homeStr(promo, "headline"),
          subtitle: "",
          ctaText: homeStr(promo, "ctaText"),
          ctaLink: homeStr(promo, "ctaHref"),
        },
        featured: homeIds(featured, "productIds"),
        categories: homeIds(categories, "categoryIds"),
      };
    });
  },

  /** A category enriched with its direct children + breadcrumb trail. */
  getCategoryBySlug(slug: string, opts?: { fresh?: boolean }): Promise<CategoryWithBreadcrumb> {
    return apiFetch<CategoryWithBreadcrumb>(`/categories/${slug}`, {
      schema: CategoryWithBreadcrumbSchema,
      ...(opts?.fresh || typeof window !== "undefined"
        ? { cache: "no-store" as const }
        : { next: { revalidate: 3600, tags: ["categories", `category-${slug}`] } }),
    });
  },

  /**
   * Category by numeric id (PDP needs the category of a product it only knows by
   * id). Coordination item: prefer slug-based lookups once the real API lands.
   */
  getCategoryById(id: number): Promise<CategoryWithBreadcrumb> {
    return apiFetch<CategoryWithBreadcrumb>(`/categories/by-id/${id}`, {
      schema: CategoryWithBreadcrumbSchema,
      next: { revalidate: 3600, tags: ["categories", `category-id-${id}`] },
    });
  },

  /** Cursor-paginated light product list (grids/carousels/search). */
  listProducts(params: ListProductsParams = {}): Promise<ProductPage> {
    // Per-category product lists get a `category-products-<slug>` tag so the
    // backend can bust just that category after a product moves/changes.
    const tags = ["products", ...(params.category ? [`category-products-${params.category}`] : [])];
    return apiFetch<ProductPage>(`/products${buildProductQuery(params)}`, {
      schema: ProductPageSchema,
      next: { revalidate: 600, tags },
    });
  },

  /** Products within a category subtree (recursive), cursor-paginated. */
  listProductsByCategory(
    slug: string,
    params: { limit?: number; cursor?: number | null } = {},
  ): Promise<CategoryProductPage> {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.cursor != null) q.set("cursor", String(params.cursor));
    const qs = q.toString();
    return apiFetch<CategoryProductPage>(
      `/products/by-category/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`,
      {
        schema: CategoryProductPageSchema,
        next: { revalidate: 600, tags: ["products", `category-products-${slug}`] },
      },
    );
  },

  /** Products within a category subtree (recursive). */
  getProductsByCategory(slug: string, limit = 24): Promise<ProductListItem[]> {
    return this.listProductsByCategory(slug, { limit }).then((r) => r.items);
  },

  /** Full product detail for the PDP. */
  getProductBySlug(slug: string): Promise<Product> {
    return apiFetch<Product>(`/products/${slug}`, {
      schema: ProductSchema,
      next: { revalidate: 3600, tags: [`product-${slug}`] },
    });
  },

  /** Free-text product search via the dedicated full-text endpoint (ranks by
   * name/description/category relevance) — NOT the catalog list, which doesn't
   * filter by `q`. */
  searchProducts(q: string, limit = 24): Promise<ProductListItem[]> {
    const term = q.trim();
    if (!term) return Promise.resolve([]);
    return apiFetch<ProductPage>(`/search?q=${encodeURIComponent(term)}`, {
      schema: ProductPageSchema,
      next: { revalidate: 60, tags: ["products"] },
    }).then((r) => r.items.slice(0, limit));
  },

  // ── Auth (Phase 3) ──
  /** Request an OTP for a phone (E.164, e.g. +919350529717). */
  sendOtp(phone: string): Promise<{ sent: boolean }> {
    return postJson("/auth/otp/send", { phone });
  },

  /** Verify the OTP; on success sets the session + persists the refresh marker. */
  async verifyOtp(phone: string, code: string): Promise<AuthSession> {
    const session = await postJson("/auth/otp/verify", { phone, code }, AuthSessionSchema);
    useAuthStore.getState().setAuth(session.accessToken, session.user);
    writeMarker(phone);
    return session;
  },

  /** Silent refresh on app load (restores the in-memory access token). */
  refresh(): Promise<boolean> {
    return doRefresh();
  },

  /** End the session everywhere. */
  async logout(): Promise<void> {
    try {
      await postJson("/auth/logout", {});
    } finally {
      useAuthStore.getState().clearAuth();
      clearMarker();
    }
  },

  getMe(): Promise<User> {
    return authedFetch("/me", { schema: UserSchema });
  },
  updateMe(patch: { name?: string; email?: string }): Promise<User> {
    return authedFetch("/me", { method: "PATCH", body: patch, schema: UserSchema });
  },

  // ── Cart (Phase 3, authenticated) ──
  getCart(): Promise<Cart> {
    return authedFetch<BeCart>("/me/cart").then(mapCart);
  },
  addCartItem(item: AddCartItem): Promise<Cart> {
    return authedFetch<BeCart>("/me/cart/items", { method: "POST", body: item }).then(mapCart);
  },
  updateCartItem(id: number, qty: number): Promise<Cart> {
    return authedFetch<BeCart>(`/me/cart/items/${id}`, { method: "PATCH", body: { qty } }).then(mapCart);
  },
  removeCartItem(id: number): Promise<Cart> {
    return authedFetch<BeCart>(`/me/cart/items/${id}`, { method: "DELETE" }).then(mapCart);
  },

  // ── Addresses (Phase 4) ──
  listAddresses(): Promise<Address[]> {
    return authedFetch("/me/addresses", { schema: AddressListSchema });
  },
  createAddress(input: AddressInput): Promise<Address> {
    return authedFetch("/me/addresses", { method: "POST", body: input, schema: AddressSchema });
  },
  updateAddress(id: number, patch: AddressUpdate): Promise<Address> {
    return authedFetch(`/me/addresses/${id}`, { method: "PATCH", body: patch, schema: AddressSchema });
  },
  removeAddress(id: number): Promise<void> {
    return authedFetch(`/me/addresses/${id}`, { method: "DELETE" });
  },

  // ── Checkout + orders (Phase 4) ──
  /** Create a pending order + Razorpay order id from the server cart. */
  createOrder(payload: CreateOrderRequest): Promise<CreateOrderResponse> {
    return authedFetch<{ orderNumber: string; razorpayOrderId: string; razorpayKeyId: string; amount: number }>(
      "/checkout/order",
      { method: "POST", body: payload },
    ).then((r) => ({
      orderNumber: r.orderNumber,
      razorpayOrderId: r.razorpayOrderId,
      razorpayKeyId: r.razorpayKeyId,
      amount: r.amount / 100, // API returns paise; the storefront works in rupees
    }));
  },
  /** Confirm the Razorpay signature. Returns the order number to route to. */
  async verifyOrder(payload: VerifyOrderRequest): Promise<{ orderNumber: string }> {
    const r = await authedFetch<{ ok: boolean; orderNumber: string }>("/checkout/verify", {
      method: "POST",
      body: payload,
    });
    return { orderNumber: r.orderNumber };
  },
  /**
   * Re-initiate payment for an existing unpaid order (the customer's earlier
   * attempt failed/was dismissed). Returns a fresh Razorpay order to open; the
   * normal `verifyOrder` then confirms it. Amount is returned in paise.
   */
  retryPayment(orderNumber: string): Promise<CreateOrderResponse> {
    return authedFetch<{ orderNumber: string; razorpayOrderId: string; razorpayKeyId: string; amount: number }>(
      `/checkout/order/${orderNumber}/pay`,
      { method: "POST" },
    ).then((r) => ({
      orderNumber: r.orderNumber,
      razorpayOrderId: r.razorpayOrderId,
      razorpayKeyId: r.razorpayKeyId,
      amount: r.amount / 100,
    }));
  },
  // Note: the API paginates orders by an ISO-date cursor, not the numeric cursor
  // the storefront uses, so we serve the first page and don't expose "load more".
  getOrders(_cursor?: number): Promise<OrderPage> {
    return authedFetch<{
      items: Array<{ orderNumber: string; total: number; status: string; itemCount: number; createdAt: string }>;
    }>("/me/orders").then((r) => ({
      // Show every order INCLUDING unpaid ones (API status "pending" →
      // storefront "created") so a customer whose payment failed can find the
      // order and retry payment from their history.
      items: (r.items ?? [])
        .map((o, idx) => ({
          id: idx + 1,
          orderNumber: o.orderNumber,
          status: mapStatus(o.status),
          total: o.total,
          itemCount: o.itemCount,
          firstItemImage: "",
          createdAt: o.createdAt,
        })),
      nextCursor: null,
    }));
  },
  getOrder(orderNumber: string): Promise<Order> {
    return authedFetch<BeOrderDetail>(`/me/orders/${orderNumber}`).then(mapOrder);
  },
  /** Tracking timeline for an order (raw backend events, granular). */
  getOrderEvents(orderNumber: string): Promise<RawTrackingEvent[]> {
    return authedFetch<{ events: BeOrderEvent[] }>(`/me/orders/${orderNumber}/events`).then(mapEvents);
  },

  // ── Store settings (public; pricing knobs + contact info) ──
  async getStoreSettings(): Promise<StoreSettings> {
    // no-store so admin changes to shipping/GST show up immediately (the API
    // sends a 1h cache header otherwise). Used by client components (cart/checkout).
    const res = await fetch(`${getApiBase()}/settings`, { cache: "no-store" });
    if (!res.ok) throw new Error("settings_failed");
    return StoreSettingsSchema.parse(await res.json());
  },
  /** Server-component variant (footer): cached briefly so it doesn't force the
   * whole page dynamic, but still picks up admin changes within a few minutes. */
  getPublicSettings(): Promise<StoreSettings> {
    return apiFetch("/settings", { schema: StoreSettingsSchema, next: { revalidate: 120, tags: ["settings"] } });
  },

  // ── Site metrics (public) ──
  /** Lifetime visit total (read-only). */
  getVisits(): Promise<{ total: number }> {
    return apiFetch("/metrics/visits", { schema: VisitsSchema });
  },
  /** Count a visit (call once per browser session); returns the new total. */
  recordVisit(): Promise<{ total: number }> {
    return postJson("/metrics/visits", {}, VisitsSchema);
  },

  // ── Pincode autofill (Phase 6, public) ──
  lookupPincode(pincode: string): Promise<PincodeLookup> {
    return apiFetch<PincodeLookup>(`/pincode/${pincode}`, {
      schema: PincodeLookupSchema,
      next: { revalidate: 86400, tags: ["pincode"] },
    });
  },
};
