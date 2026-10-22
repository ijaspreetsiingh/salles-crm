import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { MODULE_MAP } from "../domain/modules";
import { applyBranchScope } from "../services/records";

const router = Router();
router.use(requireAuth);

/** Global search across records, tasks, conversations and teammates. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) return ok(res, { query: q ?? "", groups: [] });

    const organizationId = req.auth!.organizationId;
    const contains = { contains: q } as const;

    const allowedModules =
      req.auth!.permissions.modules === "*" ? null : req.auth!.permissions.modules;
    const recordWhere = applyBranchScope(
      {
        organizationId,
        deletedAt: null,
        OR: [
          { name: contains },
          { reference: contains },
          { destination: contains },
          { email: contains },
          { phone: contains },
        ],
      },
      req.auth!,
    );
    if (allowedModules) recordWhere.moduleId = { in: allowedModules };

    const [records, tasks, conversations, members] = await Promise.all([
      prisma.record.findMany({
        where: recordWhere,
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.task.findMany({
        where: { organizationId, OR: [{ title: contains }, { ownerName: contains }] },
        take: 10,
      }),
      prisma.conversation.findMany({
        where: {
          organizationId,
          OR: [{ contactName: contains }, { contactEmail: contains }, { subject: contains }],
        },
        take: 10,
      }),
      prisma.membership.findMany({
        where: { organizationId, user: { OR: [{ name: contains }, { email: contains }] } },
        include: { user: true },
        take: 10,
      }),
    ]);

    const groups = [
      {
        group: "Records",
        items: records.map((record) => ({
          id: record.id,
          title: record.name,
          subtitle: `${MODULE_MAP[record.moduleId]?.name ?? record.moduleId} · ${record.reference}`,
          moduleId: record.moduleId,
          status: record.status,
        })),
      },
      {
        group: "Tasks",
        items: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          subtitle: `${task.type} · ${task.date}`,
          moduleId: "operations",
        })),
      },
      {
        group: "Conversations",
        items: conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.contactName,
          subtitle: conversation.subject || conversation.channel,
          moduleId: "inbox",
        })),
      },
      {
        group: "Team",
        items: members.map((membership) => ({
          id: membership.userId,
          title: membership.user.name,
          subtitle: membership.user.email,
          moduleId: "settings",
        })),
      },
    ].filter((group) => group.items.length > 0);

    return ok(res, { query: q, groups });
  }),
);

export default router;
