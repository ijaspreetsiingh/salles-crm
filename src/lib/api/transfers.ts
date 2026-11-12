/** Transfers — vehicle fleet, driver roster, assignment. */
import { apiRequest } from "./client";

export type Vehicle = {
  id: string; registrationNo: string; name: string; type: string;
  capacity: number; fuel: string; active: boolean; notes: string;
  branchId: string | null; branchName: string | null;
};

export type Driver = {
  id: string; name: string; phone: string; licenseNo: string;
  licenseExpiry: string | null; languages: string[]; active: boolean;
  notes: string; branchId: string | null;
};

export type Assignment = {
  vehicleId: string | null; vehicleRef: string | null; vehicleName: string | null;
  driverId: string | null; driverName: string | null; driverPhone: string | null;
  pickupTime: string | null; pickupLocation: string | null; dropLocation: string | null;
  assigned: boolean;
};

export const fetchVehicles = () => apiRequest<Vehicle[]>("/transfers/vehicles");
export const createVehicle = (body: Record<string, unknown>) =>
  apiRequest("/transfers/vehicles", { method: "POST", body });
export const updateVehicle = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/vehicles/${id}`, { method: "PATCH", body });
export const deleteVehicle = (id: string) =>
  apiRequest(`/transfers/vehicles/${id}`, { method: "DELETE" });

export const fetchDrivers = () => apiRequest<Driver[]>("/transfers/drivers");
export const createDriver = (body: Record<string, unknown>) =>
  apiRequest("/transfers/drivers", { method: "POST", body });
export const updateDriver = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/drivers/${id}`, { method: "PATCH", body });
export const deleteDriver = (id: string) =>
  apiRequest(`/transfers/drivers/${id}`, { method: "DELETE" });

export const assignTransfer = (transferId: string, body: Record<string, unknown>) =>
  apiRequest(`/transfers/${transferId}/assign`, { method: "POST", body });
export const fetchAssignment = (transferId: string) =>
  apiRequest<Assignment>(`/transfers/${transferId}/assignment`);
