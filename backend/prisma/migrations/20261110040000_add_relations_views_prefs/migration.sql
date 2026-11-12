-- Migration: add RecordRelation, RecordEvent, SavedView, Favorite, Preference
-- These five tables replace inferred name-matching links and client-side-only prefs.

-- RecordRelation: explicit typed links between records across modules
CREATE TABLE "RecordRelation" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fromId"         TEXT NOT NULL,
    "toId"           TEXT NOT NULL,
    "kind"           TEXT NOT NULL DEFAULT 'related',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordRelation_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecordRelation_fromTo_kind_unique" UNIQUE ("fromId", "toId", "kind")
);
CREATE INDEX "RecordRelation_organizationId_fromId_idx" ON "RecordRelation"("organizationId", "fromId");
CREATE INDEX "RecordRelation_organizationId_toId_idx"   ON "RecordRelation"("organizationId", "toId");
CREATE INDEX "RecordRelation_organizationId_kind_idx"   ON "RecordRelation"("organizationId", "kind");

-- RecordEvent: user-facing activity timeline per record
CREATE TABLE "RecordEvent" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "recordId"       TEXT NOT NULL,
    "actorId"        TEXT,
    "actorName"      TEXT NOT NULL DEFAULT 'System',
    "type"           TEXT NOT NULL,
    "body"           TEXT NOT NULL DEFAULT '',
    "meta"           TEXT NOT NULL DEFAULT '{}',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordEvent_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecordEvent_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "RecordEvent_organizationId_recordId_createdAt_idx" ON "RecordEvent"("organizationId", "recordId", "createdAt");
CREATE INDEX "RecordEvent_organizationId_type_idx"               ON "RecordEvent"("organizationId", "type");

-- SavedView: saved filter+sort+column configs per module per user
CREATE TABLE "SavedView" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT,
    "moduleId"       TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "filters"        TEXT NOT NULL DEFAULT '{}',
    "sort"           TEXT NOT NULL DEFAULT '{}',
    "columns"        TEXT NOT NULL DEFAULT '[]',
    "layout"         TEXT NOT NULL DEFAULT 'table',
    "isDefault"      BOOLEAN NOT NULL DEFAULT FALSE,
    "isShared"       BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedView_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedView_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedView_org_module_title_unique" UNIQUE ("organizationId", "moduleId", "title")
);
CREATE INDEX "SavedView_organizationId_moduleId_idx" ON "SavedView"("organizationId", "moduleId");
CREATE INDEX "SavedView_organizationId_userId_idx"   ON "SavedView"("organizationId", "userId");

-- Favorite: pinned records and modules per user
CREATE TABLE "Favorite" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "targetType"     TEXT NOT NULL,
    "targetId"       TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_userId_targetType_targetId_unique" UNIQUE ("userId", "targetType", "targetId")
);
CREATE INDEX "Favorite_organizationId_userId_idx"      ON "Favorite"("organizationId", "userId");
CREATE INDEX "Favorite_organizationId_targetType_idx"  ON "Favorite"("organizationId", "targetType");

-- Preference: per-user server-side UI preferences
CREATE TABLE "Preference" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "value"          TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Preference_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Preference_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Preference_org_user_key_unique" UNIQUE ("organizationId", "userId", "key")
);
CREATE INDEX "Preference_organizationId_userId_idx" ON "Preference"("organizationId", "userId");

-- User: add loginAttempts and lockedUntil for account lockout (Task 4)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil"   TIMESTAMP(3);

-- Campaign: add scheduledFor for scheduled campaign sends (Task 15)
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);

-- Travel request status values now include "Pending approval" and "In review"
-- No schema change needed — status is a VARCHAR field on Record.
-- This comment documents the new values added by corporate.routes.ts.
