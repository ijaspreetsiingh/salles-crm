import { parseJson } from "../lib/utils";

/**
 * Trip end dates.
 *
 * The operations screen used to answer "which trips arrive today?" by searching
 * the record's `extra` JSON for today's date as text:
 *
 *   { extra: { contains: today }, status: "In progress" }
 *
 * That cannot work. It matches the date in any field — a booking date, a note,
 * a payment date — so it lists trips that are not arriving, and it misses a
 * trip whose return date was written as `12/11/2026` or stored in a key the
 * query did not imagine. An ops manager reading that list sends a driver to the
 * airport for the wrong flight, or sends nobody at all.
 *
 * A trip now carries its own return date, and it is read from a named field
 * rather than guessed from the whole JSON blob.
 */

/**
 * Keys that can hold a trip's end date, newest convention first.
 *
 * `returnDate` is what the form writes. The others exist because this data was
 * free-form JSON before the field existed: quotations use `return`, some
 * imports say `endDate`, and transfers say `arrivalDate`. Reading them is
 * cheaper than asking the agency to re-key their history.
 */
const RETURN_KEYS = ["returnDate", "return", "endDate", "arrivalDate", "to"] as const;

/** A yyyy-mm-dd calendar day, or "" when the value cannot be trusted. */
const normaliseDay = (raw: unknown): string => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Some imports wrote an epoch in milliseconds.
    if (raw > 1e12) return new Date(raw).toISOString().slice(0, 10);
    return "";
  }
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";

  // ISO day, or an ISO timestamp we only need the day from.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    const [, year, month, day] = iso;
    return isValidDay(Number(year), Number(month), Number(day)) ? `${year}-${month}-${day}` : "";
  }

  // Day-first, which is how a date is written by hand in India: 12/11/2026.
  // Written the other way round it would be 11 December, one month out, so the
  // assumption is stated here rather than left to chance.
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (dmy) {
    const [, day, month, year] = dmy;
    if (!isValidDay(Number(year), Number(month), Number(day))) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return "";
};

const isValidDay = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

/** The day a trip ends, or "" when the record does not say. */
export function tripReturnDate(extraJson: string | null | undefined): string {
  const extra = parseJson<Record<string, unknown>>(extraJson ?? "{}", {});
  for (const key of RETURN_KEYS) {
    const day = normaliseDay(extra[key]);
    if (day) return day;
  }
  return "";
}

/** True when the trip is on the road right now, so its return day matters. */
export const tripIsRunning = (status: string): boolean =>
  status === "In progress" || status === "Delayed";

export type TripLike = {
  id: string;
  status: string;
  extra: string | null;
};

export type ArrivalsToday<T extends TripLike> = {
  /** Trips whose recorded return date is today. */
  arriving: T[];
  /**
   * Trips that are on the road with no return date at all. They are counted,
   * never guessed at: a driver cannot be sent to meet a flight nobody recorded.
   */
  undated: T[];
};

/**
 * Splits the candidate trips into "arriving today" and "we do not know".
 *
 * Filtering happens here, in JavaScript, and not in SQL. The date lives inside
 * a JSON string, so any `LIKE` prefilter would have to guess the exact way it
 * was written — which is the bug this replaces. Ops trips are few, and the
 * caller bounds the query.
 */
export function pickArrivals<T extends TripLike>(
  trips: readonly T[],
  today: string,
): ArrivalsToday<T> {
  const arriving: T[] = [];
  const undated: T[] = [];
  for (const trip of trips) {
    const day = tripReturnDate(trip.extra);
    if (day === today) {
      arriving.push(trip);
    } else if (!day && tripIsRunning(trip.status)) {
      undated.push(trip);
    }
  }
  return { arriving, undated };
}
