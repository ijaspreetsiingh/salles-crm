import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Clock,
  Plane,
  Plus,
  RefreshCw,
  TicketX,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApiQuery } from "@/lib/api/hooks";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import {
  fetchPNRs,
  createPNR,
  issuePNRTickets,
  voidPNR,
  refundPNR,
  expirePNR,
  type PNRDto,
} from "@/lib/api/modules";

/* ==========================================================================
   Flight PNR Queue — holds, deadlines, ticketing, voids and refunds.

   Every GDS hold has a ticketing deadline. Missing it means the airline
   cancels the booking automatically. This screen makes every pending
   deadline visible at a glance — colour-coded, countdown in hours.
   ========================================================================== */

// ── Deadline badge ────────────────────────────────────────────────────────────
const URGENCY_STYLES = {
  none: "bg-gray-100 text-gray-600",
  ok: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700 animate-pulse",
  expired: "bg-red-200 text-red-800 line-through",
};

function DeadlineBadge({ pnr }: { pnr: PNRDto }) {
  if (!pnr.ticketDeadline) return <span className="text-xs text-muted">No deadline</span>;

  const h = pnr.hoursUntilDeadline ?? 0;
  const label =
    pnr.deadlineUrgency === "expired"
      ? "Expired"
      : h < 1
        ? "< 1 hr"
        : h < 24
          ? `${h}h left`
          : `${Math.floor(h / 24)}d ${h % 24}h left`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        URGENCY_STYLES[pnr.deadlineUrgency],
      )}
    >
      <Clock className="size-3" />
      {label}
    </span>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  Active: "bg-blue-100 text-blue-700",
  Ticketed: "bg-green-100 text-green-700",
  Voided: "bg-red-100 text-red-700",
  Expired: "bg-gray-100 text-gray-500",
  Refunded: "bg-purple-100 text-purple-700",
};

// ── component ────────────────────────────────────────────────────────────────
export function PNRQueue() {
  const { status } = useCRM();
  const [statusFilter, setStatusFilter] = useState("Active");
  const [createOpen, setCreateOpen] = useState(false);
  const [actionPNR, setActionPNR] = useState<PNRDto | null>(null);
  const [actionType, setActionType] = useState<"ticket" | "void" | "refund" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Ticket issuance
  const [ticketInputs, setTicketInputs] = useState<string[]>([""]);
  // Void/refund reason
  const [actionReason, setActionReason] = useState("");

  // New PNR form
  const [form, setForm] = useState({
    pnr: "",
    gds: "Amadeus",
    airline: "",
    route: "",
    departure: "",
    fareType: "Economy",
    ticketDeadline: "",
    notes: "",
    passengerCount: 1,
  });
  const [createBusy, setCreateBusy] = useState(false);

  const { data: pnrs, reload } = useApiQuery(
    () => fetchPNRs({ status: statusFilter }),
    [statusFilter],
    status === "ready",
  );

  // Auto-refresh every 2 minutes so deadlines stay current
  useEffect(() => {
    const t = setInterval(() => reload(), 120_000);
    return () => clearInterval(t);
  }, [reload]);

  const critical = (pnrs ?? []).filter(
    (p) => p.deadlineUrgency === "critical" || p.deadlineUrgency === "warning",
  ).length;

  const openAction = (pnr: PNRDto, type: "ticket" | "void" | "refund") => {
    setActionPNR(pnr);
    setActionType(type);
    setActionReason("");
    setTicketInputs(pnr.passengers.length > 0 ? pnr.passengers.map(() => "") : [""]);
  };

  const runAction = async () => {
    if (!actionPNR || !actionType) return;
    setActionBusy(true);
    try {
      if (actionType === "ticket") {
        const nums = ticketInputs.map((t) => t.trim()).filter(Boolean);
        if (nums.length === 0) {
          toast.error("Enter at least one ticket number");
          return;
        }
        await issuePNRTickets(actionPNR.id, nums);
        toast.success("Tickets issued successfully");
      } else if (actionType === "void") {
        await voidPNR(actionPNR.id, actionReason);
        toast.success("PNR voided");
      } else {
        await refundPNR(actionPNR.id, actionReason);
        toast.success("Refund marked");
      }
      reload();
      setActionPNR(null);
      setActionType(null);
    } catch (err) {
      toast.error(errorMessage(err, "Action failed"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!form.pnr.trim() && !form.route.trim()) {
      toast.error("Enter a PNR or route");
      return;
    }
    setCreateBusy(true);
    try {
      await createPNR({
        pnr: form.pnr.trim(),
        gds: form.gds,
        airline: form.airline.trim(),
        route: form.route.trim(),
        departure: form.departure,
        fareType: form.fareType,
        ...(form.ticketDeadline
          ? { ticketDeadline: new Date(form.ticketDeadline).toISOString() }
          : {}),
        notes: form.notes.trim(),
        passengers: Array.from({ length: form.passengerCount }, () => ({
          name: "",
          passport: "",
          dob: "",
          nationality: "",
          ticketNumber: "",
        })),
      });
      toast.success("PNR added to queue");
      reload();
      setCreateOpen(false);
      setForm({
        pnr: "",
        gds: "Amadeus",
        airline: "",
        route: "",
        departure: "",
        fareType: "Economy",
        ticketDeadline: "",
        notes: "",
        passengerCount: 1,
      });
    } catch (err) {
      toast.error(errorMessage(err, "Could not create PNR"));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleExpire = async (id: string) => {
    try {
      await expirePNR(id);
      toast.success("PNR marked expired");
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not expire PNR"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">PNR Queue</h2>
          <p className="text-xs text-muted">
            {critical > 0 ? (
              <span className="text-red-600 font-semibold">
                {critical} deadline{critical !== 1 ? "s" : ""} need attention ·{" "}
              </span>
            ) : null}
            {(pnrs ?? []).length} PNRs shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status filter tabs */}
          <div className="flex gap-1 rounded-xl border border-line bg-glass-1 p-1">
            {["Active", "Ticketed", "Voided", "Expired", "Refunded"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === s ? "bg-ink text-on-ink" : "text-muted hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={reload} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> Add PNR
          </Button>
        </div>
      </div>

      {/* PNR table */}
      {(pnrs ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-muted gap-3">
          <Plane className="size-14" />
          <p className="text-sm font-medium">No PNRs in this queue</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> Add first PNR
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-glass-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">PNR</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Airline</th>
                <th className="px-4 py-3">GDS</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Pax</th>
                <th className="px-4 py-3">Ticketing deadline</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tickets</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {(pnrs ?? []).map((p) => (
                <tr
                  key={p.id}
                  className={cn(
                    "transition-colors hover:bg-glass-1",
                    p.deadlineUrgency === "critical" && "bg-red-50",
                    p.deadlineUrgency === "warning" && "bg-amber-50",
                  )}
                >
                  <td className="px-4 py-3 font-mono font-bold text-foreground">
                    {p.pnr || <span className="text-muted italic">—</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.route}</td>
                  <td className="px-4 py-3 text-muted">{p.airline}</td>
                  <td className="px-4 py-3 text-muted">{p.gds}</td>
                  <td className="px-4 py-3 text-muted">{p.fareType}</td>
                  <td className="px-4 py-3 text-muted">{p.passengers.length}</td>
                  <td className="px-4 py-3">
                    <DeadlineBadge pnr={p} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS_STYLES[p.status] ?? "bg-gray-100 text-gray-600",
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted max-w-[140px] truncate">
                    {p.ticketNumbers.length > 0 ? p.ticketNumbers.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {p.status === "Active" && (
                        <>
                          <button
                            onClick={() => openAction(p, "ticket")}
                            className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100"
                            title="Issue tickets"
                          >
                            <CheckCheck className="size-3" /> Issue
                          </button>
                          <button
                            onClick={() => openAction(p, "void")}
                            className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                            title="Void PNR"
                          >
                            <XCircle className="size-3" /> Void
                          </button>
                        </>
                      )}
                      {p.status === "Ticketed" && (
                        <button
                          onClick={() => openAction(p, "refund")}
                          className="flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100"
                          title="Refund"
                        >
                          <TicketX className="size-3" /> Refund
                        </button>
                      )}
                      {p.status === "Active" && (
                        <button
                          onClick={() => void handleExpire(p.id)}
                          className="rounded-lg p-1 text-muted hover:text-red-600 hover:bg-red-50"
                          title="Mark expired"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Action dialog (ticket / void / refund) ─────────────────────── */}
      <Dialog
        open={Boolean(actionPNR && actionType)}
        onOpenChange={() => {
          setActionPNR(null);
          setActionType(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "ticket" && "Issue e-tickets"}
              {actionType === "void" && "Void PNR"}
              {actionType === "refund" && "Request refund"}
            </DialogTitle>
            <DialogDescription>
              PNR <strong>{actionPNR?.pnr}</strong> · {actionPNR?.route}
            </DialogDescription>
          </DialogHeader>

          {actionType === "ticket" && (
            <div className="grid gap-3 py-2">
              <p className="text-xs text-muted">Enter the e-ticket number for each passenger.</p>
              {ticketInputs.map((val, idx) => (
                <div key={idx} className="grid gap-1">
                  <Label>
                    Ticket {idx + 1}
                    {actionPNR?.passengers[idx]?.name ? ` — ${actionPNR.passengers[idx].name}` : ""}
                  </Label>
                  <Input
                    value={val}
                    onChange={(e) => {
                      const next = [...ticketInputs];
                      next[idx] = e.target.value;
                      setTicketInputs(next);
                    }}
                    placeholder="098-1234567890"
                    className="font-mono"
                  />
                </div>
              ))}
              <button
                className="text-xs text-pine hover:underline text-left"
                onClick={() => setTicketInputs([...ticketInputs, ""])}
              >
                + Add another ticket number
              </button>
            </div>
          )}

          {(actionType === "void" || actionType === "refund") && (
            <div className="grid gap-3 py-2">
              <div className="grid gap-1">
                <Label>Reason</Label>
                <Input
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={
                    actionType === "void"
                      ? "e.g. Customer cancelled, schedule change"
                      : "e.g. Medical emergency, visa refused"
                  }
                />
              </div>
              {actionType === "void" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    Confirm with the GDS before voiding
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This marks the PNR as voided in Traveldesk. Cancel it in {actionPNR?.gds}{" "}
                    separately if not already done.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setActionPNR(null);
                setActionType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={actionBusy}
              variant={actionType === "void" ? "destructive" : "default"}
              onClick={() => void runAction()}
            >
              {actionBusy
                ? "Processing…"
                : actionType === "ticket"
                  ? "Issue tickets"
                  : actionType === "void"
                    ? "Void PNR"
                    : "Confirm refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create PNR dialog ───────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add PNR to queue</DialogTitle>
            <DialogDescription>
              Record a GDS hold. Set the ticketing deadline — missing it means the airline cancels
              the reservation automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>PNR code</Label>
              <Input
                value={form.pnr}
                onChange={(e) => setForm({ ...form, pnr: e.target.value.toUpperCase() })}
                placeholder="e.g. ABC123"
                className="font-mono uppercase"
              />
            </div>
            <div className="grid gap-1">
              <Label>GDS</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.gds}
                onChange={(e) => setForm({ ...form, gds: e.target.value })}
              >
                {["Amadeus", "Sabre", "Galileo", "Manual"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>Airline</Label>
              <Input
                value={form.airline}
                onChange={(e) => setForm({ ...form, airline: e.target.value })}
                placeholder="e.g. Emirates, AI"
              />
            </div>
            <div className="grid gap-1">
              <Label>Route</Label>
              <Input
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value.toUpperCase() })}
                placeholder="DEL-DXB-DEL"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1">
              <Label>Departure date/time</Label>
              <Input
                type="datetime-local"
                value={form.departure}
                onChange={(e) => setForm({ ...form, departure: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Fare class</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.fareType}
                onChange={(e) => setForm({ ...form, fareType: e.target.value })}
              >
                {["Economy", "Premium Economy", "Business", "First"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>
                Ticketing deadline <span className="font-normal text-red-500">(critical)</span>
              </Label>
              <Input
                type="datetime-local"
                value={form.ticketDeadline}
                onChange={(e) => setForm({ ...form, ticketDeadline: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Passengers</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={form.passengerCount}
                onChange={(e) => setForm({ ...form, passengerCount: Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2 grid gap-1">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Special requests, fare rules…"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createBusy} onClick={() => void handleCreate()}>
              {createBusy ? "Adding…" : "Add to queue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
