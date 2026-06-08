#!/usr/bin/env node
/**
 * Prints LAN URLs for testing the storefront/admin on a phone.
 * Run via `npm run dev:lan` or standalone: node scripts/print-lan-url.mjs
 */
import { networkInterfaces } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

const PORT = Number(process.env.PORT ?? 3000);
const API_PORT = Number(process.env.API_PORT ?? 8787);
const useProxy = process.env.NEXT_PUBLIC_USE_API_PROXY === "true";

function lanIpv4Addresses() {
  const out = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const net of ifaces ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const ips = lanIpv4Addresses();

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Veronica — local network (Wi‑Fi) dev URLs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log(`  Next.js binds: 0.0.0.0:${PORT} (all interfaces)\n`);

if (ips.length === 0) {
  console.log("  ⚠ Could not detect a LAN IPv4 address.");
  console.log("    Connect to Wi‑Fi, then run: ipconfig getifaddr en0 (Mac)\n");
} else {
  for (const ip of ips) {
    console.log(`  📱 Open on your phone:  http://${ip}:${PORT}`);
  }
  console.log("");
}

if (useProxy) {
  console.log("  API mode: proxy via Next.js (/veronica-api → API_PROXY_TARGET)");
  console.log(`  Backend target: ${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787"}`);
} else if (process.env.NEXT_PUBLIC_API_URL) {
  console.log(`  API (browser): ${process.env.NEXT_PUBLIC_API_URL}`);
} else {
  console.log("  Tip: copy .env.local.example → .env.local and set NEXT_PUBLIC_USE_API_PROXY=true");
  if (ips[0]) {
    console.log(`       or NEXT_PUBLIC_API_URL=http://${ips[0]}:${API_PORT}`);
  }
}

console.log("\n  Start the API:  cd veronica-api- && pnpm dev");
console.log("  (API already listens on 0.0.0.0 — phone uses Next proxy, not API port directly)\n");
