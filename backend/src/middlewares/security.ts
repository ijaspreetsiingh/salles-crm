import type { NextFunction, Request, Response } from "express";

/**
 * Security headers middleware — production hardening.
 *
 * Adds defense-in-depth headers on every response:
 *   - HSTS: forces HTTPS for one year (production only)
 *   - CSP: restrictive content security policy
 *   - X-Frame-Options: prevents clickjacking
 *   - X-Content-Type-Options: prevents MIME sniffing
 *   - Referrer-Policy: limits referrer leakage
 *   - Permissions-Policy: disables unused browser features
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const isProd = process.env.NODE_ENV === "production";

  // HSTS — tell browsers to only use HTTPS for a year (production only)
  if (isProd) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Content Security Policy — restrictive but functional for our SPA + APIs
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'", // clickjacking protection
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  // X-Frame-Options — clickjacking protection
  res.setHeader("X-Frame-Options", "DENY");

  // X-Content-Type-Options — prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Referrer-Policy — limit referrer information leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy — disable unused browser features
  res.setHeader(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "),
  );

  // Remove server fingerprinting headers
  res.removeHeader("X-Powered-By");

  next();
}

export default securityHeaders;
