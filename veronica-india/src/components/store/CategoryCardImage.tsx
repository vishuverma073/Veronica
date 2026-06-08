"use client";

import { useState } from "react";
import Image from "next/image";
import { FolderOpen } from "lucide-react";
import { getSafeImageSrc } from "@/lib/utils";

interface CategoryCardImageProps {
    src: string | null | undefined;
    alt: string;
}

export default function CategoryCardImage({ src, alt }: CategoryCardImageProps) {
    const safeSrc = getSafeImageSrc(src);
    const [failed, setFailed] = useState(false);

    if (!safeSrc || failed) {
        return (
            <div
                className="absolute inset-0 bg-gradient-to-br from-brand-orange/25 via-brand-black/80 to-brand-black flex items-center justify-center"
                aria-hidden
            >
                <FolderOpen size={40} className="text-white/40" strokeWidth={1.5} />
            </div>
        );
    }

    return (
        <Image
            src={safeSrc}
            alt={alt}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            sizes="(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 25vw"
            onError={() => setFailed(true)}
        />
    );
}
