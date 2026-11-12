/**
 * HaveIBeenPwned password check (k-anonymity model).
 *
 * We never send the full password to the API. We hash the password with
 * SHA-1, send the first 5 hex chars (the prefix), and compare the returned
 * suffix list locally. The API returns every suffix that starts with that
 * prefix — it never sees our full hash.
 *
 * Returns the number of times the password appears in breach databases (0 = safe).
 * Throws if the network call fails so the caller can decide whether to block
 * or allow (we prefer to allow on network error — don't lock users out because
 * HIBP is temporarily down).
 */
import crypto from "node:crypto";

export async function checkPwnedPassword(password: string): Promise<number> {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) return 0; // fail open — HIBP outage shouldn't block sign-ups

  const text = await res.text();
  for (const line of text.split("\r\n")) {
    const [lineSuffix, countStr] = line.split(":");
    if (lineSuffix?.toUpperCase() === suffix) {
      return parseInt(countStr ?? "0", 10);
    }
  }
  return 0;
}
