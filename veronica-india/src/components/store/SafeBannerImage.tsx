"use client";

import { useState } from "react";
import Image from "next/image";
import { getSafeImageSrc } from "@/lib/utils";

interface SafeBannerImageProps {
    src: string | null | undefined;
    alt: string;
    fallbackSrc: string;
    className?: string;
    priority?: boolean;
    quality?: number;
}

export default function SafeBannerImage({
    src,
    alt,
    fallbackSrc,
    className = "object-cover",
    priority,
    quality,
}: SafeBannerImageProps) {
    const initialSrc = getSafeImageSrc(src) ?? getSafeImageSrc(fallbackSrc);
    const [activeSrc, setActiveSrc] = useState(initialSrc);
    const [failed, setFailed] = useState(false);

    if (!activeSrc || failed) {
        return <div className={`absolute inset-0 bg-brand-black ${className}`} aria-hidden />;
    }

    return (
        <Image
            src={activeSrc}
            alt={alt}
            fill
            className={className}
            priority={priority}
            quality={quality}
            sizes="100vw"
            onError={() => {
                const fallback = getSafeImageSrc(fallbackSrc);
                if (fallback && fallback !== activeSrc) {
                    setActiveSrc(fallback);
                    return;
                }
                setFailed(true);
            }}
        />
    );
}
