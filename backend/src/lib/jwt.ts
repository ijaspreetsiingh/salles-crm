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
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string; // refresh token row id
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
