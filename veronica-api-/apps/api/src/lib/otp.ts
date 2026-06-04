import bcrypt from "bcryptjs";

/** Crypto-random 6-digit numeric OTP (zero-padded). */
export function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return n.toString().padStart(6, "0");
}

/** bcrypt hash at 10 rounds (Workers CPU budget — see admin auth). */
export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
