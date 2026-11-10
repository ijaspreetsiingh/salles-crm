-- CreateTable
CREATE TABLE "HotelAllotment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "roomType" TEXT NOT NULL DEFAULT 'Deluxe',
    "mealPlan" TEXT NOT NULL DEFAULT 'CP',
    "supplierName" TEXT NOT NULL DEFAULT '',
    "contractFrom" TEXT NOT NULL DEFAULT '',
    "contractTo" TEXT NOT NULL DEFAULT '',
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "usedRooms" INTEGER NOT NULL DEFAULT 0,
    "costPrice" REAL NOT NULL DEFAULT 0,
    "sellingPrice" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "releaseDays" INTEGER NOT NULL DEFAULT 7,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupRecordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "passport" TEXT NOT NULL DEFAULT '',
    "nationality" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" TEXT NOT NULL DEFAULT '',
    "roomType" TEXT NOT NULL DEFAULT 'Double',
    "roomNumber" TEXT NOT NULL DEFAULT '',
    "sharingWith" TEXT NOT NULL DEFAULT '',
    "bedPreference" TEXT NOT NULL DEFAULT '',
    "dietary" TEXT NOT NULL DEFAULT '',
    "emergencyContact" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Confirmed',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable
CREATE TABLE "VisaChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "attachmentId" TEXT,
    "receivedAt" TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable
CREATE TABLE "AgentAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "creditLimit" REAL NOT NULL DEFAULT 0,
    "creditUsed" REAL NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "commissionType" TEXT NOT NULL DEFAULT 'percent',
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "kycNotes" TEXT NOT NULL DEFAULT '',
    "panNumber" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "contractFrom" TEXT NOT NULL DEFAULT '',
    "contractTo" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderAvatar" TEXT,
    "body" TEXT NOT NULL,
    "replyToId" TEXT,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP,
    "reactions" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentCommission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "agentAccountId" TEXT NOT NULL,
    "bookingReference" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "saleAmount" REAL NOT NULL DEFAULT 0,
    "rate" REAL NOT NULL DEFAULT 0,
    "commissionType" TEXT NOT NULL DEFAULT 'percent',
    "amount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'Accrued',
    "paidOn" TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL
);

-- CreateIndex
CREATE INDEX "HotelAllotment_organizationId_hotelName_idx" ON "HotelAllotment"("organizationId", "hotelName");

-- CreateIndex
CREATE INDEX "HotelAllotment_organizationId_status_idx" ON "HotelAllotment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HotelAllotment_organizationId_city_idx" ON "HotelAllotment"("organizationId", "city");

-- CreateIndex
CREATE INDEX "GroupMember_organizationId_groupRecordId_idx" ON "GroupMember"("organizationId", "groupRecordId");

-- CreateIndex
CREATE INDEX "GroupMember_organizationId_status_idx" ON "GroupMember"("organizationId", "status");

-- CreateIndex
CREATE INDEX "VisaChecklistItem_organizationId_recordId_idx" ON "VisaChecklistItem"("organizationId", "recordId");

-- CreateIndex
CREATE INDEX "VisaChecklistItem_organizationId_status_idx" ON "VisaChecklistItem"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAccount_recordId_key" ON "AgentAccount"("recordId");

-- CreateIndex
CREATE INDEX "AgentAccount_organizationId_status_idx" ON "AgentAccount"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AgentAccount_organizationId_kycStatus_idx" ON "AgentAccount"("organizationId", "kycStatus");

-- CreateIndex
CREATE INDEX "ChatChannel_organizationId_idx" ON "ChatChannel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_organizationId_name_key" ON "ChatChannel"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ChatMember_channelId_idx" ON "ChatMember"("channelId");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_channelId_userId_key" ON "ChatMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCommission_organizationId_status_idx" ON "AgentCommission"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AgentCommission_agentAccountId_idx" ON "AgentCommission"("agentAccountId");
