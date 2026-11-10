/**
 * Payment Reconciliation Panel.
 *
 * Shows matched vs unmatched payments with a one-click "Run reconciliation"
 * button. Matched payments show the confidence level and match method.
 * Unmatched payments are highlighted for manual review.
 */

import { useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Zap, CircleDot, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiQuery } from "@/lib/api/hooks";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import { fetchReconciliationSummary, runReconciliation } from "@/lib/api/modules";

const fmt = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);

const STATUS_ICON = {
  matched: <CheckCircle2 className="size-4 text-green-500" />,
  unmatched: <AlertCircle className="size-4 text-red-500" />,
  partial: <CircleDot className="size-4 text-amber-500" />,
};

const STATUS_ROW = {
  matched: "hover:bg-green-50/40",
  unmatched: "hover:bg-red-50/40 bg-red-50/20",
  partial: "hover:bg-amber-50/40 bg-amber-50/20",
};

export function ReconciliationPanel() {
  const { status } = useCRM();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [running, setRunning] = useState(false);

  const { data: summary, reload } = useApiQuery(
    () =>
      fetchReconciliationSummary({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    [from, to],
    status === "ready",
  );

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runReconciliation();
      toast.success(
        `Reconciliation complete — ${result.matched} matched, ${result.unmatched} unmatched`,
      );
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Reconciliation failed"));
    } finally {
      setRunning(false);
    }
  };

  const matchRate =
    summary && summary.total > 0 ? Math.round((summary.matched / summary.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header + run button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Payment Reconciliation</h2>
          <p className="text-xs text-muted mt-0.5">
            Razorpay payments are auto-matched to invoices on capture. Use Run to catch up on any
            unmatched payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={reload} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button onClick={() => void handleRun()} disabled={running} className="gap-2">
            {running ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}
            {running ? "Running…" : "Run reconciliation"}
          </Button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="grid gap-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-xs h-8"
          >
            Clear filter
          </Button>
        )}
      </div>

      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: summary.total, color: "text-foreground", bg: "bg-white" },
            {
              label: "Matched",
              value: summary.matched,
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "Unmatched",
              value: summary.unmatched,
              color: "text-red-600",
              bg: "bg-red-50",
            },
            {
              label: "Match rate",
              value: `${matchRate}%`,
              color:
                matchRate >= 90
                  ? "text-green-600"
                  : matchRate >= 70
                    ? "text-amber-600"
                    : "text-red-600",
              bg: "bg-white",
            },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cn("rounded-2xl border border-line p-4 shadow-sm", bg)}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {label}
              </p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Match rate progress bar */}
      {summary && summary.total > 0 && (
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted flex items-center gap-1">
              <TrendingUp className="size-3.5" />
              Reconciliation health
            </span>
            <span
              className={cn(
                "text-xs font-bold",
                matchRate >= 90
                  ? "text-green-600"
                  : matchRate >= 70
                    ? "text-amber-600"
                    : "text-red-600",
              )}
            >
              {matchRate}% matched
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                matchRate >= 90 ? "bg-green-500" : matchRate >= 70 ? "bg-amber-500" : "bg-red-500",
              )}
              style={{ width: `${matchRate}%` }}
            />
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            {summary.unmatched > 0
              ? `${summary.unmatched} payment${summary.unmatched !== 1 ? "s" : ""} need manual review`
              : "All payments are reconciled"}
          </p>
        </div>
      )}

      {/* Items table */}
      {summary && summary.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-glass-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Invoice ref</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Matched at</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {summary.items.map((item) => (
                <tr
                  key={item.paymentId}
                  className={cn("transition-colors", STATUS_ROW[item.status])}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium">
                    {item.invoiceRef ?? item.invoiceId?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {fmt(item.amount, item.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted capitalize">{item.provider}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      {STATUS_ICON[item.status]}
                      {item.status === "matched"
                        ? "Matched"
                        : item.status === "partial"
                          ? "Partial"
                          : "Needs review"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {item.matchedAt
                      ? new Date(item.matchedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted max-w-[200px] truncate">
                    {item.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && summary.items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-12 text-muted gap-2">
          <CheckCircle2 className="size-10 text-green-400" />
          <p className="text-sm font-medium">No payments in this period</p>
        </div>
      )}
    </div>
  );
}
