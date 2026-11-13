-- Itinerary Catalog: pre-built day-wise trip templates and sightseeing entries
-- These tables power the "Use Pre-built Itinerary" flow in quotations.

CREATE TABLE "ItineraryTemplate" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT,
    "name"           TEXT NOT NULL,
    "destination"    TEXT NOT NULL DEFAULT '',
    "nights"         INTEGER NOT NULL DEFAULT 0,
    "days"           INTEGER NOT NULL DEFAULT 0,
    "travellers"     INTEGER NOT NULL DEFAULT 2,
    "category"       TEXT NOT NULL DEFAULT '',
    "pricePerPerson" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency"       TEXT NOT NULL DEFAULT 'INR',
    "durationType"   TEXT NOT NULL DEFAULT 'Fixed',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItineraryTemplate_organizationId_destination_isActive_idx"
    ON "ItineraryTemplate"("organizationId", "destination", "isActive");
CREATE INDEX "ItineraryTemplate_destination_isActive_idx"
    ON "ItineraryTemplate"("destination", "isActive");
CREATE INDEX "ItineraryTemplate_category_isActive_idx"
    ON "ItineraryTemplate"("category", "isActive");

ALTER TABLE "ItineraryTemplate" ADD CONSTRAINT "ItineraryTemplate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ItineraryDay" (
    "id"          TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "dayNumber"   INTEGER NOT NULL,
    "title"       TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "activities"  TEXT NOT NULL DEFAULT '[]',
    "hotelId"     TEXT,
    "transportId" TEXT,
    "meals"       TEXT NOT NULL DEFAULT 'CP',
    "order"       INTEGER NOT NULL,

    CONSTRAINT "ItineraryDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItineraryDay_itineraryId_order_idx" ON "ItineraryDay"("itineraryId", "order");

ALTER TABLE "ItineraryDay" ADD CONSTRAINT "ItineraryDay_itineraryId_fkey"
    FOREIGN KEY ("itineraryId") REFERENCES "ItineraryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SightseeingEntry" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT,
    "name"           TEXT NOT NULL DEFAULT '',
    "city"           TEXT NOT NULL DEFAULT '',
    "state"          TEXT,
    "country"        TEXT NOT NULL DEFAULT 'India',
    "category"       TEXT NOT NULL DEFAULT '',
    "durationHours"  INTEGER NOT NULL DEFAULT 2,
    "entryFee"       DECIMAL(10,2),
    "rating"         DECIMAL(3,1),
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SightseeingEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SightseeingEntry_organizationId_city_isActive_idx"
    ON "SightseeingEntry"("organizationId", "city", "isActive");
CREATE INDEX "SightseeingEntry_city_isActive_idx"
    ON "SightseeingEntry"("city", "isActive");
CREATE INDEX "SightseeingEntry_category_isActive_idx"
    ON "SightseeingEntry"("category", "isActive");

ALTER TABLE "SightseeingEntry" ADD CONSTRAINT "SightseeingEntry_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
