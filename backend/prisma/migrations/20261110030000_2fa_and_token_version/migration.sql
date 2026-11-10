-- Session revocation and two-factor authentication.

-- Every access token carries the version it was minted with, so a password
-- change or a deactivation can cut off sessions that are already out there.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- TOTP enrolment: the secret is stored only once the user starts enrolment,
-- and `twoFactorEnabledAt` is the switch that makes it compulsory.
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "twoFactorRecoveryCodes" TEXT NOT NULL DEFAULT '[]';
