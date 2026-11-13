import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";

/**
 * Itinerary Catalog service.
 *
 * Pre-built day-wise trip templates (e.g. "Goa 3N4D Beach") and sightseeing
 * entries (e.g. "Basilica of Bom Jesus, Goa"). organizationId is null when
 * the entry is global (shared across all organizations).
 */

export type ItineraryTemplateDto = {
  id: string;
  organizationId: string | null;
  name: string;
  destination: string;
  nights: number;
  totalDays: number;
  travellers: number;
  category: string;
  pricePerPerson: number;
  currency: string;
  durationType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ItineraryDayDto = {
  id: string;
  itineraryId: string;
  dayNumber: number;
  title: string;
  description: string | null;
  activities: string[];
  hotelId: string | null;
  transportId: string | null;
  meals: string;
  order: number;
};

export type SightseeingEntryDto = {
  id: string;
  organizationId: string | null;
  name: string;
  city: string;
  state: string | null;
  country: string;
  category: string;
  durationHours: number;
  entryFee: number | null;
  rating: number | null;
  isActive: boolean;
  createdAt: string;
};

export type ItineraryTemplateWithDays = ItineraryTemplateDto & {
  days: ItineraryDayDto[];
};

const templateDto = (t: any): ItineraryTemplateDto => ({
  id: t.id,
  organizationId: t.organizationId,
  name: t.name,
  destination: t.destination,
  nights: t.nights,
  totalDays: t.totalDays,
  travellers: t.travellers,
  category: t.category,
  pricePerPerson: Number(t.pricePerPerson ?? 0),
  currency: t.currency,
  durationType: t.durationType,
  isActive: t.isActive,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const dayDto = (d: any): ItineraryDayDto => ({
  id: d.id,
  itineraryId: d.itineraryId,
  dayNumber: d.dayNumber,
  title: d.title,
  description: d.description,
  activities: parseJson<string[]>(d.activities, []),
  hotelId: d.hotelId,
  transportId: d.transportId,
  meals: d.meals,
  order: d.order,
});

const sightseeingDto = (s: any): SightseeingEntryDto => ({
  id: s.id,
  organizationId: s.organizationId,
  name: s.name,
  city: s.city,
  state: s.state,
  country: s.country,
  category: s.category,
  durationHours: s.durationHours,
  entryFee: s.entryFee ? Number(s.entryFee) : null,
  rating: s.rating ? Number(s.rating) : null,
  isActive: s.isActive,
  createdAt: s.createdAt.toISOString(),
});

/** List active itinerary templates, optionally filtered by destination/category. */
export async function listItineraryTemplates(
  organizationId: string,
  filters: { destination?: string; category?: string; activeOnly?: boolean } = {},
): Promise<ItineraryTemplateDto[]> {
  const where: any = {
    isActive: filters.activeOnly ?? true,
    OR: [{ organizationId: null }, { organizationId }],
  };
  if (filters.destination) where.destination = { contains: filters.destination, mode: "insensitive" };
  if (filters.category) where.category = { contains: filters.category, mode: "insensitive" };

  const rows = await prisma.itineraryTemplate.findMany({
    where,
    orderBy: [{ destination: "asc" }, { name: "asc" }],
    take: 200,
  });
  return rows.map(templateDto);
}

/** Get one template with its days. */
export async function getItineraryTemplate(
  id: string,
  organizationId: string,
): Promise<ItineraryTemplateWithDays | null> {
  const t = await prisma.itineraryTemplate.findFirst({
    where: { id, isActive: true, OR: [{ organizationId: null }, { organizationId }] },
    include: { itineraryDays: { orderBy: { order: "asc" } } },
  });
  if (!t) return null;
  return { ...templateDto(t), days: t.itineraryDays.map(dayDto) };
}

/** List sightseeing entries, optionally filtered by city/category. */
export async function listSightseeingEntries(
  organizationId: string,
  filters: { city?: string; category?: string; activeOnly?: boolean } = {},
): Promise<SightseeingEntryDto[]> {
  const where: any = {
    isActive: filters.activeOnly ?? true,
    OR: [{ organizationId: null }, { organizationId }],
  };
  if (filters.city) where.city = { contains: filters.city, mode: "insensitive" };
  if (filters.category) where.category = { contains: filters.category, mode: "insensitive" };

  const rows = await prisma.sightseeingEntry.findMany({
    where,
    orderBy: [{ city: "asc" }, { name: "asc" }],
    take: 200,
  });
  return rows.map(sightseeingDto);
}

/** Create a new itinerary template (organization-scoped). */
export async function createItineraryTemplate(
  organizationId: string,
  data: {
    name: string;
    destination: string;
    nights: number;
    totalDays: number;
    travellers: number;
    category: string;
    pricePerPerson: number;
    currency?: string;
    durationType?: string;
    dayPlans: Array<{
      dayNumber: number;
      title: string;
      description?: string;
      activities?: string[];
      meals?: string;
    }>;
  },
): Promise<ItineraryTemplateWithDays> {
  const created = await prisma.itineraryTemplate.create({
    data: {
      organizationId,
      name: data.name,
      destination: data.destination,
      nights: data.nights,
      totalDays: data.totalDays,
      travellers: data.travellers,
      category: data.category,
      pricePerPerson: data.pricePerPerson,
      currency: data.currency ?? "INR",
      durationType: data.durationType ?? "Fixed",
      itineraryDays: {
        create: data.dayPlans.map((d, i) => ({
          dayNumber: d.dayNumber,
          title: d.title,
          description: d.description ?? null,
          activities: JSON.stringify(d.activities ?? []),
          meals: d.meals ?? "CP",
          order: i + 1,
        })),
      },
    },
    include: { itineraryDays: { orderBy: { order: "asc" } } },
  });
  return { ...templateDto(created), days: created.itineraryDays.map(dayDto) };
}

/** Create a sightseeing entry (organization-scoped). */
export async function createSightseeingEntry(
  organizationId: string,
  data: {
    name: string;
    city: string;
    state?: string;
    country?: string;
    category: string;
    durationHours?: number;
    entryFee?: number;
    rating?: number;
  },
): Promise<SightseeingEntryDto> {
  const created = await prisma.sightseeingEntry.create({
    data: {
      organizationId,
      name: data.name,
      city: data.city,
      state: data.state ?? null,
      country: data.country ?? "India",
      category: data.category,
      durationHours: data.durationHours ?? 2,
      entryFee: data.entryFee ?? null,
      rating: data.rating ?? null,
    },
  });
  return sightseeingDto(created);
}

/** Seed the catalog with a batch of templates (import tool). */
export async function importItineraryTemplates(
  organizationId: string | null,
  templates: Array<{
    name: string;
    destination: string;
    nights: number;
    totalDays: number;
    travellers: number;
    category: string;
    pricePerPerson: number;
    currency?: string;
    dayPlans: Array<{ dayNumber: number; title: string; description?: string; activities?: string[]; meals?: string }>;
  }>,
): Promise<number> {
  let count = 0;
  for (const t of templates) {
    await prisma.itineraryTemplate.create({
      data: {
        organizationId,
        name: t.name,
        destination: t.destination,
        nights: t.nights,
        totalDays: t.totalDays,
        travellers: t.travellers,
        category: t.category,
        pricePerPerson: t.pricePerPerson,
        currency: t.currency ?? "INR",
        itineraryDays: {
          create: t.dayPlans.map((d, index) => ({
            dayNumber: d.dayNumber,
            title: d.title,
            description: d.description ?? null,
            activities: JSON.stringify(d.activities ?? []),
            meals: d.meals ?? "CP",
            order: index + 1,
          })),
        },
      },
    });
    count++;
  }
  return count;
}
