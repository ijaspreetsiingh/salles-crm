import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "../src/lib/totp";
import { requiresTwoFactor } from "../src/domain/rbac";

/**
 * Two-factor is the lock on the accounts that can move money, so the
 * algorithm is pinned to the published RFC 6238 vectors rather than to
 * "whatever this implementation happens to produce".
 *
 * RFC 6238 uses the ASCII secret "12345678901234567890"; in base32 that is
 * GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ. The RFC prints eight digits, this product
 * uses six, so each expected value is the last six digits of the RFC row.
 */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const rfc = (seconds: number) => totpCode(RFC_SECRET, seconds * 1000);

describe("TOTP (RFC 6238 vectors, 6 digits)", () => {
  it("matches the published codes", () => {
    expect(rfc(59)).toBe("287082");
    expect(rfc(1111111109)).toBe("081804");
    expect(rfc(1111111111)).toBe("050471");
    expect(rfc(1234567890)).toBe("005924");
    expect(rfc(2000000000)).toBe("279037");
    expect(rfc(20000000000)).toBe("353130");
  });

  it("accepts the current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), 1, now)).toBe(true);
    expect(verifyTotp(secret, "000000", 1, now)).toBe(false);
  });

  it("tolerates one step of clock drift but not five", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const previous = totpCode(secret, now - 30_000);
    expect(verifyTotp(secret, previous, 1, now)).toBe(true);
    expect(verifyTotp(secret, previous, 0, now)).toBe(false);
  });

  it("rejects anything that is not six digits", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345", 1)).toBe(false);
    expect(verifyTotp(secret, "abcdef", 1)).toBe(false);
    expect(verifyTotp(secret, "", 1)).toBe(false);
  });
});

describe("base32", () => {
  it("round-trips bytes", () => {
    const buffer = Buffer.from("traveldesk-2fa", "utf8");
    expect(base32Decode(base32Encode(buffer)).equals(buffer)).toBe(true);
  });

  it("generates 160-bit secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });
});

describe("recovery codes", () => {
  it("are unique, grouped in fours and easy to read out", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});

describe("otpauth URL", () => {
  it("carries the secret, issuer and six-digit/30-second parameters", () => {
    const url = otpauthUrl({ secret: "JBSWY3DPEHPK3PXP", issuer: "Horizon Travel", account: "a@b.in" });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(params.get("issuer")).toBe("Horizon Travel");
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
    expect(decodeURIComponent(url)).toContain("Horizon Travel:a@b.in");
  });
});

describe("which roles must use a second factor", () => {
  it("covers the money and admin roles", () => {
    expect(requiresTwoFactor("company_admin")).toBe(true);
    expect(requiresTwoFactor("branch_manager")).toBe(true);
    expect(requiresTwoFactor("finance")).toBe(true);
  });

  it("leaves the front desk on password-only sign-in", () => {
    expect(requiresTwoFactor("sales")).toBe(false);
    expect(requiresTwoFactor("operations")).toBe(false);
    expect(requiresTwoFactor("support")).toBe(false);
    // An unknown custom role is not silently treated as privileged.
    expect(requiresTwoFactor("custom_role")).toBe(false);
  });
});
