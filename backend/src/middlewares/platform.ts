import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { env } from "../config/env";

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth) return next(new UnauthorizedError());
  if (!env.PLATFORM_ADMIN_EMAILS.includes(auth.email.toLowerCase())) {
    return next(new ForbiddenError("Platform administrator access required"));
  }
  next();
}
