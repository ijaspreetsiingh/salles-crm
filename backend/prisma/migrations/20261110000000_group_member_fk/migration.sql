-- Delegates whose group (or organisation) no longer exists are unreachable
-- rows holding passports and phone numbers. They must go before the foreign
-- keys can be added — a member can only ever be reached through its group.

DELETE FROM "GroupMember" gm
WHERE NOT EXISTS (SELECT 1 FROM "Record" r WHERE r."id" = gm."groupRecordId");

DELETE FROM "GroupMember" gm
WHERE NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o."id" = gm."organizationId");

-- CreateIndex
CREATE INDEX "GroupMember_groupRecordId_idx" ON "GroupMember"("groupRecordId");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupRecordId_fkey"
  FOREIGN KEY ("groupRecordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
