import { apiBlob, apiRequest } from "./client";

/* ------------------------------------------------------------------ *
 * Hotels — room allotments
 * ------------------------------------------------------------------ */

export type AllotmentDto = {
  id: string;
  hotelName: string;
  city: string;
  roomType: string;
  mealPlan: string;
  supplierName: string;
  contractFrom: string;
  contractTo: string;
  totalRooms: number;
  usedRooms: number;
  availableRooms: number;
  occupancy: number;
  costPrice: number;
  sellingPrice: number;
  margin: number;
  currency: string;
  releaseDays: number;
  status: string;
  notes: string;
  updatedAt: string;
};

export type AllotmentInput = {
  hotelName: string;
  city?: string;
  roomType?: string;
  mealPlan?: string;
  supplierName?: string;
  contractFrom?: string;
  contractTo?: string;
  totalRooms: number;
  costPrice?: number;
  sellingPrice?: number;
  currency?: string;
  releaseDays?: number;
  status?: string;
  notes?: string;
};

export const fetchAllotments = (query: Record<string, string | undefined> = {}) =>
  apiRequest<{
    items: AllotmentDto[];
    cities: string[];
    totals: { rooms: number; held: number; free: number };
  }>("/hotel-allotments", { query });

export const createAllotment = (body: AllotmentInput) =>
  apiRequest<AllotmentDto>("/hotel-allotments", { method: "POST", body });

export const updateAllotment = (id: string, body: Partial<AllotmentInput>) =>
  apiRequest<AllotmentDto>(`/hotel-allotments/${id}`, { method: "PATCH", body });

export const holdRooms = (id: string, rooms: number) =>
  apiRequest<AllotmentDto>(`/hotel-allotments/${id}/hold`, { method: "POST", body: { rooms } });

export const releaseRooms = (id: string, rooms: number) =>
  apiRequest<AllotmentDto>(`/hotel-allotments/${id}/release`, { method: "POST", body: { rooms } });

export const deleteAllotment = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/hotel-allotments/${id}`, { method: "DELETE" });

export const fetchAvailability = (query: { hotelName: string; from?: string; to?: string }) =>
  apiRequest<{
    hotelName: string;
    items: Array<{
      id: string;
      roomType: string;
      mealPlan: string;
      availableRooms: number;
      totalRooms: number;
      usedRooms: number;
      sellingPrice: number;
      currency: string;
      releaseDays: number;
    }>;
  }>("/hotel-allotments/availability", { query });

/* ------------------------------------------------------------------ *
 * Groups — delegates and the rooming list
 * ------------------------------------------------------------------ */

export type GroupMemberDto = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passport: string;
  nationality: string;
  dateOfBirth: string;
  roomType: string;
  roomNumber: string;
  sharingWith: string;
  bedPreference: string;
  dietary: string;
  emergencyContact: string;
  status: string;
  notes: string;
  updatedAt: string;
};

export type GroupSummary = {
  delegates: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  rooms: number;
  unassigned: number;
  passportsMissing: number;
};

export const fetchGroupMembers = (recordId: string) =>
  apiRequest<{ items: GroupMemberDto[]; summary: GroupSummary }>(`/groups/${recordId}/members`);

export const addGroupMember = (
  recordId: string,
  body: Partial<GroupMemberDto> & { name: string },
) => apiRequest<GroupMemberDto>(`/groups/${recordId}/members`, { method: "POST", body });

export const importGroupMembers = (recordId: string, text: string, roomType?: string) =>
  apiRequest<{ added: number }>(`/groups/${recordId}/members/bulk`, {
    method: "POST",
    body: { text, roomType },
  });

export const updateGroupMember = (id: string, body: Partial<GroupMemberDto>) =>
  apiRequest<GroupMemberDto>(`/groups/members/${id}`, { method: "PATCH", body });

export const deleteGroupMember = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/groups/members/${id}`, { method: "DELETE" });

export const autoAssignRooms = (recordId: string) =>
  apiRequest<{ assigned: number; rooms: number }>(`/groups/${recordId}/auto-rooms`, {
    method: "POST",
    body: {},
  });

export type RoomingListDto = {
  group: {
    id: string;
    reference: string;
    name: string;
    destination: string;
    date: string;
    status: string;
  };
  rooms: Array<{
    roomNumber: string;
    roomType: string;
    guests: Array<{
      name: string;
      passport: string;
      dietary: string;
      bedPreference: string;
      age: string;
    }>;
  }>;
  unassigned: string[];
};

export const fetchRooming = (recordId: string) =>
  apiRequest<RoomingListDto>(`/groups/${recordId}/rooming`);

export type ManifestDto = {
  group?: {
    reference: string;
    name: string;
    destination: string;
    date: string;
    status: string;
    notes: string;
  };
  departure?: {
    id: string;
    moduleId: string;
    reference: string;
    name: string;
    destination: string;
    date: string;
    status: string;
    owner: string;
    phone: string;
    notes: string;
  };
  generatedAt: string;
  travellers: Array<{
    name: string;
    passport: string;
    nationality?: string;
    dateOfBirth?: string;
    phone: string;
    room: string;
    roomType: string;
    status: string;
    dietary: string;
    emergencyContact: string;
    notes?: string;
  }>;
  counts: { total?: number; travellers?: number; confirmed?: number; withoutPassport: number };
};

export const fetchGroupManifest = (recordId: string) =>
  apiRequest<ManifestDto>(`/groups/${recordId}/manifest`);

/* ------------------------------------------------------------------ *
 * Groups — rooms held against a hotel contract
 *
 * A room block is not the rooming list. The rooming list says how the group
 * sleeps; a block says how many rooms this group has taken out of a hotel's
 * contracted allocation, which is what stops the same rooms being promised to
 * two group trips.
 * ------------------------------------------------------------------ */

export type RoomBlockDto = {
  id: string;
  allotmentId: string;
  hotelName: string;
  roomType: string;
  roomsHeld: number;
  notes: string;
  linkedAt: string;
  /** The contract as it stands now, or null if it has been deleted since. */
  allotment: {
    id: string;
    hotelName: string;
    city: string;
    roomType: string;
    mealPlan: string;
    contractFrom: string;
    contractTo: string;
    totalRooms: number;
    usedRooms: number;
    availableRooms: number;
    status: string;
  } | null;
};

export const fetchRoomBlocks = (recordId: string) =>
  apiRequest<RoomBlockDto[]>(`/groups/${recordId}/room-blocks`);

/** Claims rooms out of a contract for this group. Fails when they are gone. */
export const holdRoomBlock = (
  recordId: string,
  body: { allotmentId: string; roomsHeld: number; notes?: string },
) => apiRequest<RoomBlockDto>(`/groups/${recordId}/room-blocks`, { method: "POST", body });

/** Releases a block and puts its rooms back on the contract. */
export const releaseRoomBlock = (recordId: string, blockId: string) =>
  apiRequest<{ removed: boolean }>(`/groups/${recordId}/room-blocks/${blockId}`, {
    method: "DELETE",
  });

/* ------------------------------------------------------------------ *
 * Visa checklists
 * ------------------------------------------------------------------ */

export type ChecklistItemDto = {
  id: string;
  label: string;
  required: boolean;
  status: string;
  note: string;
  receivedAt: string | null;
  position: number;
};

export const fetchVisaChecklist = (recordId: string) =>
  apiRequest<{
    application: {
      id: string;
      reference: string;
      name: string;
      destination: string;
      status: string;
      date: string;
    };
    items: ChecklistItemDto[];
    summary: {
      total: number;
      verified: number;
      received: number;
      pending: number;
      requiredPending: number;
      ready: boolean;
    };
  }>(`/visa/${recordId}/checklist`);

export const addVisaItem = (recordId: string, label: string) =>
  apiRequest<ChecklistItemDto>(`/visa/${recordId}/checklist`, { method: "POST", body: { label } });

export const updateVisaItem = (
  id: string,
  body: { status?: string; note?: string; required?: boolean },
) => apiRequest<ChecklistItemDto>(`/visa/items/${id}`, { method: "PATCH", body });

export const deleteVisaItem = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/visa/items/${id}`, { method: "DELETE" });

export const sendVisaReminder = (recordId: string) =>
  apiRequest<{ taskId: string; missing: string[]; message: string }>(`/visa/${recordId}/remind`, {
    method: "POST",
    body: {},
  });

export const fetchVisaPending = () =>
  apiRequest<
    Array<{
      id: string;
      reference: string;
      name: string;
      destination: string;
      date: string;
      status: string;
      tracked: number;
      pending: number;
      missing: string[];
    }>
  >("/visa/pending");

/* ------------------------------------------------------------------ *
 * B2B agents
 * ------------------------------------------------------------------ */

export type AgentAccountDto = {
  id: string;
  recordId: string;
  agencyName: string;
  contactName: string;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  creditUsedPercent: number;
  creditDays: number;
  commissionType: string;
  commissionRate: number;
  kycStatus: string;
  kycNotes: string;
  panNumber: string;
  gstin: string;
  contractFrom: string;
  contractTo: string;
  status: string;
  notes: string;
  updatedAt: string;
};

export type AgentListItem = {
  recordId: string;
  reference: string;
  name: string;
  city: string;
  recordStatus: string;
  account: AgentAccountDto | null;
  commission: { accrued: number; approved: number; paid: number };
};

export const fetchAgents = () =>
  apiRequest<{
    items: AgentListItem[];
    totals: {
      agents: number;
      creditExtended: number;
      creditUsed: number;
      commissionOwed: number;
      kycPending: number;
    };
  }>("/agents");

export const fetchAgent = (recordId: string) =>
  apiRequest<{
    agent: {
      id: string;
      reference: string;
      name: string;
      status: string;
      email: string;
      phone: string;
    };
    account: AgentAccountDto;
    commissions: Array<{
      id: string;
      bookingReference: string;
      description: string;
      saleAmount: number;
      rate: number;
      commissionType: string;
      amount: number;
      currency: string;
      status: string;
      paidOn: string | null;
      createdAt: string;
    }>;
    summary: { accrued: number; approved: number; paid: number };
  }>(`/agents/${recordId}`);

export const updateAgentAccount = (recordId: string, body: Partial<AgentAccountDto>) =>
  apiRequest<AgentAccountDto>(`/agents/${recordId}`, { method: "PATCH", body });

export const chargeAgent = (recordId: string, amount: number, bookingReference?: string) =>
  apiRequest<AgentAccountDto>(`/agents/${recordId}/charge`, {
    method: "POST",
    body: { amount, bookingReference },
  });

export const settleAgent = (recordId: string, amount: number) =>
  apiRequest<AgentAccountDto>(`/agents/${recordId}/settle`, { method: "POST", body: { amount } });

export const createAgentCommission = (
  recordId: string,
  body: { saleAmount: number; rate?: number; bookingReference?: string; description?: string },
) =>
  apiRequest<{ id: string; amount: number }>(`/agents/${recordId}/commissions`, {
    method: "POST",
    body,
  });

export const updateAgentCommission = (id: string, status: string) =>
  apiRequest<{ id: string; status: string }>(`/agents/commissions/${id}`, {
    method: "PATCH",
    body: { status },
  });

export const deleteAgentCommission = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/agents/commissions/${id}`, { method: "DELETE" });

/* ------------------------------------------------------------------ *
 * Trip operations
 * ------------------------------------------------------------------ */

export type DepartureDay = {
  date: string;
  items: Array<{
    id: string;
    moduleId: string;
    reference: string;
    name: string;
    destination: string;
    status: string;
    owner: string;
    amount?: number;
    currency?: string;
    travellers?: number;
  }>;
};

export const fetchDepartures = (from: string, to: string) =>
  apiRequest<{
    from: string;
    to: string;
    days: DepartureDay[];
    totals: { departures: number; travellers: number };
  }>("/operations/departures", { query: { from, to } });

export const fetchManifest = (recordId: string) =>
  apiRequest<ManifestDto>(`/operations/manifest/${recordId}`);

export const fetchDeadlines = () =>
  apiRequest<{
    allotments: Array<{
      id: string;
      hotelName: string;
      roomType: string;
      contractTo: string;
      releaseDays: number;
      freeRooms: number;
      daysLeft: number;
    }>;
    visas: Array<{
      id: string;
      reference: string;
      name: string;
      destination: string;
      date: string;
      pendingDocuments: number;
    }>;
  }>("/operations/deadlines");

/** Opens the printable voucher in a new tab. */
export async function openVoucher(recordId: string) {
  const blob = await apiBlob(`/operations/voucher/${recordId}`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  // Give the new tab a moment to take the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
