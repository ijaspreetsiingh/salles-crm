import type { Module } from "./catalog";

/**
 * Record number prefixes, so a new booking already looks like BK-XXXX before
 * the server answers and keeps the same shape afterwards.
 */
export const recordPrefix = (module: Module) =>
  (
    ({
      leads: "LD",
      bookings: "BK",
      quotations: "QT",
      finance: "INV",
      visa: "VSA",
      support: "TKT",
    }) as Record<string, string>
  )[module.id] ?? module.id.slice(0, 3).toUpperCase();

export const nextRecordId = (module: Module) =>
  `${recordPrefix(module)}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
