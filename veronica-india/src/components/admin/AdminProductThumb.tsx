import { Package } from "lucide-react";
import { cn, productImageUrl } from "@/lib/utils";

export default function AdminProductThumb({
  src,
  className,
  iconSize = 22,
}: {
  src: string | null | undefined;
  className?: string;
  iconSize?: number;
}) {
  const url = productImageUrl(src);
  if (!url) {
    return <Package size={iconSize} className="text-text-muted shrink-0" aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("w-full h-full object-contain", className)} />
  );
}
