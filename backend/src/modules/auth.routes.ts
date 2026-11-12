import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  signPasswordResetToken,
  signEmailVerifyToken,
  verifyPasswordResetToken,
  verifyEmailVerifyToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";
import { issueCsrfToken } from "../middlewares/csrf";
import { validate } from "../middlewares/validate";
import { authLimiter } from "../middlewares/rateLimit";
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from "../lib/errors";
import { env, isProd } from "../config/env";
import { randomToken, sha256, stringifyJson, uniqueSlug } from "../lib/utils";
import { ROLE_DEFS, isBranchScoped, normalizePermissions, requiresTwoFactor } from "../domain/rbac";
import { recordAudit } from "../services/audit";
import { sendEmail } from "../services/email";
import { generateRecoveryCodes, generateTotpSecret, otpauthUrl, verifyTotp } from "../lib/totp";
import { checkPwnedPassword } from "../lib/pwned";

const router = Router();

/*
 * Self-service routes. A person who has not enrolled an authenticator app yet
 * must still be able to sign in, reach the enrolment screen and change their
 * password — otherwise the two-factor requirement would lock them out of their
 * own account. Every other router enforces enrolment.
 */
router.use((req, _res, next) => {
  (req as typeof req & { twoFactorExempt?: boolean }).twoFactorExempt = true;
  next();
});

router.get("/csrf", issueCsrfToken);

const emailSchema = z.string().email().toLowerCase();

/**
 * Password policy: minimum 8 chars, at least one uppercase, one lowercase
 * and one digit. Strong enough to resist brute force without being
 * burdensome for a travel team that works from phones.
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .refine((v) => /[a-z]/.test(v), "Password must contain a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password must contain an uppercase letter")
  .refine((v) => /\d/.test(v), "Password must contain a digit");

const registerSchema = z.object({
  organizationName: z.string().min(2).max(80),
  name: z.string().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().max(30).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  /** Six-digit TOTP from the authenticator app, when the account has 2FA. */
  totp: z.string().max(12).optional(),
  /** A single-use recovery code, when the phone is lost. */
  recoveryCode: z.string().max(24).optional(),
});

const refreshSchema = z.object({ refreshToken: z.string().optional() });

async function issueSession(
  userId: string,
  organizationId: string,
  meta: { ip?: string; userAgent?: string },
) {
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
    tv: user.tokenVersion,
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
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      isPlatformAdmin: env.PLATFORM_ADMIN_EMAILS.includes(user.email.toLowerCase()),
    },
    membership: { organizationId, roleKey: membership.roleKey, branchId: membership.branchId },
  };
}

/** `XXXX-XXXX`, typed with or without the dash and in any case. */
function normalizeRecoveryCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

const hashRecoveryCode = (code: string) => sha256(normalizeRecoveryCode(code));

function parseRecoveryCodes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Checks a recovery code and burns it.
 *
 * Recovery codes are stored as hashes, so a database leak cannot be replayed
 * into an account. Each code works exactly once: the row is rewritten without
 * the used hash, which also tells the person how many are left.
 */
async function consumeRecoveryCode(
  userId: string,
  stored: string,
  supplied: string | undefined,
): Promise<boolean> {
  if (!supplied) return false;
  const codes = parseRecoveryCodes(stored);
  const hash = hashRecoveryCode(supplied);
  const index = codes.indexOf(hash);
  if (index === -1) return false;
  codes.splice(index, 1);
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorRecoveryCodes: JSON.stringify(codes) },
  });
  return true;
}

function setAuthCookies(
  res: import("express").Response,
  accessToken: string,
  refreshToken: string,
) {
  // `none` is only legal together with `secure`; otherwise browsers drop the
  // cookie and the person is silently signed out on every request.
  const sameSite = env.AUTH_COOKIE_SAME_SITE;
  const secure = isProd || sameSite === "none";
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite,
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
    const { organizationName, name, email, password, phone } = req.body as z.infer<
      typeof registerSchema
    >;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    // Check the password against the HaveIBeenPwned breach database.
    // Fail open: if HIBP is unreachable we still register the user.
    try {
      const pwnCount = await checkPwnedPassword(password);
      if (pwnCount > 0) {
        throw new BadRequestError(
          `This password has appeared in ${pwnCount.toLocaleString()} data breaches. Please choose a different password.`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      // Network error reaching HIBP — allow registration to proceed.
    }

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

    const verifyToken = signEmailVerifyToken(user.id);
    const verifyLink = `${env.FRONTEND_URL.replace(/\/+$/, "")}/verify-email?token=${encodeURIComponent(
      verifyToken,
    )}`;
    void sendEmail({
      organizationId: organization.id,
      to: user.email,
      subject: "Verify your Traveldesk email",
      body: `Welcome to Traveldesk! Please verify your email by opening this link (expires in 24 hours):\n${verifyLink}\n\nIf you did not create this account, you can ignore this email.`,
      template: "email-verify",
      userId: user.id,
    }).catch(() => {
      /* delivery failures are recorded in the outbox */
    });

    await recordAudit({
      organizationId: organization.id,
      actorId: user.id,
      actorName: user.name,
      action: "Created",
      moduleId: "settings",
      label: `Organisation "${organization.name}" created`,
      req,
    });

    return created(res, { ...session, organization, emailVerified: false });
  }),
);

/** Email + password sign in. */
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, totp, recoveryCode } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) throw new UnauthorizedError("Invalid email or password");

    // Account lockout: refuse sign-in if the account is temporarily locked.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const unlockIn = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedError(
        `Too many failed attempts. Try again in ${unlockIn} minute${unlockIn === 1 ? "" : "s"}.`,
        "account_locked",
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      // Increment failure counter and lock the account after 10 consecutive failures.
      const attempts = (user.loginAttempts ?? 0) + 1;
      const lockThreshold = 10;
      const lockedUntil = attempts >= lockThreshold
        ? new Date(Date.now() + 15 * 60 * 1000) // 15 min lock
        : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, lockedUntil },
      });
      if (lockedUntil) {
        throw new UnauthorizedError(
          "Too many failed attempts. Your account is locked for 15 minutes.",
          "account_locked",
        );
      }
      throw new UnauthorizedError("Invalid email or password");
    }

    // Successful sign-in: reset failure counter.
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new UnauthorizedError("No active organisation for this account");

    /*
     * The password only gets us this far when the account has an authenticator
     * app. A wrong or missing code returns 401 with `two_factor_required`, so
     * the sign-in screen knows to show the code field rather than "wrong
     * password" — and the password is never used as a fallback.
     */
    let usedRecoveryCode = false;
    if (user.twoFactorEnabledAt) {
      const totpOk =
        Boolean(totp) && Boolean(user.twoFactorSecret) && verifyTotp(user.twoFactorSecret!, totp!);

      if (!totpOk) {
        const recovery = await consumeRecoveryCode(user.id, user.twoFactorRecoveryCodes, recoveryCode);
        if (!recovery) {
          throw new UnauthorizedError(
            "Enter the 6-digit code from your authenticator app, or a recovery code",
            "two_factor_required",
          );
        }
        usedRecoveryCode = true;
      }
    }

    /*
     * An unverified address cannot complete a password sign-in when the
     * workspace requires verification. Without this gate anyone could type a
     * colleague's address, receive the invoice and password-reset mail, and
     * take the account over. The error code lets the sign-in screen offer
     * "resend the link" instead of showing "wrong password".
     */
    if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      throw new ForbiddenError(
        "Verify your email address before signing in. Open the link we emailed you, or request a new one.",
        "email_not_verified",
      );
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session = await issueSession(user.id, membership.organizationId, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    const organization = await prisma.organization.findUnique({
      where: { id: membership.organizationId },
    });

    await recordAudit({
      organizationId: membership.organizationId,
      actorId: user.id,
      actorName: user.name,
      action: "Login",
      label: usedRecoveryCode ? "Signed in with a recovery code" : "Signed in",
      req,
    });

    /*
     * An admin or finance user who has not enrolled yet gets a session, but
     * every other route refuses them until they enrol. Saying so here lets the
     * shell open the setup screen instead of showing a wall of errors.
     */
    const twoFactorSetupRequired =
      env.TWO_FACTOR_ENFORCEMENT &&
      requiresTwoFactor(membership.roleKey) &&
      !user.twoFactorEnabledAt;

    return ok(res, {
      ...session,
      organization,
      emailVerified: user.emailVerified,
      twoFactorSetupRequired,
      twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
      ...(usedRecoveryCode ? { recoveryCodeUsed: true } : {}),
    });
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

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.active) throw new UnauthorizedError("Account is inactive");
    if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      throw new ForbiddenError(
        "Verify your email address before continuing",
        "email_not_verified",
      );
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

/**
 * Signs out every device.
 *
 * Revoking refresh tokens alone would leave the 15-minute access tokens alive,
 * so the version is bumped as well. The device making the request gets a new
 * session, because the person is standing in front of it.
 */
router.post(
  "/logout-all",
  requireAuth,
  validate(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { password } = req.body as { password: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new BadRequestError("Password is incorrect");
    }

    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    const session = await issueSession(user.id, auth.organizationId, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    await recordAudit({
      organizationId: auth.organizationId,
      action: "Logout",
      label: "Signed out of every device",
      req,
    });

    return ok(res, { signedOutOthers: true, session });
  }),
);

/* ── Two-factor authentication ─────────────────────────────────────────── */

/** What Settings → Security renders before the person has done anything. */
router.get(
  "/2fa/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    const required = requiresTwoFactor(req.auth!.roleKey);
    const enforced = required && env.TWO_FACTOR_ENFORCEMENT;
    const enabled = Boolean(user.twoFactorEnabledAt);
    return ok(res, {
      required: enforced,
      recommended: required && !enforced,
      enabled,
      enabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
      recoveryCodesRemaining: parseRecoveryCodes(user.twoFactorRecoveryCodes).length,
      // The rest of the app refuses this person until they enrol.
      setupRequired: enforced && !enabled,
    });
  }),
);

/**
 * Starts enrolment. The secret is stored but not yet trusted — it only takes
 * effect once the person proves their app shows the right codes, so a scan
 * that failed does not lock anybody out.
 */
router.post(
  "/2fa/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    if (user.twoFactorEnabledAt) {
      throw new BadRequestError("Two-factor authentication is already on");
    }

    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
    });
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

    return ok(res, {
      secret,
      otpauthUrl: otpauthUrl({
        secret,
        issuer: organization?.name || "Traveldesk",
        account: user.email,
      }),
      digits: 6,
      period: 30,
    });
  }),
);

/** Completes enrolment once the app produces a valid code. */
router.post(
  "/2fa/enable",
  requireAuth,
  validate(z.object({ code: z.string().min(6).max(10) })),
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

    if (user.twoFactorEnabledAt) {
      throw new BadRequestError("Two-factor authentication is already on");
    }
    if (!user.twoFactorSecret) throw new BadRequestError("Start the setup first");

    if (!verifyTotp(user.twoFactorSecret, code)) {
      throw new BadRequestError("That code is not right. Check the time on your phone and try again.");
    }

    // Shown once, stored as hashes. Losing the phone is the whole reason these
    // exist, so they are generated at the same moment the secret is trusted.
    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabledAt: new Date(),
        twoFactorRecoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Two-factor authentication turned on",
      req,
    });

    return ok(res, { enabled: true, recoveryCodes });
  }),
);

/**
 * Turns two-factor off. Refused for the roles that require it: the way out is
 * to change the role first, which a company admin has to do deliberately.
 */
router.post(
  "/2fa/disable",
  requireAuth,
  validate(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new BadRequestError("Password is incorrect");
    }
    if (requiresTwoFactor(req.auth!.roleKey)) {
      throw new ForbiddenError(
        "Your role must keep two-factor authentication on. Ask a company admin to change your role first.",
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabledAt: null,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: "[]",
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Two-factor authentication turned off",
      req,
    });

    return ok(res, { enabled: false });
  }),
);

/** Issues a fresh set of recovery codes and invalidates the old ones. */
router.post(
  "/2fa/recovery-codes",
  requireAuth,
  validate(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new BadRequestError("Password is incorrect");
    }
    if (!user.twoFactorEnabledAt) throw new BadRequestError("Two-factor authentication is off");

    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)) },
    });

    return ok(res, { recoveryCodes });
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
        where: {
          userId_organizationId: { userId: auth.userId, organizationId: auth.organizationId },
        },
      }),
    ]);

    return ok(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        lastLoginAt: user.lastLoginAt,
        isPlatformAdmin: env.PLATFORM_ADMIN_EMAILS.includes(user.email.toLowerCase()),
        twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
        twoFactorRequired: requiresTwoFactor(membership.roleKey) && env.TWO_FACTOR_ENFORCEMENT,
      },
      organization,
      membership: {
        roleKey: membership.roleKey,
        branchId: membership.branchId,
        // The shell needs this to decide whether an office switcher would be
        // honest: a branch-scoped role only ever sees its own office.
        branchScoped: isBranchScoped(membership.roleKey),
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
    return ok(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
    });
  }),
);

router.post(
  "/change-password",
  requireAuth,
  validate(
    z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }),
  ),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestError("Current password is incorrect");
    }

    // Check new password against HIBP breach database (fail open on network error).
    try {
      const pwnCount = await checkPwnedPassword(newPassword);
      if (pwnCount > 0) {
        throw new BadRequestError(
          `This password has appeared in ${pwnCount.toLocaleString()} data breaches. Please choose a different password.`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        // A password change revokes every session that was minted with the old
        // one. The device making the change gets a fresh session below, so the
        // person is not signed out of the screen they are standing on.
        tokenVersion: { increment: 1 },
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const session = await issueSession(user.id, auth.organizationId, {
      ip: req.ip,
      userAgent: req.header("user-agent"),
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);

    await recordAudit({
      organizationId: auth.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Password changed",
      req,
    });

    return ok(res, { updated: true, session });
  }),
);

/** Issues a short-lived password reset token and emails it when SMTP is configured. */
router.post(
  "/forgot-password",
  authLimiter,
  validate(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });

    // Always answer the same way to avoid account enumeration.
    if (!user) return ok(res, { requested: true });

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });

    const resetToken = signPasswordResetToken(user.id);
    const baseUrl = env.FRONTEND_URL.replace(/\/+$/, "");
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    if (membership) {
      void sendEmail({
        organizationId: membership.organizationId,
        to: user.email,
        subject: "Reset your Traveldesk password",
        body: `We received a request to reset your password.\n\nOpen this link to choose a new one (it expires in 15 minutes):\n${link}\n\nIf you did not request this, you can ignore this email.`,
        template: "password-reset",
        userId: user.id,
      }).catch(() => {
        /* delivery failures are recorded in the outbox */
      });
    }

    return ok(res, { requested: true, ...(isProd ? {} : { resetToken, link }) });
  }),
);

/** Completes a password reset with a valid, unexpired token. */
router.post(
  "/reset-password",
  authLimiter,
  validate(z.object({ token: z.string().min(10), password: passwordSchema })),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const payload = verifyPasswordResetToken(token);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedError("Account is inactive");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        // Anyone who already has a session on a stolen password is cut off.
        tokenVersion: { increment: 1 },
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return ok(res, { reset: true });
  }),
);

/**
 * Re-sends the verification link. Always answers the same way, so the endpoint
 * cannot be used to discover which addresses have an account.
 */
router.post(
  "/resend-verification",
  authLimiter,
  validate(z.object({ email: z.string().email().max(160).toLowerCase() })),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.active && !user.emailVerified) {
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, active: true },
        orderBy: { createdAt: "asc" },
      });
      if (membership) {
        const token = signEmailVerifyToken(user.id);
        const link = `${env.FRONTEND_URL.replace(/\/+$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
        void sendEmail({
          organizationId: membership.organizationId,
          to: user.email,
          subject: "Verify your Traveldesk email",
          body: `Open this link to verify your email address (expires in 24 hours):\n${link}\n\nIf you did not ask for this, you can ignore it.`,
          template: "email-verify",
          userId: user.id,
        }).catch(() => {
          /* delivery failures are recorded in the outbox */
        });
      }
    }
    return ok(res, { sent: true });
  }),
);

/** Verifies an email address using the token emailed at registration. */
router.post(
  "/verify-email",
  authLimiter,
  validate(z.object({ token: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    const { token } = req.body as { token: string };
    const payload = verifyEmailVerifyToken(token);
    const user = await prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
    return ok(res, { verified: true, email: user.email });
  }),
);

export default router;
