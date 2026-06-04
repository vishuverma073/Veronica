import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  OtpSendRequestSchema,
  OtpSendResponseSchema,
  OtpVerifyRequestSchema,
  OtpVerifyResponseSchema,
} from "@veronica/contracts";
import type { DbClient } from "../db/client.js";
import { otpCodes, users } from "../db/schema.js";
import { generateOtp, hashOtp, verifyOtp } from "../lib/otp.js";
import { sendOtp } from "../lib/sms.js";
import { checkOtpLimit, rateLimit } from "../lib/ratelimit.js";
import { isDevAuthBypass } from "../lib/dev-bypass.js";
import { REFRESH_TTL, signAccess, signRefresh, verifyRefresh } from "../lib/jwt.js";
import { isJtiRevoked, revokeJti } from "../lib/token-revocation.js";
import type { AppEnv } from "../lib/types.js";

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  // HTTPS-only in production; relaxed for local http so the cookie (and thus
  // session-restore on reload) works in dev. Browsers reject Secure cookies on
  // http://localhost.
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax",
  path: "/auth",
} as const;

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

export function makeAuthRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // POST /auth/otp/send — generate, hash+store, dispatch (stub in dev).
  router.post("/otp/send", async (c) => {
    const parsed = OtpSendRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { phone } = parsed.data;

    const limit = await checkOtpLimit(phone);
    if (!limit.allowed) {
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json({ error: "Too many OTP requests", retryAfterSeconds: limit.retryAfterSeconds }, 429);
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    await db.insert(otpCodes).values({
      phone,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });

    await sendOtp(phone, code);

    const body: Record<string, unknown> = OtpSendResponseSchema.parse({
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
    });
    // Dev convenience: SMS is stubbed locally, so echo the code in the response
    // to make manual login testing painless. Gated by the dev-auth bypass so it
    // can never be exposed in production (see lib/dev-bypass.ts).
    if (isDevAuthBypass()) body.devCode = code;
    return c.json(body);
  });

  // POST /auth/otp/verify — check code, consume OTP, upsert user, issue JWTs.
  router.post("/otp/verify", async (c) => {
    const parsed = OtpVerifyRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { phone, code } = parsed.data;

    const [row] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.id))
      .limit(1);
    if (!row) {
      const rl = await rateLimit(`otp-verify:${phone}`, 10, 900); // 10 failed verifies / 15 min / phone
      if (!rl.allowed) {
        c.header("Retry-After", String(rl.retryAfterSeconds));
        return c.json({ error: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds }, 429);
      }
      return c.json({ error: "OTP expired or not found" }, 401);
    }

    const attempts = row.attempts + 1;
    if (attempts > MAX_ATTEMPTS) {
      await db.update(otpCodes).set({ attempts, consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
      return c.json({ error: "Too many attempts" }, 429);
    }

    const ok = await verifyOtp(code, row.codeHash);
    if (!ok) {
      await db.update(otpCodes).set({ attempts }).where(eq(otpCodes.id, row.id));
      const rl = await rateLimit(`otp-verify:${phone}`, 10, 900); // 10 failed verifies / 15 min / phone
      if (!rl.allowed) {
        c.header("Retry-After", String(rl.retryAfterSeconds));
        return c.json({ error: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds }, 429);
      }
      return c.json({ error: "Invalid OTP" }, 401);
    }

    await db.update(otpCodes).set({ attempts, consumedAt: new Date() }).where(eq(otpCodes.id, row.id));

    const [user] = await db
      .insert(users)
      .values({ phone })
      .onConflictDoUpdate({ target: users.phone, set: { phone } })
      .returning();

    const accessToken = await signAccess({ sub: user!.id, isAdmin: user!.isAdmin });
    const refreshToken = await signRefresh({ sub: user!.id, jti: crypto.randomUUID() });

    setCookie(c, "refresh_token", refreshToken, { ...REFRESH_COOKIE_OPTS, maxAge: REFRESH_TTL });

    return c.json(
      OtpVerifyResponseSchema.parse({
        accessToken,
        user: {
          id: user!.id,
          phone: user!.phone,
          name: user!.name,
          email: user!.email,
          isAdmin: user!.isAdmin,
        },
      }),
    );
  });

  // POST /auth/refresh — exchange the refresh cookie for a new access token (rotates refresh).
  router.post("/refresh", async (c) => {
    const token = getCookie(c, "refresh_token");
    if (!token) return c.json({ error: "Missing refresh token" }, 401);

    let payload: { sub: string; jti: string };
    try {
      payload = await verifyRefresh(token);
    } catch {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    // A token whose jti was blacklisted on logout can no longer be exchanged,
    // even though it hasn't reached its 30-day expiry yet.
    if (await isJtiRevoked(payload.jti)) {
      return c.json({ error: "Refresh token revoked" }, 401);
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return c.json({ error: "User not found" }, 401);

    const accessToken = await signAccess({ sub: user.id, isAdmin: user.isAdmin });
    const rotated = await signRefresh({ sub: user.id, jti: crypto.randomUUID() });
    setCookie(c, "refresh_token", rotated, { ...REFRESH_COOKIE_OPTS, maxAge: REFRESH_TTL });

    return c.json(
      OtpVerifyResponseSchema.parse({
        accessToken,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
        },
      }),
    );
  });

  // POST /auth/logout — clear the refresh cookie and blacklist its jti so a
  // leaked-but-unexpired refresh token can't be reused.
  router.post("/logout", async (c) => {
    const token = getCookie(c, "refresh_token");
    if (token) {
      try {
        const { jti } = await verifyRefresh(token);
        await revokeJti(jti, REFRESH_TTL);
      } catch {
        // Already invalid/expired — nothing worth blacklisting.
      }
    }
    deleteCookie(c, "refresh_token", { path: "/auth" });
    return c.json({ ok: true });
  });

  return router;
}
