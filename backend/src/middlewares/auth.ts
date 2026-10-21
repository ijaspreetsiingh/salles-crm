import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { normalizePermissions, ROLE_MAP } from "../domain/rbac";
import { sha256 } from "../lib/utils";

const readToken = (req: Request): string | null => {
  const header = req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const apiKey = req.header("x-api-key");
  if (apiKey) return apiKey.trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.access_token;
  return cookie ?? null;
};

async function permissionsFor(organizationId: string, roleKey: string) {
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
      if (!apiKey || apiKey.keyHash !== sha256(token)) throw new UnauthorizedError("Invalid API key");

      await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

      req.auth = {
        userId: `apikey:${apiKey.id}`,
        organizationId: apiKey.organizationId,
        roleKey: "api_key",
        branchId: null,
        email: apiKey.organization.supportEmail ?? "",
        name: apiKey.name,
        permissions: { modules: "*", actions: "*" },
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

    const permissions = await permissionsFor(payload.org, membership.roleKey);

    req.auth = {
      userId: user.id,
      organizationId: payload.org,
      roleKey: membership.roleKey,
      branchId: membership.branchId ?? null,
      email: user.email,
      name: user.name,
      permissions,
    };
    next();
  } catch (error) {
    next(error);
  }
}
