import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { normalizePermissions, permissionsForApiKeyScopes, requiresTwoFactor, ROLE_MAP } from "../domain/rbac";
import { sha256 } from "../lib/utils";
import { env } from "../config/env";

const readToken = (req: Request): string | null => {
  const header = req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const apiKey = req.header("x-api-key");
  if (apiKey) return apiKey.trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.access_token;
  return cookie ?? null;
};

/**
 * The permission set of a role — the company's own edited role if it exists,
 * otherwise the built-in default. Exported because the daily digest has to
 * scope one person's email exactly the way that person's session is scoped.
 */
export async function permissionsForRole(organizationId: string, roleKey: string) {
  const role = await prisma.role.findUnique({
    where: { organizationId_key: { organizationId, key: roleKey } },
  });
  if (role) return normalizePermissions(JSON.parse(role.permissions || "{}"));
  const builtin = ROLE_MAP[roleKey];
  return normalizePermissions(builtin?.permissions ?? { modules: [], actions: [] });
}

/**
 * Authenticates a request using either a JWT access token or an organisation API
 * key, then attaches the resolved auth context (tenant + role + permissions).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new UnauthorizedError();

    // API key path — keys are prefixed with `tdk_`.
    if (token.startsWith("tdk_")) {
      const prefix = token.slice(0, 12);
      const apiKey = await prisma.apiKey.findFirst({
        where: { prefix, revokedAt: null },
        include: { organization: true },
      });
      if (!apiKey || apiKey.keyHash !== sha256(token))
        throw new UnauthorizedError("Invalid API key");

      await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

      req.auth = {
        userId: `apikey:${apiKey.id}`,
        organizationId: apiKey.organizationId,
        roleKey: "api_key",
        branchId: null,
        email: apiKey.organization.supportEmail ?? "",
        name: apiKey.name,
        // Scopes are the key's permission matrix; "admin" is the only way to
        // full access, and it has to be granted deliberately.
        permissions: permissionsForApiKeyScopes(
          (() => {
            try {
              const parsed = JSON.parse(apiKey.scopes || "[]");
              return Array.isArray(parsed) ? parsed.map(String) : [];
            } catch {
              return [];
            }
          })(),
        ),
        apiKeyId: apiKey.id,
      };
      return next();
    }

    const payload = verifyAccessToken(token);

    const [user, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.sub } }),
      prisma.membership.findUnique({
        where: { userId_organizationId: { userId: payload.sub, organizationId: payload.org } },
      }),
    ]);

    if (!user || !user.active) throw new UnauthorizedError("Account is inactive");
    if (!membership || !membership.active) {
      throw new UnauthorizedError("You no longer have access to this organisation");
    }

    /*
     * Session revocation. Access tokens live for 15 minutes and cannot be
     * recalled, so every token carries the `tokenVersion` it was minted with.
     * A password change, a deactivation or a role change bumps the version and
     * every token issued before it stops working immediately.
     *
     * Tokens minted before this existed carry no `tv`; they are treated as
     * version 0, which is what the migration backfills.
     */
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedError("Your session has ended. Please sign in again.", "session_revoked");
    }

    if (env.ENFORCE_SUBSCRIPTION) {
      const subscription = await prisma.subscription.findUnique({
        where: { organizationId: payload.org },
      });
      if (subscription) {
        const now = new Date();
        const expiredTrial =
          subscription.status === "trialing" &&
          subscription.currentPeriodEnd !== null &&
          subscription.currentPeriodEnd < now;
        const inactive =
          subscription.status === "canceled" || subscription.status === "past_due";
        if (expiredTrial || inactive) {
          throw new ForbiddenError(
            "Your subscription has expired. Please update your plan to continue.",
          );
        }
      }
    }

    const permissions = await permissionsForRole(payload.org, membership.roleKey);

    req.auth = {
      userId: user.id,
      organizationId: payload.org,
      roleKey: membership.roleKey,
      branchId: membership.branchId ?? null,
      email: user.email,
      name: user.name,
      permissions,
      twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    };

    /*
     * Two-factor enforcement for the roles that hold the money.
     *
     * The person still gets a session — they need one to reach the enrolment
     * screen — but every other route refuses until they have enrolled. The
     * auth router marks its own routes exempt so that "set up 2FA" and
     * "change my password" remain reachable.
     */
    if (
      env.TWO_FACTOR_ENFORCEMENT &&
      requiresTwoFactor(membership.roleKey) &&
      !user.twoFactorEnabledAt &&
      !(req as Request & { twoFactorExempt?: boolean }).twoFactorExempt
    ) {
      throw new ForbiddenError(
        "Two-factor authentication is required for your role. Set it up in Settings → Security.",
        "two_factor_setup_required",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
