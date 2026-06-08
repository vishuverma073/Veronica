import { serve } from "@hono/node-server";
import { networkInterfaces } from "node:os";
import { createApp } from "../app.js";
import { createDbClient } from "../db/client.js";
import { loadEnv } from "../lib/env.js";
import { initSentry } from "../lib/sentry.js";
import { flushLogs } from "../lib/logger.js";
import { isDevAuthBypass } from "../lib/dev-bypass.js";

const env = loadEnv();
initSentry();

// Loud warning if the local-only auth/payment shortcuts are active — these must
// never be on in production.
if (isDevAuthBypass()) {
  console.warn(
    "⚠️  DEV AUTH BYPASS ENABLED (ENABLE_DEV_AUTH_BYPASS=1): OTP code is exposed in responses, " +
      "OTP rate limits are skipped, and mock payment signatures are accepted. Never enable this in production.\n" +
      "   OTP codes are also printed in this terminal when you sign in (look for 🔐 DEV OTP).",
  );
}
const db = createDbClient(env.DATABASE_URL);
const app = createApp({ db });

// Bind 0.0.0.0 (all interfaces) so containers/Fly can route to it — the default
// loopback bind is unreachable through Docker/Fly port forwarding.
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`veronica-api listening on http://0.0.0.0:${info.port}`);
  for (const ip of lanIpv4Addresses()) {
    console.log(`  → LAN: http://${ip}:${info.port}`);
  }
});

function lanIpv4Addresses(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const net of ifaces ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// Flush buffered Axiom logs before exit so the last lines aren't lost.
async function shutdown(signal: string): Promise<void> {
  console.log(`received ${signal}, shutting down`);
  server.close();
  await flushLogs();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
