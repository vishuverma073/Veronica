import ProductsList from "@/components/admin/ProductsList";
import ArchivedCategoriesPanel from "@/components/admin/ArchivedCategoriesPanel";

export default function ArchivedProductsPage() {
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-text-primary mb-1">Archive</h1>
        <p className="text-sm text-text-muted mb-6">
          Archived categories, subcategories, and products are hidden from the storefront. Restore
          them here when needed.
        </p>
      </div>
      <ArchivedCategoriesPanel />
      <ProductsList
        title="Archived products"
        lockedStatus="archived"
        emptyMessage="No archived products yet."
        showRestore
        showDelete
      />
    </div>
  );
}
