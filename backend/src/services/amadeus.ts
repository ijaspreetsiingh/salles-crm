import { env } from "../config/env";

type FlightOffer = {
  airline: string;
  price: number;
  currency: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  seatsLeft?: number;
};

/**
 * Amadeus flight search adapter.
 *
 * With AMADEUS_CLIENT_ID/SECRET set, searches are real (test or production host
 * via AMADEUS_HOST). Without keys it reports exactly that instead of showing
 * fake flights — the sales flow never quotes a fare that does not exist.
 */
export function amadeusConfigured(): boolean {
  return Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.AMADEUS_CLIENT_ID,
    client_secret: env.AMADEUS_CLIENT_SECRET,
  });
  const response = await fetch(`${env.AMADEUS_HOST.replace(/\/$/, "")}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error("Amadeus authentication failed — check AMADEUS_CLIENT_ID/SECRET");
  }
  cachedToken = { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 1700) * 1000 };
  return cachedToken.token;
}

export async function searchFlightOffers(input: {
  origin: string;
  destination: string;
  date: string;
  adults?: number;
}): Promise<{ offers: FlightOffer[]; currency: string }> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    originLocationCode: input.origin,
    destinationLocationCode: input.destination,
    departureDate: input.date,
    adults: String(input.adults ?? 1),
    max: "10",
  });
  const response = await fetch(
    `${env.AMADEUS_HOST.replace(/\/$/, "")}/v2/shopping/flight-offers?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{
      price?: { grandTotal?: string; currency?: string };
      numberOfBookableSeats?: number;
      itineraries?: Array<{
        segments?: Array<{
          carrierCode?: string;
          departure?: { iataCode?: string; at?: string };
          arrival?: { iataCode?: string; at?: string };
        }>;
      }>;
    }>;
    dictionaries?: { carriers?: Record<string, string> };
    error?: string;
  } | null;

  if (!response.ok) throw new Error(payload?.error ?? `Amadeus returned ${response.status}`);

  const carriers = payload?.dictionaries?.carriers ?? {};
  const offers: FlightOffer[] = (payload?.data ?? []).slice(0, 10).map((offer) => {
    const itinerary = offer.itineraries?.[0];
    const first = itinerary?.segments?.[0];
    const last = itinerary?.segments?.[itinerary.segments.length - 1];
    const carrierCode = first?.carrierCode ?? "";
    return {
      airline: carriers[carrierCode] ?? carrierCode,
      price: Number(offer.price?.grandTotal ?? 0),
      currency: offer.price?.currency ?? "INR",
      departure: { airport: first?.departure?.iataCode ?? input.origin, time: first?.departure?.at ?? "" },
      arrival: { airport: last?.arrival?.iataCode ?? input.destination, time: last?.arrival?.at ?? "" },
      seatsLeft: offer.numberOfBookableSeats,
    };
  });
  return { offers, currency: payload?.data?.[0]?.price?.currency ?? "INR" };
}
