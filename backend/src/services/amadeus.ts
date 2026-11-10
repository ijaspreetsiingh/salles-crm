import { env } from "../config/env";

type FlightOffer = {
  /** Amadeus offer id — required to create the order, so never omit it. */
  id: string;
  airline: string;
  price: number;
  currency: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  seatsLeft?: number;
  /**
   * The untouched Amadeus offer. Amadeus' order API needs the whole offer,
   * not just its id, so the route signs this into the booking token instead
   * of making the browser carry it around.
   */
  raw: Record<string, unknown>;
};

export type AmadeusCredentials = {
  apiKey: string;
  apiSecret: string;
  host: string;
};

/**
 * Check if Amadeus credentials are available for an organization.
 * Per-company: checks IntegrationConnection table first, falls back to env.
 */
export function amadeusConfigured(creds?: AmadeusCredentials | null): boolean {
  if (creds) return Boolean(creds.apiKey && creds.apiSecret);
  return Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET);
}

/**
 * Get Amadeus credentials from env (platform default).
 */
export function getEnvAmadeusCredentials(): AmadeusCredentials | null {
  if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) return null;
  return {
    apiKey: env.AMADEUS_CLIENT_ID,
    apiSecret: env.AMADEUS_CLIENT_SECRET,
    host: env.AMADEUS_HOST,
  };
}

/**
 * Amadeus flight search adapter.
 *
 * Per-company: accepts credentials from IntegrationConnection table.
 * Falls back to env vars for platform-level default.
 */
export async function searchFlightOffers(
  input: { origin: string; destination: string; date: string; adults?: number },
  creds?: AmadeusCredentials | null,
): Promise<{ offers: FlightOffer[]; currency: string }> {
  const credentials = creds ?? getEnvAmadeusCredentials();
  if (!credentials) {
    throw new Error("Amadeus credentials not configured");
  }

  const { apiKey, apiSecret, host } = credentials;
  const baseUrl = host.replace(/\/$/, "");

  // Get access token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: apiSecret,
  });
  const tokenResponse = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error("Amadeus authentication failed — check API key/secret");
  }
  const token = tokenPayload.access_token;

  // Search flights
  const params = new URLSearchParams({
    originLocationCode: input.origin,
    destinationLocationCode: input.destination,
    departureDate: input.date,
    adults: String(input.adults ?? 1),
    max: "10",
  });
  const response = await fetch(`${baseUrl}/v2/shopping/flight-offers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{
      id?: string;
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
      id: String(offer.id ?? ""),
      airline: carriers[carrierCode] ?? carrierCode,
      price: Number(offer.price?.grandTotal ?? 0),
      currency: offer.price?.currency ?? "INR",
      departure: {
        airport: first?.departure?.iataCode ?? input.origin,
        time: first?.departure?.at ?? "",
      },
      arrival: {
        airport: last?.arrival?.iataCode ?? input.destination,
        time: last?.arrival?.at ?? "",
      },
      seatsLeft: offer.numberOfBookableSeats,
      raw: offer as unknown as Record<string, unknown>,
    };
  });
  return { offers, currency: payload?.data?.[0]?.price?.currency ?? "INR" };
}

/**
 * Create a flight order (PNR) through Amadeus API.
 *
 * Amadeus requires the complete flight offer object returned by search, so the
 * caller passes the offer itself (recovered from the signed booking token).
 */
export async function createFlightOrder(
  input: {
    flightOffer: Record<string, unknown>;
    passengers: Array<{ firstName: string; lastName: string; dateOfBirth: string; gender: string }>;
    contactEmail: string;
    contactPhone: string;
  },
  creds?: AmadeusCredentials | null,
): Promise<{ pnr: string; orderId: string; status: string }> {
  const credentials = creds ?? getEnvAmadeusCredentials();
  if (!credentials) throw new Error("Amadeus credentials not configured");

  const { apiKey, apiSecret, host } = credentials;
  const baseUrl = host.replace(/\/$/, "");

  // Get access token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: apiSecret,
  });
  const tokenResponse = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error("Amadeus authentication failed");
  }
  const token = tokenPayload.access_token;

  // Create flight order
  const orderPayload = {
    data: {
      type: "flight-order",
      flightOffers: [input.flightOffer],
      travelers: input.passengers.map((p, i) => ({
        id: String(i + 1),
        dateOfBirth: p.dateOfBirth,
        name: { firstName: p.firstName, lastName: p.lastName },
        gender: p.gender,
        contact: {
          emailAddress: input.contactEmail,
          phones: [{ deviceType: "MOBILE", countryCallingCode: "91", number: input.contactPhone }],
        },
      })),
    },
  };

  const response = await fetch(`${baseUrl}/v1/booking/flight-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(orderPayload),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: { id: string; associatedRecords?: Array<{ reference?: string }> };
    errors?: Array<{ detail?: string }>;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.detail ?? `Amadeus booking failed: ${response.status}`);
  }

  return {
    pnr: payload?.data?.associatedRecords?.[0]?.reference ?? payload?.data?.id ?? "",
    orderId: payload?.data?.id ?? "",
    status: "confirmed",
  };
}

/**
 * Issue tickets for an existing Amadeus flight order.
 *
 * Amadeus requires a payment to be recorded before tickets are issued. In
 * practice most Indian agencies issue tickets in the GDS desktop and record
 * the numbers here, but when the order was created through this system we
 * can attempt the API call and fall back to manual recording on failure.
 */
export async function issueAmadeusTickets(
  input: { orderId: string; formOfPayment?: string },
  creds?: AmadeusCredentials | null,
): Promise<{ ticketNumbers: string[]; status: string }> {
  const credentials = creds ?? getEnvAmadeusCredentials();
  if (!credentials) throw new Error("Amadeus credentials not configured");

  const { apiKey, apiSecret, host } = credentials;
  const baseUrl = host.replace(/\/$/, "");

  // Get access token
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: apiSecret,
  });
  const tokenResponse = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error("Amadeus authentication failed");
  }
  const token = tokenPayload.access_token;

  // Issue payment to trigger ticketing
  const paymentPayload = {
    data: {
      type: "flight-order",
      flightOffers: [],
      travelers: [],
      formOfPayment: {
        other: {
          method: input.formOfPayment || "CASH",
        },
      },
    },
  };

  const response = await fetch(
    `${baseUrl}/v1/booking/flight-orders/${input.orderId}/payments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(paymentPayload),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      associatedRecords?: Array<{ reference?: string }>;
      travelers?: Array<{ ticketNumbers?: string[] }>;
    };
    errors?: Array<{ detail?: string }>;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.detail ?? `Amadeus ticketing failed: ${response.status}`);
  }

  // Extract ticket numbers from the response
  const ticketNumbers: string[] = [];
  for (const traveler of payload?.data?.travelers ?? []) {
    for (const tn of traveler.ticketNumbers ?? []) {
      ticketNumbers.push(tn);
    }
  }
  // Fallback: use associated record references
  if (ticketNumbers.length === 0) {
    for (const rec of payload?.data?.associatedRecords ?? []) {
      if (rec.reference) ticketNumbers.push(rec.reference);
    }
  }

  return {
    ticketNumbers: ticketNumbers.length > 0 ? ticketNumbers : [`AMADEUS-${input.orderId}`],
    status: "Ticketed",
  };
}
