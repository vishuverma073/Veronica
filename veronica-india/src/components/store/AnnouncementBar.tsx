"use client";

import { useMemo } from "react";
import { useStoreSettings } from "@/lib/use-store-settings";
import { formatPrice } from "@/lib/utils";

function buildMessages(freeDeliveryAbove: number): string[] {
  return [
    `Free delivery on orders above ${formatPrice(freeDeliveryAbove)}`,
    "Trusted since 2004",
    "Premium quartz sinks · faucets · fittings",
    "Pan India delivery",
    "Quality products with warranty support",
    "WhatsApp support for quick assistance",
  ];
}

function TickerTrack({ messages, ariaHidden }: { messages: string[]; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={ariaHidden}>
      {messages.map((message, index) => (
        <span key={`${message}-${index}`} className="flex shrink-0 items-center">
          <span className="whitespace-nowrap px-8 md:px-12">{message}</span>
          <span className="text-white/30 select-none" aria-hidden>
            •
          </span>
        </span>
      ))}
    </div>
  );
}

export default function AnnouncementBar() {
  const { data: storeSettings } = useStoreSettings();
  const freeDeliveryAbove = storeSettings?.shippingFreeAbove ?? 5000;
  const messages = useMemo(() => buildMessages(freeDeliveryAbove), [freeDeliveryAbove]);

  return (
    <div
      className="group/announce bg-brand-black text-white text-[10px] sm:text-[11px] py-2 font-medium tracking-[0.18em] sm:tracking-widest uppercase overflow-hidden border-b border-white/5"
      role="region"
      aria-label="Store announcements"
    >
      {/* Animated ticker — seamless loop via duplicated track */}
      <div className="relative motion-reduce:hidden">
        <div className="flex w-max animate-marquee group-hover/announce:[animation-play-state:paused]">
          <TickerTrack messages={messages} />
          <TickerTrack messages={messages} ariaHidden />
        </div>
      </div>

      {/* Reduced motion: static single-line list */}
      <p className="hidden motion-reduce:block text-center px-4 leading-relaxed">
        {messages.join("  ·  ")}
      </p>

      <span className="sr-only">{messages.join(". ")}</span>
    </div>
  );
}
