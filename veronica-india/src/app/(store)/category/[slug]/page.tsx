import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { backend } from "@/lib/backend";
import { buildCategoryTree } from "@/lib/category-tree";
import type { CategoryWithBreadcrumb } from "@veronica/contracts";
import Breadcrumb from "@/components/store/Breadcrumb";
import CategorySidebar from "@/components/store/CategorySidebar";
import SectionHeader from "@/components/store/SectionHeader";
import CategoryProductLoader from "@/components/store/CategoryProductLoader";
import { ProductCarouselSkeleton } from "@/components/store/Skeletons";
import LastVisitedCategoryTracker from "@/components/store/nav/LastVisitedCategoryTracker";
import { getShopBrowseHref } from "@/lib/shop-nav";

interface CategoryPageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const category = await backend.getCategoryBySlug(slug);
        return { title: `${category.name} — Veronica India`, description: category.description };
    } catch {
        return {};
    }
}

async function CategoryProductsSection({ slug }: { slug: string }) {
    return <CategoryProductLoader slug={slug} />;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
    const { slug } = await params;

    let category: CategoryWithBreadcrumb;
    try {
        category = await backend.getCategoryBySlug(slug);
    } catch {
        notFound();
    }

    const breadcrumb = category.breadcrumb; // root → … → self
    const isRootNode = category.parentId === null;
    const parentCategory = isRootNode ? category : breadcrumb[breadcrumb.length - 2];

    // Sibling pills = the parent's children (one extra fetch only for sub-pages), alphabetical.
    const displaySubCategories = [
        ...(isRootNode
            ? category.children
            : (await backend.getCategoryBySlug(parentCategory.slug)).children),
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const hasSubCategories = displaySubCategories.length > 0;

    // Sidebar + mobile tabs: expandable tree on the active branch.
    const allCategories = await backend.getAllCategories();
    const breadcrumbIdSet = new Set(breadcrumb.map((c) => c.id));

    const breadcrumbItems = breadcrumb.map((cat, i) => ({
        label: cat.name,
        ...(i < breadcrumb.length - 1 ? { href: `/category/${cat.slug}` } : {}),
    }));

    const shopHref = getShopBrowseHref(buildCategoryTree(allCategories));

    return (
        <div className="max-w-380 mx-auto px-4 py-8">
            <LastVisitedCategoryTracker slug={slug} name={category.name} />
            <Breadcrumb items={breadcrumbItems} shopHref={shopHref} className="mb-8" />

            <div className="flex gap-10">
                {/* Desktop Sidebar */}
                <aside className="hidden lg:block w-56 shrink-0">
                    <div className="sticky top-24">
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-4">
                            Categories
                        </h3>
                        <CategorySidebar
                            categories={allCategories}
                            currentSlug={slug}
                            breadcrumbIds={breadcrumbIdSet}
                        />
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    <SectionHeader title={category.name} subtitle={category.description} />

                    {/* Mobile Category Tabs */}
                    <div className="lg:hidden flex gap-4 overflow-x-auto scroll-x-hidden border-b border-border-light mb-6">
                        {allCategories
                            .filter((c) => c.parentId === null)
                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                            .map((cat) => (
                            <Link
                                key={cat.id}
                                href={`/category/${cat.slug}`}
                                className={`category-tab ${cat.slug === slug || breadcrumb.some((a) => a.id === cat.id) ? "active" : ""}`}
                            >
                                {cat.name}
                            </Link>
                        ))}
                    </div>

                    {/* Subcategory Pills */}
                    {hasSubCategories && (
                        <div className="flex gap-2 overflow-x-auto scroll-x-hidden pb-4 mb-6">
                            <Link
                                href={`/category/${parentCategory.slug}`}
                                className={`subcat-pill ${category.id === parentCategory.id ? "active" : ""}`}
                            >
                                All
                            </Link>
                            {displaySubCategories.map((sub) => (
                                <Link
                                    key={sub.id}
                                    href={`/category/${sub.slug}`}
                                    className={`subcat-pill ${category.id === sub.id ? "active" : ""}`}
                                >
                                    {sub.name}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Product Grid */}
                    <Suspense
                        fallback={
                            <div className="mt-8">
                                <ProductCarouselSkeleton columns={3} />
                            </div>
                        }
                    >
                        <CategoryProductsSection slug={slug} />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
