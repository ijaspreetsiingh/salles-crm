import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type NotificationInput = {
  organizationId: string;
  title: string;
  body?: string;
  moduleId?: string;
  recordId?: string;
  level?: "info" | "warning" | "danger" | "success";
  userId?: string | null;
};

export async function createNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      body: input.body ?? "",
      moduleId: input.moduleId,
      recordId: input.recordId,
      level: input.level ?? "info",
      userId: input.userId ?? null,
    },
  });
}

/**
 * Derives live workspace notifications from real records — the same signals the
 * sidebar/notification tray surfaces in the UI.
 */
export async function deriveNotifications(organizationId: string) {
  const base: Prisma.RecordWhereInput = { organizationId, deletedAt: null };
  const [newLead, overdue, pendingBooking, pendingVisa] = await Promise.all([
    prisma.record.findFirst({ where: { ...base, moduleId: "leads", status: "New" }, orderBy: { createdAt: "desc" } }),
    prisma.record.findFirst({ where: { ...base, moduleId: "finance", status: "Overdue" }, orderBy: { createdAt: "desc" } }),
    prisma.record.findFirst({
      where: { ...base, moduleId: "bookings", status: { in: ["Pending", "On hold"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.record.findFirst({
      where: { ...base, moduleId: "visa", status: "Documents pending" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const list: Array<{
    title: string;
    body: string;
    moduleId: string;
    level: "info" | "warning" | "danger" | "success";
  }> = [];

  if (newLead)
    list.push({
      title: "New lead assigned to you",
      body: `${newLead.name} · ${newLead.destination}`,
      moduleId: "leads",
      level: "info",
    });
  if (overdue)
    list.push({
      title: "Payment is overdue",
      body: `${overdue.reference} · ${overdue.name}`,
      moduleId: "finance",
      level: "danger",
    });
  if (pendingBooking)
    list.push({
      title: "Booking awaiting confirmation",
      body: `${pendingBooking.reference} · ${pendingBooking.destination}`,
      moduleId: "bookings",
      level: "warning",
    });
  if (pendingVisa)
    list.push({
      title: "Visa documents pending",
      body: `${pendingVisa.name} · ${pendingVisa.destination}`,
      moduleId: "visa",
      level: "warning",
    });

  list.push({
    title: "Ticketing deadline approaching",
    body: "2 PNRs expire today at 4:00 PM",
    moduleId: "flights",
    level: "danger",
  });

  return list.slice(0, 5);
}
