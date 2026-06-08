import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { backend } from "@/lib/backend";
import { buildCategoryTree } from "@/lib/category-tree";
import { getShopBrowseHref } from "@/lib/shop-nav";
import type { Product } from "@veronica/contracts";
import { getMinPrice, getMaxBasePrice } from "@/lib/sku-helpers";
import ProductPageClient from "@/components/store/ProductPageClient";
import { ProductPageSkeleton } from "@/components/store/Skeletons";

interface ProductPageProps {
    params: Promise<{ slug: string }>;
}

/** Per-product SEO metadata (title, description, canonical, OG). */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const product = await backend.getProductBySlug(slug);
        const description =
            product.description?.trim().slice(0, 160) ||
            `Buy ${product.name} from Veronica India — premium sanitaryware since 2004.`;
        return {
            title: `${product.name} — Veronica India`,
            description,
            alternates: { canonical: `/product/${slug}` },
            // OG image is supplied by the colocated opengraph-image route.
            openGraph: { title: product.name, description, type: "website" },
        };
    } catch {
        return { title: "Product — Veronica India" };
    }
}

/** Schema.org Product structured data for rich results. */
function productJsonLd(product: Product) {
    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description || undefined,
        image: product.images,
        brand: { "@type": "Brand", name: "Veronica India" },
        sku: product.skus[0]?.skuCode,
        offers: {
            "@type": "AggregateOffer",
            priceCurrency: "INR",
            lowPrice: getMinPrice(product),
            highPrice: getMaxBasePrice(product),
            offerCount: product.skus.length,
            availability: "https://schema.org/InStock",
        },
    };
}

async function ProductDetailsFetcher({ slug }: { slug: string }) {
    let product: Product;
    try {
        product = await backend.getProductBySlug(slug);
    } catch {
        notFound();
    }

    const category = await backend.getCategoryById(product.categoryId).catch(() => null);
    const allCategories = await backend.getAllCategories().catch(() => []);
    const shopHref = getShopBrowseHref(buildCategoryTree(allCategories));

    // Related products from the same category subtree (excluding this one).
    const relatedProducts = category
        ? (await backend.getProductsByCategory(category.slug))
            .filter((p) => p.id !== product.id)
            .slice(0, 4)
        : [];

    const breadcrumbItems = [
        ...(category?.breadcrumb ?? []).map((cat) => ({
            label: cat.name,
            href: `/category/${cat.slug}`,
        })),
        { label: product.name },
    ];

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }}
            />
            <ProductPageClient
                product={product}
                categoryName={category?.name}
                categorySlug={category?.slug}
                breadcrumbItems={breadcrumbItems}
                shopHref={shopHref}
                relatedProducts={relatedProducts}
            />
        </>
    );
}

export default async function ProductPage({ params }: ProductPageProps) {
    const { slug } = await params;

    return (
        <Suspense fallback={<ProductPageSkeleton />}>
            <ProductDetailsFetcher slug={slug} />
        </Suspense>
    );
}
