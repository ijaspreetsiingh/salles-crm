-- AddTeamChat: ChatChannel, ChatMember, ChatMessage
-- This migration is idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS "ChatChannel" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT NOT NULL DEFAULT '',
    "isPrivate"      BOOLEAN NOT NULL DEFAULT false,
    "isDirect"       BOOLEAN NOT NULL DEFAULT false,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMember" (
    "id"          TEXT NOT NULL,
    "channelId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "lastReadAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id"           TEXT NOT NULL,
    "channelId"    TEXT NOT NULL,
    "senderId"     TEXT NOT NULL,
    "senderName"   TEXT NOT NULL,
    "senderAvatar" TEXT,
    "body"         TEXT NOT NULL,
    "replyToId"    TEXT,
    "edited"       BOOLEAN NOT NULL DEFAULT false,
    "deletedAt"    TIMESTAMP(3),
    "reactions"    TEXT NOT NULL DEFAULT '{}',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "ChatChannel_organizationId_name_key"
    ON "ChatChannel"("organizationId", "name");

CREATE INDEX IF NOT EXISTS "ChatChannel_organizationId_idx"
    ON "ChatChannel"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMember_channelId_userId_key"
    ON "ChatMember"("channelId", "userId");

CREATE INDEX IF NOT EXISTS "ChatMember_channelId_idx"
    ON "ChatMember"("channelId");

CREATE INDEX IF NOT EXISTS "ChatMember_userId_idx"
    ON "ChatMember"("userId");

CREATE INDEX IF NOT EXISTS "ChatMessage_channelId_createdAt_idx"
    ON "ChatMessage"("channelId", "createdAt");

-- Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChatMember_channelId_fkey'
  ) THEN
    ALTER TABLE "ChatMember"
      ADD CONSTRAINT "ChatMember_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_channelId_fkey'
  ) THEN
    ALTER TABLE "ChatMessage"
      ADD CONSTRAINT "ChatMessage_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- PushSubscription table (needed for Task 4 — browser push notifications)
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "endpoint"       TEXT NOT NULL,
    "p256dh"         TEXT NOT NULL,
    "auth"           TEXT NOT NULL,
    "userAgent"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
    ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
    ON "PushSubscription"("userId");

CREATE INDEX IF NOT EXISTS "PushSubscription_organizationId_idx"
    ON "PushSubscription"("organizationId");

-- PNR / Ticketing table (Task 5 — flight PNR queue)
CREATE TABLE IF NOT EXISTS "FlightPNR" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId"       TEXT,
    "pnr"            TEXT NOT NULL DEFAULT '',
    "gds"            TEXT NOT NULL DEFAULT 'Amadeus',
    "airline"        TEXT NOT NULL DEFAULT '',
    "route"          TEXT NOT NULL DEFAULT '',
    "departure"      TEXT NOT NULL DEFAULT '',
    "passengers"     TEXT NOT NULL DEFAULT '[]',
    "fareType"       TEXT NOT NULL DEFAULT 'Economy',
    "ticketDeadline" TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'Active',
    "ticketNumbers"  TEXT NOT NULL DEFAULT '[]',
    "notes"          TEXT NOT NULL DEFAULT '',
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlightPNR_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FlightPNR_organizationId_status_idx"
    ON "FlightPNR"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "FlightPNR_ticketDeadline_idx"
    ON "FlightPNR"("ticketDeadline");

-- Payment model additions: meta, reference, razorpayPaymentLink
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Payment' AND column_name='meta'
  ) THEN
    ALTER TABLE "Payment" ADD COLUMN "meta" TEXT NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Payment' AND column_name='reference'
  ) THEN
    ALTER TABLE "Payment" ADD COLUMN "reference" TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Payment' AND column_name='razorpayPaymentLink'
  ) THEN
    ALTER TABLE "Payment" ADD COLUMN "razorpayPaymentLink" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Payment_reference_idx" ON "Payment"("reference");
