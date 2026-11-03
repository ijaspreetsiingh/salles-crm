/**
 * Module statuses — one source of truth.
 *
 * The API owns the workflow for every module (it validates every write
 * against its own list). The workspace therefore loads that list once on
 * sign-in and paints the UI with it, instead of keeping a second, drifting
 * copy in the frontend.
 *
 * `applyModuleStatuses` patches the schema objects in place so every existing
 * caller of `getSchema` keeps working without another round of plumbing.
 */
import { schemas } from "./schema";

/** The API module shape we care about here. */
export type ModuleStatusSource = { id: string; statuses?: string[] | undefined };

/** Statuses the API reported, keyed by module id. */
const fromApi: Record<string, string[]> = {};

const clean = (list: string[]): string[] =>
  Array.from(new Set(list.map((s) => String(s).trim()).filter(Boolean)));

/**
 * Adopts the API's status lists. Called once after the workspace loads; a
 * later call (reload, org switch) simply replaces them.
 */
export function applyModuleStatuses(modules: ModuleStatusSource[]): void {
  for (const module of modules) {
    if (!module?.id || !Array.isArray(module.statuses)) continue;
    const statuses = clean(module.statuses);
    if (statuses.length === 0) continue;
    fromApi[module.id] = statuses;
    const schema = schemas[module.id];
    if (schema) schema.statuses = statuses;
  }
}

/** What the API said, or undefined when this module was never reported. */
export const apiStatusesFor = (moduleId: string): string[] | undefined => fromApi[moduleId];

/**
 * A status the module does not declare. Records seeded before a workflow
 * change (or imported from a spreadsheet) can carry one; it is still shown,
 * appended last, so nothing silently disappears from a filter.
 */
export function reconcileStatuses(declared: string[], seen: string[]): string[] {
  const base = clean(declared);
  const extra = clean(seen).filter((s) => !base.includes(s));
  return [...base, ...extra];
}
