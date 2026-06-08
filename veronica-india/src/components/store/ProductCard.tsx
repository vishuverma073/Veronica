import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice, productImageUrl } from "@/lib/utils";

interface ProductCardProps {
    slug: string;
    name: string;
    image: string;
    minPrice: number;
    maxBasePrice: number; // highest MRP for strikethrough
    discount: number; // best discount %
    isBestseller: boolean;
    isNew: boolean;
}

export default function ProductCard({
    slug,
    name,
    image,
    minPrice,
    maxBasePrice,
    discount,
    isBestseller,
    isNew,
}: ProductCardProps) {
    const imageUrl = productImageUrl(image);

    return (
        <Link href={`/product/${slug}`} className="card group block">
            {/* Image Container — fixed aspect ratio for uniform cards. A soft
                near-white (#f4f4f5, both themes) matches the product photos'
                studio background so they blend in rather than the photo's square
                popping against the dark card. Set via inline style so it always
                applies (an arbitrary Tailwind bg class can miss a dev rebuild). */}
            <div
                className="relative aspect-[4/3] overflow-hidden"
                style={{ backgroundColor: "#f4f4f5" }}
            >
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={name}
                        fill
                        className="object-contain p-6 transition-transform duration-500 ease-out group-hover:scale-108"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Package size={40} className="text-text-muted" aria-hidden />
                    </div>
                )}

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    {isBestseller && (
                        <span className="badge badge-bestseller">Bestseller</span>
                    )}
                    {isNew && <span className="badge badge-new">New</span>}
                </div>

                {discount > 0 && (
                    <span className="absolute top-3 right-3 badge badge-discount">
                        -{discount}%
                    </span>
                )}

                {/* Quick-view overlay on hover */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Info */}
            <div className="p-4">
                <h3 className="text-sm font-semibold text-text-primary line-clamp-2 mb-3 min-h-[2.5rem] leading-snug">
                    {name}
                </h3>

                <div className="flex items-baseline gap-2 mb-3">
                    <span className="price-sale">
                        {minPrice < maxBasePrice ? "From " : ""}
                        {formatPrice(minPrice)}
                    </span>
                    {discount > 0 && (
                        <span className="price-mrp">{formatPrice(maxBasePrice)}</span>
                    )}
                </div>

                <div className="btn btn-secondary w-full text-xs py-2.5 group-hover:bg-brand-orange group-hover:text-white group-hover:border-brand-orange transition-all duration-300">
                    View Details
                </div>
            </div>
        </Link>
    );
}
