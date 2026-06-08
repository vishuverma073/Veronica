import React from "react";
import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    className?: string;
    /** Insert a Shop link after Home for category/product pages. */
    shopHref?: string;
}

export default function Breadcrumb({ items, className = "", shopHref }: BreadcrumbProps) {
    const trail = shopHref
        ? [{ label: "Shop", href: shopHref }, ...items]
        : items;

    return (
        <nav className={`breadcrumb ${className}`} aria-label="Breadcrumb">
            <Link href="/" className="breadcrumb-item" aria-label="Home">
                <Home size={15} strokeWidth={2} />
            </Link>

            {trail.map((item, i) => {
                const isLast = i === trail.length - 1;
                return (
                    <React.Fragment key={`${item.label}-${i}`}>
                        <ChevronRight size={13} className="breadcrumb-separator" />
                        {isLast || !item.href ? (
                            <span className="breadcrumb-item active" aria-current={isLast ? "page" : undefined}>{item.label}</span>
                        ) : (
                            <Link href={item.href} className="breadcrumb-item">
                                {item.label}
                            </Link>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
