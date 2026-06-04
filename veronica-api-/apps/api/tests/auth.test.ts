import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test"; // sendOtp stub mode
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-chars-long!";

import { createApp } from "../src/app.js";
import { signRefresh } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

// ─── /otp/send ───
function mockSendDb(values: ReturnType<typeof vi.fn>): DbClient {
  return { insert: () => ({ values }) } as unknown as DbClient;
}
function send(db: DbClient, body: unknown) {
  return createApp({ db }).request("/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── /otp/verify ───
const USER = { id: "11111111-1111-1111-1111-111111111111", phone: "+919350529717", name: null, email: null, isAdmin: false };
function otpRow(over: Partial<{ attempts: number; codeFor: string }> = {}) {
  return {
    id: 1,
    phone: "+919350529717",
    codeHash: bcrypt.hashSync(over.codeFor ?? "123456", 10),
    attempts: over.attempts ?? 0,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  };
}
function mockVerifyDb(opts: { otpRow?: unknown; user?: unknown }): DbClient {
  return {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => (opts.otpRow ? [opts.otpRow] : []) }) }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [opts.user] }) }) }),
  } as unknown as DbClient;
}
function verify(db: DbClient, body: unknown) {
  return createApp({ db }).request("/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /auth/otp/send", () => {
  it("accepts a valid phone, stores a hashed OTP, returns 200", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const res = await send(mockSendDb(values), { phone: "+919350529717" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expiresInSeconds: 300 });
    const row = values.mock.calls[0]![0] as { codeHash: string };
    expect(row.codeHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a malformed phone with 400", async () => {
    const values = vi.fn();
    const res = await send(mockSendDb(values), { phone: "12345" });
    expect(res.status).toBe(400);
    expect(values).not.toHaveBeenCalled();
  });

  it("rate limits: 2nd send to the same phone within 60s → 429 + Retry-After", async () => {
    const db = mockSendDb(vi.fn().mockResolvedValue(undefined));
    const phone = "+919876543210"; // distinct phone to avoid cross-test limiter state
    expect((await send(db, { phone })).status).toBe(200);
    const second = await send(db, { phone });
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /auth/otp/verify", () => {
  it("verifies a correct code → 200 with accessToken + user + refresh cookie", async () => {
    const res = await verify(mockVerifyDb({ otpRow: otpRow(), user: USER }), {
      phone: "+919350529717",
      code: "123456",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; user: { id: string } };
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.user.id).toBe(USER.id);
    expect(res.headers.get("set-cookie")).toMatch(/refresh_token=/);
  });

  it("wrong code → 401", async () => {
    const res = await verify(mockVerifyDb({ otpRow: otpRow({ codeFor: "123456" }), user: USER }), {
      phone: "+919350529717",
      code: "000000",
    });
    expect(res.status).toBe(401);
  });

  it("no valid OTP → 401", async () => {
    const res = await verify(mockVerifyDb({ user: USER }), { phone: "+919350529717", code: "123456" });
    expect(res.status).toBe(401);
  });

  it("too many attempts → 429", async () => {
    const res = await verify(mockVerifyDb({ otpRow: otpRow({ attempts: 5 }), user: USER }), {
      phone: "+919350529717",
      code: "123456",
    });
    expect(res.status).toBe(429);
  });
});

function mockUserDb(user: unknown): DbClient {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (user ? [user] : []) }) }) }),
  } as unknown as DbClient;
}

describe("POST /auth/refresh + /auth/logout", () => {
  it("refresh with a valid cookie → 200 + new accessToken + rotated cookie", async () => {
    const token = await signRefresh({ sub: USER.id, jti: "j1" });
    const res = await createApp({ db: mockUserDb(USER) }).request("/auth/refresh", {
      method: "POST",
      headers: { Cookie: `refresh_token=${token}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBeTypeOf("string");
    expect(res.headers.get("set-cookie")).toMatch(/refresh_token=/);
  });

  it("refresh with a bad token → 401", async () => {
    const res = await createApp({ db: mockUserDb(USER) }).request("/auth/refresh", {
      method: "POST",
      headers: { Cookie: "refresh_token=not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("refresh with no cookie → 401", async () => {
    const res = await createApp({ db: mockUserDb(USER) }).request("/auth/refresh", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("logout clears the cookie → 200", async () => {
    const res = await createApp({ db: mockUserDb(USER) }).request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toMatch(/refresh_token=;|Max-Age=0/);
  });

  it("logout blacklists the jti → reusing that refresh token → 401", async () => {
    const token = await signRefresh({ sub: USER.id, jti: "leaked-jti-1" });

    const out = await createApp({ db: mockUserDb(USER) }).request("/auth/logout", {
      method: "POST",
      headers: { Cookie: `refresh_token=${token}` },
    });
    expect(out.status).toBe(200);

    // The same (still-unexpired) token can no longer be exchanged.
    const reused = await createApp({ db: mockUserDb(USER) }).request("/auth/refresh", {
      method: "POST",
      headers: { Cookie: `refresh_token=${token}` },
    });
    expect(reused.status).toBe(401);
    expect((await reused.json()).error).toBe("Refresh token revoked");
  });
});
