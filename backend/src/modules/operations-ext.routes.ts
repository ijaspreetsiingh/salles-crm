/**
 * Trip Operations — manifests, incidents, departure deadlines.
 *
 * Routes:
 *   GET    /operations-ext/manifests/:tripId     — passenger manifest for a trip
 *   POST   /operations-ext/manifests/:tripId/pdf — generate manifest PDF
 *   GET    /operations-ext/incidents             — incidents list
 *   POST   /operations-ext/incidents             — log an incident
 *   PATCH  /operations-ext/incidents/:id         — update incident (resolution)
 *   GET    /operations-ext/deadlines             — upcoming deadlines across trips
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { cuid, parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { eventCreated, eventStatusChange } from "../services/timeline";
import { pickArrivals, tripReturnDate } from "../services/trip-dates";

const router = Router();
router.use(requireAuth);

// ─── Manifests ────────────────────────────────────────────────────────────────

/**
 * Builds the manifest from group members linked to this trip.
 * A trip record links to group members via its extra.groupId or via
 * RecordRelation edges (kind = "visa_for", "flight_for", etc.).
 */
router.get(
  "/manifests/:tripId",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const trip = await prisma.record.findFirst({
      where: { id: req.params.tripId, organizationId, moduleId: "operations", deletedAt: null },
    });
    if (!trip) throw new NotFoundError("Trip");

    const extra = parseJson<Record<string, unknown>>(trip.extra as string, {});
    const groupId = extra["groupId"] as string | undefined;

    // Get passengers from group members if linked, otherwise from relation edges.
    let passengers: Array<Record<string, unknown>> = [];
    if (groupId) {
      const members = await prisma.groupMember.findMany({
        where: { organizationId, groupRecordId: groupId },
        orderBy: { name: "asc" },
      });
      passengers = members.map((m) => ({
        name: m.name,
        passport: m.passport ?? "",
        nationality: m.nationality ?? "",
        dob: m.dateOfBirth ?? "",
        email: m.email ?? "",
        phone: m.phone ?? "",
        roomType: m.roomType ?? "",
        mealPreference: m.dietary ?? "",
      }));
    }

    // Also pull any manually added passengers from trip extra.
    const manualPax = Array.isArray(extra["passengers"]) ? extra["passengers"] as Array<Record<string, unknown>> : [];
    passengers = [...passengers, ...manualPax];

    return ok(res, {
      tripId: trip.id,
      tripReference: trip.reference,
      tripName: trip.name,
      destination: trip.destination,
      departureDate: trip.date,
      passengerCount: passengers.length,
      passengers,
    });
  }),
);

/** Generates a simple HTML manifest for printing (PDF conversion in browser). */
router.get(
  "/manifests/:tripId/print",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const trip = await prisma.record.findFirst({
      where: { id: req.params.tripId, organizationId, moduleId: "operations", deletedAt: null },
    });
    if (!trip) throw new NotFoundError("Trip");

    const extra = parseJson<Record<string, unknown>>(trip.extra as string, {});
    const groupId = extra["groupId"] as string | undefined;

    let passengers: Array<Record<string, unknown>> = [];
    if (groupId) {
      const members = await prisma.groupMember.findMany({ where: { organizationId, groupRecordId: groupId }, orderBy: { name: "asc" } });
      passengers = members.map((m) => ({ name: m.name, passport: m.passport ?? "", nationality: m.nationality ?? "", dob: m.dateOfBirth ?? "" }));
    }
    const manualPax = Array.isArray(extra["passengers"]) ? extra["passengers"] as Array<Record<string, unknown>> : [];
    passengers = [...passengers, ...manualPax];

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Manifest — ${trip.reference}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5}@media print{button{display:none}}</style></head>
<body>
<h1>${org?.name ?? "Travel Agency"} — Passenger Manifest</h1>
<p><strong>Trip:</strong> ${trip.reference} · ${trip.name}<br>
<strong>Destination:</strong> ${trip.destination}<br>
<strong>Departure:</strong> ${trip.date}<br>
<strong>Passengers:</strong> ${passengers.length}</p>
<table><thead><tr><th>#</th><th>Name</th><th>Passport No</th><th>Nationality</th><th>Date of Birth</th></tr></thead>
<tbody>${passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p["name"] ?? ""}</td><td>${p["passport"] ?? ""}</td><td>${p["nationality"] ?? ""}</td><td>${p["dob"] ?? ""}</td></tr>`).join("")}</tbody>
</table>
<p style="margin-top:20px;font-size:10px;color:#666">Generated ${new Date().toLocaleString("en-IN")} · ${org?.name ?? ""}</p>
<script>window.onload=()=>window.print()</script>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }),
);

// ─── Incidents ────────────────────────────────────────────────────────────────

const incidentSchema = z.object({
  tripId: z.string().optional(),
  tripReference: z.string().max(40).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  category: z.enum(["Medical", "Safety", "Service failure", "Weather", "Delay", "Complaint", "Other"]).default("Other"),
  affectedPassengers: z.array(z.string().max(120)).max(50).default([]),
  reportedBy: z.string().max(120).optional(),
});

router.get(
  "/incidents",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    const take = Math.min(Number(req.query.take ?? 50), 200);

    const rows = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "operations",
        tab: "Incidents",
        deletedAt: null,
        ...(severity ? { extra: { contains: severity } } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        reference: r.reference,
        title: r.name,
        description: r.notes,
        severity: extra["severity"] ?? "Medium",
        category: extra["category"] ?? "Other",
        tripId: extra["tripId"] ?? null,
        tripReference: extra["tripReference"] ?? null,
        affectedPassengers: extra["affectedPassengers"] ?? [],
        reportedBy: extra["reportedBy"] ?? null,
        status: r.status,
        resolution: extra["resolution"] ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    }));
  }),
);

router.post(
  "/incidents",
  requirePermission("create"),
  validate(incidentSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof incidentSchema>;

    const reference = `INC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "operations",
        tab: "Incidents",
        reference,
        name: body.title,
        notes: body.description,
        status: "Open",
        extra: JSON.stringify({
          severity: body.severity,
          category: body.category,
          tripId: body.tripId ?? null,
          tripReference: body.tripReference ?? null,
          affectedPassengers: body.affectedPassengers,
          reportedBy: body.reportedBy ?? actorName,
          resolution: null,
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, reference, "Incident", userId, actorName);

    // High/Critical incidents notify the whole team.
    if (body.severity === "High" || body.severity === "Critical") {
      await prisma.notification.create({
        data: {
          organizationId,
          title: `${body.severity} incident: ${body.title}`,
          body: body.description.slice(0, 160),
          moduleId: "operations",
          recordId: record.id,
          level: body.severity === "Critical" ? "error" : "warning",
        },
      });
    }

    await recordAudit({ organizationId, action: "Created", moduleId: "operations", recordId: record.id, label: `${body.severity} incident logged: ${body.title}`, req });
    return created(res, { id: record.id, reference });
  }),
);

const incidentUpdateSchema = z.object({
  status: z.enum(["Open", "In progress", "Resolved", "Closed"]).optional(),
  resolution: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

router.patch(
  "/incidents/:id",
  requirePermission("edit"),
  validate(incidentUpdateSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof incidentUpdateSchema>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "operations", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Incident");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    const prevStatus = existing.status;

    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        extra: JSON.stringify({ ...extra, ...(body.resolution !== undefined ? { resolution: body.resolution } : {}) }),
        updatedById: userId,
      },
    });

    if (body.status && body.status !== prevStatus) {
      void eventStatusChange(organizationId, existing.id, prevStatus, body.status, userId, actorName);
    }

    return ok(res, { updated: true });
  }),
);

// ─── Vouchers — generic service voucher for any module ────────────────────────

/**
 * Generates a printable voucher for any booking-type record (hotel, flight, transfer, package).
 * Reuses the voucher PDF service with the record's module context.
 */
router.get(
  "/vouchers/:recordId",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const record = await prisma.record.findFirst({
      where: { id: req.params.recordId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Record");

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, address: true, supportEmail: true, phone: true } });
    const extra = parseJson<Record<string, unknown>>(record.extra as string, {});

    // Return a printable HTML voucher (browser's print → PDF)
    const moduleLabel = record.moduleId.charAt(0).toUpperCase() + record.moduleId.slice(1);
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Voucher — ${record.reference}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;max-width:600px}h1{font-size:16px;color:#2f5c50}h2{font-size:13px}.box{border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0;background:#f9fafb}@media print{button{display:none}}</style></head>
<body>
<h1>${org?.name ?? "Travel Agency"}</h1>
<h2>${moduleLabel} Voucher — ${record.reference}</h2>
<div class="box">
<p><strong>Customer:</strong> ${record.name}</p>
<p><strong>Destination:</strong> ${record.destination || "—"}</p>
<p><strong>Date:</strong> ${record.date || "—"}</p>
<p><strong>Status:</strong> ${record.status}</p>
${record.amount ? `<p><strong>Amount:</strong> ₹${record.amount.toLocaleString("en-IN")} ${record.currency || "INR"}</p>` : ""}
${record.email ? `<p><strong>Email:</strong> ${record.email}</p>` : ""}
${record.phone ? `<p><strong>Phone:</strong> ${record.phone}</p>` : ""}
</div>
${record.notes ? `<div class="box"><strong>Notes:</strong><br>${record.notes}</div>` : ""}
${Object.keys(extra).length > 0 ? `<div class="box"><strong>Details:</strong><br><pre style="font-size:11px;white-space:pre-wrap">${JSON.stringify(extra, null, 2)}</pre></div>` : ""}
<p style="margin-top:20px;font-size:10px;color:#666">Generated ${new Date().toLocaleString("en-IN")} · ${org?.name ?? ""}</p>
<button onclick="window.print()" style="margin-top:10px;padding:8px 16px;background:#2f5c50;color:#fff;border:none;border-radius:4px;cursor:pointer">Print / Save as PDF</button>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }),
);

// ─── Daily Operations Dashboard ───────────────────────────────────────────────

/**
 * Real-time operations dashboard: today's departures, arrivals, active trips,
 * pending tasks, incidents, and PNR deadlines. Everything an ops manager needs
 * on one screen to run the day.
 */
router.get(
  "/daily-dashboard",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const [departuresToday, tripCandidates, activeTrips, openIncidents, pnrDeadlines, openTasks] = await Promise.all([
      // Departures today
      prisma.record.findMany({
        where: { organizationId, moduleId: "operations", tab: "Departures", date: today, status: { in: ["Upcoming", "Confirmed"] }, deletedAt: null },
        orderBy: { name: "asc" },
        take: 50,
        select: { id: true, reference: true, name: true, destination: true, date: true, status: true },
      }),
      /*
       * Arrivals today.
       *
       * A trip ends on the return date recorded on the trip itself. The old
       * query searched the whole `extra` blob for today's date as text, which
       * matched any field holding that date and missed every trip whose date
       * was written differently — the list showed trips that were not arriving
       * and hid trips that were.
       *
       * A trip has no arrival column, so the date still lives in `extra`; but
       * it is parsed from named keys and compared here rather than guessed at
       * in SQL. Bounded by the statuses that can be ending, and ordered newest
       * first so a busy workspace keeps the recent trips.
       */
      prisma.record.findMany({
        where: {
          organizationId,
          moduleId: "operations",
          tab: "Departures",
          deletedAt: null,
          status: { in: ["Upcoming", "In progress", "Delayed", "Completed"] },
        },
        orderBy: [{ date: "desc" }, { name: "asc" }],
        take: 1000,
        select: { id: true, reference: true, name: true, destination: true, date: true, status: true, extra: true },
      }),
      // Active trips (in progress)
      prisma.record.findMany({
        where: { organizationId, moduleId: "operations", status: "In progress", deletedAt: null },
        orderBy: { name: "asc" },
        take: 50,
        select: { id: true, reference: true, name: true, destination: true, date: true, status: true },
      }),
      // Open incidents
      prisma.record.findMany({
        where: { organizationId, moduleId: "operations", tab: "Incidents", status: { in: ["Open", "In progress"] }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, reference: true, name: true, status: true, notes: true },
      }),
      // PNR deadlines within 48 hours
      prisma.flightPNR.findMany({
        where: { organizationId, status: "Active", ticketDeadline: { lte: new Date(Date.now() + 2 * 86400000), gte: new Date() } },
        orderBy: { ticketDeadline: "asc" },
        take: 20,
        select: { id: true, pnr: true, airline: true, ticketDeadline: true, recordId: true },
      }),
      // Open tasks assigned to operations team
      prisma.task.findMany({
        where: { organizationId, done: false, type: { in: ["Trip operations", "Supplier follow-up", "Departure"] } },
        orderBy: { date: "asc" },
        take: 20,
        select: { id: true, title: true, ownerName: true, date: true, priority: true },
      }),
    ]);

    const arrivals = pickArrivals(tripCandidates, today);
    const arrivalsToday = arrivals.arriving.map((trip) => ({
      id: trip.id,
      reference: trip.reference,
      name: trip.name,
      destination: trip.destination,
      /** Departure day, kept beside the arrival day so the screen can say "3 of 8 nights". */
      date: trip.date,
      returnDate: tripReturnDate(trip.extra),
      status: trip.status,
    }));
    const arrivalsUndated = arrivals.undated.map((trip) => ({
      id: trip.id,
      reference: trip.reference,
      name: trip.name,
      destination: trip.destination,
      date: trip.date,
      status: trip.status,
    }));

    return ok(res, {
      date: today,
      summary: {
        departuresToday: departuresToday.length,
        arrivalsToday: arrivalsToday.length,
        /** Trips on the road whose return day nobody wrote down. */
        arrivalsUndated: arrivalsUndated.length,
        activeTrips: activeTrips.length,
        openIncidents: openIncidents.length,
        pnrDeadlines: pnrDeadlines.length,
        openTasks: openTasks.length,
      },
      departuresToday,
      arrivalsToday,
      arrivalsUndated,
      activeTrips,
      openIncidents: openIncidents.map((i) => ({
        id: i.id, reference: i.reference, title: i.name, status: i.status, description: (i.notes ?? "").slice(0, 100),
      })),
      pnrDeadlines: pnrDeadlines.map((p) => ({
        id: p.id, pnr: p.pnr, airline: p.airline,
        deadline: p.ticketDeadline?.toISOString().slice(0, 10) ?? "",
        recordId: p.recordId,
      })),
      openTasks: openTasks.map((t) => ({
        id: t.id, title: t.title, owner: t.ownerName, date: t.date, priority: t.priority,
      })),
    });
  }),
);

/**
 * Upcoming deadlines across all trips — ticketing deadlines, visa submission
 * dates, hotel block release dates. Sorted by days remaining.
 */
router.get(
  "/deadlines",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const daysAhead = Math.min(Number(req.query.days ?? 30), 90);
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const [pnrDeadlines, visaDeadlines, tripDeadlines] = await Promise.all([
      // PNR ticketing deadlines
      prisma.flightPNR.findMany({
        where: {
          organizationId,
          status: "Active",
          ticketDeadline: { lte: cutoff, gte: new Date() },
        },
        orderBy: { ticketDeadline: "asc" },
        take: 50,
        select: { id: true, pnr: true, airline: true, ticketDeadline: true, recordId: true },
      }),
      // Visa submission dates from records
      prisma.record.findMany({
        where: {
          organizationId,
          moduleId: "visa",
          status: { in: ["Documents pending", "Submitted"] },
          date: { lte: cutoff.toISOString().slice(0, 10), gte: new Date().toISOString().slice(0, 10) },
          deletedAt: null,
        },
        orderBy: { date: "asc" },
        take: 30,
        select: { id: true, reference: true, name: true, date: true, status: true },
      }),
      // Upcoming departures in operations
      prisma.record.findMany({
        where: {
          organizationId,
          moduleId: "operations",
          tab: "Departures",
          status: { in: ["Upcoming", "Confirmed"] },
          date: { lte: cutoff.toISOString().slice(0, 10), gte: new Date().toISOString().slice(0, 10) },
          deletedAt: null,
        },
        orderBy: { date: "asc" },
        take: 30,
        select: { id: true, reference: true, name: true, destination: true, date: true, status: true },
      }),
    ]);

    const now = new Date();
    const deadlines = [
      ...pnrDeadlines.map((p) => ({
        type: "ticketing" as const,
        id: p.id,
        label: `${p.pnr} ${p.airline}`,
        date: p.ticketDeadline?.toISOString().slice(0, 10) ?? "",
        daysLeft: Math.ceil(((p.ticketDeadline?.getTime() ?? 0) - now.getTime()) / 86400000),
        recordId: p.recordId ?? null,
        urgency: "High" as const,
      })),
      ...visaDeadlines.map((v) => ({
        type: "visa" as const,
        id: v.id,
        label: `${v.reference} ${v.name}`,
        date: v.date ?? "",
        daysLeft: Math.ceil((new Date(v.date ?? "").getTime() - now.getTime()) / 86400000),
        recordId: v.id,
        urgency: (v.status === "Documents pending" ? "High" : "Normal") as "High" | "Normal",
      })),
      ...tripDeadlines.map((t) => ({
        type: "departure" as const,
        id: t.id,
        label: `${t.reference} → ${t.destination}`,
        date: t.date ?? "",
        daysLeft: Math.ceil((new Date(t.date ?? "").getTime() - now.getTime()) / 86400000),
        recordId: t.id,
        urgency: "Normal" as const,
      })),
    ].sort((a, b) => a.daysLeft - b.daysLeft);

    return ok(res, { total: deadlines.length, deadlines });
  }),
);

export default router;
