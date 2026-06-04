import crypto from "node:crypto";

/**
 * Public-facing order number derived from the order's UUID.
 *
 * Per agent-council review (2026-05-28) we use a UUID-hashed number rather than
 * a sequential VEYYYYMMDDNNNNN: sequential numbers leak order volume to anyone
 * who places an order, and generating them safely needs a Postgres sequence /
 * locking. Hashing the row's UUID is atomic, collision-resistant, and reveals
 * nothing about volume or timing.
 *
 * Format: "VE" + 10 chars of Crockford base32 (no I/L/O/U) ≈ 50 bits.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

export function orderNumberFromId(orderId: string): string {
  const hash = crypto.createHash("sha256").update(orderId).digest();
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += ALPHABET[hash[i]! % 32];
  }
  return `VE${out}`;
}
