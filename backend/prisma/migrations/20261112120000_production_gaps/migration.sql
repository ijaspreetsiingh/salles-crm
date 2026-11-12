-- Attendance, GST credit notes, payable three-way match, trigram search
-- indexes and an append-only audit trail.

-- ILIKE '%term%' needs trigram indexes; btree cannot serve a leading wildcard.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "invoiceAmount" DECIMAL(14,2),
ADD COLUMN     "invoiceNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "matchNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
ADD COLUMN     "matchedAt" TIMESTAMP(3),
ADD COLUMN     "poAmount" DECIMAL(14,2),
ADD COLUMN     "poNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receivedAmount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Present',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "invoiceReference" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerGstin" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issuedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliesToReference" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_organizationId_date_idx" ON "Attendance"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Attendance_organizationId_userId_idx" ON "Attendance"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_organizationId_userId_date_key" ON "Attendance"("organizationId", "userId", "date");

-- CreateIndex
CREATE INDEX "CreditNote_organizationId_status_idx" ON "CreditNote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CreditNote_organizationId_issuedOn_idx" ON "CreditNote"("organizationId", "issuedOn");

-- CreateIndex
CREATE INDEX "CreditNote_organizationId_invoiceReference_idx" ON "CreditNote"("organizationId", "invoiceReference");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_organizationId_reference_key" ON "CreditNote"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "AuditLog_label_idx" ON "AuditLog" USING GIN ("label" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Conversation_contactName_idx" ON "Conversation" USING GIN ("contactName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Conversation_contactEmail_idx" ON "Conversation" USING GIN ("contactEmail" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_name_idx" ON "Record" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_detail_idx" ON "Record" USING GIN ("detail" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_destination_idx" ON "Record" USING GIN ("destination" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_email_idx" ON "Record" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_phone_idx" ON "Record" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_notes_idx" ON "Record" USING GIN ("notes" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Record_reference_idx" ON "Record" USING GIN ("reference" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Task_title_idx" ON "Task" USING GIN ("title" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log is append-only.
--
-- The API never exposed an update/delete route, but the database allowed both,
-- so a bug, a migration script or anyone with psql could rewrite history. The
-- trigger blocks updates outright, and blocks deletes while the owning
-- organisation still exists. A tenant deletion cascades after the parent row is
-- gone, so removing an entire organisation still works — removing one audit row
-- does not.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "AuditLog_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog is append-only: updates are not allowed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId") THEN
      RAISE EXCEPTION 'AuditLog is append-only: deletes are not allowed'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "AuditLog_append_only"();
