"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";
import {
  GOOGLE_MAPS_EMBED_URL,
  GOOGLE_MAPS_OPEN_URL,
  STORE_ADDRESS_LINES,
} from "@/lib/store-location";

const LOAD_TIMEOUT_MS = 10_000;

type MapState = "loading" | "ready" | "error";

export default function StoreLocationMap({ className = "" }: { className?: string }) {
  const [state, setState] = useState<MapState>("loading");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState((prev) => (prev === "loading" ? "error" : prev));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function handleLoad() {
    setState("ready");
  }

  if (state === "error") {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl bg-white/5 border border-white/10 p-6 text-center min-h-[220px] md:min-h-[280px] ${className}`}
      >
        <MapPin size={28} className="text-brand-orange mb-3" strokeWidth={1.5} />
        <p className="text-sm font-semibold text-white mb-2">Map unavailable</p>
        <p className="text-sm text-white/70 leading-relaxed mb-4">
          {STORE_ADDRESS_LINES.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <Link
          href={GOOGLE_MAPS_OPEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn bg-white text-brand-black text-sm inline-flex gap-2 hover:bg-white/90"
        >
          <ExternalLink size={15} />
          Open in Google Maps
        </Link>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl ${className}`}>
      {state === "loading" && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/5 border border-white/10 animate-pulse"
          aria-label="Loading map"
        >
          <MapPin size={24} className="text-white/40 mb-2" />
          <p className="text-xs font-medium text-white/50">Loading map…</p>
        </div>
      )}
      <div className="relative w-full aspect-[4/3] md:aspect-[16/10] min-h-[220px] md:min-h-[280px]">
        <iframe
          title="Veronica India location on Google Maps"
          src={GOOGLE_MAPS_EMBED_URL}
          className="absolute inset-0 h-full w-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={handleLoad}
        />
      </div>
    </div>
  );
}
