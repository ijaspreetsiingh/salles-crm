import rateLimit from "express-rate-limit";
import { env, isTest } from "../config/env";

const base = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  // Tests must not be throttled.
  skip: () => isTest,
};

/** Broad limiter applied to the whole API surface. */
export const apiLimiter = rateLimit({
  ...base,
  max: env.RATE_LIMIT_MAX,
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
