/**
 * SetupWizard — shown once to the company_admin on first login.
 *
 * Zero tech jargon. Plain language. Every step has:
 *  • What it is (heading)
 *  • Why it matters (one sentence)
 *  • What to do (clear input or button)
 *  • A "skip for now" option — nothing is forced
 *
 * Steps:
 *  1. Company name + logo (branding)
 *  2. Email (SMTP) — "so customers get real emails"
 *  3. WhatsApp — "your number, one QR scan"
 *  4. Payments (Razorpay) — "collect money online"
 *  5. Invite your team
 *  6. All done — "you're ready"
 */

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Mail,
  PartyPopper,
  Phone,
  Smartphone,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import { saveEmailChannel, saveRazorpayChannel } from "@/lib/api/modules";

// ── local types ──────────────────────────────────────────────────────────────
type EmailChannelInput = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string | undefined;
  from?: string | undefined;
};
type RazorpayChannelInput = {
  keyId: string;
  keySecret: string;
  webhookSecret?: string | undefined;
};

// ── local storage key ────────────────────────────────────────────────────────
const DONE_KEY = "traveldesk.setup_wizard_done";

export function useSetupWizard(isAdmin: boolean) {
  const alreadyDone =
    typeof localStorage !== "undefined" && Boolean(localStorage.getItem(DONE_KEY));
  const [open, setOpen] = useState(isAdmin && !alreadyDone);

  const close = () => {
    if (typeof localStorage !== "undefined") localStorage.setItem(DONE_KEY, "1");
    setOpen(false);
  };

  return { open, close };
}

// ── step definitions ─────────────────────────────────────────────────────────

const STEP_ICONS = [Building2, Mail, Smartphone, Wallet, Users, PartyPopper];
const STEP_LABELS = ["Company", "Email", "WhatsApp", "Payments", "Team", "Done"];

// ── individual step forms ────────────────────────────────────────────────────

function StepBranding({ onNext }: { onNext: () => void }) {
  const { settings, updateSettings } = useCRM();
  const [name, setName] = useState(settings.orgName ?? "");

  const save = () => {
    if (!name.trim()) {
      toast.error("Enter your company name");
      return;
    }
    updateSettings({ orgName: name.trim() });
    toast.success("Company name saved");
    onNext();
  };

  return (
    <StepShell
      icon={<Building2 className="size-6 text-blue-600" />}
      title="What's your company called?"
      why="This shows up on every quotation, invoice and email your customers receive."
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Company name</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Horizon Travels"
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Currency your business runs in</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={settings.currency}
            onChange={(e) => updateSettings({ currency: e.target.value })}
          >
            {["INR", "USD", "EUR", "GBP", "AED", "SGD", "THB", "MYR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <StepFooter onNext={save} />
    </StepShell>
  );
}

function StepEmail({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!host.trim() || !user.trim() || !pass.trim()) {
      toast.error("Fill in SMTP host, username and password");
      return;
    }
    setBusy(true);
    try {
      await saveEmailChannel({
        host: host.trim(),
        port: Number(port) || 587,
        user: user.trim(),
        pass: pass.trim(),
        from: from.trim() || user.trim(),
        secure: Number(port) === 465,
      } as EmailChannelInput);
      toast.success("Email connected — customers will get real emails now");
      onNext();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save email settings"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      icon={<Mail className="size-6 text-blue-500" />}
      title="Connect your email"
      why="When you send a quote or invoice, it lands in the customer's inbox — not a generic noreply."
      tip={
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          <strong>Using Gmail?</strong> Use <code>smtp.gmail.com</code>, port 587, and an{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            App Password
          </a>{" "}
          — not your regular Gmail password.
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label>SMTP server</Label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Port</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            >
              <option value="587">587 (recommended)</option>
              <option value="465">465 (SSL)</option>
              <option value="25">25</option>
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Email address (username)</Label>
          <Input
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="bookings@horizontravels.com"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Password / App password</Label>
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Display name for customers (optional)</Label>
          <Input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Horizon Travels <bookings@horizontravels.com>"
          />
        </div>
      </div>
      <StepFooter onNext={() => void save()} onSkip={onSkip} skipLabel="Set up later" busy={busy} />
    </StepShell>
  );
}

function StepWhatsApp({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <StepShell
      icon={<Smartphone className="size-6 text-green-600" />}
      title="Connect WhatsApp"
      why="Send quotations, payment reminders and booking confirmations from the number customers already know you on."
    >
      <div className="grid gap-4">
        {/* Option A — QR (recommended) */}
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white">
              RECOMMENDED
            </span>
            <span className="text-sm font-semibold text-green-800">Scan a QR code</span>
          </div>
          <p className="text-xs text-green-700 mb-3">
            Works with any WhatsApp number. Takes 30 seconds. No Meta account needed.
          </p>
          <ol className="text-xs text-green-700 space-y-1 mb-3">
            <li>1. Open WhatsApp on your business phone</li>
            <li>2. Tap Settings → Linked devices → Link a device</li>
            <li>3. Scan the QR code that appears</li>
          </ol>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={onNext}>
            <Smartphone className="size-4 mr-1" /> Open QR scanner
          </Button>
        </div>

        {/* Option B — Meta Cloud API */}
        <div className="rounded-2xl border border-line bg-glass-1 p-4">
          <p className="text-sm font-semibold mb-1">Meta Business API</p>
          <p className="text-xs text-muted mb-2">
            For high-volume sending (1000+ messages/day). Requires Meta Business Manager approval
            which takes 2–7 days.
          </p>
          <a
            href="https://business.facebook.com/latest/whatsapp_manager"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-pine underline"
          >
            Open Meta Business Manager <ChevronRight className="size-3" />
          </a>
        </div>
      </div>
      <StepFooter onNext={onNext} onSkip={onSkip} skipLabel="Set up later" />
    </StepShell>
  );
}

function StepPayments({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!keyId.trim() || !keySecret.trim()) {
      toast.error("Enter both Razorpay Key ID and Secret");
      return;
    }
    setBusy(true);
    try {
      await saveRazorpayChannel({
        keyId: keyId.trim(),
        keySecret: keySecret.trim(),
        webhookSecret: "",
      } as RazorpayChannelInput);
      toast.success("Razorpay connected — you can now collect payments online");
      onNext();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save Razorpay settings"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepShell
      icon={<Wallet className="size-6 text-purple-600" />}
      title="Collect payments online"
      why="Send a payment link with every invoice. Customer pays by card, UPI or net banking — money reflects automatically."
      tip={
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs text-purple-700">
          <strong>Don't have Razorpay?</strong>{" "}
          <a
            href="https://razorpay.com/signup"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Create a free account
          </a>{" "}
          — takes 5 minutes. Then go to Dashboard → Settings → API Keys.
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Razorpay Key ID</Label>
          <Input
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="rzp_live_xxxxxxxxxxxxxx"
            className="font-mono text-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Razorpay Key Secret</Label>
          <Input
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            placeholder="••••••••••••••••••••"
          />
        </div>
      </div>
      <StepFooter onNext={() => void save()} onSkip={onSkip} skipLabel="Set up later" busy={busy} />
    </StepShell>
  );
}

function StepTeam({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <StepShell
      icon={<Users className="size-6 text-amber-600" />}
      title="Invite your team"
      why="Your agents, operations staff and finance team each get their own login with the right level of access."
    >
      <div className="grid gap-3">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Who can you invite?</p>
          <div className="grid gap-1.5">
            {[
              { role: "Sales agent", desc: "Sees and manages leads, quotations, bookings" },
              { role: "Operations", desc: "Manages departures, vouchers, suppliers" },
              { role: "Finance", desc: "Invoices, payments and reports" },
              { role: "Branch manager", desc: "Everything in their branch" },
              { role: "Support", desc: "Customer complaints and after-trip service" },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span className="text-xs text-amber-700">
                  <strong>{role}</strong> — {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          Invite them from <strong>Settings → Employees</strong> after this setup. You can always
          come back.
        </p>
      </div>
      <StepFooter onNext={onNext} onSkip={onSkip} skipLabel="Invite later" nextLabel="Got it" />
    </StepShell>
  );
}

function StepDone({ onClose }: { onClose: () => void }) {
  return (
    <StepShell
      icon={<PartyPopper className="size-6 text-green-600" />}
      title="You're ready to go!"
      why="Your workspace is set up. Here's what to do first."
    >
      <div className="grid gap-2">
        {[
          {
            icon: "📋",
            title: "Add your first lead",
            desc: "Go to Leads → New lead. Takes 30 seconds.",
            href: "/workspace/leads",
          },
          {
            icon: "💬",
            title: "Send a quotation",
            desc: "Convert a lead into a quotation — one click.",
            href: "/workspace/quotations",
          },
          {
            icon: "✅",
            title: "Confirm a booking",
            desc: "When the customer says yes, confirm the booking.",
            href: "/workspace/bookings",
          },
        ].map(({ icon, title, desc, href }) => (
          <a
            key={title}
            href={href}
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-glass-2 transition-colors"
          >
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted">{desc}</p>
            </div>
            <ArrowRight className="size-4 text-muted ml-auto" />
          </a>
        ))}
      </div>
      <div className="mt-4">
        <Button className="w-full" onClick={onClose}>
          <BadgeCheck className="size-4 mr-2" /> Start using Traveldesk
        </Button>
      </div>
    </StepShell>
  );
}

// ── shared shell components ───────────────────────────────────────────────────

function StepShell({
  icon,
  title,
  why,
  tip,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  why: string;
  tip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3">
        <div className="size-12 rounded-2xl bg-white border border-line shadow-sm flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted mt-0.5">{why}</p>
        </div>
      </div>
      {tip && <div>{tip}</div>}
      {children}
    </div>
  );
}

function StepFooter({
  onNext,
  onSkip,
  skipLabel = "Skip",
  nextLabel = "Continue",
  busy = false,
}: {
  onNext: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  nextLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-2">
      {onSkip ? (
        <button onClick={onSkip} className="text-xs text-muted hover:text-foreground underline">
          {skipLabel}
        </button>
      ) : (
        <span />
      )}
      <Button disabled={busy} onClick={onNext}>
        {busy ? "Saving…" : nextLabel}
        {!busy && <ArrowRight className="size-4 ml-1" />}
      </Button>
    </div>
  );
}

// ── main wizard component ─────────────────────────────────────────────────────

export function SetupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(s + 1, 5));
  const skip = () => setStep((s) => Math.min(s + 1, 5));

  if (!open) return null;

  const Icon = STEP_ICONS[step]!;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-line bg-white shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{ width: `${((step + 1) / 6) * 100}%` }}
          />
        </div>

        {/* Step tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2 border-b border-line/50 overflow-x-auto">
          {STEP_LABELS.map((label, i) => {
            const StepIcon = STEP_ICONS[i]!;
            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  i === step
                    ? "bg-blue-50 text-blue-700"
                    : i < step
                      ? "text-green-600"
                      : "text-muted",
                )}
              >
                {i < step ? (
                  <CheckCircle2 className="size-3.5 text-green-500" />
                ) : (
                  <StepIcon className="size-3.5" />
                )}
                {label}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="p-6">
          {step === 0 && <StepBranding onNext={next} />}
          {step === 1 && <StepEmail onNext={next} onSkip={skip} />}
          {step === 2 && <StepWhatsApp onNext={next} onSkip={skip} />}
          {step === 3 && <StepPayments onNext={next} onSkip={skip} />}
          {step === 4 && <StepTeam onNext={next} onSkip={skip} />}
          {step === 5 && <StepDone onClose={onClose} />}
        </div>

        {/* Close button (only visible after step 0) */}
        {step > 0 && step < 5 && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted hover:text-foreground"
            title="Close setup wizard (you can reopen it from Settings)"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
