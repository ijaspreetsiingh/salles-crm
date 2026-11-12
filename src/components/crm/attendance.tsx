import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, LogIn, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

type Day = {
  id: string | null;
  userId: string;
  userName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  minutes: number;
  status: string;
  notes: string;
};

type MonthView = { month: string; days: Day[]; totalMinutes: number };
type TeamView = { date: string; people: Day[] };
type SummaryView = {
  month: string;
  people: Array<{ userId: string; userName: string; present: number; halfDays: number; leave: number; minutes: number }>;
};

const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
const thisMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Attendance & working hours. Deliberately small: check in, check out, and
 * honest totals. It reuses the same table the backend derives hours from, so
 * correcting a row in the database and opening this screen cannot disagree.
 */
export function Attendance({ tab }: { tab: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [mine, setMine] = useState<MonthView | null>(null);
  const [team, setTeam] = useState<TeamView | null>(null);
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "Team attendance") {
        setTeam(await apiRequest<TeamView>("/attendance/team"));
      } else if (tab === "Monthly summary") {
        setSummary(await apiRequest<SummaryView>(`/attendance/summary?month=${month}`));
      } else {
        setMine(await apiRequest<MonthView>(`/attendance/me?month=${month}`));
      }
    } catch (err) {
      setError(errorMessage(err, "Attendance could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [tab, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const punch = async (kind: "check-in" | "check-out") => {
    setBusy(true);
    try {
      await apiRequest(`/attendance/${kind}`, { method: "POST", body: {} });
      toast.success(kind === "check-in" ? "Checked in" : "Checked out");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, `Could not ${kind === "check-in" ? "check in" : "check out"}.`));
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const todays = mine?.days.find((day) => day.date === today);

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Attendance & working hours</h2>
          <p className="text-sm text-muted-foreground">
            One row per teammate per day. Hours are derived from the check-in and check-out.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab !== "Team attendance" ? (
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || thisMonth())}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {tab === "Today" || tab === "Leave" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock size={14} /> Today
              </p>
              <p className="mt-1 text-2xl font-semibold">{todays ? hours(todays.minutes) : "Not marked"}</p>
              <p className="text-xs text-muted-foreground">
                {todays ? `${time(todays.checkIn)} → ${time(todays.checkOut)} · ${todays.status}` : "Check in to start the day"}
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarDays size={14} /> This month
              </p>
              <p className="mt-1 text-2xl font-semibold">{mine ? hours(mine.totalMinutes) : "—"}</p>
              <p className="text-xs text-muted-foreground">{mine?.days.length ?? 0} day(s) marked</p>
            </div>
            <div className="flex flex-col justify-center gap-2 rounded-xl border p-4">
              <Button size="sm" onClick={() => void punch("check-in")} disabled={busy || Boolean(todays?.checkIn)}>
                <LogIn size={15} /> Check in
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void punch("check-out")}
                disabled={busy || !todays?.checkIn || Boolean(todays?.checkOut)}
              >
                <LogOut size={15} /> Check out
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(mine?.days ?? []).map((day) => (
                  <tr key={day.date} className="border-t">
                    <td className="px-3 py-2">{day.date}</td>
                    <td className="px-3 py-2">{time(day.checkIn)}</td>
                    <td className="px-3 py-2">{time(day.checkOut)}</td>
                    <td className="px-3 py-2">{hours(day.minutes)}</td>
                    <td className="px-3 py-2">{day.status}</td>
                  </tr>
                ))}
                {!loading && (mine?.days.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No attendance marked for this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "Team attendance" ? (
        <div className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Users size={14} /> Team on {team?.date ?? today}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Teammate</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(team?.people ?? []).map((person) => (
                <tr key={person.userId} className="border-t">
                  <td className="px-3 py-2 font-medium">{person.userName}</td>
                  <td className="px-3 py-2">{time(person.checkIn)}</td>
                  <td className="px-3 py-2">{time(person.checkOut)}</td>
                  <td className="px-3 py-2">{hours(person.minutes)}</td>
                  <td className="px-3 py-2">{person.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "Monthly summary" ? (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Teammate</th>
                <th className="px-3 py-2">Present</th>
                <th className="px-3 py-2">Half days</th>
                <th className="px-3 py-2">Leave / WFH</th>
                <th className="px-3 py-2">Hours</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.people ?? []).map((person) => (
                <tr key={person.userId} className="border-t">
                  <td className="px-3 py-2 font-medium">{person.userName}</td>
                  <td className="px-3 py-2">{person.present}</td>
                  <td className="px-3 py-2">{person.halfDays}</td>
                  <td className="px-3 py-2">{person.leave}</td>
                  <td className="px-3 py-2">{hours(person.minutes)}</td>
                </tr>
              ))}
              {!loading && (summary?.people.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No attendance marked for this month.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
