import crypto from "node:crypto";

/** Safe JSON parse that never throws — falls back to a default value. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const stringifyJson = (value: unknown): string => JSON.stringify(value ?? {});

/** URL/record-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Generates a unique slug, appending a short random suffix on collision. */
export function uniqueSlug(input: string): string {
  const base = slugify(input) || "org";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("hex");

export const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");
