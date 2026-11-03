/**
 * Per-module structured editors.
 *
 * A travel record is rarely one row of fields. A hotel stay is a set of room
 * nights, a flight is a set of sectors, a visa is a document checklist, a group
 * is a rooming list. Those are defined here once, and the record dialog renders
 * them — so every module's create screen looks like the work it represents
 * instead of a generic form.
 *
 * Rows are stored as JSON inside the record's `extra` bag (same pattern as
 * quote lines), which means no migration is needed and the values survive a
 * reload. `derive` copies the important totals back into the flat `extra` keys
 * the table columns, tabs and reports already read.
 */

export type EditorRow = {
  [key: string]: string | number | boolean;
} & Partial<{
  name: string; type: string; dob: string; passport: string;
  role: string; phone: string; email: string;
  from: string; to: string; date: string; depart: string; arrive: string;
  flightNo: string; cabin: string;
  roomType: string; count: number; nights: number; rate: number; meal: string;
  time: string; vehicle: string; driver: string; flight: string;
  rooms: number; occupancy: number;
  seats: number; price: number; note: string;
  service: string; validFrom: string; validTo: string; commission: number;
  label: string; done: boolean;
}>;

export type EditorColumn = {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "percent" | "date" | "time" | "select";
  options?: string[];
  placeholder?: string;
  /** CSS width, e.g. "96px" — keeps short columns short. */
  width?: string;
};

export type TableSpec = {
  key: string;
  title: string;
  /** One line that says what this table is for. */
  hint?: string;
  addLabel: string;
  columns: EditorColumn[];
  /** Column whose values are summed in the footer. */
  totalColumn?: string;
  /** Flat `extra` keys written from the rows on save. */
  derive?: (rows: EditorRow[]) => Record<string, string | number>;
  /** Rows that a new record starts with (e.g. one empty traveller). */
  seed?: EditorRow[];
};

export type ChecklistSpec = {
  key: string;
  title: string;
  hint?: string;
  items: string[];
  derive?: (rows: EditorRow[]) => Record<string, string | number>;
};

export type EditorSpec = {
  tables?: TableSpec[];
  checklists?: ChecklistSpec[];
};

const money = (n: number) => Math.round(n * 100) / 100;

const sum = (rows: EditorRow[], key: string) =>
  money(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0));

const nonEmpty = (rows: EditorRow[], key: string) =>
  rows.filter((row) => String(row[key] ?? "").trim().length > 0);

/* ------------------------------------------------------------------ *
 * Shared row shapes
 * ------------------------------------------------------------------ */

const travellerColumns: EditorColumn[] = [
  { key: "name", label: "Traveller name", type: "text", placeholder: "As on passport" },
  {
    key: "type",
    label: "Type",
    type: "select",
    options: ["Adult", "Child", "Infant"],
    width: "104px",
  },
  { key: "dob", label: "Date of birth", type: "date", width: "148px" },
  { key: "passport", label: "Passport no.", type: "text", width: "132px" },
];

const travellerTable = (key: string, title: string, addLabel: string): TableSpec => ({
  key,
  title,
  hint: "Names exactly as printed on the passport — this list becomes the manifest and the visa paperwork.",
  addLabel,
  columns: travellerColumns,
  derive: (rows) => {
    const people = nonEmpty(rows, "name");
    const adults = people.filter((row) => (row.type || "Adult") !== "Child" && row.type !== "Infant").length;
    return {
      pax: people.length,
      adults,
      children: people.length - adults,
    };
  },
  seed: [{ name: "", type: "Adult", dob: "", passport: "" }],
});

/* ------------------------------------------------------------------ *
 * The specs
 * ------------------------------------------------------------------ */

export const editorSpecs: Record<string, EditorSpec> = {
  leads: {
    tables: [travellerTable("travellers", "Who is travelling", "Add traveller")],
  },

  customers: {
    tables: [
      {
        key: "contacts",
        title: "People at this customer",
        hint: "The decision maker, the booker, the person who pays — keep them with the account.",
        addLabel: "Add contact",
        columns: [
          { key: "name", label: "Name", type: "text" },
          { key: "role", label: "Role", type: "text", width: "150px", placeholder: "Director" },
          { key: "phone", label: "Phone", type: "text", width: "148px" },
          { key: "email", label: "Email", type: "text" },
        ],
        seed: [{ name: "", role: "", phone: "", email: "" }],
      },
    ],
    checklists: [
      {
        key: "kyc",
        title: "KYC & credit documents",
        hint: "Tick what you already hold. An account without KYC should not get credit terms.",
        items: [
          "Photo ID",
          "Address proof",
          "Passport copy",
          "PAN / tax number",
          "GST / VAT certificate",
          "Signed credit terms",
        ],
      },
    ],
  },

  quotations: {
    checklists: [
      {
        key: "inclusions",
        title: "Inclusions ticked off",
        hint: "The quote is only as clear as its inclusions. Anything unticked is not in the price.",
        items: [
          "Return flights",
          "Hotel with breakfast",
          "Airport transfers",
          "Sightseeing with guide",
          "Travel insurance",
          "Visa assistance",
          "GST / service fee",
        ],
      },
    ],
  },

  bookings: {
    tables: [travellerTable("travellers", "Travellers on this booking", "Add traveller")],
    checklists: [
      {
        key: "preDeparture",
        title: "Before departure",
        hint: "The same list every trip needs. Tick as you go — nothing should be open on departure day.",
        items: [
          "Tickets issued",
          "Hotel voucher received",
          "Transfers assigned",
          "Visa approved",
          "Travel insurance issued",
          "Balance payment received",
          "Final itinerary sent to customer",
        ],
      },
    ],
  },

  flights: {
    tables: [
      {
        key: "sectors",
        title: "Flight sectors",
        hint: "One row per leg (outbound, return, connection). The first row sets the departure date and sector on the list.",
        addLabel: "Add sector",
        columns: [
          { key: "from", label: "From", type: "text", width: "92px", placeholder: "BOM" },
          { key: "to", label: "To", type: "text", width: "92px", placeholder: "DXB" },
          { key: "date", label: "Date", type: "date", width: "148px" },
          { key: "depart", label: "Departs", type: "time", width: "104px" },
          { key: "arrive", label: "Arrives", type: "time", width: "104px" },
          { key: "flightNo", label: "Flight no.", type: "text", width: "112px" },
          { key: "cabin", label: "Cabin", type: "select", options: ["Economy", "Premium economy", "Business", "First"], width: "132px" },
        ],
        derive: (rows) => {
          const legs = nonEmpty(rows, "from");
          if (legs.length === 0) return {};
          const first = legs[0]!;
          const last = legs[legs.length - 1]!;
          return {
            sector: `${first.from} → ${last.to}`,
            ...(first.date ? { departure: String(first.date) } : {}),
            ...(first.flightNo ? { flightNo: String(first.flightNo) } : {}),
            ...(first.cabin ? { cabin: String(first.cabin) } : {}),
          };
        },
        seed: [{ from: "", to: "", date: "", depart: "", arrive: "", flightNo: "", cabin: "Economy" }],
      },
    ],
  },

  hotels: {
    tables: [
      {
        key: "rooms",
        title: "Rooms held",
        hint: "One row per room type. Nights and room counts are summed into the stay summary.",
        addLabel: "Add room type",
        columns: [
          { key: "roomType", label: "Room type", type: "text", placeholder: "Deluxe sea view" },
          { key: "count", label: "Rooms", type: "number", width: "88px" },
          { key: "nights", label: "Nights", type: "number", width: "88px" },
          { key: "rate", label: "Rate / night", type: "money", width: "128px" },
          { key: "meal", label: "Meal plan", type: "select", options: ["Room only", "Breakfast", "Half board", "Full board", "All inclusive"], width: "140px" },
        ],
        totalColumn: "rate",
        derive: (rows) => {
          const typed = nonEmpty(rows, "roomType");
          if (typed.length === 0) return {};
          const rooms = typed.reduce((total, row) => total + (Number(row.count) || 0), 0);
          const nights = typed.reduce((max, row) => Math.max(max, Number(row.nights) || 0), 0);
          const rate = typed.reduce(
            (total, row) => total + (Number(row.count) || 0) * (Number(row.nights) || 0) * (Number(row.rate) || 0),
            0,
          );
          return {
            rooms,
            nights,
            roomType: String(typed[0]!.roomType),
            ...(rate > 0 ? { roomsValue: money(rate) } : {}),
          };
        },
        seed: [{ roomType: "Deluxe", count: 1, nights: 0, rate: 0, meal: "Breakfast" }],
      },
    ],
  },

  transfers: {
    tables: [
      {
        key: "legs",
        title: "Transfers in this file",
        hint: "Pickup and drop with a time. The driver needs a time, not just a date.",
        addLabel: "Add transfer",
        columns: [
          { key: "date", label: "Date", type: "date", width: "148px" },
          { key: "time", label: "Time", type: "time", width: "100px" },
          { key: "from", label: "From", type: "text", placeholder: "Airport T2" },
          { key: "to", label: "To", type: "text", placeholder: "Nusa Dua resort" },
          { key: "vehicle", label: "Vehicle", type: "select", options: ["Sedan", "SUV", "Van", "Coach", "Luxury"], width: "112px" },
          { key: "driver", label: "Driver", type: "text", width: "132px" },
          { key: "flight", label: "Flight no.", type: "text", width: "112px" },
        ],
        derive: (rows) => {
          const legs = nonEmpty(rows, "from");
          if (legs.length === 0) return {};
          return {
            transferCount: legs.length,
            ...(legs[0]!.date ? { date: String(legs[0]!.date) } : {}),
          };
        },
        seed: [{ date: "", time: "", from: "", to: "", vehicle: "Sedan", driver: "", flight: "" }],
      },
    ],
  },

  visa: {
    checklists: [
      {
        key: "documents",
        title: "Document checklist",
        hint: "Tick each document as it arrives. Applications stall on missing paperwork, not on the embassy.",
        items: [
          "Passport (6 months validity)",
          "Photographs (as per spec)",
          "Bank statement (3 months)",
          "Income tax return",
          "Cover letter",
          "Confirmed flight itinerary",
          "Hotel booking",
          "Travel insurance",
          "Appointment confirmation",
        ],
        derive: (rows) => ({
          docsPending: rows.filter((row) => !row.done).length,
        }),
      },
    ],
  },

  groups: {
    tables: [
      {
        key: "rooming",
        title: "Rooming list",
        hint: "How the group sleeps. The room count is written back to the group so the room block stays accurate.",
        addLabel: "Add room type",
        columns: [
          { key: "roomType", label: "Room type", type: "text", placeholder: "Twin sharing" },
          { key: "rooms", label: "Rooms", type: "number", width: "88px" },
          { key: "occupancy", label: "Pax / room", type: "number", width: "100px" },
          { key: "rate", label: "Rate", type: "money", width: "120px" },
        ],
        derive: (rows) => {
          const typed = nonEmpty(rows, "roomType");
          if (typed.length === 0) return {};
          return {
            roomBlocks: typed.reduce((total, row) => total + (Number(row.rooms) || 0), 0),
            confirmedPax: typed.reduce(
              (total, row) => total + (Number(row.rooms) || 0) * (Number(row.occupancy) || 0),
              0,
            ),
          };
        },
        seed: [{ roomType: "Twin sharing", rooms: 1, occupancy: 2, rate: 0 }],
      },
    ],
  },

  operations: {
    checklists: [
      {
        key: "departure",
        title: "Departure checklist",
        hint: "Every departure needs the same six checks. The ops board reads how many are still open.",
        items: [
          "Manifest verified",
          "Hotels reconfirmed",
          "Transfers and drivers assigned",
          "Tickets checked in",
          "Vouchers shared with guests",
          "On-trip contact briefed",
        ],
        derive: (rows) => ({
          openChecks: rows.filter((row) => !row.done).length,
        }),
      },
    ],
  },

  packages: {
    tables: [
      {
        key: "departures",
        title: "Fixed departures",
        hint: "Guaranteed dates you can actually sell. Seats are written back to the package total.",
        addLabel: "Add departure",
        columns: [
          { key: "date", label: "Departure", type: "date", width: "150px" },
          { key: "seats", label: "Seats", type: "number", width: "92px" },
          { key: "price", label: "Price / person", type: "money", width: "136px" },
          { key: "note", label: "Note", type: "text", placeholder: "Holi special" },
        ],
        derive: (rows) => {
          const typed = nonEmpty(rows, "date");
          if (typed.length === 0) return {};
          const seats = typed.reduce((total, row) => total + (Number(row.seats) || 0), 0);
          const next = typed
            .map((row) => String(row.date))
            .filter((date) => date >= new Date().toISOString().slice(0, 10))
            .sort()[0];
          return {
            seats,
            ...(next ? { nextDeparture: next } : {}),
          };
        },
        seed: [{ date: "", seats: 0, price: 0, note: "" }],
      },
    ],
    checklists: [
      {
        key: "inclusions",
        title: "Included in this package",
        hint: "What the customer gets for the price. Anything unticked must be sold separately.",
        items: [
          "Accommodation",
          "Daily breakfast",
          "Airport transfers",
          "Sightseeing",
          "Guide",
          "Entry tickets",
          "Travel insurance",
          "GST",
        ],
      },
    ],
  },

  suppliers: {
    tables: [
      {
        key: "contracts",
        title: "Rate contracts",
        hint: "What you have agreed, until when, and what you earn on it. Expiry is the date that matters.",
        addLabel: "Add contract",
        columns: [
          { key: "service", label: "Service", type: "text", placeholder: "Deluxe room — peak" },
          { key: "validFrom", label: "From", type: "date", width: "146px" },
          { key: "validTo", label: "To", type: "date", width: "146px" },
          { key: "commission", label: "Commission %", type: "percent", width: "118px" },
          { key: "rate", label: "Rate", type: "money", width: "120px" },
        ],
        seed: [{ service: "", validFrom: "", validTo: "", commission: 0, rate: 0 }],
      },
    ],
  },
};

/** Editor spec for a module, if it has one. */
export const editorsFor = (moduleId: string): EditorSpec => editorSpecs[moduleId] ?? {};

/** Which modules hold a real traveller list. */
export const hasTravellers = (moduleId: string) =>
  moduleId === "bookings" || moduleId === "leads";
