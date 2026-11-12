import { prisma } from "../lib/prisma";
import { parseJson, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { logger } from "../lib/logger";

/**
 * Recycle-bin auto-purge.
 *
 * Deletes in this product are soft — a trashed record stays until someone
 * restores it or empties the bin. Without a purge policy the bin grows
 * forever: old cancelled bookings, deleted leads, removed invoices — all
 * still taking space and still showing up in searches that don't filter
 * `deletedAt: null` carefully enough.
 *
 * Auto-purge puts a time limit on it. When `purgeAfterDays` is set (default
 * 30), any record that has been in the bin longer than that is permanently
 * deleted by the scheduler. Zero means "never purge automatically".
 *
 * Purge respects module permissions: a record is only purged if this
 * organization's scheduler process has delete rights for that module — the
 * scheduler never purges what a company admin couldn't delete by hand.
 */

export type PurgeSettings = {
  /** Days after soft-delete before permanent removal. 0 = never. */
  purgeAfterDays: number;
};

const DEFAULT_PURGE_AFTER_DAYS = 30;

/** Read the purge setting from org settings JSON. */
export function readPurgeSettings(settingsJson: string | null | undefined): PurgeSettings {
  try {
    const settings = parseJson<{ purgeAfterDays?: number }>(settingsJson ?? "{}", {});
    const days = settings.purgeAfterDays;
    if (typeof days === "number" && Number.isFinite(days) && days >= 0) {
      return { purgeAfterDays: days };
    }
  } catch {
    /* fall through to default */
  }
  return { purgeAfterDays: DEFAULT_PURGE_AFTER_DAYS };
}

/** Permanently delete trashed records older than the purge window. */
export async function purgeExpiredTrash(organizationId: string): Promise<number> {
  const settings = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const { purgeAfterDays } = readPurgeSettings(settings?.settings ?? null);
  if (purgeAfterDays === 0) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - purgeAfterDays);

  const purged = await prisma.record.deleteMany({
    where: {
      organizationId,
      deletedAt: { not: null, lt: cutoff },
    },
  });

  if (purged.count > 0) {
    logger.info(
      { organizationId, count: purged.count, cutoff: cutoff.toISOString() },
      "Auto-purged expired records from recycle bin",
    );
    await recordAudit({
      organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `Auto-purged ${purged.count} expired record${purged.count === 1 ? "" : "s"} from recycle bin`,
    });
  }

  return purged.count;
}

let scheduler: ReturnType<typeof setInterval> | undefined;

/** Runs the purge check once an hour on the elected scheduler process. */
export function startTrashPurgeScheduler(): void {
  if (scheduler) return;
  const run = async () => {
    try {
      // Find every organization that has trash older than its cutoff.
      const orgs = await prisma.organization.findMany({
        select: { id: true, settings: true },
      });
      for (const { id, settings } of orgs) {
        const { purgeAfterDays } = readPurgeSettings(settings);
        if (purgeAfterDays === 0) continue;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - purgeAfterDays);
        const hasOldTrash = await prisma.record.findFirst({
          where: {
            organizationId: id,
            deletedAt: { not: null, lt: cutoff },
          },
          select: { id: true },
        });
        if (!hasOldTrash) continue;
        await purgeExpiredTrash(id);
      }
    } catch (error) {
      logger.warn({ err: error }, "Trash purge scheduler failed; it will retry on the next poll");
    }
  };
  void run();
  scheduler = setInterval(() => void run(), 60 * 60 * 1000);
  scheduler.unref?.();
}

export function stopTrashPurgeScheduler(): void {
  if (scheduler) clearInterval(scheduler);
  scheduler = undefined;
}
