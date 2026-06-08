import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CategoryCardImage from "@/components/store/CategoryCardImage";

interface CategoryCardProps {
    name: string;
    slug: string;
    image?: string | null;
    className?: string;
}

export default function CategoryCard({
    name,
    slug,
    image,
    className = "",
}: CategoryCardProps) {
    return (
        <Link
            href={`/category/${slug}`}
            className={`category-card group block aspect-[4/3] ${className}`}
        >
            <CategoryCardImage src={image} alt={name} />
            <div className="category-card-content">
                <h3 className="text-white text-base md:text-lg font-bold leading-snug">
                    {name}
                </h3>
                <span className="text-white/50 text-xs flex items-center gap-1 mt-1.5 group-hover:text-white/80 transition-colors">
                    Browse Collection <ChevronRight size={13} />
                </span>
            </div>
        </Link>
    );
}
