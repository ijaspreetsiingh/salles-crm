import type { NextFunction, Request, Response } from "express";
import { randomToken } from "../lib/utils";
import { env, isProd } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Double-submit cookie CSRF protection.
 *
 * A random token is issued in a (non-httpOnly) cookie and must be echoed back
 * in the `X-CSRF-Token` header on every state-changing request. An attacker on
 * another origin cannot read the cookie, so they cannot forge the header.
 *
 * Auth endpoints are exempt because no session exists yet.
 */
export function issueCsrfToken(_req: Request, res: Response) {
  const token = randomToken(24);
  // The CSRF cookie must travel on exactly the same requests as the session
  // cookie; if they disagree the double-submit check fails on every write.
  const sameSite = env.AUTH_COOKIE_SAME_SITE;
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite,
    secure: isProd || sameSite === "none",
    maxAge: 24 * 60 * 60 * 1000,
  });
  return res.json({ success: true, data: { csrfToken: token } });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path.startsWith("/auth")) return next();
  if (req.path.startsWith("/health") || req.path.startsWith("/ready")) return next();
  if (req.path.startsWith("/public") || req.path.startsWith("/inbound")) return next();
  // Payment provider webhooks authenticate with an HMAC signature over the
  // raw body, not with a browser session — there is no CSRF cookie to echo.
  if (req.path.startsWith("/webhooks")) return next();

  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[CSRF_COOKIE];
  const headerToken = req.header(CSRF_HEADER);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({
      success: false,
      error: { code: "csrf_failed", message: "CSRF token missing or invalid" },
    });
    return;
  }
  next();
}

export { CSRF_COOKIE, CSRF_HEADER };