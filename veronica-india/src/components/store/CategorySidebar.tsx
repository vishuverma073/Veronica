import Link from "next/link";
import type { Category } from "@veronica/contracts";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/category-tree";
import { cn } from "@/lib/utils";

export default function CategorySidebar({
  categories,
  currentSlug,
  breadcrumbIds,
}: {
  categories: Category[];
  currentSlug: string;
  breadcrumbIds: Set<number>;
}) {
  const tree = buildCategoryTree(categories);

  return (
    <nav className="space-y-0.5">
      {tree.map((node) => (
        <SidebarNode
          key={node.id}
          node={node}
          depth={0}
          currentSlug={currentSlug}
          breadcrumbIds={breadcrumbIds}
        />
      ))}
    </nav>
  );
}

function SidebarNode({
  node,
  depth,
  currentSlug,
  breadcrumbIds,
}: {
  node: CategoryTreeNode;
  depth: number;
  currentSlug: string;
  breadcrumbIds: Set<number>;
}) {
  const isActive = node.slug === currentSlug;
  const onPath = breadcrumbIds.has(node.id);
  const isRoot = depth === 0;
  const showChildren =
    node.children.length > 0 && (onPath || node.children.some((c) => breadcrumbIds.has(c.id)));

  return (
    <div className={isRoot ? "mb-1" : undefined}>
      <Link
        href={`/category/${node.slug}`}
        className={cn(
          "block rounded-xl transition-all duration-200",
          isRoot
            ? "py-2 text-sm font-bold tracking-tight"
            : "py-1.5 text-[13px] font-normal",
          isActive
            ? isRoot
              ? "bg-brand-orange text-white shadow-sm"
              : "bg-brand-orange-light/80 text-brand-orange/80 font-medium"
            : onPath && isRoot
              ? "bg-brand-orange text-white shadow-sm"
              : onPath
                ? "text-brand-orange/75 font-medium hover:bg-brand-orange-light/50"
                : isRoot
                  ? "text-text-primary hover:bg-surface-dim"
                  : "text-text-secondary/70 hover:bg-surface-dim hover:text-text-secondary",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "12px" }}
      >
        {node.name}
      </Link>
      {showChildren && (
        <div className="mt-0.5 ml-1 border-l border-border/30 pl-1">
          {node.children.map((child) => (
            <SidebarNode
              key={child.id}
              node={child}
              depth={depth + 1}
              currentSlug={currentSlug}
              breadcrumbIds={breadcrumbIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
