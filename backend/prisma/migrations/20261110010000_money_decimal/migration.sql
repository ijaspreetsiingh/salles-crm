-- Money moves from binary floating point to exact DECIMAL columns.
--
-- Float cannot represent 0.1 exactly, so repeated additions drift by paise and
-- two different orderings of the same ledger can disagree. Every money column
-- becomes DECIMAL(14,2) (up to 99,999,999,999.99) and every rate/tax column
-- becomes a fixed decimal too.
ALTER TABLE "AgentAccount"
  ALTER COLUMN "creditLimit" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "creditUsed" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "commissionRate" SET DATA TYPE DECIMAL(6,3);

ALTER TABLE "AgentCommission"
  ALTER COLUMN "saleAmount" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "rate" SET DATA TYPE DECIMAL(6,3),
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "Expense"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "gstRate" SET DATA TYPE DECIMAL(5,2);

ALTER TABLE "HotelAllotment"
  ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "sellingPrice" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "HotelRate"
  ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "sellingPrice" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "Payable"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "gstRate" SET DATA TYPE DECIMAL(5,2);

ALTER TABLE "PayablePayment"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "Payment"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "Plan"
  ALTER COLUMN "priceMonthly" SET DATA TYPE DECIMAL(14,2),
  ALTER COLUMN "priceYearly" SET DATA TYPE DECIMAL(14,2);

ALTER TABLE "Record"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- Webhook deliveries gain idempotency + retry bookkeeping.
ALTER TABLE "WebhookDelivery"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  -- Backfill the new column for rows that already exist, then drop the default
  -- so application writes must set it (Prisma's @updatedAt does).
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WebhookDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- A receipt number and a provider payment id must be unique per organisation,
-- otherwise the same money can be recorded (or reconciled) twice.
CREATE UNIQUE INDEX "Payment_organizationId_receiptNo_key"
  ON "Payment"("organizationId", "receiptNo");

CREATE UNIQUE INDEX "Payment_organizationId_providerPaymentId_key"
  ON "Payment"("organizationId", "providerPaymentId");

CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
  ON "WebhookDelivery"("status", "nextAttemptAt");

CREATE UNIQUE INDEX "WebhookDelivery_webhookId_dedupeKey_key"
  ON "WebhookDelivery"("webhookId", "dedupeKey");
