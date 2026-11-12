-- Room blocks become rows instead of an array inside the group's `extra` JSON.
--
-- The JSON version had two failure modes that cost real money:
--   * two people linking a block at the same moment both read the same array,
--     one block was lost, but both increments to `HotelAllotment.usedRooms`
--     stuck — the contract then showed rooms as held that no group was holding;
--   * deleting "block 2" by index could remove the wrong block once another
--     block had been removed first.
-- A row per block with real foreign keys makes the block and the counter move
-- together, and deleting by id can never hit the wrong one.

CREATE TABLE "GroupRoomBlock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupRecordId" TEXT NOT NULL,
    "allotmentId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL DEFAULT '',
    "roomType" TEXT NOT NULL DEFAULT '',
    "roomsHeld" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupRoomBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupRoomBlock_organizationId_groupRecordId_idx" ON "GroupRoomBlock"("organizationId", "groupRecordId");
CREATE INDEX "GroupRoomBlock_organizationId_allotmentId_idx" ON "GroupRoomBlock"("organizationId", "allotmentId");

ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_groupRecordId_fkey"
  FOREIGN KEY ("groupRecordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_allotmentId_fkey"
  FOREIGN KEY ("allotmentId") REFERENCES "HotelAllotment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move every block that is still in a group's `extra` JSON into the new table.
-- `usedRooms` already includes them, so the counter is deliberately untouched.
-- A single malformed `extra` value must not abort the whole migration, so each
-- record is handled on its own and skipped with a warning if it cannot be read.
DO $$
DECLARE
  rec RECORD;
  block jsonb;
BEGIN
  FOR rec IN
    SELECT "id", "organizationId", "extra"
    FROM "Record"
    WHERE "moduleId" = 'groups' AND "extra" LIKE '%roomBlocks%'
  LOOP
    BEGIN
      IF jsonb_typeof((rec."extra")::jsonb -> 'roomBlocks') <> 'array' THEN
        CONTINUE;
      END IF;

      FOR block IN SELECT * FROM jsonb_array_elements((rec."extra")::jsonb -> 'roomBlocks')
      LOOP
        INSERT INTO "GroupRoomBlock" (
          "id", "organizationId", "groupRecordId", "allotmentId", "hotelName",
          "roomType", "roomsHeld", "notes", "createdAt", "updatedAt"
        )
        SELECT
          md5(random()::text || clock_timestamp()::text || rec."id" || (block->>'allotmentId')),
          rec."organizationId",
          rec."id",
          a."id",
          COALESCE(NULLIF(block->>'hotelName', ''), a."hotelName"),
          COALESCE(NULLIF(block->>'roomType', ''), a."roomType"),
          -- Casts are guarded, not attempted-and-caught: one malformed value
          -- must not roll back the other blocks of the same group.
          GREATEST(
            CASE WHEN block->>'roomsHeld' ~ '^[0-9]{1,4}$'
                 THEN (block->>'roomsHeld')::int ELSE 1 END,
            1
          ),
          COALESCE(block->>'notes', ''),
          -- Keep the real link date when it is the ISO string the old code
          -- wrote, otherwise fall back to now.
          CASE WHEN block->>'linkedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
               THEN (block->>'linkedAt')::timestamp ELSE now() END,
          now()
        FROM "HotelAllotment" a
        WHERE a."id" = block->>'allotmentId'
          AND a."organizationId" = rec."organizationId";
      END LOOP;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Skipped room blocks on group %: %', rec."id", SQLERRM;
    END;
  END LOOP;
END $$;
