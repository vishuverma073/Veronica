import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Cart, ServerCartItem } from "@veronica/contracts";
import { backend } from "@/lib/backend";
import { useAuthStore } from "@/store/authStore";
import { isPurchasable, maxPurchasableQty } from "@/lib/stock";
import { toast } from "sonner";

export interface CartItem {
    id: number;          // SKU id (the merge key with the server)
    cartKey: string;     // unique local key: "id" or "id-variant"
    serverId?: number;   // server line-item id, once synced (logged-in only)
    name: string;
    slug: string;
    price: number;
    image: string;
    variant?: string;
    qty: number;
    /** null/undefined = stock not tracked */
    stock?: number | null;
}

interface CartState {
    items: CartItem[];

    // Actions
    addItem: (item: Omit<CartItem, "qty" | "cartKey" | "serverId"> & { variant?: string }) => void;
    removeItem: (cartKey: string) => void;
    updateQty: (cartKey: string, qty: number) => void;
    clearCart: () => void;
    /** Empty the cart everywhere (local + the signed-in user's server cart). */
    emptyCart: () => void;
    /** Merge the guest cart into the server cart on login, then mirror the server. */
    syncWithServer: () => Promise<void>;

    // Computed
    totalItems: () => number;
    totalAmount: () => number;
}

function makeCartKey(id: number, variant?: string): string {
    return variant ? `${id}-${variant}` : `${id}`;
}

function toLocal(item: ServerCartItem): CartItem {
    return {
        id: item.skuId,
        cartKey: makeCartKey(item.skuId, item.variant),
        serverId: item.id,
        name: item.name,
        slug: item.slug,
        price: item.price,
        image: item.image,
        variant: item.variant,
        qty: item.qty,
    };
}

const isAuthed = () => useAuthStore.getState().status === "authenticated";

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => {
            // Replace local items with the authoritative server cart (keeps serverIds).
            const reconcile = (cart: Cart) => set({ items: cart.items.map(toLocal) });

            return {
                items: [],

                addItem: (item) => {
                    if (!isPurchasable(item.stock)) {
                        toast.error("This item is out of stock");
                        return;
                    }
                    const cartKey = makeCartKey(item.id, item.variant);
                    const max = maxPurchasableQty(item.stock);
                    set((state) => {
                        const existing = state.items.find((i) => i.cartKey === cartKey);
                        if (existing) {
                            const nextQty = existing.qty + 1;
                            if (max != null && nextQty > max) {
                                toast.error(`Only ${max} available in stock`);
                                return state;
                            }
                            return {
                                items: state.items.map((i) =>
                                    i.cartKey === cartKey ? { ...i, qty: nextQty, stock: item.stock ?? i.stock } : i,
                                ),
                            };
                        }
                        return { items: [...state.items, { ...item, cartKey, qty: 1 }] };
                    });
                    if (isAuthed()) {
                        backend
                            .addCartItem({
                                skuId: item.id,
                                qty: 1,
                                name: item.name,
                                slug: item.slug,
                                price: item.price,
                                image: item.image,
                                variant: item.variant,
                            })
                            .then(reconcile)
                            .catch(() => { /* optimistic: keep local state */ });
                    }
                },

                removeItem: (cartKey) => {
                    const target = get().items.find((i) => i.cartKey === cartKey);
                    set((state) => ({ items: state.items.filter((i) => i.cartKey !== cartKey) }));
                    if (isAuthed() && target?.serverId) {
                        backend.removeCartItem(target.serverId).then(reconcile).catch(() => {});
                    }
                },

                updateQty: (cartKey, qty) => {
                    const target = get().items.find((i) => i.cartKey === cartKey);
                    const max = maxPurchasableQty(target?.stock);
                    if (qty > 0 && max != null && qty > max) {
                        toast.error(`Only ${max} available in stock`);
                        qty = max;
                        if (qty <= 0) return;
                    }
                    set((state) => {
                        if (qty <= 0) {
                            return { items: state.items.filter((i) => i.cartKey !== cartKey) };
                        }
                        return {
                            items: state.items.map((i) => (i.cartKey === cartKey ? { ...i, qty } : i)),
                        };
                    });
                    if (isAuthed()) {
                        if (target?.serverId) {
                            const op =
                                qty <= 0
                                    ? backend.removeCartItem(target.serverId)
                                    : backend.updateCartItem(target.serverId, qty);
                            op.then(reconcile).catch(() => {});
                        } else if (qty > 0) {
                            // No server line id yet (e.g. just after a reload, before the
                            // cart re-synced) — reconcile so the new quantity still reaches
                            // the server. Otherwise the server keeps the old qty and the
                            // order would be created for the wrong amount.
                            get().syncWithServer().catch(() => {});
                        }
                    }
                },

                clearCart: () => set({ items: [] }),

                emptyCart: () => {
                    const current = get().items;
                    set({ items: [] });
                    // Best-effort: also clear the signed-in user's server cart so it
                    // doesn't repopulate on the next sync.
                    if (isAuthed()) {
                        for (const i of current) {
                            if (i.serverId) backend.removeCartItem(i.serverId).catch(() => {});
                        }
                    }
                },

                syncWithServer: async () => {
                    if (!isAuthed()) return;
                    // Reconcile local (guest/persisted) items against the server cart.
                    // Read the server first, then push only items it doesn't already
                    // have (matched by SKU + variant). This avoids double-counting
                    // items the server already holds AND avoids wiping the local cart
                    // when the server starts empty (e.g. after a reload) — we restore
                    // it instead of mirroring an empty server.
                    const current = await backend.getCart().catch(() => null);
                    const serverItems = current?.items ?? [];
                    const matchOnServer = (li: CartItem) =>
                        serverItems.find((s) => s.skuId === li.id && s.variant === li.variant);

                    for (const li of get().items) {
                        const match = matchOnServer(li);
                        if (!match) {
                            // Not on the server yet → add with the local quantity.
                            await backend
                                .addCartItem({
                                    skuId: li.id,
                                    qty: li.qty,
                                    name: li.name,
                                    slug: li.slug,
                                    price: li.price,
                                    image: li.image,
                                    variant: li.variant,
                                })
                                .catch(() => {});
                        } else if (match.qty !== li.qty) {
                            // On the server but the local quantity is what the shopper sees and
                            // edited — push it up so the server (and the order built from it)
                            // matches the cart. Without this, a qty changed offline/pre-sync
                            // would be silently lost server-side.
                            await backend.updateCartItem(match.id, li.qty).catch(() => {});
                        }
                    }
                    // …then mirror the authoritative merged server cart.
                    const merged = await backend.getCart().catch(() => null);
                    if (merged) reconcile(merged);
                },

                totalItems: () => get().items.reduce((sum, i) => sum + i.qty, 0),
                totalAmount: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
            };
        },
        {
            name: "veronica-cart",
            // In local dev, back the cart with sessionStorage so each fresh local
            // run (new browser session) starts with an empty cart, while reloads
            // within a session keep it. Production uses localStorage so a shopper's
            // cart survives across visits.
            storage: createJSONStorage(() =>
                process.env.NODE_ENV === "development" ? sessionStorage : localStorage,
            ),
            // Never persist server line-item ids: they belong to a server session,
            // not the browser. A stale persisted serverId would make a reloaded
            // guest cart try to PATCH/DELETE lines that don't exist yet. They're
            // re-attached by syncWithServer on the next login.
            partialize: (state) => ({
                items: state.items.map(({ serverId: _serverId, ...rest }) => rest),
            }),
        },
    ),
);
