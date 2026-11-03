# TravBizz vs. hamara Travel CRM

Ye document code dekh kar likha gaya hai (frontend `src/`, backend `backend/src/`, `backend/prisma/schema.prisma`),
aur TravBizz ke public product pages padh kar. Dono taraf ki claims ke saath source note kiya hai.

TravBizz sources:
- https://www.travbizz.com/products/b2c-b2b-crm-software
- https://www.travbizz.com/products/package-itinerary-builder
- https://www.travbizz.com/products/hotel-booking-portal
- https://www.travbizz.com/products/white-label-booking-portal
- https://www.techjockey.com/detail/travbizz (3.5/5, 8 reviews, 66% recommend)

---

## 1. Pehle: TravBizz asli me kya hai

TravBizz ek single SaaS nahi, **six products ka bundle** hai — B2C/B2B CRM, white-label booking portal,
hotel booking portal, AI package/itinerary builder, travel website, aur custom software development.
India-first (Noida, INR, GST/TCS, +91 support), target = small se mid travel agencies, tour operators, DMC.

Do baatein jo comparison me sach me matter karti hain:

- **Depth asli hai** — hotel masters with multiple tariffs, supplier payables, agent credit limits,
  attendance, campaign queue with delivery logs, PDF-to-itinerary import. Ye cheezein unke product page par
  naam se listed hain, marketing fluff nahi.
- **Lekin reputation polarised hai** — Techjockey 3.5/5 (8 reviews, 66% recommend), Capterra 1.0/5 (1 review).
  Negative reviews: "buggy screens", "zero support", "customisation time higher than expected", ek 1-star
  custom-project complaint. Positive: "faster than others", "value for money, end to end back office".
  Matlab: **standard CRM theek chal raha hai, custom project arm risk area hai.** Unka customer-count claim
  (250+ vs 500+ vs 3000+) pages ke beech me contradict karta hai — quote karne layak nahi.

Iska matlab ye hai ki humein unse **feature parity** chahiye, unki **polish/quality** nahi.

---

## 2. Side-by-side

Legend: ✅ asli, chalne wala · ⚠️ structure hai, depth nahi · ❌ nahi hai

### Core sales

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Live dashboard (enquiry, confirmed value, collections, payables, service mix) | ✅ | ✅ | Hamara home + insights, real records se |
| Query / lead management (stage, priority, owner, notes) | ✅ | ✅ | Leads module + pipeline board + kanban drag |
| Follow-ups & reminders | ✅ | ✅ | Tasks "My day", Late/Today/Tomorrow grouping |
| Global CRM search | ✅ | ✅ | `search.routes.ts` + ⌘K palette |
| Advanced filters + saved views | ✅ | ⚠️ | Filters ✅, saved views per person server-side ❌ |
| Duplicate detection | ❌ (not listed) | ✅ | `duplicates-sheet.tsx` — hum aage |
| Customer profile with journey rail | ⚠️ | ✅ | enquiry → quote → visa → flight → hotel → transfer → departure → invoice |

### Itinerary / packages (TravBizz ka sabse strong area)

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Day-wise itinerary builder | ✅ | ✅ | `document-builder.tsx` + itinerary tab |
| PDF / print proposal with letterhead | ✅ | ✅ | Quotation cover + print stylesheet |
| AI itinerary generation | ✅ | ⚠️ | `assistant.routes.ts` + `LLM_*` env — endpoint hai, output quality unverified |
| **PDF → itinerary import** | ✅ | ❌ | Unka rare differentiator. Humare paas nahi |
| Auto cover image (Pexels) | ✅ | ❌ | Nice-to-have |
| Multiple package options per query | ✅ | ⚠️ | Multiple quotations possible, "options" UI nahi |
| Costing: service-wise cost + markup % / flat | ✅ | ⚠️ | Line items ✅, per-service supplier vs selling price ⚠️ |
| **TCS** on package invoice | ✅ | ❌ | Humare paas CGST/SGST/IGST hai (`invoice-pdf.ts`), TCS nahi |
| Multi-currency + FX | ✅ | ✅ | `fxRates` settings, invoice par FX truth |

### Travel masters / inventory

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Hotel master with multiple tariffs | ✅ | ⚠️ | "Hotels / Room inventory / Rate plans" tabs generic records hain |
| Meal plans, room types, cancellation policy | ✅ | ⚠️ | Fields hain, pricing logic nahi |
| Supplier master + contracts + allotments | ✅ | ⚠️ | Module + tabs hain, allotment/cut-off logic nahi |
| Hotel availability / live inventory | ✅ | ❌ | Booking portal nahi hai |
| Vouchers auto-generated from booking | ✅ | ⚠️ | Documents generic hain |
| Flight / GDS connectivity | ⚠️ (unnamed APIs) | ⚠️ | `flights.routes.ts` Amadeus creds maangta hai, warna clean message |
| CSV import of masters | ✅ | ✅ | `import-sheet.tsx` + `POST /records/import` |

### Money

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Quotation → invoice → receipt flow | ✅ | ✅ | Real, records + payment ledger |
| GST invoice PDF with CGST/SGST/IGST | ✅ | ✅ | `services/invoice-pdf.ts` |
| Payment gateway | ✅ (unnamed) | ✅ | Razorpay links + webhook secret |
| Partial payments / balance tracking | ✅ | ✅ | `services/payment-ledger.ts` |
| Refunds | ✅ | ⚠️ | Refunds tab generic |
| Supplier payables + settlements | ✅ | ✅ | `payables.routes.ts` + Payables panel |
| Expenses + profitability (P&L) | ⚠️ (reports only) | ✅ | `expenses.routes.ts` + Profitability tab — hum aage |
| Ledger / reconciliation | ✅ | ✅ | Ledger + Reconciliation tabs |
| Accounting export (Tally/Zoho) | ❌ | ❌ | Dono me nahi. Opportunity |
| TCS / e-invoicing (IRN) | TCS ✅, e-invoice ❌ | ❌ | India compliance gap |

### Communication

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Email workspace (send, threads, templates) | ✅ | ✅ | Real SMTP + `EmailOutbox` + templates |
| WhatsApp connected to customer record | ✅ (API unclear) | ✅ | **Official** Cloud API creds (`channels.routes.ts`), per-message delivery status |
| WhatsApp number setup (scan/QR) | ✅ | ⚠️ | `whatsapp-connect.tsx` — Meta credentials flow, QR scan nahi |
| Delivery status / logs | ✅ | ✅ | `Message.delivery` |
| Call logs | ✅ | ✅ | `CallLog` |
| Consent tracking | ❌ | ✅ | `ConsentRecord` — hum aage |
| Shared team inbox | ⚠️ | ✅ | Assignment + status |

### Marketing

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Campaigns with audiences (client/company/mixed) | ✅ | ❌ | Module hai, **sender engine nahi** |
| Queue-based bulk send + logs | ✅ | ❌ | ❌ |
| Segments | ✅ | ⚠️ | Records only |
| Referrals & coupons, attribution | ❌ | ⚠️ | Tabs hain, logic nahi |

### Team / admin / data

| Capability | TravBizz | Hamara CRM | Note |
|---|---|---|---|
| Roles + permissions | ✅ | ✅ | `rbac.ts`, roles module, per-module action matrix |
| Branch scoping | ✅ | ✅ | Har query, export, bulk action par enforced |
| Audit log | ✅ | ✅ | `AuditLog` + screen |
| **Attendance / working hours** | ✅ | ❌ | Poora missing |
| **Backup / recycle bin / restore** | ✅ | ❌ | `deletedAt` sirf 2 jagah — **koi soft delete nahi** |
| CSV export | ✅ | ✅ | ✅ |
| **Excel / PDF export of reports** | ✅ | ❌ | Sirf CSV (`growth-reports.tsx`) |
| API + docs | ✅ | ✅ | `/api/v1/meta`, API keys |
| Webhooks + delivery log | ✅ | ⚠️ | Backend ✅, screen ❌ |
| 2FA / security settings | ⚠️ | ✅ | Settings → Security |
| White-label branding | ✅ | ⚠️ | Logo/colour/domain fields, portal adhoora |
| Mobile app | ❌ | ❌ | Dono me nahi |

### Reports

| Capability | TravBizz | Hamara CRM |
|---|---|---|
| Sales / quotation / invoice / collection reports | ✅ | ✅ Growth + Reports tabs |
| Supplier / ledger reports | ✅ | ✅ |
| Team performance | ✅ | ✅ |
| Attendance report | ✅ | ❌ |
| Saved reports | ✅ | ✅ `SavedReport` |
| Excel/PDF output | ✅ | ❌ |

---

## 3. Scorecard

TravBizz ke CRM page par named **13 modules** + 3 add-on products. Uske against:

- **Fully covered (asli, chalne wala):** dashboard, query/lead, follow-ups, search, itinerary builder,
  billing/payments/GST, supplier payables, ledger, expenses, reports (data), users/roles/branches/audit,
  API/webhooks, CSV import/export, email workspace, WhatsApp (official API), tasks/productivity, consent.
  → **~18 capabilities**
- **Structure only (tab hai, dimaag nahi):** travel masters, hotels/rate plans, campaigns, segments,
  vouchers, refunds, referrals, B2B agent portal, white-label portal.
  → **~9 capabilities**
- **Missing:** TCS, PDF-to-itinerary, hotel availability, attendance, backup/recycle bin, Excel/PDF report
  export, campaign sender, saved views, webhook log screen.
  → **~9 capabilities**

Rough coverage: **~62–68% of what a travel agency does daily**. Sales → quote → booking → invoice →
collection loop **end-to-end chalta hai**. Jo nahi chalta wo hai: inventory depth, marketing engine,
staff attendance, aur data-safety (backup/restore) — aur **data-safety hi wo cheez hai jispar ek mid-size
agency vendor change kar deti hai.**

### Where hum aage hain

1. **Official WhatsApp Cloud API** with per-message delivery + consent records (TravBizz ka API unclear).
2. **Expenses + profitability** proper (unke paas sirf reports me).
3. **Razorpay payment links + webhook** named aur configured.
4. **Branch-level scoping** har query par enforced.
5. **Duplicate detection**, **audit log screen**, **shared inbox**, **⌘K palette**, **keyboard-first**.
6. **Test suite** (frontend `src/test/*`, backend `backend/tests/*`) — unke reviews me "buggy" isi ki kami hai.
7. **Ek hi request me sign-in** (`/workspace/all-records`), 429 retry — bade data par bhi blank screen nahi.

### Where hum peeche hain (impact order)

1. **Data safety** — soft delete, recycle bin, backup/export-all, restore. Bina iske koi agency production
   data nahi daalegi. (P0)
2. **Hotel/supplier masters with real tariffs** — multiple price records, meal plans, validity dates,
   cancellation policy. Abhi generic records hain. (P0)
3. **TCS + GST breakup on package invoices** — India me package billing ka basic requirement. (P0)
4. **Reports export (Excel/PDF)** — agency owner ko CA ko file bhejni hoti hai. (P1)
5. **Campaign engine** — audience → queue → send → delivery log. Module already hai, engine nahi. (P1)
6. **Saved views + webhook delivery log** — chhoti cheezein, roz use hoti hain. (P1)
7. **Attendance / working hours** — TravBizz me hai, agencies iske aadi hain. (P2)
8. **PDF → itinerary import** — unka differentiator, humein nahi chahiye turant. (P2)
9. **Hotel availability / booking portal** — poora naya product, CRM ka kaam nahi. (P3)

### Structural note (important)

Humara poora CRM **ek generic `Record` model + JSON fields** par khada hai (22 modules), TravBizz ke paas
per-domain tables hain (Lead, Quotation, Booking, Invoice, Hotel, Supplier...).

- Fayda: naya module 1 din me, custom fields free, schema-driven UI.
- Nuksan: **referential integrity nahi** — booking ↔ hotel ↔ supplier ↔ invoice ke beech asli foreign keys
  nahi, isliye voucher/manifest/allotment jaisa logic likhna mushkil hota hai. Jab bhi hum "asli depth"
  add karenge (tariffs, allotments, attendance, campaigns), unke liye **dedicated tables** banane padenge,
  generic Record me nahi.

---

## 4. Kya ek mid-size agency (20–60 staff) isse launch kar sakti hai?

**Aaj:** Nahi — production me nahi. Demo aur pilot ke liye haan.

Blockers (agency ke nazariye se):
1. Delete ka koi undo nahi, backup nahi → "hamara data chala jayega" ka dar. Deal-killer.
2. Hotel rates/tariffs asli nahi → costing manually karni padegi, matlab ROI nahi dikhega.
3. TCS ke bina package invoice galat → CA reject karega.
4. Reports Excel me nahi → owner ko manual kaam.
5. Campaigns nahi → marketing team wapas WhatsApp Web par chali jayegi.

**P0 (1–2 hafte) ke baad:** pilot ke liye ready — 1 branch, 5–10 users, real data, weekly review.

---

## 5. Build plan

### P0 — "agency production me daal sakti hai"

1. **Soft delete + Recycle bin + Restore** (backend + schema + admin screen)
   - `deletedAt`, `deletedBy` on Record and money tables; default filters; `GET /trash`, `POST /trash/:id/restore`.
   - Settings → Data → Recycle bin (30-day retention), plus "Export everything" JSON/CSV zip.
2. **Hotel & supplier masters with tariffs**
   - `HotelRate` table (hotel, room type, meal plan, season from/to, currency, cost, selling, cancellation policy).
   - Supplier contracts with validity + currency; rate picker in quotation line items.
3. **TCS + tax breakup on invoices**
   - `tcsPercent` in org tax settings, `tcsAmount` on invoice, printed in `invoice-pdf.ts`,
     included in totals + ledger + reports.
4. **Reports: Excel + PDF export**
   - Excel via `exceljs` on the backend (`GET /reports/:key/export?format=xlsx`), PDF reuse the print stylesheet.

### P1 — "roz ka kaam smooth"

5. **Campaign engine** — audience query builder (records + segments), `Campaign`/`CampaignRecipient` tables,
   queue worker reusing `sendEmail`/`sendWhatsApp`, delivery log screen, opt-out/consent check before send.
6. **Saved views per person + shared**, server-stored; Favourites for records.
7. **Webhook delivery log screen** in Integrations (data already exists).
8. **Vouchers + booking documents** generated from a booking record with real numbers.

### P2 — "parity + polish"

9. **Attendance / working hours** (check-in/out, monthly report) — needed only if customers ask.
10. **B2B agent portal** + credit-limit enforcement on booking + commission ledger.
11. **PDF → itinerary import** (upload → parse → draft day-wise plan → edit).
12. **Hotel availability/allotment** (cut-off dates, room blocks) — before any booking portal.

### P3 — naya product, CRM ke bahar

13. White-label B2C/B2B portal with hotel/flight inventory (TravBizz ke poore product line ka equivalent).

---

## 6. Ek line me

TravBizz **breadth** me aage hai (masters, campaigns, attendance, portals), hum **quality aur safety** me
aage hain (official WhatsApp, branch scoping, audit, tests, clean UX). Launch ke liye humein unki breadth
nahi, sirf **chaar cheezein** chahiye: **recycle bin/backup, hotel tariffs, TCS, aur Excel export.**
