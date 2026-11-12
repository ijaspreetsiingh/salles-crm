-- Every uploaded document records which scanner cleared it.
--
-- The scanner service existed but no upload called it, so "we scan documents"
-- was a promise the code did not keep. The row now carries the answer:
-- "clamav:clean" when clamd checked the file, "eicar-only:clean" when no daemon
-- is configured (and the UI can say so instead of implying a full scan).

ALTER TABLE "Attachment"
  ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "scannedAt" TIMESTAMP(3);
