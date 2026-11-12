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

  /*
   * CSRF only matters when the browser is riding a session cookie. A request
   * that authenticates with an `Authorization: Bearer` token or an `x-api-key`
   * header and carries no access-token cookie cannot be forged by another
   * site: sending a custom header cross-origin needs a CORS preflight, which
   * this server refuses for unknown origins.
   *
   * Without this exemption every documented server-to-server API call failed
   * with `csrf_failed`, because a machine client has no cookie jar to echo a
   * double-submit token from. The browser app still sends the cookie, so its
   * writes stay protected.
   */
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const hasSessionCookie = Boolean(cookies?.access_token);
  const hasHeaderCredential =
    /^Bearer\s+\S/i.test(req.header("authorization") ?? "") || Boolean(req.header("x-api-key"));
  if (hasHeaderCredential && !hasSessionCookie) return next();

  const cookieToken = cookies?.[CSRF_COOKIE];
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