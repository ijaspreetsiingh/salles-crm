import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { hasPermission, type Action } from "../domain/rbac";

/**
 * Routers that do not carry a `:module` parameter are still tied to a module.
 * Without this map a route like `/finance/invoices/:ref/invoice.pdf` would
 * find no module and skip the permission check entirely.
 */
const BASE_MODULE: Record<string, string> = {
  packages: "packages",
  "hotel-rates": "hotels",
  "hotel-allotments": "hotels",
  hotels: "hotels",
  groups: "groups",
  visa: "visa",
  operations: "operations",
  agents: "agents",
  campaigns: "campaigns",
  reports: "reports",
  integrations: "integrations",
  pnr: "flights",
  flights: "flights",
  comms: "inbox",
  conversations: "inbox",
  finance: "finance",
  payments: "finance",
  payables: "finance",
  expenses: "finance",
  reconciliation: "finance",
  tally: "finance",
  dashboard: "reports",
  assistant: "assistant",
  workflows: "automation",
  channels: "settings",
  domains: "settings",
  "custom-fields": "settings",
  organizations: "settings",
  uploads: "settings",
  // Module-less workspace routes (the sign-in cache, the attention list) are a
  // cross-module read; `reports` is the one module every built-in role holds.
  workspace: "reports",
};

/**
 * Works out which module a request belongs to.
 *
 * 1. An explicit `:module` param (workspace record routes) wins.
 * 2. A module id in the body (record writes).
 * 3. A path prefix, for routers that host more than one module (quotation
 *    PDFs live under /finance but belong to quotations).
 * 4. The router's base name, via BASE_MODULE.
 */
function moduleForRequest(req: Request, moduleParam: string): string {
  const queryModule = typeof req.query?.module === "string" ? req.query.module : "";
  const explicit =
    (req.params[moduleParam] as string) ||
    (req.body?.moduleId as string) ||
    (req.body?.module as string) ||
    queryModule ||
    "";
  if (explicit) return explicit;

  const path = req.path || "";
  if (path.startsWith("/quotations")) return "quotations";

  const base = (req.baseUrl || "").split("/").filter(Boolean).pop() ?? "";
  return BASE_MODULE[base] ?? "";
}

/**
 * Guards a route with the caller's role permissions.
 * `:module` param is respected automatically when present; otherwise the
 * module is derived from the route so the check is never silently skipped.
 */
export function requirePermission(action: Action, moduleParam = "module") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(new UnauthorizedError());

    const moduleId = moduleForRequest(req, moduleParam);
    // Fail closed: a route whose module cannot be resolved must never silently
    // skip the permission check.
    if (!moduleId) {
      return next(new ForbiddenError("This route is not mapped to a permission"));
    }
    if (!hasPermission(auth.permissions, moduleId, action)) {
      return next(new ForbiddenError(`Your role cannot ${action} records in "${moduleId}"`));
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
      return next(new ForbiddenError(`Your role cannot ${action} in "${moduleId}"`));
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
