-- API keys get an expiry date and an IP allowlist.
--
-- `expiresAt` is optional: an empty value means the key never expires, which is
-- the safe default so existing keys keep working.
-- `allowedIps` is a JSON array of IP/CIDR strings. Empty means any IP may use
-- the key. The auth middleware checks the client IP on every request.
ALTER TABLE "ApiKey"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "allowedIps" TEXT NOT NULL DEFAULT '[]';

-- Helpful for ops: see which keys are about to expire or which IPs are allowed.
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt") WHERE "expiresAt" IS NOT NULL;
