"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { formatPrice, generateWhatsAppUrl } from "@/lib/utils";
import StoreProductThumb from "@/components/store/StoreProductThumb";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { shippingFeeFor, amountToFreeShipping } from "@/lib/checkout";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ArrowLeft } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { useStoreSettings } from "@/lib/use-store-settings";

const PHONE = "9350529717";

export default function CartPage() {
    const [mounted, setMounted] = useState(false);
    const [confirmEmpty, setConfirmEmpty] = useState(false);

    const items = useCartStore((s) => s.items);
    const removeItem = useCartStore((s) => s.removeItem);
    const updateQty = useCartStore((s) => s.updateQty);
    const emptyCart = useCartStore((s) => s.emptyCart);
    const authStatus = useAuthStore((s) => s.status);
    const { data: settings } = useStoreSettings();

    useEffect(() => {
        setMounted(true);
    }, []);

    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shipping = shippingFeeFor(total, settings);
    const grandTotal = total + shipping;
    const toFreeShipping = amountToFreeShipping(total, settings);
    const checkoutHref = authStatus === "authenticated" ? "/checkout" : "/login?returnTo=/checkout";

    const whatsAppUrl = generateWhatsAppUrl(
        PHONE,
        items.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price * item.qty,
        })),
        grandTotal
    );

    // SSR placeholder
    if (!mounted) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <div className="w-20 h-20 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag size={36} className="text-text-muted" strokeWidth={1.5} />
                </div>
                <p className="text-text-secondary text-sm">Loading your cart...</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="w-20 h-20 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag size={36} className="text-text-muted" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-2 tracking-tight">
                    Your cart is empty
                </h1>
                <p className="text-text-secondary mb-8 text-sm">
                    Browse our collection and add some products.
                </p>
                <Link href="/" className="btn btn-primary">
                    Continue Shopping
                    <ArrowRight size={16} />
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-extrabold text-text-primary tracking-tight">
                    Your Cart
                    <span className="text-text-muted font-semibold text-sm ml-2">
                        ({items.length} {items.length === 1 ? "item" : "items"})
                    </span>
                </h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setConfirmEmpty(true)}
                        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-danger transition-colors"
                    >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">Empty cart</span>
                    </button>
                    <Link
                        href="/"
                        className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-brand-orange transition-colors"
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">Continue Shopping</span>
                        <span className="sm:hidden">Shop</span>
                    </Link>
                </div>
            </div>

            <div className="space-y-3 mb-6">
                {items.map((item) => (
                    <div
                        key={item.cartKey}
                        className="flex gap-3 p-3 sm:p-4 bg-surface-card rounded-2xl border border-border-light hover:border-border transition-colors duration-200"
                    >
                        <Link
                            href={`/product/${item.slug}`}
                            className="w-18 h-18 sm:w-20 sm:h-20 bg-surface-dim rounded-xl overflow-hidden shrink-0 border border-border-light"
                        >
                            <StoreProductThumb
                                src={item.image}
                                alt={item.name}
                                width={80}
                                height={80}
                                className="object-contain w-full h-full p-2"
                            />
                        </Link>
                        <div className="flex-1 min-w-0">
                            <Link
                                href={`/product/${item.slug}`}
                                className="text-sm font-semibold text-text-primary line-clamp-2 hover:text-brand-orange transition-colors"
                            >
                                {item.name}
                            </Link>
                            {item.variant && (
                                <p className="text-xs text-text-secondary mt-0.5">
                                    {item.variant}
                                </p>
                            )}
                            <p className="text-sm font-bold text-text-primary mt-1">
                                {formatPrice(item.price)}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                                <div className="flex items-center border border-border rounded-xl overflow-hidden">
                                    <button
                                        onClick={() => updateQty(item.cartKey, item.qty - 1)}
                                        className="px-2.5 py-1.5 text-text-secondary hover:bg-surface-dim transition-colors active:bg-surface-dim"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="px-3 py-1.5 text-sm font-bold border-x border-border min-w-[36px] text-center">
                                        {item.qty}
                                    </span>
                                    <button
                                        onClick={() => updateQty(item.cartKey, item.qty + 1)}
                                        className="px-2.5 py-1.5 text-text-secondary hover:bg-surface-dim transition-colors active:bg-surface-dim"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeItem(item.cartKey)}
                                    className="text-text-muted hover:text-danger transition-colors p-1"
                                >
                                    <Trash2 size={15} />
                                </button>
                                <span className="ml-auto text-sm font-bold text-text-primary">
                                    {formatPrice(item.price * item.qty)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Order Summary */}
            <div className="bg-surface-card rounded-2xl p-5 sm:p-6 mb-6 border border-border-light">
                <h2 className="text-base font-bold text-text-primary mb-4 tracking-tight">
                    Order Summary
                </h2>
                <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-secondary">Subtotal</span>
                        <span className="font-semibold">{formatPrice(total)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-secondary">Delivery</span>
                        <span className={`font-semibold ${shipping === 0 ? "text-success" : ""}`}>
                            {shipping === 0 ? "Free" : formatPrice(shipping)}
                        </span>
                    </div>
                    <div className="border-t border-border-light pt-2.5 mt-2.5 flex justify-between">
                        <span className="font-bold text-base">Total</span>
                        <span className="font-extrabold text-lg text-text-primary">
                            {formatPrice(grandTotal)}
                        </span>
                    </div>
                </div>
                {toFreeShipping > 0 && (
                    <p className="text-xs text-text-muted mt-3 bg-brand-orange-light px-3 py-2 rounded-lg">
                        💡 Add {formatPrice(toFreeShipping)} more for <span className="font-semibold text-brand-orange">free delivery</span>!
                    </p>
                )}
            </div>

            {/* Primary CTA — checkout (sign in first if guest) */}
            <Link
                href={checkoutHref}
                className="btn btn-primary w-full py-4 text-[15px] font-bold rounded-2xl"
            >
                {authStatus === "authenticated" ? "Proceed to checkout" : "Sign in to checkout"}
                <ArrowRight size={17} />
            </Link>

            {/* Secondary CTA — WhatsApp fallback */}
            <Link
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost w-full py-3 mt-3 text-sm font-semibold text-whatsapp border border-border-light rounded-2xl hover:bg-surface-dim"
            >
                <MessageCircle size={17} />
                Order on WhatsApp instead
            </Link>

            <p className="text-center text-xs text-text-muted mt-4">
                Secure checkout · or send your order to us on WhatsApp for confirmation.
            </p>

            <ConfirmDialog
                open={confirmEmpty}
                title="Empty your cart?"
                message="Remove all items from your cart? This cannot be undone."
                confirmLabel="Empty cart"
                danger
                onCancel={() => setConfirmEmpty(false)}
                onConfirm={() => {
                    emptyCart();
                    setConfirmEmpty(false);
                }}
            />
        </div>
    );
}
