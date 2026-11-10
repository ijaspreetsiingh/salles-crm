import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { isBranchScoped } from "../domain/rbac";
import { applyBranchScope, toRecordDto } from "./records";

/* ==========================================================================
   "Today's work" — the list the home page and the daily email are built from.

   It lives in a service, not in the route, because two callers need the exact
   same answer: the person looking at the screen, and the digest that lands in
   their inbox at 8am. If the two ever disagreed, the email would be a guess.
   ========================================================================== */

/** How many rows of each kind one person's day holds. */
export const ATTENTION_TAKE = 100;

/**
 * Today's date in the organisation's own timezone. A Mumbai office starting
 * at 9am should not lose the day's work because the server is still on UTC.
 */
export const todayIn = (timeZone: string): string => {
  const read = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
};

export const isoDaysBefore = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export const isoDaysAfter = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The person whose day we are describing — enough to scope the queries. */
export type AttentionPerson = {
  name: string;
  roleKey: string;
  branchId: string | null;
  /** "*" for every module, otherwise the role's allow-list. */
  modules: "*" | string[];
};

export type AttentionTaskDto = {
  id: string;
  title: string;
  type: string;
  owner: string;
  date: string;
  priority: string;
  done: boolean;
  relatedModule: string | null;
  relatedRecordId: string | null;
};

export type AttentionDto = {
  scope: "mine" | "team";
  person: string;
  today: string;
  tasks: AttentionTaskDto[];
  leads: ReturnType<typeof toRecordDto>[];
  bookings: ReturnType<typeof toRecordDto>[];
  finance: ReturnType<typeof toRecordDto>[];
  visa: ReturnType<typeof toRecordDto>[];
  groups: ReturnType<typeof toRecordDto>[];
};

const attentionTask = (task: {
  id: string;
  title: string;
  type: string;
  ownerName: string;
  date: string;
  priority: string;
  done: boolean;
  relatedModule: string | null;
  relatedRecordId: string | null;
}): AttentionTaskDto => ({
  id: task.id,
  title: task.title,
  type: task.type,
  owner: task.ownerName,
  date: task.date,
  priority: task.priority,
  done: task.done,
  relatedModule: task.relatedModule,
  relatedRecordId: task.relatedRecordId,
});

/**
 * The work that needs a human today, narrowed to one person.
 *
 * `scope=mine` (the default) means records owned by me plus the unclaimed
 * queue; `scope=team` means the whole branch (for managers). Branch-scoped
 * roles are narrowed to their branch exactly like every other record read.
 */
export async function buildAttention(
  organizationId: string,
  person: AttentionPerson,
  scope: "mine" | "team" = "mine",
  /** Narrow the day to one office — the shell's branch switcher. */
  branch?: string,
): Promise<AttentionDto> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  const today = todayIn(organization?.timezone || "Asia/Kolkata");
  // An enquiry is only late once it has waited three full days.
  const leadCutoff = isoDaysBefore(today, 3);
  // A group earns a line on the list from a month before its departure date
  // until a fortnight after — the window where a record out of date is
  // actually expensive (rooms, manifest, tour manager).
  const groupFrom = isoDaysBefore(today, 30);
  const groupTo = isoDaysAfter(today, 14);

  const allowedModules = person.modules === "*" ? null : person.modules;
  const canView = (moduleId: string) => !allowedModules || allowedModules.includes(moduleId);

  // A branch-scoped role sees its own branch's work. Tasks carry no branch
  // column, so we resolve the branch's people first. An explicit office pick
  // replaces that — and `applyBranchScope` below still clamps a branch-scoped
  // role to its own office, so the pick can never widen what they see.
  const branchId = isBranchScoped(person.roleKey) ? person.branchId : null;
  const pickedBranch = branch && branch !== "All branches" ? branch : null;
  const pickedBranchId = pickedBranch
    ? ((
        await prisma.branch.findFirst({
          where: { organizationId, name: pickedBranch },
          select: { id: true },
        })
      )?.id ?? null)
    : null;
  const peopleBranchId = pickedBranchId ?? branchId;
  const branchNames = peopleBranchId
    ? (
        await prisma.membership.findMany({
          where: { organizationId, branchId: peopleBranchId, active: true },
          include: { user: { select: { name: true } } },
        })
      ).map((member) => member.user.name)
    : null;

  const taskWhere: Prisma.TaskWhereInput = {
    organizationId,
    done: false,
    date: { lte: today },
  };
  if (scope === "mine") taskWhere.ownerName = person.name;
  else if (branchNames) taskWhere.ownerName = { in: branchNames };

  const auth = { roleKey: person.roleKey, branchId: person.branchId };

  const recordsFor = async (moduleId: string, extra: Prisma.RecordWhereInput) => {
    if (!canView(moduleId)) return [];
    const where: Prisma.RecordWhereInput = {
      organizationId,
      moduleId,
      deletedAt: null,
      ...extra,
    };
    applyBranchScope(where, auth, pickedBranch ?? undefined);
    if (scope === "mine") {
      // The unclaimed queue belongs to whoever picks it up first.
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: [{ ownerName: person.name }, { ownerName: "" }] },
      ];
    }
    return prisma.record.findMany({
      where,
      orderBy: { date: "asc" },
      take: ATTENTION_TAKE,
    });
  };

  const [tasks, leads, bookings, finance, visa, groups] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      orderBy: { date: "asc" },
      take: ATTENTION_TAKE,
    }),
    recordsFor("leads", { status: "New", date: { lte: leadCutoff } }),
    recordsFor("bookings", { status: { in: ["Pending", "On hold"] } }),
    recordsFor("finance", { status: "Overdue" }),
    recordsFor("visa", { status: "Documents pending" }),
    recordsFor("groups", {
      status: { notIn: ["Completed", "Cancelled", "Departed"] },
      date: { gte: groupFrom, lte: groupTo },
    }),
  ]);

  return {
    scope,
    person: person.name,
    today,
    tasks: tasks.map(attentionTask),
    leads: leads.map(toRecordDto),
    bookings: bookings.map(toRecordDto),
    finance: finance.map(toRecordDto),
    visa: visa.map(toRecordDto),
    groups: groups.map(toRecordDto),
  };
}
