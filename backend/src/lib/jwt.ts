import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "./errors";

export type AccessTokenPayload = {
  sub: string; // user id
  org: string; // organization id
  role: string; // role key
  branch?: string | null;
  email: string;
  name: string;
  /**
   * The user's `tokenVersion` when the token was minted. A password change,
   * a deactivation or a role change bumps the version, which invalidates every
   * access token already in the wild instead of waiting for it to expire.
   */
  tv?: number;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string; // refresh token row id
};

export type PasswordResetTokenPayload = {
  sub: string; // user id
  purpose: "password-reset";
};

export type EmailVerifyTokenPayload = {
  sub: string; // user id
  purpose: "email-verify";
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
}

export function signPasswordResetToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "password-reset" } as PasswordResetTokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: "15m",
  } as SignOptions);
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as PasswordResetTokenPayload;
    if (payload.purpose !== "password-reset") throw new Error("wrong purpose");
    return payload;
  } catch {
    throw new UnauthorizedError("Invalid or expired password reset token");
  }
}

export function signEmailVerifyToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "email-verify" } as EmailVerifyTokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: "24h",
  } as SignOptions);
}

export function verifyEmailVerifyToken(token: string): EmailVerifyTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as EmailVerifyTokenPayload;
    if (payload.purpose !== "email-verify") throw new Error("wrong purpose");
    return payload;
  } catch {
    throw new UnauthorizedError("Invalid or expired email verification token");
  }
}
