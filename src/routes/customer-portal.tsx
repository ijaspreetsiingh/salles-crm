import { useState, type ReactNode, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plane,
  Mail,
  Search,
  ArrowRight,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/crm/ui";
import { PageIdentity } from "@/components/crm/page";
import { API_BASE_URL } from "@/lib/api/client";
import { formatDay, money } from "@/lib/crm/catalog";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Customer Portal — public page where a traveller can look up their
   bookings by email + booking reference. No login needed — the reference
   is secret enough.
   ========================================================================== */

type BookingRecord = {
  id: string;
  reference: string;
  moduleId: string;
  name: string;
  destination: string;
  status: string;
  amount: number;
  currency: string;
  date: string;
  notes: string;
  canDownloadInvoice: boolean;
  /** Signed, short-lived token for the public invoice PDF. */
  invoiceDownloadToken: string | null;
};

type CustomerPortalData = {
  organization: {
    name: string;
    supportEmail: string;
    phone: string;
    gstin: string;
    address: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  records: BookingRecord[];
};

type LookupState = "idle" | "searching" | "found" | "not-found" | "error";

export function CustomerPortal() {
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [state, setState] = useState<LookupState>("idle");
  const [data, setData] = useState<CustomerPortalData | null>(null);
  const [error, setError] = useState("");

  const submitLookup = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !reference) {
      setError("Please enter both email and booking reference.");
      return;
    }
    setState("searching");
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/public/customer-portal/lookup?email=${encodeURIComponent(email)}&reference=${encodeURIComponent(reference)}`,
      );
      if (!response.ok) {
        setState("not-found");
        setError("No booking found with this email and reference. Please check and try again.");
        return;
      }
      const result = await response.json();
      // The API wraps every payload in `{ success, data }`.
      const payload = (result?.data ?? result) as CustomerPortalData;
      if (!payload || !payload.organization || !Array.isArray(payload.records)) {
        setState("error");
        setError("We could not read this booking. Please contact your travel company.");
        return;
      }
      setData(payload);
      setState("found");
    } catch {
      setState("error");
      setError("Unable to connect. Please try again later.");
    }
  };

  const downloadInvoice = async (record: BookingRecord) => {
    if (!record.invoiceDownloadToken) {
      setError("This invoice is not available for download yet. Please contact support.");
      return;
    }
    try {
      // Public endpoint: the signed token is the credential, not the session.
      const url = `${API_BASE_URL}/public/customer-portal/invoice/${encodeURIComponent(
        record.invoiceDownloadToken,
      )}/download`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `invoice-${record.reference}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Unable to download invoice. Please contact support.");
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Top navigation */}
      <nav className="border-b border-line bg-glass-2">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Plane className="size-5 text-pine" />
            <span>Travel Portal</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Lookup section */}
        <Panel className="max-w-xl mx-auto mb-8">
          <PageIdentity
            eyebrow="Customer Portal"
            title="Your Bookings"
            purpose="Enter your email and booking reference to view your trips and download invoices."
          />
          <form onSubmit={submitLookup} className="grid gap-3 sm:grid-cols-2 mt-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Email Address</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Booking Reference</label>
              <Input
                placeholder="e.g. BK-2401"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={state === "searching"}
              className="w-full bg-ink text-on-ink hover:opacity-90"
            >
              {state === "searching" ? (
                <Clock className="size-4 mr-2" />
              ) : (
                <Search className="size-4" />
              )}
              {state === "searching" ? "Searching…" : "Find My Booking"}
            </Button>
          </form>
          {error && (
            <div className="mt-3 p-3 rounded-xl border border-tomato/30 bg-tomato/10 text-tomato text-sm">
              {error}
            </div>
          )}
        </Panel>

        {/* Results section */}
        {state === "found" && data && (
          <>
            {/* Customer info */}
            <Panel className="flex flex-col lg:flex-row gap-4">
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-pine" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{data.customer.name}</h3>
                  <p className="text-xs text-muted">{data.customer.email}</p>
                  {data.customer.phone && (
                    <p className="text-xs text-muted">{data.customer.phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <CheckCircle className="size-5 text-pine" />
                <span className="text-sm font-medium text-foreground">Verified Customer</span>
              </div>
            </Panel>

            <h2 className="text-lg font-bold text-foreground">
              Your Bookings ({data.records.length})
            </h2>

            <div className="grid gap-4">
              {data.records.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-col lg:flex-row gap-4 p-4 rounded-xl border border-line bg-glass-2 hover:border-pine/30 transition-colors cursor-pointer"
                  onClick={() => {
                    // Clicking a booking could show more details
                  }}
                >
                  <Panel className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-foreground">{record.name}</h4>
                      <span
                        className={cn(
                          "text-xs font-bold rounded-full px-2 py-0.5",
                          record.status === "Confirmed"
                            ? "bg-pine/10 text-pine"
                            : record.status === "Pending"
                              ? "bg-butter/10 text-on-butter"
                              : "bg-ink/10 text-ink",
                        )}
                      >
                        {record.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mb-1">
                      {record.destination} • {formatDay(record.date)}
                    </p>
                    <p className="text-xs text-muted">
                      Reference:{" "}
                      <span className="font-mono text-foreground">{record.reference}</span>
                    </p>
                  </Panel>
                  <div className="text-right">
                    <div className="text-sm font-bold text-foreground">
                      {money(record.amount, record.currency || "INR")}
                    </div>
                    {record.canDownloadInvoice && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadInvoice(record);
                        }}
                      >
                        <Download className="size-4 mr-2" /> Download Invoice
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-line flex items-center justify-between">
              <p className="text-xs text-muted">Powered by {data.organization.name}</p>
              <Link to="/" className="text-xs font-medium text-pine hover:underline">
                ← Back to main site
              </Link>
            </div>
          </>
        )}

        {/* Not found state */}
        {state === "not-found" && (
          <Panel className="max-w-lg mx-auto text-center py-12">
            <AlertCircle className="size-48 mx-auto text-muted mb-6" />
            <h3 className="text-lg font-bold text-foreground">No booking found</h3>
            <p className="text-muted mt-2">
              We couldn't find a booking with this email and reference. Please check your details
              and try again, or contact {data?.organization.supportEmail || "our support team"} for
              help.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => setState("idle")}>Try Again</Button>
              <Link to="/" className="text-sm font-medium text-pine hover:underline">
                Back to Home
              </Link>
            </div>
          </Panel>
        )}

        {/* Error state */}
        {state === "error" && (
          <Panel className="max-w-lg mx-auto text-center py-12">
            <AlertCircle className="size-48 mx-auto text-tomato mb-6" />
            <h3 className="text-lg font-bold text-foreground">Unable to Connect</h3>
            <p className="text-muted mt-2">{error}</p>
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setState("idle")}>Try Again</Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/customer-portal")({
  component: CustomerPortal,
});
