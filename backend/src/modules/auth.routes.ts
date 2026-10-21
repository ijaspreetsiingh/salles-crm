import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { authLimiter } from "../middlewares/rateLimit";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../lib/errors";
import { env, isProd } from "../config/env";
import { randomToken, sha256, stringifyJson, uniqueSlug } from "../lib/utils";
import { ROLE_DEFS, normalizePermissions } from "../domain/rbac";
import { recordAudit } from "../services/audit";

const router = Router();

const emailSchema = z.string().email().toLowerCase();

const registerSchema = z.object({
  organizationName: z.string().min(2).max(80),
  name: z.string().min(2).max(80),
  email: emailSchema,
  password: z.string().min(8).max(128),
  phone: z.string().max(30).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().optional() });

async function issueSession(userId: string, organizationId: string, meta: { ip?: string; userAgent?: string }) {
  const [user, membership] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.membership.findUniqueOrThrow({
      where: { userId_organizationId: { userId, organizationId } },
    }),
  ]);

  const payload: AccessTokenPayload = {
    sub: user.id,
    org: organizationId,
    role: membership.roleKey,
    branch: membership.branchId,
    email: user.email,
    name: user.name,
  };

  const accessToken = signAccessToken(payload);

  const refreshRow = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: "pending",
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti: refreshRow.id });
  await prisma.refreshToken.update({
    where: { id: refreshRow.id },
    data: { tokenHash: sha256(refreshToken) },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl },
    membership: { organizationId, roleKey: membership.roleKey, branchId: membership.branchId },
  };
}

function setAuthCookies(res: import("express").Response, accessToken: string, refreshToken: string) {
  const secure = isProd;
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth",
  });
}

/** Registers a new organisation with its first company admin. */
router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { organizationName, name, email, password, phone } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        slug: uniqueSlug(organizationName),
        supportEmail: email,
        settings: stringifyJson({ defaultTaxRate: 18 }),
      },
    });

    await prisma.role.createMany({
      data: ROLE_DEFS.map((role) => ({
        organizationId: organization.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: stringifyJson(role.permissions),
        isSystem: role.isSystem,
      })),
    });

    const branch = await prisma.branch.create({
      data: { organizationId: organization.id, name: "Head office", code: "HQ" },
    });

    const user = await prisma.user.create({
      data: { email, name, phone, passwordHash: await hashPassword(password) },
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        roleKey: "company_admin",
        branchId: branch.id,
      },
    });

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        planKey: "starter",
        status: "trialing",
        billingCycle: "Yearly",
        seats: 5,
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    const session = await issueSession(user.id, organization.id, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    await recordAudit({
      organizationId: organization.id,
      actorId: user.id,
      actorName: user.name,
      action: "Created",
      moduleId: "settings",
      label: `Organisation "${organization.name}" created`,
      req,
    });

    return created(res, { ...session, organization });
  }),
);

/** Email + password sign in. */
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) throw new UnauthorizedError("Invalid email or password");

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new UnauthorizedError("No active organisation for this account");

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session = await issueSession(user.id, membership.organizationId, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    const organization = await prisma.organization.findUnique({ where: { id: membership.organizationId } });

    await recordAudit({
      organizationId: membership.organizationId,
      actorId: user.id,
      actorName: user.name,
      action: "Login",
      label: "Signed in",
      req,
    });

    return ok(res, { ...session, organization });
  }),
);

/** Rotates a refresh token into a fresh token pair. */
router.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const token =
      (req.body as z.infer<typeof refreshSchema>).refreshToken ??
      (req as unknown as { cookies?: Record<string, string> }).cookies?.refresh_token;
    if (!token) throw new BadRequestError("refreshToken is required");

    const payload = verifyRefreshToken(token);
    const row = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || row.tokenHash !== sha256(token)) {
      throw new UnauthorizedError("Refresh token is no longer valid");
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: row.userId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new UnauthorizedError("No active organisation for this account");

    await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

    const session = await issueSession(row.userId, membership.organizationId, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    return ok(res, session);
  }),
);

/** Revokes the supplied refresh token (or all of the user's tokens). */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token =
      (req.body?.refreshToken as string | undefined) ??
      (req as unknown as { cookies?: Record<string, string> }).cookies?.refresh_token;

    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await prisma.refreshToken.updateMany({
          where: { id: payload.jti },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Logging out with an expired token is harmless.
      }
    }

    res.clearCookie("access_token");
    res.clearCookie("refresh_token", { path: "/api/v1/auth" });
    return ok(res, { loggedOut: true });
  }),
);

/** Current user, organisation, role and effective permissions. */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const [user, organization, membership] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }),
      prisma.membership.findUniqueOrThrow({
        where: { userId_organizationId: { userId: auth.userId, organizationId: auth.organizationId } },
      }),
    ]);

    return ok(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        lastLoginAt: user.lastLoginAt,
      },
      organization,
      membership: {
        roleKey: membership.roleKey,
        branchId: membership.branchId,
      },
      permissions: normalizePermissions(auth.permissions),
    });
  }),
);

/** Update the signed-in user's own profile. */
router.patch(
  "/me",
  requireAuth,
  validate(
    z.object({
      name: z.string().min(2).max(80).optional(),
      phone: z.string().max(30).optional(),
      avatarUrl: z.string().url().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: req.body,
    });
    return ok(res, { id: user.id, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl });
  }),
);

router.post(
  "/change-password",
  requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) })),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestError("Current password is incorrect");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit({
      organizationId: auth.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Password changed",
      req,
    });

    return ok(res, { updated: true });
  }),
);

/** Issues a short-lived password reset token (emailed in production). */
router.post(
  "/forgot-password",
  authLimiter,
  validate(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });

    // Always answer the same way to avoid account enumeration.
    if (!user) return ok(res, { requested: true });

    const resetToken = signRefreshToken({ sub: user.id, jti: randomToken(8) });

    // In production this would be emailed. In dev we return it so it is testable.
    return ok(res, { requested: true, ...(isProd ? {} : { resetToken }) });
  }),
);

/** Completes a password reset with a valid token. */
router.post(
  "/reset-password",
  authLimiter,
  validate(z.object({ token: z.string().min(10), password: z.string().min(8).max(128) })),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const payload = verifyRefreshToken(token);
    await prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash: await hashPassword(password) },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return ok(res, { reset: true });
  }),
);

export default router;
