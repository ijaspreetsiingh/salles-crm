import { describe, expect, it } from "vitest";
import { plain, plainModule, statusGuide } from "@/lib/crm/language";
import { buildJourney, journeyKind, relatedRecords } from "@/lib/crm/journey";
import { customerHealth, customerSegment, customerSignals } from "@/lib/crm/customer";
import type { RecordRow } from "@/lib/crm/catalog";

/* Plain language, the journey rail and the customer score are the three
   things a new user leans on. They must be honest and consistent. */

const row = (over: Partial<RecordRow> = {}): RecordRow => ({
  id: "R-1",
  name: "Aarav Sharma",
  detail: "",
  destination: "Bali, Indonesia",
  owner: "Sarah Wilson",
  branch: "Mumbai",
  date: "2026-03-01",
  amount: 100000,
  status: "Confirmed",
  email: "",
  phone: "",
  source: "Website",
  notes: "",
  ...over,
});

describe("Plain language", () => {
  it("renames the internal words", () => {
    expect(plain("Leads & enquiries")).toBe("Enquiries");
    expect(plain("Gross margin")).toBe("Gross margin");
    expect(plain("Receivables")).toBe("Money owed to you");
    expect(plain("Groups & MICE")).toBe("Groups & events");
    expect(plain("Hotels & stays")).toBe("Hotels");
  });

  it("leaves unknown words alone", () => {
    expect(plain("Something nobody has heard of")).toBe("Something nobody has heard of");
  });

  it("names a module in plain words", () => {
    expect(plainModule("bookings")).toBe("Trips");
    expect(plainModule("finance")).toBe("Money");
  });

  it("explains what every status means and what to do next", () => {
    const guide = statusGuide("Overdue");
    expect(guide.meaning.length).toBeGreaterThan(10);
    expect(guide.next.length).toBeGreaterThan(10);
  });

  it("still answers for a status it has never seen", () => {
    const guide = statusGuide("Something Odd");
    expect(guide.meaning).toContain("Something Odd");
  });
});

describe("The journey", () => {
  const booking = row({
    id: "BK-2411",
    name: "Aarav Sharma",
    detail: "Booking for Aarav Sharma · from lead LD-2411",
    status: "Confirmed",
  });
  const lead = row({ id: "LD-2411", name: "Aarav Sharma", detail: "2 travellers", status: "Won" });
  const quote = row({
    id: "QT-2411",
    name: "Holiday package — Bali, Indonesia",
    detail: "Quotation for Aarav Sharma · from lead LD-2411",
    status: "Accepted",
  });
  const invoice = row({
    id: "INV-2411",
    name: "Aarav Sharma",
    detail: "Invoice for booking BK-2411",
    status: "Partially paid",
    extra: { received: 60000 },
  });

  const all = {
    leads: [lead],
    quotations: [quote],
    bookings: [booking],
    finance: [invoice],
    visa: [],
    flights: [],
    hotels: [],
    transfers: [],
    operations: [],
    support: [],
  };

  it("knows which journey a record belongs to", () => {
    expect(journeyKind("bookings")).toBe("booking");
    expect(journeyKind("leads")).toBe("lead");
    expect(journeyKind("hotels")).toBe("generic");
  });

  it("links a booking to its enquiry, quote and invoice", () => {
    const related = relatedRecords(booking, all);
    expect(related["leads"]?.map((r) => r.id)).toContain("LD-2411");
    expect(related["quotations"]?.map((r) => r.id)).toContain("QT-2411");
    expect(related["finance"]?.map((r) => r.id)).toContain("INV-2411");
  });

  it("builds a journey where the real records fill the steps", () => {
    const journey = buildJourney(booking, "bookings", all);
    const enquiry = journey.find((s) => s.id === "enquiry");
    const quoteStep = journey.find((s) => s.id === "quotation");
    const invoiceStep = journey.find((s) => s.id === "invoice");
    expect(enquiry?.record?.id).toBe("LD-2411");
    expect(quoteStep?.record?.id).toBe("QT-2411");
    expect(invoiceStep?.record?.id).toBe("INV-2411");
  });

  it("shows how much of an invoice is paid", () => {
    const journey = buildJourney(booking, "bookings", all);
    const invoiceStep = journey.find((s) => s.id === "invoice");
    expect(invoiceStep?.detail).toBe("60% paid");
  });

  it("says plainly when a step has no record yet", () => {
    const journey = buildJourney(booking, "bookings", all);
    const visa = journey.find((s) => s.id === "visa");
    expect(visa?.record).toBeUndefined();
    expect(visa?.missing).toBe("No visa yet");
  });
});

describe("Customer truth", () => {
  const customer = row({ id: "CUS-1", name: "Aarav Sharma", status: "Active" });

  it("scores a customer who pays on time above one who does not", () => {
    const good = customerHealth(
      customerSignals(customer, {
        bookings: [row({ id: "BK-1", name: "Aarav Sharma" })],
        invoices: [row({ id: "INV-1", name: "Aarav Sharma", status: "Paid", amount: 500000 })],
        enquiries: [],
        tasks: [],
      }),
    );
    const bad = customerHealth(
      customerSignals(customer, {
        bookings: [],
        invoices: [row({ id: "INV-2", name: "Aarav Sharma", status: "Overdue", amount: 50000 })],
        enquiries: [],
        tasks: [],
      }),
    );
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.label).toBeTruthy();
    expect(good.reasons.length).toBeGreaterThan(0);
  });

  it("uses one rule for segments", () => {
    const signals = customerSignals(customer, {
      bookings: [],
      invoices: [row({ id: "INV-1", name: "Aarav Sharma", status: "Paid", amount: 900000 })],
      enquiries: [],
      tasks: [],
    });
    expect(customerSegment(signals)).toBe("Enterprise");
  });

  it("counts real money, not a guess", () => {
    const signals = customerSignals(customer, {
      bookings: [],
      invoices: [
        row({ id: "INV-1", name: "Aarav Sharma", status: "Paid", amount: 90000 }),
        row({ id: "INV-2", name: "Aarav Sharma", status: "Sent", amount: 10000 }),
      ],
      enquiries: [],
      tasks: [],
    });
    expect(signals.lifetimeValue).toBe(90000);
    expect(signals.outstanding).toBe(10000);
  });
});
