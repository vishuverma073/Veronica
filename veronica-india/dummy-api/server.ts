/**
 * Veronica DUMMY backend — a real HTTP server for local testing.
 *
 * It reuses the EXACT same MSW request handlers + seed data the frontend mocks
 * use (so every response shape matches the `@veronica/contracts` schemas the FE
 * validates against), served over real HTTP via @mswjs/http-middleware. On top
 * of that it adds the one thing MSW can't do: REAL cookie-based auth — so the
 * frontend can run with NEXT_PUBLIC_USE_MOCKS=false against an external API,
 * exactly as it will against the production backend.
 *
 * Run:  npm run dummy-api   (listens on 0.0.0.0:8787 by default)
 * Then: NEXT_PUBLIC_USE_MOCKS=false + NEXT_PUBLIC_USE_API_PROXY=true (recommended)
 *    or NEXT_PUBLIC_API_URL=http://<your-lan-ip>:8787
 *
 * State is in-memory and lives in THIS process, so — unlike the mocks — it
 * survives frontend reloads (cart/orders/addresses persist until you restart
 * the server).
 */
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { networkInterfaces } from "node:os";
import { createMiddleware } from "@mswjs/http-middleware";
import { handlers } from "@/mocks/handlers";
import {
  MOCK_OTP,
  MOCK_USER_TOKEN,
  getOrCreateUser,
  setCurrentPhone,
  serverCart,
} from "@/mocks/data/account";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

const DEV_LAN_ORIGIN =
  /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const REFRESH_COOKIE = "veronica_refresh";

/** refreshToken -> phone. The httpOnly cookie carries the opaque refresh token. */
const sessions = new Map<string, string>();
function newRefreshToken() {
  return `rt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

const app = express();

// Real CORS with credentials (localhost or LAN dev origins).
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin === WEB_ORIGIN) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && DEV_LAN_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true, backend: "dummy" }));

// ── Real cookie auth (overrides the marker-based mock auth) ──────────────────
// Registered BEFORE the MSW middleware so these win; everything else falls
// through to the reused handlers. Body parsing is route-level so the MSW
// middleware still receives raw bodies for the other POST/PATCH routes.

app.post("/auth/otp/verify", express.json(), (req, res) => {
  const { phone, code } = (req.body ?? {}) as { phone?: string; code?: string };
  if (!phone || code !== MOCK_OTP) {
    return res.status(401).json({ error: "invalid_otp" });
  }
  const user = getOrCreateUser(phone);
  setCurrentPhone(user.phone);
  const token = newRefreshToken();
  sessions.set(token, user.phone);
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  res.json({ accessToken: MOCK_USER_TOKEN, user });
});

app.post("/auth/refresh", (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  const phone = token ? sessions.get(token) : undefined;
  if (!phone) return res.status(401).json({ error: "unauthorized" });
  const user = getOrCreateUser(phone);
  setCurrentPhone(user.phone);
  res.json({ accessToken: MOCK_USER_TOKEN, user });
});

app.post("/auth/logout", (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) sessions.delete(token);
  setCurrentPhone(null);
  serverCart.length = 0; // mirror the mock's logout cart-clear
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// ── Everything else: the reused MSW handlers, served over real HTTP ──────────
app.use(createMiddleware(...handlers));

app.listen(PORT, HOST, () => {
  console.log(`\n  Veronica dummy backend → http://${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const net of ifaces ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          console.log(`  → LAN: http://${net.address}:${PORT}`);
        }
      }
    }
  }
  console.log(`  CORS origin: ${WEB_ORIGIN} (+ private LAN IPs in dev)`);
  console.log(`  OTP code: ${MOCK_OTP}  ·  admin: admin@test.local / admin123\n`);
});
