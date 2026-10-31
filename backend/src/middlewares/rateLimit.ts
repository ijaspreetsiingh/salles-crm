import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { env, isTest } from "../config/env";

const base = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  // Tests must not be throttled.
  skip: () => isTest,
};

/**
 * A whole office usually shares one public IP. Counting every teammate
 * against that one IP meant fifty people could exhaust the budget between
 * them before lunch. Signed-in requests now count against the person's own
 * token, and only anonymous traffic falls back to the IP.
 */
const keyFor = (request: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, unknown>;
}): string => {
  const header = request.headers.authorization;
  const bearer = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const apiKeyHeader = request.headers["x-api-key"];
  const apiKey = typeof apiKeyHeader === "string" ? apiKeyHeader : "";
  const cookieToken =
    typeof request.cookies?.["accessToken"] === "string"
      ? (request.cookies["accessToken"] as string)
      : "";
  const credential = bearer || apiKey || cookieToken;
  if (credential) {
    return `client:${createHash("sha256").update(credential).digest("hex").slice(0, 32)}`;
  }
  return `ip:${request.ip ?? "unknown"}`;
};

/** Broad limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  ...base,
  max: env.RATE_LIMIT_MAX,
  keyGenerator: keyFor,
  message: {
    success: false,
    error: {
      code: "too_many_requests",
      message: "Too many requests — please wait a moment and try again.",
      retryAfterSeconds: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
    },
  },
});

/** Stricter limiter for credential endpoints (login, register, reset). */
export const authLimiter = rateLimit({
  ...base,
  max: env.AUTH_RATE_LIMIT_MAX,
  message: {
    success: false,
    error: { code: "too_many_requests", message: "Too many attempts, please try again later" },
  },
});
