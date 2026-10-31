import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  PlaneTakeoff,
  Star,
  Ticket,
  User,
  UserCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Status, RecordDialog, workflowDataFor } from "./common";
import { RecordSheet } from "./record-sheet";
import { formatDay, money, type Module, type RecordRow, findModule } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { setCommsFocus } from "@/lib/crm/handoff";
import { cn } from "@/lib/utils";
import { customerHealth, customerSegment, customerSignals, healthColour } from "@/lib/crm/customer";

const healthTone = healthColour;

const agoLabel = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const hrs = Math.round(diff / 36e5);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "1 d ago";
  if (days < 30) return `${days} d ago`;
  return formatDay(iso);
};

type Interaction = {
  at: string;
  title: string;
  amount: number;
  status: string;
  ref: string;
  module: string;
  row: RecordRow;
};

export function CustomerProfile({
  row,
  currency,
  onBack,
  onOpenCommunications,
}: {
  row: RecordRow;
  currency: string;
  onBack: () => void;
  onOpenCommunications?: (row: RecordRow) => void;
}) {
  const [sheet, setSheet] = useState<{ row: RecordRow; module: Module } | null>(null);
  const [sheetEdit, setSheetEdit] = useState<RecordRow | null>(null);
  const [workflowCreate, setWorkflowCreate] = useState<{
    module: Module;
    data: Partial<RecordRow>;
  } | null>(null);
  const [funnelStage, setFunnelStage] = useState<string | null>(null);
  const { getRows, tasks, toggleTask } = useCRM();

  const current = row;

  // Health & segment
  const meta = useMemo(() => {
    const signals = customerSignals(current, {
      bookings: getRows("bookings"),
      invoices: getRows("finance"),
      enquiries: getRows("leads"),
      tasks,
    });
    const health = customerHealth(signals);
    return { health: health.score, segment: customerSegment(signals) };
  }, [current, getRows, tasks]);

  const health = meta.health;
  const seg = meta.segment;

  // Traveller-specific extra fields
  const passport = String(current.extra?.["passport"] ?? current.extra?.["passportNumber"] ?? "");
  const passportExpiry = String(
    current.extra?.["passportExpiry"] ?? current.extra?.["passportExpiryDate"] ?? "",
  );
  const dob = current.extra?.["dob"] ?? current.extra?.["dateOfBirth"] ?? "";
  const nationality = current.extra?.["nationality"] ?? "";
  const loyalty = current.extra?.["loyalty"] ?? current.extra?.["loyaltyTier"] ?? "None";
  const city = current.extra?.["city"] ?? "";

  // Cross-module interactions
  const interactions: Interaction[] = (
    ["leads", "quotations", "bookings", "finance", "support"] as const
  ).flatMap((mid) =>
    getRows(mid)
      .filter((r) => r.name.trim().toLowerCase() === current.name.trim().toLowerCase())
      .map((r) => ({
        at: r.date,
        title: r.name,
        amount: r.amount,
        status: r.status,
        ref: r.id,
        module: mid,
        row: r,
      })),
  );
  interactions.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Upcoming trips (bookings with future dates)
  const upcomingBookings = getRows("bookings")
    .filter(
      (r) =>
        r.name.trim().toLowerCase() === current.name.trim().toLowerCase() &&
        /^(Pending|On hold|Confirmed)/i.test(r.status),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Completed trips
  const completedBookings = getRows("bookings").filter(
    (r) =>
      r.name.trim().toLowerCase() === current.name.trim().toLowerCase() &&
      /^(Confirmed|Completed)/i.test(r.status),
  );

  // Open pipeline
  const openStatuses = [
    "New",
    "Contacted",
    "Qualified",
    "Quoted",
    "Sent",
    "Draft",
    "Pending",
    "On hold",
    "Open",
  ];
  const pipelineRows = [...getRows("leads"), ...getRows("quotations")].filter(
    (r) =>
      r.name.trim().toLowerCase() === current.name.trim().toLowerCase() &&
      openStatuses.includes(r.status),
  );
  const openPipeline = pipelineRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);

  // Won/completed total
  const wonAll = interactions.filter((i) => /^(won|accepted|confirmed|paid)/i.test(i.status));
  const wonTotal = wonAll.reduce((a, i) => a + i.amount, 0);

  // Lead funnel
  const leadRows = getRows("leads").filter(
    (r) => r.name.trim().toLowerCase() === current.name.trim().toLowerCase(),
  );
  const funnelStages = ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"];
  const funnel = funnelStages.map((s) => ({
    stage: s,
    total: leadRows.filter((r) => r.status === s).reduce((a, r) => a + (Number(r.amount) || 0), 0),
    count: leadRows.filter((r) => r.status === s).length,
  }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.total));

  // Tasks
  const customerTasks = tasks.filter(
    (t) =>
      t.relatedRecordId === current.id ||
      t.title.toLowerCase().includes(current.name.toLowerCase()),
  );
  const openCustomerTasks = customerTasks.filter((t) => !t.done);

  const openComms = (channel: "Email" | "WhatsApp") => {
    if (onOpenCommunications) {
      onOpenCommunications(current);
      return;
    }
    const phone = current.phone.replace(/[^\d+]/g, "");
    setCommsFocus({
      name: current.name,
      email: current.email || undefined,
      phone: phone || undefined,
      channel,
      module: "customers",
      recordId: current.id,
    });
  };

  const sheetNodes = (
    <>
      {sheet && !sheetEdit && (
        <RecordSheet
          module={sheet.module}
          row={sheet.row}
          onClose={() => {
            setSheet(null);
            setSheetEdit(null);
          }}
          onEdit={() => setSheetEdit(sheet.row)}
          onWorkflow={(targetModuleId) => {
            setWorkflowCreate({
              module: findModule(targetModuleId) ?? sheet.module,
              data: workflowDataFor(targetModuleId, sheet.module.id, sheet.row),
            });
            setSheet(null);
            setSheetEdit(null);
          }}
        />
      )}
      {sheetEdit && sheet && (
        <RecordDialog module={sheet.module} row={sheetEdit} onClose={() => setSheetEdit(null)} />
      )}
      {workflowCreate && !sheet && (
        <RecordDialog
          module={workflowCreate.module}
          create
          initialData={workflowCreate.data}
          onClose={() => setWorkflowCreate(null)}
        />
      )}
    </>
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-center gap-x-10 gap-y-4">
        <button
          onClick={onBack}
          className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
          title="Back to customers"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-tight sm:text-[40px]">
            Traveller Profile
            <br />
            <span className="text-[18px] font-normal text-muted">{current.name}</span>
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-10 gap-y-4">
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
              <Wallet className="size-5 text-pine" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                {money(wonTotal, currency)}
                {wonAll.length ? (
                  <span className="rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-bold text-on-butter">
                    {wonAll.length} trips
                  </span>
                ) : (
                  <span className="rounded-full bg-well px-2.5 py-0.5 text-[11px] font-bold text-muted">
                    No trips yet
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">Total spent with us</div>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
              <PlaneTakeoff className="size-5 text-tomato" />
            </span>
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight">{upcomingBookings.length}</div>
              <div className="text-xs text-muted">
                Upcoming trip{upcomingBookings.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
              <Clock className="size-5 text-muted" />
            </span>
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight">{openCustomerTasks.length}</div>
              <div className="text-xs text-muted">
                Open follow-up{openCustomerTasks.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          {/* Upcoming trips */}
          <section className="glass-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Upcoming Trips</h2>
              <span className="text-xs text-muted">{upcomingBookings.length} planned</span>
            </div>
            {upcomingBookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No upcoming trips — create a booking from Quotes or add a new enquiry.
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.slice(0, 5).map((b) => (
                  <article
                    key={b.id}
                    onClick={() => {
                      const mod = findModule("bookings");
                      if (mod) setSheet({ row: b, module: mod });
                    }}
                    className="cursor-pointer rounded-3xl p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md border border-line bg-glass-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          {b.destination || "Trip"}
                          <span className="rounded-full bg-pine px-2 py-0.5 text-[10px] font-bold text-on-pine">
                            {b.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted">
                          {b.extra?.["departure"] ? <Calendar className="size-3" /> : null}
                          {b.extra?.["departure"] && formatDay(String(b.extra["departure"]))}
                          {b.extra?.["pax"] && <span className="mx-1">·</span>}
                          {b.extra?.["pax"] && (
                            <span>
                              {Number(b.extra["pax"])} traveller
                              {Number(b.extra["pax"]) === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm">{money(b.amount, currency)}</div>
                        <div className="text-[10px] text-muted">{b.id}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Interaction history */}
          <section className="glass-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Interaction History</h2>
              <span className="text-xs text-muted">{interactions.length} records</span>
            </div>
            {interactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No linked leads, quotations or bookings yet — create one from the relevant
                workspace.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {interactions.slice(0, 8).map((it, i) => (
                  <article
                    key={`${it.ref}-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const mod = findModule(it.module);
                      if (mod) setSheet({ row: it.row, module: mod });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const mod = findModule(it.module);
                        if (mod) setSheet({ row: it.row, module: mod });
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${it.module === "finance" ? "invoice" : it.module.slice(0, -1)} ${it.ref}`}
                    className={cn(
                      "cursor-pointer rounded-3xl p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                      i === 0 ? "bg-ink text-on-ink" : "border border-line bg-glass-2",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className={cn("font-medium", i === 0 ? "opacity-75" : "text-muted")}>
                        {formatDay(it.at)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          i === 0 ? "bg-black/15" : "bg-well",
                        )}
                      >
                        {it.status}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-bold leading-tight">
                      {it.module === "finance"
                        ? "Invoice"
                        : it.module === "support"
                          ? "Ticket"
                          : it.module.slice(0, -1)}{" "}
                      {it.ref}
                    </h3>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {it.row.destination || it.row.detail || "—"}
                    </p>
                    <div className={cn("mt-3 text-lg font-bold", i === 0 && "opacity-90")}>
                      {money(it.amount, currency)}
                    </div>
                    <p className={cn("mt-1 text-[11px]", i === 0 ? "opacity-70" : "text-muted")}>
                      Click to open details →
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Tasks schedule */}
          <section className="glass-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Follow-ups & Tasks</h2>
              <span className="text-xs text-muted">{openCustomerTasks.length} open</span>
            </div>
            {openCustomerTasks.length === 0 ? (
              <p className="rounded-2xl bg-well px-3 py-2 text-xs text-muted">
                No open follow-ups. Add one from the side panel.
              </p>
            ) : (
              <div className="space-y-2">
                {openCustomerTasks.slice(0, 6).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-2xl border border-line bg-glass-2 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => toggleTask(t.id, e.target.checked)}
                      aria-label={`Mark ${t.title} done`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{t.title}</div>
                      <div className="text-[11px] text-muted">
                        {t.date
                          ? new Date(t.date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                        · {t.priority}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Stage funnel */}
          <section className="glass-card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Enquiry Funnel</h2>
            </div>
            <div className="text-2xl font-extrabold tracking-tight">
              {money(openPipeline, currency)}
            </div>
            <p className="mb-4 text-xs text-muted">Open pipeline value</p>
            <div className="space-y-2">
              {funnel.map((f) => (
                <div
                  key={f.stage}
                  onClick={() => setFunnelStage((s) => (s === f.stage ? null : f.stage))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setFunnelStage((s) => (s === f.stage ? null : f.stage));
                  }}
                  className={cn(
                    "relative cursor-pointer overflow-hidden rounded-2xl border bg-glass-2 px-4 py-2.5 transition-colors",
                    funnelStage === f.stage ? "border-pine" : "border-line hover:border-line-2",
                  )}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-well transition-all"
                    style={{ width: `${(f.total / funnelMax) * 100}%` }}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-between text-xs">
                    <span className="font-semibold">
                      <i
                        className={cn(
                          "mr-1.5 inline-block size-2 rounded-full",
                          f.stage === "Won"
                            ? "bg-pine"
                            : f.stage === "Lost"
                              ? "bg-tomato"
                              : "bg-butter",
                        )}
                      />
                      {f.stage}
                      {f.count > 0 && <span className="ml-1 text-muted">· {f.count}</span>}
                    </span>
                    <span className="font-bold">{money(f.total, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column: traveller profile */}
        <div className="space-y-4">
          {/* Profile hero */}
          <section className="glass-card flex flex-col items-center p-6 text-center">
            <div className="relative mb-4">
              <svg
                className="absolute -inset-1.5 size-[calc(100%+12px)] -rotate-90"
                viewBox="0 0 100 100"
                aria-hidden
              >
                <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="4" />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke={healthTone(health)}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(health / 100) * 289} 289`}
                />
              </svg>
              <span className="grid size-24 place-items-center">
                <Avatar name={current.name} size="large" />
              </span>
              <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-ink text-[11px] font-bold text-on-ink">
                {health}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">{current.name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {city ? `${city} · ` : ""}
              {current.detail || current.id}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${loyalty === "VIP" ? "bg-butter text-on-butter" : loyalty === "Gold" ? "bg-pine text-on-pine" : loyalty === "Silver" ? "bg-glass-2 text-foreground" : "bg-well text-muted"}`}
              >
                {loyalty} traveller
              </span>
              {current.destination && (
                <span className="inline-flex items-center gap-1 rounded-full bg-well px-3 py-1 text-xs font-semibold">
                  <MapPin className="size-3" /> {current.destination}
                </span>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="grid size-11 place-items-center rounded-full border border-line-2 bg-glass-2 transition-colors hover:bg-well"
                title="Email this traveller"
                onClick={() => openComms("Email")}
              >
                <Mail className="size-4" />
              </button>
              <button
                className="grid size-11 place-items-center rounded-full border border-line-2 bg-glass-2 transition-colors hover:bg-well"
                title="WhatsApp this traveller"
                onClick={() => openComms("WhatsApp")}
              >
                <Phone className="size-4" />
              </button>
              <Button
                variant="outline"
                size="icon"
                className="size-11 rounded-full"
                title="Edit traveller details"
                onClick={() => {
                  const mod = findModule("customers");
                  if (mod) setSheet({ row: current, module: mod });
                }}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </section>

          {/* Traveller documents & details */}
          <section className="glass-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Traveller Documents</h2>
              <span className="text-xs text-muted">Passport & identity</span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-glass-2 p-3">
                <FileText className="size-5 text-pine" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Passport number
                  </div>
                  <div className="font-medium">{passport || "Not provided"}</div>
                </div>
                {passport && (
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-line hover:bg-well"
                    title="Copy passport number"
                    onClick={() => {
                      navigator.clipboard?.writeText(passport);
                      toast.success("Passport number copied");
                    }}
                  >
                    <Copy className="size-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-glass-2 p-3">
                <Calendar className="size-5 text-tomato" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Passport expiry
                  </div>
                  <div className="font-medium">
                    {passportExpiry ? formatDay(passportExpiry) : "Not provided"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-glass-2 p-3">
                <UserCheck className="size-5 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Nationality
                  </div>
                  <div className="font-medium">{nationality || "Not provided"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-glass-2 p-3">
                <CreditCard className="size-5 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Date of birth
                  </div>
                  <div className="font-medium">{dob || "Not provided"}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Contact details */}
          <section className="glass-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">Contact Details</h2>
              <Status value={current.status} />
            </div>
            <dl className="space-y-3 text-sm">
              {[
                {
                  icon: <Mail className="size-4" />,
                  label: "Email",
                  value: current.email || "—",
                  copy: current.email,
                },
                {
                  icon: <Phone className="size-4" />,
                  label: "Phone / WhatsApp",
                  value: current.phone || "—",
                  copy: current.phone,
                },
                {
                  icon: <MapPin className="size-4" />,
                  label: "Favourite destination",
                  value: current.destination || "—",
                },
                {
                  icon: <Calendar className="size-4" />,
                  label: "Last contact",
                  value: agoLabel(current.date),
                },
                {
                  icon: <Wallet className="size-4" />,
                  label: "Lifetime value",
                  value: money(current.amount, currency),
                },
                {
                  icon: <User className="size-4" />,
                  label: "Account owner",
                  value: current.owner || "Unassigned",
                },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted">{f.icon}</span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {f.label}
                    </dt>
                    <dd className="truncate font-medium">{f.value}</dd>
                  </div>
                  {f.copy && (
                    <button
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-line hover:bg-well"
                      title={`Copy ${f.label}`}
                      onClick={() => {
                        navigator.clipboard?.writeText(f.copy!);
                        toast.success(`${f.label} copied`);
                      }}
                    >
                      <Copy className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </dl>
            {current.notes && (
              <p className="mt-4 rounded-2xl bg-well p-3 text-xs leading-relaxed text-muted">
                {current.notes}
              </p>
            )}
          </section>
        </div>
      </div>
      {sheetNodes}
    </div>
  );
}
