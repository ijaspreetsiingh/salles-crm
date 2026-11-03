/**
 * Hotel rate master — contracted room prices with cost and selling side by side.
 */
import { apiRequest } from "./client";

export type HotelRateDto = {
  id: string;
  hotelName: string;
  city: string;
  country: string;
  roomType: string;
  mealPlan: string;
  season: string;
  validFrom: string | null;
  validTo: string | null;
  costPrice: number;
  sellingPrice: number;
  currency: string;
  basis: string;
  cancellation: string;
  supplierName: string;
  notes: string;
  active: boolean;
  margin: number;
  marginPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HotelRatesDto = {
  items: HotelRateDto[];
  cities: string[];
  totals: { count: number; hotels: number; avgMarginPercent: number | null };
};

export type HotelRateInput = {
  hotelName: string;
  city?: string;
  country?: string;
  roomType?: string;
  mealPlan?: string;
  season?: string;
  validFrom?: string;
  validTo?: string;
  costPrice: number;
  sellingPrice: number;
  currency?: string;
  basis?: string;
  cancellation?: string;
  supplierName?: string;
  notes?: string;
  active?: boolean;
};

export const MEAL_PLANS = ["EP", "CP", "MAP", "AP"] as const;

export const RATE_BASIS = [
  "Per room per night",
  "Per person per night",
  "Per room per stay",
  "Per person per stay",
] as const;

export const fetchHotelRates = (params: { q?: string; city?: string; inactive?: boolean } = {}) =>
  apiRequest<HotelRatesDto>("/hotel-rates", {
    query: {
      q: params.q,
      city: params.city,
      inactive: params.inactive ? "true" : undefined,
    },
  });

export const createHotelRate = (body: HotelRateInput) =>
  apiRequest<{ rate: HotelRateDto }>("/hotel-rates", { method: "POST", body });

export const updateHotelRate = (id: string, body: Partial<HotelRateInput>) =>
  apiRequest<{ rate: HotelRateDto }>(`/hotel-rates/${id}`, { method: "PATCH", body });

export const deleteHotelRate = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/hotel-rates/${id}`, { method: "DELETE" });
