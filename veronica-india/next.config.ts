import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";

function apiConnectSrc(): string {
  if (process.env.NEXT_PUBLIC_USE_API_PROXY === "true") {
    return "'self'";
  }
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  try {
    return `'self' ${new URL(raw).origin}`;
  } catch {
    return "'self' http://localhost:8787";
  }
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
    remotePatterns: [
      // Supabase Storage (admin image uploads, once wired)
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Placeholder host used by MSW mock image URLs (serves real PNGs)
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
    ],
  },
  async redirects() {
    return [
      // Retired category slug → canonical (keeps old external links alive).
      {
        source: "/category/health-faucets",
        destination: "/category/health-faucet-sets",
        permanent: true,
      },
    ];
  },
  /** Proxy API through Next on the same origin — best for phone/LAN testing (no CORS). */
  async rewrites() {
    const useProxy = process.env.NEXT_PUBLIC_USE_API_PROXY === "true";
    if (!useProxy) return [];
    const target = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";
    return [
      {
        source: "/veronica-api/:path*",
        destination: `${target}/:path*`,
      },
    ];
  },
  async headers() {
    // Permissive but meaningful: blocks clickjacking + MIME-sniffing, and a CSP
    // that still allows Next.js' inline runtime, Razorpay checkout, the UPI QR
    // (api.qrserver.com → https img), Supabase images, and the API. HSTS only in
    // production builds. Tighten the CSP (nonces, drop unsafe-*) later.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com",
      "connect-src 'self' https: ws: wss: " + apiConnectSrc(),
      "frame-src 'self' https://www.google.com https://maps.google.com https://api.razorpay.com https://*.razorpay.com",
    ].join("; ");

    const headers = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
      { key: "Content-Security-Policy", value: csp },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
