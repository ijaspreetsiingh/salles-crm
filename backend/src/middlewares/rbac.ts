import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { hasPermission, type Action } from "../domain/rbac";

/**
 * Guards a route with the caller's role permissions.
 * `:module` param is respected automatically when present.
 */
export function requirePermission(action: Action, moduleParam = "module") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(new UnauthorizedError());

    const moduleId = (req.params[moduleParam] as string) || (req.body?.moduleId as string) || "";
    if (moduleId && !hasPermission(auth.permissions, moduleId, action)) {
      return next(
        new ForbiddenError(`Your role cannot ${action} records in "${moduleId}"`),
      );
    }
    next();
  };
}

/** Requires a permission on a fixed module (used by non-module routes). */
export function requireModulePermission(moduleId: string, action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(new UnauthorizedError());
    if (!hasPermission(auth.permissions, moduleId, action)) {
      return next(
        new ForbiddenError(`Your role cannot ${action} in "${moduleId}"`),
      );
    }
    next();
  };
}

/** Restricts a route to one or more role keys (e.g. settings administration). */
export function requireRole(...roleKeys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(new UnauthorizedError());
    if (!roleKeys.includes(auth.roleKey)) {
      return next(new ForbiddenError("This action requires a different role"));
    }
    next();
  };
}
