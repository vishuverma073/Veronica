"use client";

import { Check, ShoppingBag } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useCartStore } from "@/store/cartStore";
import { isPurchasable, stockBadgeLabel } from "@/lib/stock";
import { toast } from "sonner";

interface AddToCartButtonProps {
    product: {
        id: number;
        name: string;
        slug: string;
        price: number;
        image: string;
        variant?: string;
        stock?: number | null;
    };
}

export default function AddToCartButton({ product }: AddToCartButtonProps) {
    const [justAdded, setJustAdded] = useState(false);
    const [mounted, setMounted] = useState(false);

    const items = useCartStore((s) => s.items);
    const addItem = useCartStore((s) => s.addItem);
    const updateQty = useCartStore((s) => s.updateQty);

    const outOfStock = !isPurchasable(product.stock);
    const stockLabel = stockBadgeLabel(product.stock);

    const cartKey = useMemo(
        () => (product.variant ? `${product.id}-${product.variant}` : `${product.id}`),
        [product.id, product.variant],
    );

    const cartItem = useMemo(() => items.find((i) => i.cartKey === cartKey), [items, cartKey]);

    const inCart = !!cartItem;
    const qty = cartItem?.qty ?? 1;

    const [inputValue, setInputValue] = useState(String(qty));

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (cartItem) {
            setInputValue(String(cartItem.qty));
        }
    }, [cartItem?.qty, cartItem]);

    const handleAddToCart = () => {
        if (outOfStock) {
            toast.error("This item is out of stock");
            return;
        }
        addItem(product);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1200);
    };

    const handleUpdateQty = () => {
        const parsed = parseInt(inputValue, 10);
        const newQty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
        setInputValue(String(newQty));
        updateQty(cartKey, newQty);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 800);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleUpdateQty();
            (e.target as HTMLInputElement).blur();
        }
    };

    if (!mounted) {
        return (
            <button className="pdp-atc-btn" disabled>
                <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
            </button>
        );
    }

    if (outOfStock) {
        return (
            <div className="space-y-2">
                <button className="pdp-atc-btn opacity-50 cursor-not-allowed" disabled type="button">
                    Out of Stock
                </button>
                {stockLabel && <p className="text-xs font-medium text-danger">{stockLabel}</p>}
            </div>
        );
    }

    if (inCart && !justAdded) {
        return (
            <div className="space-y-2">
                <div className="pdp-qty-row">
                    <label className="pdp-qty-label" htmlFor="pdp-qty-input">
                        Qty
                    </label>
                    <input
                        id="pdp-qty-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={handleKeyDown}
                        onBlur={handleUpdateQty}
                        className="pdp-qty-input"
                    />
                    <button onClick={handleUpdateQty} className="pdp-qty-update" type="button">
                        Update Cart
                    </button>
                </div>
                {stockLabel && <p className="text-xs font-medium text-amber-700">{stockLabel}</p>}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <button
                onClick={handleAddToCart}
                disabled={justAdded}
                className={`pdp-atc-btn ${justAdded ? "success" : ""}`}
                type="button"
            >
                {justAdded ? (
                    <>
                        <Check size={18} strokeWidth={2.5} /> Added
                    </>
                ) : (
                    <>
                        <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
                    </>
                )}
            </button>
            {stockLabel && !justAdded && (
                <p className="text-xs font-medium text-amber-700">{stockLabel}</p>
            )}
        </div>
    );
}
