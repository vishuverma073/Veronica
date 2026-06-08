import Link from "next/link";
import { Suspense } from "react";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { formatPrice, getSafeImageSrc } from "@/lib/utils";
import { backend, type HomeBanner, type HomeSectionKey } from "@/lib/backend";
import { getBrowseAllHref } from "@/lib/category-shortcuts";
import SectionHeader from "@/components/store/SectionHeader";
import CategoryCard from "@/components/store/CategoryCard";
import SafeBannerImage from "@/components/store/SafeBannerImage";
import ProductCarousel from "@/components/store/ProductCarousel";
import { CategoryGridSkeleton, ProductCarouselSkeleton } from "@/components/store/Skeletons";
import { ArrowRight, Check } from "lucide-react";

// The home page reads live catalog data from the backend client. With mocks the
// API isn't reachable during build-time static generation, so render on demand.
export const dynamic = "force-dynamic";

// ─── Defaults ────────────────────────────────────────────────────────
// Used when the admin hasn't composed the home page yet (empty config) or a
// banner field is left blank — so the storefront always looks complete.
const DEFAULT_ORDER: HomeSectionKey[] = ["hero", "categories", "bestsellers", "promo", "new"];

const DEFAULT_HERO: HomeBanner = {
    image: "/uploads/categories/kitchen-sinks.webp",
    title: "Crafted with Modern Technology",
    subtitle:
        "Premium Quartz Sinks, Faucets & Sanitary Solutions. Designed for Modern Indian Homes.",
    ctaText: "Shop Sanitary Goods",
    ctaLink: "/search",
};

const HERO_TRUST_ITEMS = [
    "Since 2004",
    "Premium Quality",
    "Pan India Delivery",
    "Modern Designs",
] as const;

const DEFAULT_PROMO: HomeBanner = {
    image: "/uploads/categories/plumbing-fittings.webp",
    title: "Premium Quality, Honest Prices",
    subtitle: "Upto 55% off on all products.",
    ctaText: "Browse All Products",
    ctaLink: "/search",
};

/** Fill blank admin fields with defaults so a half-filled banner still renders. */
function withDefaults(b: HomeBanner, d: HomeBanner): HomeBanner {
    return {
        image: getSafeImageSrc(b.image) ?? d.image,
        title: b.title || d.title,
        subtitle: b.subtitle || d.subtitle,
        ctaText: b.ctaText || d.ctaText,
        ctaLink: b.ctaLink || d.ctaLink,
    };
}

// ─── Section components ──────────────────────────────────────────────

function HeroSection({ hero, shopHref }: { hero: HomeBanner; shopHref: string }) {
    const h = withDefaults(hero, DEFAULT_HERO);
    const primaryHref = h.ctaLink || shopHref;
    const primaryLabel = h.ctaText || "Shop Sanitary Goods";
    const secondaryHeadline = h.title;
    const [supportLineOne, supportLineTwo] = (() => {
        const parts = h.subtitle.split(".").map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) return [parts[0] + ".", parts.slice(1).join(". ") + "."];
        return [
            "Premium Quartz Sinks, Faucets & Sanitary Solutions",
            "Designed for Modern Indian Homes.",
        ];
    })();

    return (
        <section className="relative min-h-[78vh] md:min-h-[85vh] overflow-hidden bg-brand-black flex flex-col justify-end">
            <SafeBannerImage
                src={h.image}
                fallbackSrc={DEFAULT_HERO.image}
                alt="Veronica Premium Sanitary Goods"
                className="object-cover object-[65%_center] md:object-[right_center] scale-[1.02] md:scale-105"
                priority
                quality={90}
            />
            {/* Image-integrated gradients — no text panel or card */}
            <div
                className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.35)_0%,transparent_35%),linear-gradient(90deg,rgba(0,0,0,0.60)_0%,rgba(0,0,0,0.45)_25%,rgba(0,0,0,0.20)_50%,rgba(0,0,0,0.05)_70%,transparent_100%)]"
                aria-hidden
            />
            <div className="relative z-10 w-full max-w-380 mx-auto px-5 sm:px-6 md:px-16 lg:px-20 pb-10 md:pb-16 lg:pb-20 pt-24 md:pt-28">
                <div className="animate-slide-up max-w-3xl">
                    {/* Brand first */}
                    <h1 className="mb-4 md:mb-5">
                        <span className="block text-[2.75rem] sm:text-6xl md:text-7xl lg:text-[5.5rem] xl:text-[6.25rem] font-extrabold text-white leading-[0.92] tracking-[0.14em] md:tracking-[0.18em]">
                            VERONICA
                        </span>
                        <span className="block mt-2 md:mt-3 text-[10px] sm:text-xs md:text-sm font-semibold uppercase text-white/65 tracking-[0.32em] md:tracking-[0.42em]">
                            Sanitary Goods
                        </span>
                    </h1>

                    {/* Technology / supporting statement second */}
                    <p className="text-lg sm:text-xl md:text-2xl font-semibold text-white/90 leading-snug mb-4 md:mb-5 max-w-xl">
                        {secondaryHeadline}
                    </p>

                    {/* Product category copy third */}
                    <div className="space-y-1 mb-6 md:mb-8 max-w-xl">
                        <p className="text-sm sm:text-base md:text-lg text-white/75 leading-relaxed">
                            {supportLineOne}
                        </p>
                        <p className="text-sm sm:text-base text-white/55 leading-relaxed">
                            {supportLineTwo}
                        </p>
                    </div>

                    {/* Trust row */}
                    <ul className="flex flex-wrap gap-x-4 gap-y-2 sm:gap-x-6 mb-7 md:mb-9">
                        {HERO_TRUST_ITEMS.map((item) => (
                            <li
                                key={item}
                                className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-white/80"
                            >
                                <Check
                                    size={14}
                                    className="text-brand-orange shrink-0"
                                    strokeWidth={2.5}
                                    aria-hidden
                                />
                                {item}
                            </li>
                        ))}
                    </ul>

                    {/* CTAs */}
                    <div className="flex flex-wrap gap-3">
                        <Link
                            href={primaryHref}
                            className="btn btn-primary text-[14px] sm:text-[15px] px-7 sm:px-8 py-3 sm:py-3.5"
                        >
                            {primaryLabel}
                            <ArrowRight size={18} />
                        </Link>
                        <Link
                            href="#shop-categories"
                            className="btn border border-white/20 text-white hover:bg-white/10 text-[14px] sm:text-[15px] px-7 sm:px-8 py-3 sm:py-3.5"
                        >
                            Explore Categories
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

async function CategoriesSection({ categoryIds }: { categoryIds?: number[] }) {
    // A catalog read failure should degrade to "no section", never crash the
    // whole home page (a thrown error here bubbles past Suspense to the error boundary).
    let categories = await backend.getCategories().catch(() => []);
    // If the admin curated a specific set, show those in their chosen order;
    // otherwise show every category (already alphabetical from getCategories).
    if (categoryIds && categoryIds.length > 0) {
        const rank = new Map(categoryIds.map((id, i) => [id, i]));
        categories = categories
            .filter((c) => rank.has(c.id))
            .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    if (categories.length === 0) return null;

    return (
        <section id="shop-categories" className="max-w-380 mx-auto px-4 pt-12 pb-16 md:pt-14 scroll-mt-24">
            <SectionHeader
                title="Shop by Category"
                highlight="Category"
                subtitle="Find exactly what you need for your home"
            />

            {/* Mobile: Horizontal scroll */}
            <div className="md:hidden flex gap-3 overflow-x-auto scroll-x-hidden pb-2">
                {categories.map((cat) => (
                    <div key={cat.id} className="shrink-0 w-[72vw]">
                        <CategoryCard name={cat.name} slug={cat.slug} image={cat.image} />
                    </div>
                ))}
            </div>

            {/* Desktop: Grid */}
            <div className="hidden md:grid grid-cols-4 gap-4 stagger-children">
                {categories.map((cat) => (
                    <div key={cat.id} className="animate-fade-in" style={{ opacity: 0 }}>
                        <CategoryCard name={cat.name} slug={cat.slug} image={cat.image} />
                    </div>
                ))}
            </div>
        </section>
    );
}

async function BestsellersSection() {
    // Fetch a wider set so the desktop carousel has items to loop through.
    // A failed read degrades to an empty (hidden) section rather than crashing the page.
    const [page, viewAllHref] = await Promise.all([
        backend.listProducts({ bestseller: true, limit: 12 }).catch(() => null),
        getBrowseAllHref(),
    ]);
    const bestsellers = page?.items ?? [];
    if (bestsellers.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader
                title="Our Bestsellers"
                highlight="Bestsellers"
                subtitle="Most loved by our customers"
                viewAllHref={viewAllHref}
                viewAllLabel="View All"
            />
            <ProductCarousel products={bestsellers} columns={4} />
            <Link
                href={viewAllHref}
                className="md:hidden flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-orange hover:text-brand-orange-dark transition-colors mt-6"
            >
                View All Bestsellers <ArrowRight size={16} />
            </Link>
        </section>
    );
}

async function NewArrivalsSection() {
    // Fetch a wider set so the desktop carousel has items to loop through.
    const page = await backend.listProducts({ new: true, limit: 12 }).catch(() => null);
    const newArrivals = page?.items ?? [];
    if (newArrivals.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader
                title="New Arrivals"
                highlight="New"
                subtitle="Latest additions to our collection"
            />
            <ProductCarousel products={newArrivals} columns={4} />
        </section>
    );
}

async function FeaturedSection({ productIds }: { productIds: number[] }) {
    if (productIds.length === 0) return null;
    // No public by-IDs endpoint, so pull the catalog and pick the chosen ones,
    // preserving the admin's order.
    const page = await backend.listProducts({ limit: 50 }).catch(() => null);
    const items = page?.items ?? [];
    const rank = new Map(productIds.map((id, i) => [id, i]));
    const featured = items
        .filter((p) => rank.has(p.id))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    if (featured.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader title="Featured Products" highlight="Featured" subtitle="Hand-picked by our team" />
            <ProductCarousel products={featured} columns={4} />
        </section>
    );
}

function PromoSection({ promo }: { promo: HomeBanner }) {
    const p = withDefaults(promo, DEFAULT_PROMO);
    return (
        <section className="max-w-380 mx-auto px-4 py-10 animate-fade-in" style={{ animationDelay: "200ms", opacity: 0 }}>
            <div className="relative rounded-2xl overflow-hidden h-52 md:h-72 bg-brand-black">
                <SafeBannerImage
                    src={p.image}
                    fallbackSrc={DEFAULT_PROMO.image}
                    alt={p.title}
                    className="object-cover opacity-25"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-black/90 via-brand-black/60 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-center p-8 md:p-14">
                    <div className="max-w-lg">
                        <h2 className="text-white text-2xl md:text-4xl font-extrabold mb-3 leading-tight tracking-tight">
                            {p.title}
                        </h2>
                        <p className="text-white/50 text-sm md:text-base mb-6 leading-relaxed">{p.subtitle}</p>
                        <Link href={p.ctaLink || "/"} className="btn btn-primary">
                            {p.ctaText}
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── Suspense fallbacks ──────────────────────────────────────────────

function CategoriesFallback() {
    return (
        <section id="shop-categories" className="max-w-380 mx-auto px-4 pt-12 pb-16 md:pt-14 scroll-mt-24">
            <SectionHeader title="Shop by Category" highlight="Category" subtitle="Find exactly what you need for your home" />
            <CategoryGridSkeleton />
        </section>
    );
}

function RowFallback({ title, highlight, subtitle }: { title: string; highlight: string; subtitle: string }) {
    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader title={title} highlight={highlight} subtitle={subtitle} />
            <ProductCarouselSkeleton columns={4} />
        </section>
    );
}

// ─── Page ────────────────────────────────────────────────────────────

export default async function HomePage() {
    // Admin-composed layout (order + enabled + banner content). Falls back to the
    // default layout if the admin hasn't configured it yet or the API is down.
    const [home, browseAllHref, storeSettings] = await Promise.all([
        backend.getHome().catch(() => null),
        getBrowseAllHref(),
        backend.getStoreSettings().catch(() => null),
    ]);
    const order = home && home.order.length > 0 ? home.order : DEFAULT_ORDER;
    const freeAbove = storeSettings?.shippingFreeAbove ?? 5000;
    const hero = home?.hero ?? { ...DEFAULT_HERO, ctaLink: browseAllHref };
    const promo =
        home?.promo ??
        ({
            ...DEFAULT_PROMO,
            ctaLink: browseAllHref,
            subtitle: `${DEFAULT_PROMO.subtitle} Free delivery above ${formatPrice(freeAbove)}.`,
        } satisfies HomeBanner);
    const featuredIds = home?.featured ?? [];
    const categoryIds = home?.categories ?? [];

    // Organization + WebSite structured data: helps search engines show the brand
    // knowledge panel and a sitelinks search box. Product-level JSON-LD lives on the PDP.
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: "Veronica India",
                url: SITE_URL,
                logo: absoluteUrl("/uploads/logo/logo.webp"),
                email: "veronicasanitarygoods@gmail.com",
                telephone: "+919350529717",
                address: {
                    "@type": "PostalAddress",
                    streetAddress: "Plot 734, Bijwasan - Palam Vihar Rd",
                    addressLocality: "New Delhi",
                    postalCode: "110061",
                    addressCountry: "IN",
                },
            },
            {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: "Veronica India",
                publisher: { "@id": `${SITE_URL}/#organization` },
                potentialAction: {
                    "@type": "SearchAction",
                    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    };

    return (
        <div>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {order.map((key) => {
                switch (key) {
                    case "hero":
                        return <HeroSection key="hero" hero={hero} shopHref={browseAllHref} />;
                    case "categories":
                        return (
                            <Suspense key="categories" fallback={<CategoriesFallback />}>
                                <CategoriesSection categoryIds={categoryIds} />
                            </Suspense>
                        );
                    case "bestsellers":
                        return (
                            <Suspense
                                key="bestsellers"
                                fallback={<RowFallback title="Our Bestsellers" highlight="Bestsellers" subtitle="Most loved by our customers" />}
                            >
                                <BestsellersSection />
                            </Suspense>
                        );
                    case "new":
                        return (
                            <Suspense
                                key="new"
                                fallback={<RowFallback title="New Arrivals" highlight="New" subtitle="Latest additions to our collection" />}
                            >
                                <NewArrivalsSection />
                            </Suspense>
                        );
                    case "featured":
                        return (
                            <Suspense
                                key="featured"
                                fallback={<RowFallback title="Featured Products" highlight="Featured" subtitle="Hand-picked by our team" />}
                            >
                                <FeaturedSection productIds={featuredIds} />
                            </Suspense>
                        );
                    case "promo":
                        return <PromoSection key="promo" promo={promo} />;
                    default:
                        return null;
                }
            })}
        </div>
    );
}
