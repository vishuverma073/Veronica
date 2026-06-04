import { sign, verify } from "hono/jwt";

const ADMIN_ISSUER = "veronica-admin";
const ADMIN_TTL_SECONDS = 8 * 60 * 60; // 8h — admins re-login each day; no refresh tokens.

function adminSecret(): string {
  const secret = process.env.JWT_ADMIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ADMIN_SECRET is missing or shorter than 32 chars");
  }
  return secret;
}

export interface AdminTokenPayload {
  sub: string;
}

/** Sign an 8h HS256 admin access token. */
export async function signAdminAccess(payload: AdminTokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: payload.sub, iss: ADMIN_ISSUER, iat: now, exp: now + ADMIN_TTL_SECONDS },
    adminSecret(),
    "HS256",
  );
}

/** Verify an admin token; throws if invalid/expired/wrong-issuer. */
export async function verifyAdminAccess(token: string): Promise<AdminTokenPayload> {
  const payload = await verify(token, adminSecret(), "HS256");
  if (payload.iss !== ADMIN_ISSUER) {
    throw new Error("invalid token issuer");
  }
  if (typeof payload.sub !== "string") {
    throw new Error("invalid token subject");
  }
  return { sub: payload.sub };
}

// ─── Customer auth (Phase 3) — separate secrets + issuer from admin ──────────

const ACCESS_TTL_SECONDS = 15 * 60; // 15 min
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function accessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_ACCESS_SECRET is missing or shorter than 32 chars");
  return s;
}
function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_REFRESH_SECRET is missing or shorter than 32 chars");
  return s;
}
function customerIssuer(): string {
  return process.env.JWT_ISSUER ?? "veronica-api";
}

export async function signAccess(payload: { sub: string; isAdmin: boolean }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: payload.sub, isAdmin: payload.isAdmin, iss: customerIssuer(), iat: now, exp: now + ACCESS_TTL_SECONDS },
    accessSecret(),
    "HS256",
  );
}

export async function signRefresh(payload: { sub: string; jti: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: payload.sub, jti: payload.jti, iss: customerIssuer(), iat: now, exp: now + REFRESH_TTL_SECONDS },
    refreshSecret(),
    "HS256",
  );
}

export async function verifyAccess(token: string): Promise<{ sub: string; isAdmin: boolean }> {
  const p = await verify(token, accessSecret(), "HS256");
  if (p.iss !== customerIssuer()) throw new Error("invalid token issuer");
  if (typeof p.sub !== "string") throw new Error("invalid token subject");
  return { sub: p.sub, isAdmin: p.isAdmin === true };
}

export async function verifyRefresh(token: string): Promise<{ sub: string; jti: string }> {
  const p = await verify(token, refreshSecret(), "HS256");
  if (p.iss !== customerIssuer()) throw new Error("invalid token issuer");
  if (typeof p.sub !== "string" || typeof p.jti !== "string") throw new Error("invalid refresh token");
  return { sub: p.sub, jti: p.jti };
}

export const REFRESH_TTL = REFRESH_TTL_SECONDS;
