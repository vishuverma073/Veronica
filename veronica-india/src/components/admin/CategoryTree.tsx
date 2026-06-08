"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Pencil,
  Trash2,
  Archive,
  ChevronDown,
  ChevronRight,
  GripVertical,
  SquarePen,
  Package,
} from "lucide-react";
import type { Category } from "@veronica/contracts";
import { cn, formatPrice } from "@/lib/utils";
import AdminProductThumb from "@/components/admin/AdminProductThumb";
import {
  buildCategoryTree,
  getChildren,
  getDescendantCount,
  getSubtreeProductCount,
  type CategoryTreeNode,
} from "@/lib/category-tree";
import type { AdminListProduct } from "@/lib/admin-api";
import { logCategoryPanel } from "@/lib/admin-category-debug";

const INDENT_PX = 16;

export function CategoryTreePanel({
  categories,
  productCountMap,
  collapsed,
  selectedId,
  onToggleCollapse,
  onSelect,
  onAddChild,
  onEdit,
  onArchive,
  onDelete,
  onReorderSiblings,
}: {
  categories: Category[];
  productCountMap: Map<number, number>;
  collapsed: Set<number>;
  selectedId: number | null;
  onToggleCollapse: (id: number) => void;
  onSelect: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onEdit: (cat: Category) => void;
  onArchive: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  onReorderSiblings: (parentId: number | null, orderedIds: number[]) => Promise<void>;
}) {
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeCat = byId.get(Number(active.id));
    const overCat = byId.get(Number(over.id));
    if (!activeCat || !overCat || activeCat.parentId !== overCat.parentId) return;
    const siblings = getChildren(categories, activeCat.parentId).map((c) => c.id);
    const oldIndex = siblings.indexOf(activeCat.id);
    const newIndex = siblings.indexOf(overCat.id);
    if (oldIndex < 0 || newIndex < 0) return;
    await onReorderSiblings(activeCat.parentId, arrayMove(siblings, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <CategoryTreeLevel
          nodes={tree}
          depth={0}
          categories={categories}
          productCountMap={productCountMap}
          collapsed={collapsed}
          selectedId={selectedId}
          onToggleCollapse={onToggleCollapse}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      </div>
    </DndContext>
  );
}

function CategoryTreeLevel({
  nodes,
  depth,
  categories,
  productCountMap,
  collapsed,
  selectedId,
  onToggleCollapse,
  onSelect,
  onAddChild,
  onEdit,
  onArchive,
  onDelete,
}: {
  nodes: CategoryTreeNode[];
  depth: number;
  categories: Category[];
  productCountMap: Map<number, number>;
  collapsed: Set<number>;
  selectedId: number | null;
  onToggleCollapse: (id: number) => void;
  onSelect: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onEdit: (cat: Category) => void;
  onArchive: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}) {
  if (nodes.length === 0) return null;
  const ids = nodes.map((n) => n.id);
  const wrapperClass =
    depth === 0
      ? "bg-white border border-border-light rounded-xl shadow-sm overflow-hidden divide-y divide-border-light/70"
      : "border-l-2 border-border ml-3";

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className={wrapperClass}>
        {nodes.map((node) => (
          <div key={node.id}>
            <SortableCategoryRow
              cat={node}
              depth={depth}
              hasKids={node.children.length > 0}
              expanded={!collapsed.has(node.id)}
              productCount={getSubtreeProductCount(categories, node.id, productCountMap)}
              childCount={getDescendantCount(categories, node.id)}
              isSelected={selectedId === node.id}
              onToggle={() => onToggleCollapse(node.id)}
              onSelect={() => onSelect(node.id)}
              onAddChild={() => onAddChild(node.id)}
              onEdit={() => onEdit(node)}
              onArchive={() => onArchive(node)}
              onDelete={() => onDelete(node)}
            />
            {node.children.length > 0 && !collapsed.has(node.id) && (
              <div className="bg-surface-dim/40 pb-1">
                <CategoryTreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  categories={categories}
                  productCountMap={productCountMap}
                  collapsed={collapsed}
                  selectedId={selectedId}
                  onToggleCollapse={onToggleCollapse}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </SortableContext>
  );
}

function SortableCategoryRow({
  cat,
  depth,
  hasKids,
  expanded,
  productCount,
  childCount,
  isSelected,
  onToggle,
  onSelect,
  onAddChild,
  onEdit,
  onArchive,
  onDelete,
}: {
  cat: Category;
  depth: number;
  hasKids: boolean;
  expanded: boolean;
  productCount: number;
  childCount: number;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${12 + depth * INDENT_PX}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 py-2.5 pr-3",
        isSelected && "bg-brand-orange/10",
        isDragging && "opacity-60 z-10 bg-white shadow-sm",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="p-1 rounded text-text-muted/60 hover:text-text-muted cursor-grab touch-none shrink-0"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      {hasKids ? (
        <button
          type="button"
          onClick={onToggle}
          className="text-text-muted hover:text-brand-orange shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left" title="View products">
        <p
          className={cn(
            "font-medium truncate",
            depth === 0 ? "text-sm" : "text-[13px]",
            isSelected ? "text-brand-orange" : "text-text-primary",
          )}
        >
          {cat.name}
        </p>
        <p className="text-[11px] text-text-muted">
          /{cat.slug} · {productCount} product{productCount === 1 ? "" : "s"}
          {childCount > 0 && ` · ${childCount} child${childCount === 1 ? "" : "ren"}`}
        </p>
      </button>
      <button
        type="button"
        onClick={onAddChild}
        className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim"
        aria-label="Add child category"
        title="Add child category"
      >
        <Plus size={15} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim"
        aria-label="Edit category"
        title="Edit category"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={onArchive}
        className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim"
        aria-label="Archive Category"
        title="Archive Category"
      >
        <Archive size={15} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-red-50"
        aria-label="Delete Category"
        title="Delete Category"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export function CategoryProductsPanel({
  selected,
  products,
  productsLoading,
  onArchive,
  onDelete,
}: {
  selected: Category | null;
  products: AdminListProduct[];
  productsLoading: boolean;
  onArchive: (product: AdminListProduct) => void;
  onDelete: (product: AdminListProduct) => void;
}) {
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const directInList = selected
    ? sortedProducts.filter((p) => p.categoryId === selected.id).length
    : 0;
  const childInList = sortedProducts.length - directInList;
  const hasDescendants = childInList > 0;

  useEffect(() => {
    if (!selected) return;
    logCategoryPanel("selection", {
      categoryId: selected.id,
      categoryName: selected.name,
      slug: selected.slug,
      directCount: selected.productCount ?? 0,
      subtreeCount: selected.subtreeProductCount ?? sortedProducts.length,
      loadedCount: sortedProducts.length,
      productIds: sortedProducts.map((p) => p.id),
      countSource: "admin/categories productCount + subtreeProductCount",
    });
    if ((selected.subtreeProductCount ?? sortedProducts.length) !== sortedProducts.length) {
      logCategoryPanel("count mismatch", {
        subtreeCount: selected.subtreeProductCount ?? sortedProducts.length,
        loadedCount: sortedProducts.length,
      });
    }
  }, [selected, sortedProducts]);

  if (!selected) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-light bg-surface-dim/30 py-20 text-text-muted">
        <Package size={28} />
        <p className="text-sm">Select a category to see its products.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-light bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-light">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary truncate">{selected.name}</p>
          <p className="text-[11px] text-text-muted">
            {sortedProducts.length} product{sortedProducts.length === 1 ? "" : "s"}
            {hasDescendants &&
              ` · ${directInList} direct · ${childInList} in subcategories`}
          </p>
        </div>
        <Link
          href={`/admin/products/new?category=${selected.id}`}
          className="btn btn-secondary text-xs px-2.5 py-1.5 shrink-0"
        >
          <Plus size={13} /> Add
        </Link>
      </div>

      {productsLoading ? (
        <div className="flex flex-col items-center gap-2 py-14 text-text-muted">
          <Package size={26} className="animate-pulse" />
          <p className="text-sm">Loading products…</p>
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-text-muted">
          <Package size={26} />
          <p className="text-sm">No products in this category.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-light max-h-[72vh] overflow-y-auto">
          {sortedProducts.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3.5 py-3 hover:bg-surface-dim/60 group">
              <Link
                href={`/admin/products/${p.id}/edit`}
                className="flex items-center gap-4 flex-1 min-w-0"
              >
                <div className="w-20 h-20 rounded-xl bg-[#f4f4f5] border border-border-light overflow-hidden shrink-0 flex items-center justify-center">
                  <AdminProductThumb src={p.image} className="p-1.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-text-primary line-clamp-2">{p.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatPrice(p.minPrice)} · {p.status}
                  </p>
                  {hasDescendants && p.categoryId !== selected.id && (
                    <p className="text-[11px] text-text-muted/80 mt-0.5">
                      in {p.categoryName || "subcategory"}
                    </p>
                  )}
                </div>
                <SquarePen
                  size={18}
                  className="text-text-muted group-hover:text-brand-orange shrink-0"
                  aria-hidden
                />
              </Link>
              <button
                type="button"
                onClick={() => onArchive(p)}
                className="p-1.5 rounded-lg text-text-muted hover:text-brand-orange hover:bg-surface-dim shrink-0"
                aria-label="Archive Product"
                title="Archive Product"
              >
                <Archive size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-red-50 shrink-0"
                aria-label="Delete Product"
                title="Delete Product"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
