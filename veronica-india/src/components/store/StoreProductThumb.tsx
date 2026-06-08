import Image from "next/image";
import { Package } from "lucide-react";
import { cn, productImageUrl } from "@/lib/utils";

export default function StoreProductThumb({
  src,
  alt,
  width,
  height,
  className,
  iconSize = 22,
}: {
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  iconSize?: number;
}) {
  const url = productImageUrl(src);
  if (!url) {
    return (
      <span
        className={cn("flex items-center justify-center w-full h-full", className)}
        style={{ width, height }}
      >
        <Package size={iconSize} className="text-text-muted" aria-hidden />
      </span>
    );
  }
  return <Image src={url} alt={alt} width={width} height={height} className={className} />;
}
