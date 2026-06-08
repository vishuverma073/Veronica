"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { useStoreSettings } from "@/lib/use-store-settings";
import AddToCartButton from "@/components/store/AddToCartButton";
import ProductCarousel from "@/components/store/ProductCarousel";
import SectionHeader from "@/components/store/SectionHeader";
import { Truck, Package, MessageCircle, ChevronRight, ChevronLeft, Home, Shield } from "lucide-react";
import type { Product, ProductListItem } from "@veronica/contracts";
import { getSKUBySelections, getAvailableValues, getMinPrice, getMaxBasePrice, getBestDiscount } from "@/lib/sku-helpers";

interface ProductPageClientProps {
    product: Product;
    categoryName?: string;
    categorySlug?: string;
    breadcrumbItems: { label: string; href?: string }[];
    shopHref?: string;
    relatedProducts: ProductListItem[];
}

export default function ProductPageClient({
    product,
    breadcrumbItems,
    shopHref,
    relatedProducts,
}: ProductPageClientProps) {
    // ─── Image Gallery ─────────────────────────────────
    // Guard against a product with zero images (e.g. one created in admin
    // without uploads): next/image throws on an undefined `src`, so fall back
    // to a placeholder rather than crashing the whole PDP.
    const PLACEHOLDER_IMG = "https://placehold.co/600x600/F5F5F4/A8A29E/png?text=No+Image";
    const galleryImages = useMemo(() => {
        const urls = product.images
            .map((img) => productImageUrl(img))
            .filter((url): url is string => url != null);
        return urls.length > 0 ? urls : [PLACEHOLDER_IMG];
    }, [product.images]);
    const [activeImg, setActiveImg] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const totalImages = galleryImages.length;

    const { data: storeSettings } = useStoreSettings();
    const freeDeliveryAbove = storeSettings?.shippingFreeAbove ?? 5000;

    const goToImage = useCallback((idx: number) => {
        const clamped = Math.max(0, Math.min(idx, totalImages - 1));
        setActiveImg(clamped);
        // Scroll mobile carousel to that image
        if (scrollRef.current) {
            const child = scrollRef.current.children[clamped] as HTMLElement;
            if (child) {
                scrollRef.current.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
            }
        }
    }, [totalImages]);

    // Sync active dot when user swipes on mobile
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let timer: NodeJS.Timeout;
        const onScroll = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const scrollLeft = el.scrollLeft;
                const width = el.clientWidth;
                const idx = Math.round(scrollLeft / width);
                setActiveImg(idx);
            }, 80);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // ─── Dimension Selections ──────────────────────────
    const [selections, setSelections] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const dim of product.dimensions.sort((a, b) => a.sortOrder - b.sortOrder)) {
            if (dim.values.length > 0) {
                initial[dim.name] = dim.values[0].value;
            }
        }
        return initial;
    });

    const currentSKU = useMemo(
        () => getSKUBySelections(product, selections),
        [product, selections]
    );

    const displayPrice = currentSKU
        ? (currentSKU.salePrice ?? currentSKU.price)
        : getMinPrice(product);

    const mrpPrice = currentSKU
        ? currentSKU.price
        : getMaxBasePrice(product);

    const discount = currentSKU
        ? (currentSKU.salePrice !== null && currentSKU.salePrice < currentSKU.price
            ? Math.round(((currentSKU.price - currentSKU.salePrice) / currentSKU.price) * 100)
            : 0)
        : getBestDiscount(product);

    const handleDimensionSelect = (dimName: string, value: string) => {
        setSelections((prev) => ({ ...prev, [dimName]: value }));
    };

    const sortedDimensions = useMemo(
        () => [...product.dimensions].sort((a, b) => a.sortOrder - b.sortOrder),
        [product.dimensions]
    );

    return (
        <>
            {/* ─── Breadcrumb ────────────────────────────── */}
            <div className="max-w-380 mx-auto px-4 pt-4 pb-2">
                <nav className="flex items-center gap-1.5 text-[12px] text-text-muted" aria-label="Breadcrumb">
                    <Link href="/" className="hover:text-text-primary transition-colors"><Home size={13} /></Link>
                    {shopHref && (
                        <span className="flex items-center gap-1.5">
                            <ChevronRight size={10} className="opacity-40" />
                            <Link href={shopHref} className="hover:text-text-primary transition-colors">Shop</Link>
                        </span>
                    )}
                    {breadcrumbItems.map((item, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            <ChevronRight size={10} className="opacity-40" />
                            {i === breadcrumbItems.length - 1 || !item.href ? (
                                <span className="text-text-secondary font-medium truncate max-w-[180px]">{item.label}</span>
                            ) : (
                                <Link href={item.href} className="hover:text-text-primary transition-colors">{item.label}</Link>
                            )}
                        </span>
                    ))}
                </nav>
            </div>

            {/* ─── Product Section ────────────────────────── */}
            <section className="max-w-380 mx-auto px-4 pb-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

                    {/* ─── Gallery Column (7 cols) ───────── */}
                    <div className="lg:col-span-7">

                        {/* ── MOBILE: Horizontal swipe carousel ── */}
                        <div className="lg:hidden">
                            <div className="pdp-mobile-carousel" ref={scrollRef}>
                                {galleryImages.map((img, i) => (
                                    <div key={i} className="pdp-mobile-slide">
                                        <Image
                                            src={img}
                                            alt={`${product.name} - Image ${i + 1}`}
                                            fill
                                            className="object-contain p-4"
                                            priority={i === 0}
                                            sizes="100vw"
                                            quality={90}
                                        />
                                    </div>
                                ))}
                            </div>
                            {/* Dot indicators */}
                            {totalImages > 1 && (
                                <div className="flex justify-center gap-1.5 mt-3">
                                    {galleryImages.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => goToImage(i)}
                                            className={`pdp-dot ${i === activeImg ? "active" : ""}`}
                                            aria-label={`Go to image ${i + 1}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── DESKTOP: Vertical thumbs + main image ── */}
                        <div className="hidden lg:flex gap-4">
                            {/* Vertical thumbnail strip */}
                            {totalImages > 1 && (
                                <div className="pdp-thumb-col">
                                    {galleryImages.map((img, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setActiveImg(i)}
                                            className={`pdp-thumb-v ${i === activeImg ? "active" : ""}`}
                                        >
                                            <Image
                                                src={img}
                                                alt=""
                                                width={72}
                                                height={72}
                                                className="object-contain p-1.5 w-full h-full"
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Main image */}
                            <div className="pdp-hero-img flex-1 relative">
                                <Image
                                    src={galleryImages[activeImg]}
                                    alt={product.name}
                                    fill
                                    className="object-contain p-6 transition-opacity duration-300"
                                    priority
                                    sizes="58vw"
                                    quality={90}
                                    key={activeImg}
                                />
                                {/* Badges */}
                                {(product.isBestseller || product.isNew) && (
                                    <div className="absolute top-5 left-5 flex gap-1.5 z-10">
                                        {product.isBestseller && <span className="badge badge-bestseller">Bestseller</span>}
                                        {product.isNew && <span className="badge badge-new">New</span>}
                                    </div>
                                )}
                                {discount > 0 && (
                                    <div className="absolute top-5 right-5 z-10">
                                        <span className="pdp-discount-tag">-{discount}%</span>
                                    </div>
                                )}
                                {/* Prev / Next arrows */}
                                {totalImages > 1 && (
                                    <>
                                        <button
                                            onClick={() => goToImage(activeImg - 1)}
                                            disabled={activeImg === 0}
                                            className="pdp-arrow pdp-arrow-prev"
                                            aria-label="Previous image"
                                        >
                                            <ChevronLeft size={18} />
                                        </button>
                                        <button
                                            onClick={() => goToImage(activeImg + 1)}
                                            disabled={activeImg === totalImages - 1}
                                            className="pdp-arrow pdp-arrow-next"
                                            aria-label="Next image"
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </>
                                )}
                                {/* Image counter */}
                                {totalImages > 1 && (
                                    <span className="absolute bottom-4 right-4 text-[11px] font-semibold text-text-muted bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full">
                                        {activeImg + 1} / {totalImages}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── Info Column (5 cols) ──────────── */}
                    <div className="lg:col-span-5 flex flex-col">

                        {/* Title */}
                        <h1 className="text-[22px] md:text-[28px] font-bold text-text-primary leading-snug tracking-[-0.02em]">
                            {product.name}
                        </h1>

                        {/* Price */}
                        <div className="mt-4 flex items-end gap-2.5 flex-wrap">
                            <span className="text-[32px] md:text-[38px] font-extrabold text-text-primary leading-none tracking-tight">
                                {formatPrice(displayPrice)}
                            </span>
                            {displayPrice < mrpPrice && (
                                <span className="text-[15px] text-text-muted line-through leading-none mb-1">
                                    {formatPrice(mrpPrice)}
                                </span>
                            )}
                            {discount > 0 && (
                                <span className="text-[13px] font-bold text-success leading-none mb-1">
                                    {discount}% off
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-1">Inclusive of all taxes</p>

                        {/* SKU Code */}
                        {currentSKU && (
                            <p className="text-[11px] text-text-muted mt-1">SKU: {currentSKU.skuCode}</p>
                        )}

                        {/* Variant Dimension Selectors */}
                        {sortedDimensions.map((dim) => {
                            const available = getAvailableValues(product, dim.name, selections);
                            const selectedValue = selections[dim.name];

                            return (
                                <div key={dim.id} className="mt-6">
                                    <p className="text-[13px] font-medium text-text-secondary mb-2.5">
                                        <span className="text-text-muted">{dim.name}:</span>{" "}
                                        <span className="text-text-primary font-semibold">{selectedValue}</span>
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {dim.values
                                            .sort((a, b) => a.sortOrder - b.sortOrder)
                                            .map((val) => {
                                                const isAvailable = available.includes(val.value);
                                                const isSelected = selectedValue === val.value;
                                                return (
                                                    <button
                                                        key={val.id}
                                                        onClick={() => handleDimensionSelect(dim.name, val.value)}
                                                        disabled={!isAvailable}
                                                        className={`pdp-variant ${isSelected ? "active" : ""} ${!isAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                                                    >
                                                        {val.label || val.value}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add to Cart */}
                        <div className="mt-6">
                            <AddToCartButton
                                product={{
                                    id: currentSKU?.id ?? product.id,
                                    name: product.name + (Object.values(selections).length > 0
                                        ? ` (${Object.values(selections).join(" / ")})`
                                        : ""),
                                    slug: product.slug,
                                    price: displayPrice,
                                    image: galleryImages[0] ?? PLACEHOLDER_IMG,
                                    variant: Object.values(selections).join(" / ") || undefined,
                                    stock: currentSKU?.stock,
                                }}
                            />
                        </div>

                        {/* Description */}
                        <div className="mt-8">
                            <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary mb-3">About this product</h3>
                            <p className="text-[14px] leading-relaxed text-text-secondary">
                                {product.description}
                            </p>
                        </div>

                        {/* Specifications */}
                        {((product.specifications && product.specifications.length > 0) || (currentSKU?.attributes && Object.keys(currentSKU.attributes).length > 0)) && (
                            <div className="mt-8">
                                <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary mb-4">Specifications</h3>
                                <div className="border border-border-light rounded-2xl overflow-hidden bg-white">
                                    <table className="w-full text-left text-[13px]">
                                        <tbody className="divide-y divide-border-light">
                                            {/* SKU-specific attributes first (e.g. Bowl Size) */}
                                            {currentSKU?.attributes && Object.entries(currentSKU.attributes).map(([key, value]) => (
                                                <tr key={key} className="bg-brand-orange/5">
                                                    <th className="py-2.5 px-4 font-medium text-brand-orange w-1/3 bg-brand-orange/5">{key}</th>
                                                    <td className="py-2.5 px-4 font-semibold text-text-primary">{value}</td>
                                                </tr>
                                            ))}
                                            {/* General product specifications */}
                                            {product.specifications?.map((spec) => (
                                                <tr key={spec.name}>
                                                    <th className="py-2.5 px-4 font-medium text-text-secondary w-1/3 bg-surface-dim/30">{spec.name}</th>
                                                    <td className="py-2.5 px-4 text-text-primary">{spec.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Included Accessories */}
                        {product.includedAccessories && product.includedAccessories.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-primary mb-3">What&apos;s in the box</h3>
                                <ul className="flex flex-col gap-2">
                                    {product.includedAccessories.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-[13px] text-text-secondary">
                                            <div className="mt-[6px] w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Feature tags — inline, subtle */}
                        {product.tags.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-1.5">
                                {product.tags.map((tag) => (
                                    <span key={tag} className="pdp-tag">
                                        {tag.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Promises bar */}
                        <div className="mt-8 pt-6 border-t border-border-light">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="flex items-center gap-2.5">
                                    <Truck size={16} className="text-text-muted shrink-0" strokeWidth={1.5} />
                                    <span className="text-[12px] text-text-secondary leading-tight">
                                        Free delivery
                                        <br />
                                        <span className="text-text-muted">
                                            Orders {formatPrice(freeDeliveryAbove)}+
                                        </span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <Package size={16} className="text-text-muted shrink-0" strokeWidth={1.5} />
                                    <span className="text-[12px] text-text-secondary leading-tight">Ships in 2-4 days<br /><span className="text-text-muted">Pan India</span></span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <Shield size={16} className="text-text-muted shrink-0" strokeWidth={1.5} />
                                    <span className="text-[12px] text-text-secondary leading-tight">Manufacturer<br /><span className="text-text-muted">Warranty</span></span>
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp CTA */}
                        <Link
                            href="https://wa.me/919350529717"
                            target="_blank"
                            className="mt-4 flex items-center gap-2 text-[13px] text-whatsapp font-medium hover:underline transition-colors"
                        >
                            <MessageCircle size={15} strokeWidth={1.8} />
                            Need help? Chat with us on WhatsApp
                        </Link>
                    </div>
                </div>
            </section>

            {/* ─── Related ───────────────────────────────── */}
            {relatedProducts.length > 0 && (
                <section className="max-w-380 mx-auto px-4 py-12 border-t border-border-light">
                    <SectionHeader title="You May Also Like" highlight="Also" subtitle="Similar products from our collection" />
                    <ProductCarousel products={relatedProducts} columns={4} />
                </section>
            )}
        </>
    );
}
