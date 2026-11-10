import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP, implemented directly on node:crypto.
 *
 * The product already ships zero runtime dependencies for security primitives
 * (password hashing, signing), and a TOTP implementation is small enough to
 * audit: base32 secret, HMAC-SHA1 over the 30-second counter, 6 digits.
 * Authenticator apps (Google Authenticator, Authy, 1Password) all speak it.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** A fresh 160-bit secret, base32 encoded (what a QR code carries). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The 6-digit code for a counter value. */
function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  // 64-bit big-endian counter. `writeBigUInt64BE` keeps it exact past 2038.
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The code an authenticator app shows right now. */
export function totpCode(secret: string, at: number = Date.now()): string {
  return hotp(secret, Math.floor(at / 1000 / STEP_SECONDS));
}

/**
 * Verifies a code, allowing one step of clock drift in either direction —
 * phones are routinely a few seconds out, and a code that is "wrong" because
 * of that is how people get locked out of their own account.
 */
export function verifyTotp(secret: string, token: string, window = 1, at = Date.now()): boolean {
  const clean = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = hotp(secret, counter + offset);
    // Constant-time compare so a wrong code cannot be narrowed by timing.
    if (
      expected.length === clean.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(clean))
    ) {
      return true;
    }
  }
  return false;
}

/** The `otpauth://` URI an authenticator app scans. */
export function otpauthUrl(input: { secret: string; issuer: string; account: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten single-use codes, formatted `XXXX-XXXX` so they can be written down. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}
