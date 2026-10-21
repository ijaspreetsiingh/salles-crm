export type Person = { name: string; img?: string | undefined };

const av = (n: number) => `https://i.pravatar.cc/120?img=${n}`;

export const reps = {
  sofia: { name: "Sofia Reyes", img: av(47) },
  theo: { name: "Theo Adeyemi", img: av(12) },
  amara: { name: "Amara Okafor", img: av(45) },
  rohan: { name: "Rohan Mehta", img: av(53) },
  hanna: { name: "Hanna Lindqvist", img: av(44) },
} satisfies Record<string, Person>;

export type RepKey = keyof typeof reps;
export const repList = Object.entries(reps).map(([key, r]) => ({ key: key as RepKey, ...r }));
export const me: Person = { name: "Sofia Reyes", img: av(47) };

export type Stage = "Qualification" | "Proposal" | "Negotiation" | "Closing";
export type Deal = {
  id: string;
  title: string;
  company: string;
  value: number;
  closes: string;
  stage: Stage;
  team: RepKey[];
};

export const stageMeta: Record<Stage, { prob: number; tone: "sun" | "forest" | "ember" | "ink" }> = {
  Qualification: { prob: 20, tone: "sun" },
  Proposal: { prob: 40, tone: "forest" },
  Negotiation: { prob: 70, tone: "ember" },
  Closing: { prob: 90, tone: "ink" },
};

const D = (id: string, title: string, company: string, value: number, closes: string, stage: Stage, team: RepKey[]): Deal => ({ id, title, company, value, closes, stage, team });

export const deals: Deal[] = [
  D("q1", "Support plan upgrade", "Tidewater Freight", 53010, "Dec 5", "Qualification", ["sofia", "amara", "theo"]),
  D("q2", "API access tier", "Fennick & Rowe", 17970, "Dec 10", "Qualification", ["rohan", "hanna", "theo"]),
  D("q3", "Integration build", "Fennick & Rowe", 28700, "Dec 16", "Qualification", ["theo", "rohan", "amara"]),
  D("q4", "Annual renewal", "Aldercrest Hotels", 16970, "Dec 19", "Qualification", ["sofia", "hanna", "rohan"]),
  D("q5", "Fleet licence expansion", "Copperline Foods", 41200, "Oct 31", "Qualification", ["amara", "sofia"]),
  D("q6", "Pilot rollout", "Verde Farms", 22640, "Nov 28", "Qualification", ["hanna", "theo"]),
  D("p1", "Fleet licence expansion", "Tidewater Freight", 7710, "Dec 27", "Proposal", ["sofia", "theo", "rohan"]),
  D("p2", "Analytics add-on", "Tidewater Freight", 4200, "Oct 22", "Proposal", ["sofia", "rohan", "hanna"]),
  D("p3", "Team training workshops", "Fennick & Rowe", 29000, "Nov 11", "Proposal", ["theo", "hanna", "amara"]),
  D("p4", "Annual renewal", "Bell & Birch Joinery", 14710, "Nov 20", "Proposal", ["rohan", "hanna", "theo"]),
  D("p5", "Data migration package", "Nimbus Health", 19800, "Nov 24", "Proposal", ["amara", "sofia"]),
  D("n1", "Annual renewal", "Tidewater Freight", 18190, "Nov 5", "Negotiation", ["sofia", "theo", "hanna"]),
  D("n2", "Analytics add-on", "Lumio Solar", 28680, "Dec 1", "Negotiation", ["hanna", "rohan", "theo"]),
  D("n3", "Seat true-up", "Aldercrest Hotels", 55430, "Oct 23", "Negotiation", ["sofia", "amara", "theo"]),
  D("n4", "Security review bundle", "Quillon Analytics", 15800, "Dec 20", "Negotiation", ["rohan", "theo", "amara"]),
  D("n5", "Regional expansion", "Sable Freight", 49040, "Oct 27", "Negotiation", ["rohan", "hanna", "amara"]),
  D("n6", "Premium SLA", "Vela Cosmetics", 21400, "Nov 1", "Negotiation", ["amara", "hanna"]),
  D("c1", "Pilot rollout, 3 sites", "Tidewater Freight", 15960, "Nov 25", "Closing", ["sofia", "hanna", "theo"]),
  D("c2", "Support plan upgrade", "Brightmoor Clinics", 18080, "Nov 10", "Closing", ["sofia", "theo", "rohan"]),
  D("c3", "Team training workshops", "Lumio Solar", 21950, "Dec 13", "Closing", ["sofia", "theo", "rohan"]),
  D("c4", "Premium SLA", "Aldercrest Hotels", 54450, "Nov 16", "Closing", ["sofia", "amara", "rohan"]),
  D("c5", "Integration build", "Aldercrest Hotels", 54940, "Nov 10", "Closing", ["sofia", "hanna", "amara"]),
  D("c6", "Fleet licence expansion", "Kumo Retail", 56180, "Oct 23", "Closing", ["hanna", "sofia", "rohan"]),
  D("c7", "Annual renewal", "Sable Freight", 47100, "Nov 16", "Closing", ["rohan", "sofia", "amara"]),
];

export const hotDeals = ["c6", "c5", "c4", "c7", "n3", "n5"].flatMap((id) => { const deal = deals.find((d) => d.id === id); return deal ? [deal] : []; });

export type Segment = "Enterprise" | "Mid-market" | "SMB";
export type Customer = {
  slug: string;
  name: string;
  role: string;
  company: string;
  pipeline: number | null;
  lastContact: string;
  health: number;
  segment: Segment;
  starred?: boolean | undefined;
  img?: string | undefined;
};

const C = (name: string, role: string, company: string, pipeline: number | null, lastContact: string, health: number, segment: Segment, img?: string, starred?: boolean): Customer => ({
  slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name, role, company, pipeline, lastContact, health, segment, img, starred,
});

export const customers: Customer[] = [
  C("Daniel Osei", "VP Procurement", "Brightmoor Clinics", 18080, "10 h ago", 51, "Enterprise", av(59), true),
  C("Clara Vos", "Head of Operations", "Tidewater Freight", 99070, "Oct 9", 86, "Enterprise", av(32), true),
  C("Grace Liu", "VP Sales", "Peakline Software", 30460, "in 14 h", 59, "Mid-market"),
  C("Mei Tanaka", "IT Director", "Aldercrest Hotels", 181790, "in 12 h", 91, "Enterprise", av(9)),
  C("Priya Natarajan", "Head of Data", "Quillon Analytics", 33210, "in 10 h", 58, "SMB"),
  C("Aisha Rahman", "Product Lead", "Nimbus Health", 3400, "in 7 h", 91, "SMB"),
  C("Noah Fischer", "IT Manager", "Alpenrail", 54860, "16 h ago", 69, "Enterprise"),
  C("Hugo Laurent", "Managing Director", "Maison Clair Hotels", null, "17 h ago", 59, "Mid-market"),
  C("Karim Haddad", "Chief Operating Officer", "Orchard Row Bank", 64490, "2 d ago", 89, "Enterprise", av(68)),
  C("Tomás Silva", "Chief Technology Officer", "Corvo Mobility", 42740, "2 d ago", 92, "Mid-market"),
  C("Leo Martins", "Chief Executive", "Brisa Travel", 15090, "2 d ago", 78, "SMB"),
  C("Sara Lindholm", "Operations Lead", "Fjord Outdoor", 2770, "2 d ago", 54, "SMB"),
  C("Elena Rossi", "Marketing Director", "Vela Cosmetics", 29880, "3 d ago", 72, "Enterprise"),
  C("Graham Whitley", "Chief Financial Officer", "Fennick & Rowe", 75670, "4 d ago", 64, "Mid-market", av(60)),
  C("Oliver Grant", "General Manager", "Northgate Cinemas", 19940, "4 d ago", 47, "Mid-market"),
  C("Isabel Cruz", "Head of Operations", "Verde Farms", 19320, "4 d ago", 81, "SMB"),
  C("Yuki Mori", "Head of IT", "Kumo Retail", 112970, "5 d ago", 88, "Enterprise"),
  C("Marcus Bell", "Owner", "Bell & Birch Joinery", 14710, "5 d ago", 66, "SMB"),
  C("Kenji Arai", "COO", "Lumio Solar", 50630, "6 d ago", 74, "Mid-market", av(13)),
  C("Lucia Moreno", "Head of Finance", "Copperline Foods", 41200, "6 d ago", 70, "Enterprise", av(20)),
  C("Jonas Becker", "CTO", "Hafenwerk", 8800, "1 w ago", 61, "SMB"),
  C("Fatima Zahra", "Founder", "Atlas Ceramics", 14260, "1 w ago", 57, "Mid-market"),
  C("Nadia Petrova", "VP Logistics", "Sable Freight", 96140, "1 w ago", 83, "Enterprise"),
  C("Ravi Kapoor", "Head of Product", "Peakline Software", 12400, "2 w ago", 42, "SMB"),
];

export const customerBy = (name: string) => customers.find((c) => c.name === name);

export type InvoiceStatus = "Paid" | "Draft" | "Due" | "Overdue";
export type Invoice = { no: string; company: string; contact: string; issued: string; due: string; note: string; amount: number; status: InvoiceStatus };
const I = (no: string, company: string, contact: string, issued: string, due: string, note: string, amount: number, status: InvoiceStatus): Invoice => ({ no, company, contact, issued, due, note, amount, status });

export const invoices: Invoice[] = [
  I("RP-2400", "Tidewater Freight", "Clara Vos", "Oct 17", "Nov 15", "Paid Oct 17", 53070, "Paid"),
  I("RP-2444", "Tidewater Freight", "Clara Vos", "Oct 17", "Nov 15", "Not sent", 2000, "Draft"),
  I("RP-2445", "Brightmoor Clinics", "Daniel Osei", "Oct 17", "Nov 15", "Not sent", 3600, "Draft"),
  I("RP-2446", "Lumio Solar", "Kenji Arai", "Oct 17", "Nov 15", "Not sent", 2900, "Draft"),
  I("RP-2442", "Alpenrail", "Noah Fischer", "Oct 12", "Nov 10", "Paid Oct 17", 18150, "Paid"),
  I("RP-2406", "Lumio Solar", "Kenji Arai", "Oct 2", "Nov 1", "in 15 d", 33300, "Due"),
  I("RP-2423", "Corvo Mobility", "Tomás Silva", "Oct 2", "Nov 1", "in 15 d", 8040, "Due"),
  I("RP-2427", "Kumo Retail", "Yuki Mori", "Oct 1", "Oct 31", "Paid Oct 15", 61790, "Paid"),
  I("RP-2428", "Fjord Outdoor", "Sara Lindholm", "Oct 1", "Oct 31", "in 14 d", 4240, "Due"),
  I("RP-2433", "Atlas Ceramics", "Fatima Zahra", "Sep 29", "Oct 29", "in 12 d", 14260, "Due"),
  I("RP-2411", "Sable Freight", "Nadia Petrova", "Aug 28", "Sep 27", "20 d late", 32180, "Overdue"),
  I("RP-2415", "Maison Clair Hotels", "Hugo Laurent", "Aug 12", "Sep 11", "36 d late", 28543, "Overdue"),
  I("RP-2398", "Northgate Cinemas", "Oliver Grant", "Jul 20", "Aug 19", "59 d late", 11280, "Overdue"),
];

export type ProjectStatus = "Planning" | "In progress" | "In review" | "Done";
export type Project = { id: string; company: string; contact: string; title: string; status: ProjectStatus; done: number; total: number; pct: number; next: string; due: string; team: RepKey[] };
const P = (id: string, company: string, contact: string, title: string, status: ProjectStatus, done: number, total: number, pct: number, next: string, due: string, team: RepKey[]): Project => ({ id, company, contact, title, status, done, total, pct, next, due, team });

export const projects: Project[] = [
  P("p1", "Tidewater Freight", "Clara Vos", "Platform onboarding", "In progress", 3, 6, 47, "Next: Workflow setup", "Due in 8 days", ["sofia", "theo", "rohan"]),
  P("p8", "Quillon Analytics", "Priya Natarajan", "Platform onboarding", "In progress", 3, 5, 55, "Next: User testing", "Due in 11 days", ["rohan", "amara", "sofia"]),
  P("p9", "Hafenwerk", "Jonas Becker", "Data migration", "In review", 4, 5, 71, "Next: Handover", "Due Nov 5", ["theo", "hanna", "sofia"]),
  P("p4", "Fennick & Rowe", "Graham Whitley", "Warehouse integration", "In review", 5, 6, 70, "Next: Go-live review", "Due Nov 8", ["hanna", "sofia", "rohan"]),
  P("p3", "Lumio Solar", "Kenji Arai", "SSO rollout", "Planning", 0, 5, 0, "Next: Requirements", "Due Nov 16", ["sofia", "hanna", "theo"]),
  P("p5", "Aldercrest Hotels", "Mei Tanaka", "Team training programme", "In progress", 1, 5, 13, "Next: Sandbox ready", "Due Nov 29", ["sofia", "amara", "rohan"]),
  P("p2", "Brightmoor Clinics", "Daniel Osei", "Data migration", "In progress", 1, 5, 13, "Next: Sandbox ready", "Due Nov 30", ["theo", "amara", "hanna"]),
  P("p7", "Orchard Row Bank", "Karim Haddad", "API integration", "Planning", 0, 6, 0, "Next: Kick-off call", "Due Dec 1", ["rohan", "hanna", "sofia"]),
  P("p6", "Copperline Foods", "Lucia Moreno", "Reporting setup", "Done", 5, 5, 100, "Every step is done", "Delivered · Sep 27", ["theo", "sofia", "rohan"]),
  P("p10", "Vela Cosmetics", "Elena Rossi", "SSO rollout", "Done", 6, 6, 100, "Every step is done", "Delivered · Oct 7", ["amara", "rohan", "sofia"]),
];

export type EventKind = "Call" | "Meeting" | "Task" | "Email";
export type CalEvent = { day: number; month: 0 | 1 | -1; time: string; title: string; kind: EventKind; rep: RepKey; done?: boolean; company: string };
const E = (day: number, time: string, title: string, kind: EventKind, rep: RepKey, company: string, done = false, month: 0 | 1 | -1 = 0): CalEvent => ({ day, time, title, kind, rep, company, done, month });

export const events: CalEvent[] = [
  E(7, "11a", "Prepare pricing sheet", "Task", "amara", "Kumo Retail", true),
  E(7, "1:30p", "Prepare pricing sheet", "Task", "sofia", "Lumio Solar", true),
  E(7, "4p", "Send recap", "Email", "theo", "Alpenrail", true),
  E(8, "9:30a", "Discovery call", "Call", "amara", "Peakline Software"),
  E(8, "12p", "Check in on pilot", "Call", "theo", "Bell & Birch Joinery"),
  E(8, "3p", "Pipeline review", "Meeting", "rohan", "Internal"),
  E(10, "12p", "Draft contract redlines", "Task", "sofia", "Sable Freight", true),
  E(11, "1p", "Discovery call", "Call", "rohan", "Aldercrest Hotels"),
  E(11, "1:30p", "Renewal conversation", "Call", "amara", "Lumio Solar"),
  E(11, "4p", "Kick-off workshop", "Meeting", "sofia", "Verde Farms"),
  E(12, "2p", "Security walkthrough", "Meeting", "theo", "Brisa Travel"),
  E(13, "11:30a", "Send revised proposal", "Email", "theo", "Vela Cosmetics", true),
  E(14, "12:30p", "Discovery call", "Call", "hanna", "Corvo Mobility", true),
  E(15, "1:30p", "Update account plan", "Task", "amara", "Kumo Retail", true),
  E(16, "10:30a", "Renewal conversation", "Call", "sofia", "Brisa Travel", true),
  E(16, "12p", "Renewal conversation", "Call", "hanna", "Fjord Outdoor", true),
  E(16, "2p", "Quarterly review", "Meeting", "amara", "Orchard Row Bank"),
  E(16, "4p", "Send recap", "Email", "rohan", "Atlas Ceramics"),
  E(17, "10a", "Draft contract redlines", "Task", "hanna", "Tidewater Freight"),
  E(17, "10:30a", "Discovery call", "Call", "sofia", "Tidewater Freight"),
  E(17, "11:30a", "Kick-off workshop", "Meeting", "rohan", "Orchard Row Bank"),
  E(17, "4:30p", "Check in on pilot", "Call", "theo", "Fennick & Rowe"),
  E(18, "9:30a", "Renewal conversation", "Call", "amara", "Brisa Travel"),
  E(18, "10a", "Security walkthrough", "Meeting", "rohan", "Nimbus Health"),
  E(18, "2p", "Draft contract redlines", "Task", "sofia", "Atlas Ceramics"),
  E(19, "10:30a", "Draft contract redlines", "Task", "theo", "Kumo Retail"),
  E(19, "11:30a", "Product demo", "Meeting", "sofia", "Peakline Software"),
  E(19, "2p", "Forecast call", "Call", "amara", "Internal"),
  E(19, "4p", "Send recap", "Email", "hanna", "Alpenrail"),
  E(20, "9a", "Team stand-up", "Meeting", "rohan", "Internal"),
  E(20, "9a", "Coaching 1:1", "Meeting", "theo", "Internal"),
  E(20, "3p", "Send proposal", "Email", "amara", "Verde Farms"),
  E(21, "9a", "Send revised proposal", "Email", "hanna", "Hafenwerk"),
  E(21, "2p", "Prepare pricing sheet", "Task", "theo", "Corvo Mobility"),
  E(22, "9a", "Team stand-up", "Meeting", "rohan", "Internal"),
  E(22, "9:30a", "Quarterly review", "Meeting", "theo", "Sable Freight"),
  E(22, "1p", "Discovery call", "Call", "sofia", "Brisa Travel"),
  E(23, "10a", "Forecast call", "Meeting", "rohan", "Internal"),
  E(23, "12p", "Prepare pricing sheet", "Task", "theo", "Vela Cosmetics"),
  E(24, "1:30p", "Check in on pilot", "Call", "hanna", "Lumio Solar"),
  E(24, "2p", "Send revised proposal", "Email", "sofia", "Kumo Retail"),
  E(25, "9a", "Team stand-up", "Meeting", "amara", "Internal"),
  E(25, "12:30p", "Draft contract redlines", "Task", "sofia", "Alpenrail"),
  E(26, "4p", "Draft contract redlines", "Task", "theo", "Fennick & Rowe"),
  E(26, "4p", "Discovery call", "Call", "rohan", "Atlas Ceramics"),
  E(27, "10a", "Share case study", "Email", "theo", "Nimbus Health"),
  E(27, "10a", "Pipeline review", "Meeting", "hanna", "Internal"),
  E(27, "3p", "Send recap", "Email", "rohan", "Verde Farms"),
  E(27, "4p", "Prepare pricing sheet", "Task", "amara", "Hafenwerk"),
  E(28, "4:30p", "Update account plan", "Task", "sofia", "Brightmoor Clinics"),
  E(29, "9a", "Kick-off workshop", "Meeting", "theo", "Corvo Mobility"),
  E(30, "9a", "Send revised proposal", "Email", "hanna", "Orchard Row Bank"),
  E(30, "12p", "Quarterly review", "Meeting", "rohan", "Fjord Outdoor"),
  E(30, "3p", "Discovery call", "Call", "amara", "Peakline Software"),
  E(31, "3:30p", "Share case study", "Email", "theo", "Kumo Retail"),
  E(1, "9a", "Security walkthrough", "Meeting", "hanna", "Aldercrest Hotels", false, 1),
  E(1, "2:30p", "Product demo", "Meeting", "theo", "Tidewater Freight", false, 1),
  E(2, "8:30a", "Quarterly review", "Meeting", "rohan", "Lumio Solar", false, 1),
  E(2, "12p", "Send revised proposal", "Email", "theo", "Vela Cosmetics", false, 1),
  E(6, "11a", "Discovery call", "Call", "rohan", "Alpenrail", false, 1),
  E(7, "8:30a", "Quarterly review", "Meeting", "theo", "Nimbus Health", false, 1),
  E(7, "9:30a", "Discovery call", "Call", "hanna", "Corvo Mobility", false, 1),
  E(8, "10a", "Kick-off workshop", "Meeting", "theo", "Fjord Outdoor", false, 1),
  E(8, "2p", "Send revised proposal", "Email", "rohan", "Kumo Retail", false, 1),
];

export const overdue = [
  { title: "Security walkthrough", when: "Mon, Oct 12, 2:00 PM", kind: "Meeting" as EventKind, company: "Brisa Travel", rep: "theo" as RepKey },
  { title: "Renewal conversation", when: "Sun, Oct 11, 1:30 PM", kind: "Call" as EventKind, company: "Lumio Solar", rep: "amara" as RepKey },
  { title: "Discovery call", when: "Sun, Oct 11, 1:00 PM", kind: "Call" as EventKind, company: "Aldercrest Hotels", rep: "rohan" as RepKey },
  { title: "Check in on pilot", when: "Thu, Oct 8, 12:00 PM", kind: "Call" as EventKind, company: "Bell & Birch Joinery", rep: "theo" as RepKey },
  { title: "Discovery call", when: "Thu, Oct 8, 9:30 AM", kind: "Call" as EventKind, company: "Peakline Software", rep: "amara" as RepKey },
  { title: "Pipeline review", when: "Thu, Oct 8, 3:00 PM", kind: "Meeting" as EventKind, company: "Internal", rep: "rohan" as RepKey },
];

export const activity = [
  { rep: "sofia" as RepKey, text: "moved Pilot rollout, 3 sites to Closing", company: "Tidewater Freight", ago: "6 min ago" },
  { rep: "theo" as RepKey, text: "sent the revised proposal", company: "Brightmoor Clinics", ago: "53 min ago" },
  { rep: "sofia" as RepKey, text: "logged a 24 min call", company: "Lumio Solar", ago: "2 h ago" },
  { rep: "rohan" as RepKey, text: "marked invoice RP-2403 as paid", company: "Fennick & Rowe", ago: "2 h ago" },
  { rep: "hanna" as RepKey, text: "finished Data import", company: "Aldercrest Hotels", ago: "3 h ago" },
  { rep: "amara" as RepKey, text: "won Annual renewal", company: "Orchard Row Bank", ago: "4 h ago" },
];

export const leaderboard = [
  { rep: "sofia" as RepKey, won: 94410, pct: 270, deals: 3 },
  { rep: "amara" as RepKey, won: 18150, pct: 73, deals: 1 },
  { rep: "theo" as RepKey, won: 0, pct: 0, deals: 0 },
  { rep: "rohan" as RepKey, won: 0, pct: 0, deals: 0 },
  { rep: "hanna" as RepKey, won: 0, pct: 0, deals: 0 },
];

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const kmoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 100000 ? 1 : 1).replace(/\.0$/, "")}K` : `$${n}`);
