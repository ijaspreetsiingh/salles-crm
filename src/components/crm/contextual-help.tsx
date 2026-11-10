import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  DollarSign,
  FileText,
  Hotel,
  MessageSquare,
  Package,
  Phone,
  PlaneTakeoff,
  Receipt,
  Settings2,
  Star,
  Ticket,
  TrendingUp,
  Users,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

/* ==========================================================================
   Contextual Help — per-module quick-tips panel.

   Each module has:
   - A short "what is this?" line
   - 3-5 quick-tip items (what to do, how to do it)
   - An optional "common questions" section
   ========================================================================== */

interface ModuleHelp {
  icon: ReactNode;
  title: string;
  what: string;
  tips: Array<{ label: string; detail: string }>;
  questions?: Array<{ q: string; a: string }>;
}

const MODULE_HELP: Record<string, ModuleHelp> = {
  leads: {
    icon: <UserPlus className="size-4" />,
    title: "Enquiries",
    what: "Every trip starts here. Add an enquiry the moment a customer contacts you — even just a name and phone number is enough.",
    tips: [
      { label: "Add a new enquiry", detail: "Press N or click the + in the sidebar header." },
      {
        label: "Convert to a quote",
        detail: "Open the enquiry → click 'New Quote'. All the customer details carry over.",
      },
      {
        label: "Filter by status",
        detail:
          "Use the Status filter at the top to see only New, Contacted, or Follow-up enquiries.",
      },
      {
        label: "Assign to a team member",
        detail:
          "Open the enquiry → Owner field → pick a name. The owner sees it on their Today screen.",
      },
    ],
    questions: [
      {
        q: "How is an enquiry different from a customer?",
        a: "An enquiry is one trip request. A customer is the person. One customer can have many enquiries.",
      },
      {
        q: "Can a customer submit their own enquiry?",
        a: "Yes. Settings → Channels → Public Lead Form gives you a link to put on your website.",
      },
    ],
  },

  quotations: {
    icon: <FileText className="size-4" />,
    title: "Quotations",
    what: "Build a price quote with flights, hotels and transfers. The PDF is ready to send in one click.",
    tips: [
      {
        label: "Add line items",
        detail: "Inside the quote, click 'Add item' — pick Flight, Hotel, Transfer or Other.",
      },
      {
        label: "GST is automatic",
        detail: "Set the GST rate on each item; the totals update live.",
      },
      {
        label: "Send the PDF",
        detail: "Click 'Send Quote' — it emails the PDF and logs the activity.",
      },
      {
        label: "Convert to booking",
        detail: "Once the customer confirms, click 'Convert to Booking' at the top right.",
      },
    ],
    questions: [
      {
        q: "Can I create multiple versions of a quote?",
        a: "Yes. Duplicate the quote from the menu and change the line items — both versions stay linked to the enquiry.",
      },
    ],
  },

  bookings: {
    icon: <Ticket className="size-4" />,
    title: "Bookings",
    what: "A confirmed trip. Tracks travellers, supplier confirmations, PNRs, and documents.",
    tips: [
      {
        label: "Add traveller details",
        detail: "Open booking → Travellers tab → add name, passport, DOB.",
      },
      {
        label: "Attach documents",
        detail: "Documents tab → Upload — vouchers and tickets stay here for the customer portal.",
      },
      {
        label: "PNR ticketing queue",
        detail:
          "If you have an air PNR on hold, add it — the countdown timer warns you before the deadline.",
      },
      {
        label: "Share with customer",
        detail:
          "Click 'Customer Portal Link' to send the customer a link where they can view the booking and pay.",
      },
    ],
    questions: [
      {
        q: "What is the difference between a booking and a PNR?",
        a: "A booking is the full trip record. A PNR is just the airline reservation reference — one booking can have multiple PNRs.",
      },
    ],
  },

  customers: {
    icon: <Users className="size-4" />,
    title: "Customers",
    what: "Every person you have done business with. Full history — trips, money, communication.",
    tips: [
      {
        label: "See full history",
        detail: "Open a customer → Timeline tab shows every enquiry, booking, payment and message.",
      },
      {
        label: "Add a note",
        detail:
          "Timeline → Add note. Great for remembering preferences — 'window seat', 'vegetarian'.",
      },
      {
        label: "Corporate customers",
        detail: "Set the customer type to 'Corporate' and link their company for B2B billing.",
      },
    ],
  },

  finance: {
    icon: <Wallet className="size-4" />,
    title: "Finance",
    what: "All the money — invoices, payments, receipts. The reconciliation screen matches Razorpay payments automatically.",
    tips: [
      {
        label: "Raise an invoice",
        detail:
          "Open a booking → Finance tab → Raise Invoice. The booking total fills in automatically.",
      },
      {
        label: "Send a payment link",
        detail:
          "On the invoice, click 'Send Payment Link' — sends a Razorpay link to the customer.",
      },
      {
        label: "Reconciliation",
        detail:
          "Finance → Reconciliation → Run Batch — Razorpay payments get matched to invoices automatically.",
      },
      {
        label: "Record offline payment",
        detail: "Invoice → Mark Paid → enter cash/NEFT/cheque details.",
      },
    ],
    questions: [
      {
        q: "What if a payment doesn't auto-match?",
        a: "It shows as 'Unmatched' in reconciliation. Click it and manually link it to the correct invoice.",
      },
    ],
  },

  conversations: {
    icon: <MessageSquare className="size-4" />,
    title: "Conversations",
    what: "All WhatsApp and email threads, one inbox. Reply without leaving the CRM.",
    tips: [
      {
        label: "Reply to a message",
        detail:
          "Click the thread → type your reply → Enter. It sends via WhatsApp or email automatically.",
      },
      {
        label: "Link a conversation to a booking",
        detail: "In the thread → Link → search for the booking or enquiry.",
      },
      {
        label: "Template messages",
        detail: "Click the lightning bolt in the reply box to pick a pre-written message template.",
      },
    ],
    questions: [
      {
        q: "Why is WhatsApp not connected?",
        a: "Settings → Channels → WhatsApp → follow the QR code setup. Takes 30 seconds.",
      },
    ],
  },

  hotels: {
    icon: <Hotel className="size-4" />,
    title: "Hotels",
    what: "Search live hotel availability or browse your contract rates.",
    tips: [
      {
        label: "Live search",
        detail:
          "Enter destination and dates — results come from Hotelbeds (requires sandbox/production key).",
      },
      {
        label: "Contract rates",
        detail:
          "Hotels → Contract Rates tab → add your own negotiated rates per hotel and room type.",
      },
      {
        label: "Add to a quote",
        detail: "From search results, click 'Add to Quote' and pick the open quotation.",
      },
    ],
  },

  flights: {
    icon: <PlaneTakeoff className="size-4" />,
    title: "Flights & PNR Queue",
    what: "Track airline PNRs that need ticketing. Countdown timers warn you before the deadline.",
    tips: [
      {
        label: "Add a PNR",
        detail: "PNR Queue → + Add PNR — enter the reference, airline, and ticketing deadline.",
      },
      {
        label: "Issue ticket",
        detail: "Open the PNR → Issue Ticket. This logs the action and removes it from the queue.",
      },
      {
        label: "Red alert",
        detail:
          "PNRs flash red when under 4 hours to deadline. The queue auto-refreshes every 2 minutes.",
      },
    ],
  },

  tasks: {
    icon: <BadgeCheck className="size-4" />,
    title: "Tasks",
    what: "Follow-ups, reminders, internal to-dos — all in one place.",
    tips: [
      {
        label: "Create a task",
        detail: "Press N anywhere → Task. Or from a booking/enquiry → Add Task.",
      },
      {
        label: "Due today",
        detail: "Tasks due today appear on your Today home screen automatically.",
      },
      {
        label: "Assign to a teammate",
        detail: "Open the task → Assignee → pick a name. They'll see it on their Today screen.",
      },
    ],
  },

  team: {
    icon: <Users className="size-4" />,
    title: "Team Chat",
    what: "Internal Slack-style messaging. Channels, DMs, @mentions.",
    tips: [
      { label: "Send a message", detail: "Pick a channel from the left → type → Enter." },
      {
        label: "@mention someone",
        detail: "Type @ and start typing their name — they get notified instantly.",
      },
      { label: "Reply in thread", detail: "Hover a message → Reply — keeps conversations tidy." },
    ],
  },

  insights: {
    icon: <TrendingUp className="size-4" />,
    title: "Insights",
    what: "Revenue, bookings, conversion rates — how the business is performing.",
    tips: [
      {
        label: "Date range",
        detail: "Pick Last 30 days, This quarter, or a custom range at the top.",
      },
      { label: "By branch", detail: "Use the Branch filter to compare offices." },
      {
        label: "Export",
        detail: "Download button → CSV — for your accountant or management reports.",
      },
    ],
  },

  settings: {
    icon: <Settings2 className="size-4" />,
    title: "Settings",
    what: "Configure the workspace — branding, team, channels, integrations.",
    tips: [
      {
        label: "Add a team member",
        detail: "Settings → Team → Invite — enter email, pick role. They get a login link.",
      },
      {
        label: "Connect WhatsApp",
        detail: "Settings → Channels → WhatsApp → Scan QR code. 30 seconds.",
      },
      {
        label: "Connect email (SMTP)",
        detail: "Settings → Channels → Email → enter your SMTP host, port, username, password.",
      },
      {
        label: "Razorpay payments",
        detail: "Settings → Integrations → Razorpay → paste Key ID and Key Secret.",
      },
    ],
  },
};

// Default help shown when no specific module is active
const DEFAULT_HELP: ModuleHelp = {
  icon: <BookOpen className="size-4" />,
  title: "Traveldesk",
  what: "Your travel agency, all in one screen. Enquiries → Quotes → Bookings → Invoices — the whole workflow in four steps.",
  tips: [
    {
      label: "Start every morning on Today",
      detail: "The home screen shows your tasks, follow-ups and urgent PNRs for today.",
    },
    {
      label: "Press Ctrl+K to find anything",
      detail: "Customer name, booking reference, or any keyword — results appear instantly.",
    },
    {
      label: "N to add something new",
      detail: "Press N from anywhere to add a new enquiry, task or note.",
    },
    {
      label: "? to open this help panel",
      detail: "Press ? or click the help icon in the sidebar any time.",
    },
  ],
  questions: [
    {
      q: "Where do I start?",
      a: "Add your first enquiry. Sidebar → Enquiries → + New. Takes 20 seconds.",
    },
    {
      q: "How do I connect WhatsApp?",
      a: "Settings → Channels → WhatsApp → Scan QR code. Works with any existing WhatsApp number.",
    },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ContextualHelp({ moduleId, isMac }: { moduleId?: string | null; isMac: boolean }) {
  const help: ModuleHelp = (moduleId ? MODULE_HELP[moduleId] : undefined) ?? DEFAULT_HELP;

  return (
    <div className="space-y-6">
      {/* What is this module */}
      <div className="rounded-2xl border border-line bg-glass-1 p-4">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="grid size-7 place-items-center rounded-lg bg-pine/10 text-pine">
            {help.icon}
          </span>
          <p className="text-[13px] font-semibold">{help.title}</p>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">{help.what}</p>
      </div>

      {/* Quick tips */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">
          Quick tips
        </h3>
        <div className="grid gap-2">
          {help.tips.map((tip: { label: string; detail: string }) => (
            <div key={tip.label} className="rounded-xl border border-line bg-white px-3.5 py-2.5">
              <p className="text-[12.5px] font-semibold text-foreground">{tip.label}</p>
              <p className="text-[12px] text-muted mt-0.5">{tip.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Common questions */}
      {help.questions && help.questions.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">
            Common questions
          </h3>
          <div className="grid gap-2">
            {help.questions.map((item: { q: string; a: string }) => (
              <div key={item.q} className="rounded-xl border border-line bg-white px-3.5 py-2.5">
                <p className="text-[12.5px] font-semibold text-foreground">{item.q}</p>
                <p className="text-[12px] text-muted mt-0.5">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Keyboard shortcuts — always shown */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">
          Keyboard shortcuts
        </h3>
        <div className="grid gap-1.5">
          {[
            [[isMac ? "⌘K" : "Ctrl K"], "Find anything"],
            [["/"], "Search"],
            [["N"], "Add something new"],
            [["g", "l"], "Go to Enquiries"],
            [["g", "b"], "Go to Bookings"],
            [["g", "F"], "Go to Finance"],
            [["?"], "Open this panel"],
            [["Esc"], "Close any panel"],
          ].map(([keys, desc]) => (
            <div
              key={desc as string}
              className="flex items-center justify-between gap-4 rounded-xl border border-line bg-glass-2 px-3 py-2"
            >
              <span className="text-[12px] text-muted">{desc}</span>
              <span className="flex shrink-0 gap-1">
                {(keys as string[]).map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-mono font-medium text-foreground shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
