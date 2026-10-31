import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Copy,
  KeyRound,
  MailPlus,
  Search,
  ShieldCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import {
  createMember,
  fetchBranches,
  fetchMembers,
  ROLE_LABEL_BY_KEY,
  shareUnclaimedWork,
  updateMember,
  type HandoverSummary,
} from "@/lib/api/crm";
import { fetchSubscription } from "@/lib/api/modules";
import { useApiQuery } from "@/lib/api/hooks";
import { useCRM } from "@/lib/crm/store";
import { Avatar, Btn, Field, inputClass, Panel, Segmented, Sheet, StatTile } from "./ui";
import { Page, PageIdentity } from "./page";

/* ==========================================================================
   Your team.

   Five people can be managed from a settings table. Fifty cannot. A manager
   opening this page needs to answer three questions in one look: who is on
   the team, what can they see, and who is carrying too much. Every number
   here is counted from real records; nothing is estimated.
   ========================================================================== */

type Person = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  branch: string | null;
  branchId: string | null;
  active: boolean;
  lastLoginAt: string | null;
  openTasks: number;
  openEnquiries: number;
  activeTrips: number;
};

const ROLE_KEYS = Object.keys(ROLE_LABEL_BY_KEY);

const roleMeaning: Record<string, string> = {
  company_admin: "Sees every branch and manages the team, roles and billing.",
  branch_manager: "Sees their branch and runs the day-to-day work there.",
  sales: "Enquiries, customers and quotations.",
  operations: "Trips, suppliers, visa and departures.",
  finance: "Invoices, payments and money owed.",
  support: "Tickets, refunds and customer care.",
};

const workload = (person: Person) => person.openTasks + person.openEnquiries + person.activeTrips;

const lastSeen = (iso: string | null | undefined) => {
  if (!iso) return "Has not signed in yet";
  const days = differenceInCalendarDays(new Date(), parseISO(iso));
  if (Number.isNaN(days)) return "Signed in recently";
  if (days <= 0) return "Signed in today";
  if (days === 1) return "Signed in yesterday";
  if (days < 30) return `Signed in ${days} days ago`;
  return `Last signed in ${Math.round(days / 30)} months ago`;
};

const temporaryPassword = () =>
  `Td${Math.random().toString(36).slice(2, 8)}${Math.floor(10 + Math.random() * 89)}`;

export function Team() {
  const { status, settings, roleLabel } = useCRM();
  const canManage = roleLabel === "Company admin" && status === "ready";

  const {
    data: directory,
    loading,
    error,
    reload,
  } = useApiQuery(fetchMembers, [], status === "ready");
  const { data: subscription } = useApiQuery(fetchSubscription, [], canManage);
  const { data: branchDirectory } = useApiQuery(fetchBranches, [], status === "ready");

  const [query, setQuery] = useState("");
  const [role, setRole] = useState("Everyone");
  const [branch, setBranch] = useState("Everyone");
  const [view, setView] = useState<"Current team" | "Former too">("Current team");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<{
    name: string;
    email: string;
    password: string | null;
  } | null>(null);
  /** The person losing access, while their work is still looking for a home. */
  const [leaving, setLeaving] = useState<Person | null>(null);
  /** Membership id who takes the work; empty means back to the unclaimed queue. */
  const [handoverTo, setHandoverTo] = useState("");
  const [sharing, setSharing] = useState(false);

  /**
   * Signed out, the page still shows the demo team so the design never
   * collapses. Workload shows "—" rather than a made-up number.
   */
  const people = useMemo<Person[]>(() => {
    if (directory) {
      return directory.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        roleKey: member.roleKey,
        roleName: member.roleName,
        branch: member.branch,
        branchId: member.branchId,
        active: member.active,
        lastLoginAt: member.lastLoginAt ?? null,
        openTasks: member.openTasks ?? 0,
        openEnquiries: member.openEnquiries ?? 0,
        activeTrips: member.activeTrips ?? 0,
      }));
    }
    return settings.employees.map((employee) => ({
      id: `demo-${employee.name}`,
      name: employee.name,
      email: employee.email ?? "",
      roleKey: employee.roleKey ?? "sales",
      roleName: employee.role,
      branch: employee.branch || null,
      branchId: null,
      active: employee.active,
      lastLoginAt: null,
      openTasks: 0,
      openEnquiries: 0,
      activeTrips: 0,
    }));
  }, [directory, settings.employees]);

  /** Branch names for the filters, including branches nobody is posted to yet. */
  const branches = useMemo(() => {
    const names = new Set<string>(settings.branches);
    for (const person of people) if (person.branch) names.add(person.branch);
    for (const branch of branchDirectory ?? []) if (branch.active) names.add(branch.name);
    return Array.from(names).sort();
  }, [people, settings.branches, branchDirectory]);

  /** Branch ids for the invite form and the inline branch picker. */
  const branchOptions = useMemo(() => {
    if (branchDirectory) {
      return branchDirectory
        .filter((branch) => branch.active)
        .map((branch) => ({ id: branch.id, name: branch.name }));
    }
    const byId = new Map<string, string>();
    for (const person of people) {
      if (person.branchId && person.branch) byId.set(person.branchId, person.branch);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [branchDirectory, people]);

  const roles = useMemo(
    () => ["Everyone", ...Array.from(new Set(people.map((p) => p.roleName))).sort()],
    [people],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((person) => view === "Former too" || person.active)
      .filter((person) => role === "Everyone" || person.roleName === role)
      .filter((person) => branch === "Everyone" || person.branch === branch)
      .filter(
        (person) =>
          !q ||
          `${person.name} ${person.email} ${person.roleName} ${person.branch ?? ""}`
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return workload(b) - workload(a) || a.name.localeCompare(b.name);
      });
  }, [people, query, role, branch, view]);

  const activePeople = people.filter((person) => person.active);
  const carrying = activePeople.filter((person) => workload(person) > 0);
  const idle = activePeople.length - carrying.length;
  const seatLimit = subscription?.plan.limits["seats"] ?? subscription?.subscription.seats ?? null;
  const seatsLeft = seatLimit === null ? null : Math.max(0, seatLimit - activePeople.length);
  const seatsFull = seatsLeft === 0;

  const changeRole = async (person: Person, roleKey: string) => {
    try {
      await updateMember(person.id, { roleKey });
      toast.success(`${person.name} is now ${ROLE_LABEL_BY_KEY[roleKey] ?? roleKey}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not change the role"));
    }
  };

  const changeBranch = async (person: Person, branchId: string) => {
    try {
      await updateMember(person.id, { branchId: branchId || null });
      toast.success(`${person.name}'s branch updated`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not change the branch"));
    }
  };

  /**
   * Removing access asks one question first: who takes the unfinished work?
   * Leaving it unanswered would hide records behind a name that can no longer
   * sign in, so the server hands them to the unclaimed queue by default.
   */
  const removeAccess = (person: Person) => {
    setHandoverTo("");
    setLeaving(person);
  };

  const confirmRemoveAccess = async () => {
    if (!leaving) return;
    try {
      const result = await updateMember(leaving.id, {
        active: false,
        ...(handoverTo ? { reassignTo: handoverTo } : {}),
      });
      const handover: HandoverSummary | null | undefined = result.handover;
      toast.success(
        handover && handover.records + handover.tasks > 0
          ? `${leaving.name} no longer has access. ${handover.records} records and ${handover.tasks} tasks went to ${handover.to ?? "the unclaimed queue"}.`
          : `${leaving.name} no longer has access. Nothing was left open.`,
      );
      setLeaving(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update access"));
    }
  };

  const allowAccess = async (person: Person) => {
    try {
      await updateMember(person.id, { active: true });
      toast.success(`${person.name} can sign in again`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update access"));
    }
  };

  const shareQueue = async () => {
    setSharing(true);
    try {
      const result = await shareUnclaimedWork();
      if (result.assigned === 0) {
        toast.success("No unclaimed enquiries — everything already has an owner");
        return;
      }
      const spread = result.byPerson.map((row) => `${row.name} got ${row.count}`).join(" · ");
      toast.success(`${result.assigned} unclaimed enquiries shared out — ${spread}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not share the queue"));
    } finally {
      setSharing(false);
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const roleKey = String(form.get("roleKey") ?? "sales");
    const branchName = String(form.get("branch") ?? "");
    if (!name || !email) return;
    const branchId = branchOptions.find((option) => option.name === branchName)?.id;
    const password = temporaryPassword();

    setBusy(true);
    try {
      const result = await createMember({
        name,
        email,
        roleKey,
        password,
        ...(branchId ? { branchId } : {}),
      });
      setInviteOpen(false);
      setInvited({
        name,
        email,
        password: result.newUser === false ? null : password,
      });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not invite this person"));
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    if (!invited?.password) return;
    try {
      await navigator.clipboard.writeText(invited.password);
      toast.success("Temporary password copied");
    } catch {
      toast.error("Copy it from the screen — the clipboard is blocked here");
    }
  };

  return (
    <>
      <Page
        identity={
          <PageIdentity
            eyebrow="People"
            title="Your team"
            purpose="Who works here, what they are allowed to do, and how much work each person is carrying."
            stats={[
              {
                icon: <Users className="size-4" />,
                value: String(activePeople.length),
                label: seatLimit === null ? "On the team" : `On the team · ${seatLimit} seats`,
                tone: "neutral",
              },
              {
                icon: <BriefcaseBusiness className="size-4" />,
                value: String(carrying.length),
                label: "Carrying work",
                tone: "butter",
              },
              {
                icon: <UserRoundX className="size-4" />,
                value: String(idle),
                label: "Nothing assigned",
                tone: idle > 0 ? "tomato" : "pine",
              },
              {
                icon: <KeyRound className="size-4" />,
                value: seatsLeft === null ? "—" : String(seatsLeft),
                label: "Seats left",
                tone: "pine",
              },
            ]}
            actions={
              canManage ? (
                <Btn
                  tone="primary"
                  icon={<MailPlus />}
                  disabled={seatsFull}
                  title={
                    seatsFull
                      ? "Every seat on your plan is used. Upgrade in Settings → Subscriptions."
                      : "Invite a teammate"
                  }
                  onClick={() => setInviteOpen(true)}
                >
                  Invite someone
                </Btn>
              ) : undefined
            }
          />
        }
        switchboard={
          <>
            <Segmented
              options={["Current team", "Former too"]}
              value={view}
              onChange={setView}
              label="Which people to show"
            />
            <div className="switchboard__spacer" />
            <select
              aria-label="Filter by role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-9 rounded-full border border-line-2 bg-glass-2 px-3 text-[12.5px] font-medium text-foreground"
            >
              {roles.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Filter by branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="h-9 rounded-full border border-line-2 bg-glass-2 px-3 text-[12.5px] font-medium text-foreground"
            >
              {["Everyone", ...branches].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <div className="switchboard__search">
              <Search className="size-4" />
              <input
                aria-label="Search the team"
                placeholder="Search a name or email…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </>
        }
        work={
          <Panel>
            {error && !directory && (
              <p className="mb-3 rounded-xl bg-well px-3 py-2 text-[12px] text-muted">
                The live directory could not be read ({error}). The demo team is shown below.
              </p>
            )}

            {seatsFull && canManage && (
              <div className="mb-3 rounded-xl border border-line bg-well px-3 py-2 text-[12px] text-muted">
                Every seat on your plan is used. Deactivate someone or{" "}
                <Link
                  to="/workspace/$module"
                  params={{ module: "settings" }}
                  className="font-semibold text-foreground underline underline-offset-2"
                >
                  upgrade the plan
                </Link>
                .
              </div>
            )}

            {loading && !directory ? (
              <p className="py-10 text-center text-[13px] text-muted">Reading the team…</p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">
                Nobody matches that. Clear the search or pick a different role.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Role</th>
                      <th>Branch</th>
                      <th>Work now</th>
                      <th>Last active</th>
                      {canManage && <th aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((person) => {
                      const total = workload(person);
                      return (
                        <tr key={person.id}>
                          <td>
                            <span className="customer-cell">
                              <Avatar name={person.name} size={32} />
                              <span className="min-w-0">
                                <b className="block truncate text-[13px] font-semibold text-foreground">
                                  {person.name}
                                </b>
                                <span className="block truncate text-[11.5px] text-muted">
                                  {person.email || "No email on record"}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td>
                            {canManage && person.id && !person.id.startsWith("demo-") ? (
                              <select
                                aria-label={`Role for ${person.name}`}
                                value={person.roleKey}
                                onChange={(event) => void changeRole(person, event.target.value)}
                                className="h-8 rounded-lg border border-line-2 bg-glass-3 px-2 text-[12px] font-medium text-foreground"
                              >
                                {ROLE_KEYS.map((key) => (
                                  <option key={key} value={key}>
                                    {ROLE_LABEL_BY_KEY[key]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[12.5px] text-foreground">
                                {person.roleName}
                              </span>
                            )}
                            {!person.active && (
                              <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                                No access
                              </span>
                            )}
                          </td>
                          <td>
                            {canManage && person.id && !person.id.startsWith("demo-") ? (
                              <select
                                aria-label={`Branch for ${person.name}`}
                                value={person.branchId ?? ""}
                                onChange={(event) => void changeBranch(person, event.target.value)}
                                className="h-8 rounded-lg border border-line-2 bg-glass-3 px-2 text-[12px] font-medium text-foreground"
                              >
                                <option value="">No branch</option>
                                {branchOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[12.5px] text-foreground">
                                {person.branch ?? "No branch"}
                              </span>
                            )}
                          </td>
                          <td>
                            {status === "ready" ? (
                              total === 0 ? (
                                <span className="text-[12px] text-faint">Nothing assigned</span>
                              ) : (
                                <span>
                                  <b
                                    className={`block text-[12.5px] font-semibold tabular-nums ${
                                      total >= 8 ? "text-tomato" : "text-foreground"
                                    }`}
                                  >
                                    {total} open
                                  </b>
                                  <small className="block text-[11px] text-muted">
                                    {person.openTasks} tasks · {person.openEnquiries} enquiries ·{" "}
                                    {person.activeTrips} trips
                                  </small>
                                </span>
                              )
                            ) : (
                              <span
                                className="text-[12px] text-faint"
                                title="Available after you sign in"
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="text-[12px] text-muted">
                              {status === "ready" ? lastSeen(person.lastLoginAt) : "—"}
                            </span>
                          </td>
                          {canManage && (
                            <td>
                              {person.id && !person.id.startsWith("demo-") && (
                                <button
                                  type="button"
                                  className="text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-foreground hover:underline"
                                  onClick={() =>
                                    person.active ? removeAccess(person) : void allowAccess(person)
                                  }
                                >
                                  {person.active ? "Remove access" : "Allow access"}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        }
        context={
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted" />
                <h2 className="text-[13.5px] font-semibold text-foreground">
                  What each role can see
                </h2>
              </div>
              <dl className="mt-3 space-y-2">
                {ROLE_KEYS.map((key) => (
                  <div key={key} className="rounded-xl bg-well px-3 py-2">
                    <dt className="text-[12.5px] font-semibold text-foreground">
                      {ROLE_LABEL_BY_KEY[key]}
                    </dt>
                    <dd className="text-[11.5px] text-muted">
                      {roleMeaning[key] ?? "Access set by the company admin."}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                to="/workspace/$module"
                params={{ module: "settings" }}
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground underline-offset-2 hover:underline"
              >
                <BadgeCheck className="size-3.5" /> Change roles and permissions
              </Link>
            </Panel>

            <Panel>
              <h2 className="text-[13.5px] font-semibold text-foreground">
                How a person gets work
              </h2>
              <ol className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted">
                <li>
                  <b className="font-semibold text-foreground">1 · Assign an owner.</b> Open any
                  enquiry, trip or invoice and pick a teammate in “Owner”. It appears on their home
                  page the next morning.
                </li>
                <li>
                  <b className="font-semibold text-foreground">2 · Or leave it unclaimed.</b> New
                  enquiries with no owner appear for everyone in the branch, so the first person
                  free can pick them up.
                </li>
                <li>
                  <b className="font-semibold text-foreground">3 · Watch the balance.</b> Ten open
                  items on one person is a warning. The work column above turns red at eight.
                </li>
              </ol>
              <p className="mt-3 rounded-xl bg-well px-3 py-2 text-[11.5px] text-muted">
                “Nothing assigned” does not mean idle — it means no open tasks, enquiries or trips
                are owned by that person right now.
              </p>
            </Panel>
          </div>
        }
        next={
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--r-card)] border border-line bg-glass p-4">
              <h3 className="text-[13.5px] font-semibold text-foreground">Someone new joined?</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Invite them with the right role and branch on day one. You will get a temporary
                password to share — no email setup needed.
              </p>
              {canManage ? (
                <Btn className="mt-3" icon={<MailPlus />} onClick={() => setInviteOpen(true)}>
                  Invite a teammate
                </Btn>
              ) : (
                <p className="mt-3 text-[11.5px] text-faint">
                  Only a company admin can invite people.
                </p>
              )}
            </div>
            <div className="rounded-[var(--r-card)] border border-line bg-glass p-4">
              <h3 className="text-[13.5px] font-semibold text-foreground">
                {idle > 0
                  ? `${idle} ${idle === 1 ? "person has" : "people have"} nothing assigned`
                  : "Everyone is carrying something"}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {idle > 0
                  ? "Open the unclaimed queue together and share it out before the day starts."
                  : "Watch for anyone above eight open items — that is where things start to slip."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canManage && activePeople.length > 1 ? (
                  <Btn
                    tone="primary"
                    icon={<Users />}
                    loading={sharing}
                    onClick={() => void shareQueue()}
                    title="Give unclaimed enquiries to whoever is carrying the least"
                  >
                    Share the unclaimed queue
                  </Btn>
                ) : null}
                <Link
                  to="/"
                  className="inline-flex h-9 items-center rounded-full border border-line-2 bg-glass-2 px-4 text-[12.5px] font-semibold text-foreground hover:bg-glass-3"
                >
                  See what needs the team
                </Link>
              </div>
            </div>
          </div>
        }
        footer={
          <>
            <span>
              {activePeople.length} with access
              {people.length > activePeople.length
                ? ` · ${people.length - activePeople.length} without`
                : ""}
              {seatLimit === null ? "" : ` · ${seatLimit} seats on your plan`}
            </span>
            <span>Roles control pages · branches control records</span>
          </>
        }
      />

      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite someone"
        description="They join this workspace, not a separate one. You choose what they can see."
        width={520}
      >
        <form className="form-grid" onSubmit={(event) => void invite(event)}>
          <Field label="Their full name" required wide>
            {(props) => (
              <input
                {...props}
                name="name"
                className={inputClass}
                placeholder="e.g. Ananya Iyer"
                autoFocus
                required
              />
            )}
          </Field>
          <Field label="Work email" required wide hint="This is the address they sign in with.">
            {(props) => (
              <input
                {...props}
                name="email"
                type="email"
                className={inputClass}
                placeholder="ananya@yourcompany.com"
                required
              />
            )}
          </Field>
          <Field label="What can they do?" required>
            {(props) => (
              <select {...props} name="roleKey" className={inputClass} defaultValue="sales">
                {ROLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {ROLE_LABEL_BY_KEY[key]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Which branch?" hint="Branch decides which records they see.">
            {(props) => (
              <select {...props} name="branch" className={inputClass} defaultValue="">
                <option value="">No branch (shared)</option>
                {branches.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            )}
          </Field>
          <p className="full-width rounded-xl bg-well px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            We create a temporary password and show it once. Share it with them on WhatsApp or in
            person; they change it after signing in.
          </p>
          <div className="dialog-actions full-width">
            <Btn type="button" onClick={() => setInviteOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" tone="primary" loading={busy} icon={<MailPlus />}>
              Add to the team
            </Btn>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={Boolean(invited)}
        onClose={() => setInvited(null)}
        title={invited ? `${invited.name} is on the team` : "Invitation created"}
        description={
          invited?.password
            ? "Share these sign-in details. This is the only time the password is shown."
            : "They already had a Traveldesk login, so they keep their existing password."
        }
        width={460}
      >
        {invited && (
          <div className="space-y-4">
            <dl className="grid gap-2">
              <div className="rounded-xl border border-line bg-glass-2 px-3 py-2">
                <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                  Email
                </dt>
                <dd className="mt-0.5 break-all text-[13px] font-medium text-foreground">
                  {invited.email}
                </dd>
              </div>
              {invited.password && (
                <div className="rounded-xl border border-line bg-glass-2 px-3 py-2">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                    Temporary password
                  </dt>
                  <dd className="mt-0.5 flex items-center justify-between gap-2">
                    <code className="text-[14px] font-semibold tracking-wide text-foreground">
                      {invited.password}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyPassword()}
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-foreground"
                    >
                      <Copy className="size-3.5" /> Copy
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-[12px] leading-relaxed text-muted">
              {invited.password
                ? "Send this on WhatsApp or email. It works right away — no waiting for an invite to arrive."
                : "They can sign in with their existing Traveldesk password and will see this workspace straight away."}
            </p>
            <Btn tone="primary" onClick={() => setInvited(null)}>
              Done
            </Btn>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(leaving)}
        onClose={() => setLeaving(null)}
        title={leaving ? `Remove ${leaving.name}'s access?` : "Remove access"}
        description="They keep their history, but cannot sign in or see the workspace. Their unfinished work needs somewhere to go first."
        width={480}
      >
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Who takes their unfinished work
            </legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-glass-2 px-3 py-2">
              <input
                type="radio"
                name="handover"
                className="mt-0.5"
                checked={handoverTo === ""}
                onChange={() => setHandoverTo("")}
              />
              <span>
                <span className="block text-[12.5px] font-semibold text-foreground">
                  Nobody yet — back to the unclaimed queue
                </span>
                <span className="block text-[11.5px] text-muted">
                  Their records show up for everyone in the branch, and their tasks come to you.
                </span>
              </span>
            </label>
            {activePeople
              .filter((person) => person.id !== leaving?.id)
              .map((person) => (
                <label
                  key={person.id}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-glass-2 px-3 py-2"
                >
                  <input
                    type="radio"
                    name="handover"
                    className="mt-0.5"
                    checked={handoverTo === person.id}
                    onChange={() => setHandoverTo(person.id)}
                  />
                  <span>
                    <span className="block text-[12.5px] font-semibold text-foreground">
                      {person.name}
                    </span>
                    <span className="block text-[11.5px] text-muted">
                      {workload(person)} open now · {person.roleName}
                      {person.branch ? ` · ${person.branch}` : ""}
                    </span>
                  </span>
                </label>
              ))}
          </fieldset>
          <div className="dialog-actions">
            <Btn type="button" onClick={() => setLeaving(null)}>
              Keep their access
            </Btn>
            <Btn type="button" tone="primary" onClick={() => void confirmRemoveAccess()}>
              Remove access
            </Btn>
          </div>
        </div>
      </Sheet>
    </>
  );
}
