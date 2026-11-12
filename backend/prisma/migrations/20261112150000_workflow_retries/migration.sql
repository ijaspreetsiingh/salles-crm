-- Workflow runs get an automatic retry, and a dead-letter state when the
-- retries are used up.
--
-- Before this, a failed automation wrote one "failed" row and stopped: nobody
-- was told, and the run was never tried again. A booking confirmation that
-- failed at 3am looked exactly like a rule that had never fired.

ALTER TABLE "WorkflowRun"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "context" TEXT NOT NULL DEFAULT '{}';

-- The retry loop asks one question every minute: "which failed runs are due?"
CREATE INDEX "WorkflowRun_status_nextAttemptAt_idx" ON "WorkflowRun"("status", "nextAttemptAt");
