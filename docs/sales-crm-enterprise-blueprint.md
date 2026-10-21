# Enterprise Sales CRM Blueprint

## Purpose

Create a distinct **Sales CRM** entry point in Desk for the complete customer acquisition and sales lifecycle. Sales CRM owns prospecting, customer conversations, opportunity qualification, proposals, negotiation, and the commercial handoff. Shared ERP records remain the source of truth for stock, manufacturing, projects/jobs, delivery, invoicing, and accounting.

This is the functional scope and implementation order. It is not a claim that all features are already configured in the running site.

## Delivered baseline (2026-10-19)

- CRM and Selling are presented as one **Sales** workspace under the **CRM** module at `/desk/crm/sales`. The launcher source exposes one Sales tile for this flow.
- The workspace includes six sales KPIs, opportunity-stage and lead-status charts, lead/opportunity/quotation/customer/campaign quick actions, and links for CRM records and existing sales reports.
- Customer activity links cover Contacts, To-do follow-ups, and Calendar Events. Handoff links point to the owning ERP records for Delivery Notes, Projects/jobs, and Sales Invoices; they do not move stock, manufacturing, project, or accounting ownership into CRM.
- Duplicate activity links were removed from the report card. The custom Desk launcher CRM tile source now points to `/desk/crm/sales-crm`.

This is the workspace and navigation foundation, not a production-ready completion of every enterprise workflow below. Qualification/assignment/SLA automation, role-scoped queues, approval and quotation governance, forecast/targets, permission validation, and a full lead-to-won-deal walkthrough remain rollout work. KPI cards currently show zero because the site has no CRM records; no sample records were created.

## Product boundary

Sales CRM should let a salesperson follow a deal end to end without moving operational records into the CRM:

1. Find or receive a prospect.
2. Qualify the company, contact, need, budget, authority, timeline, and fit.
3. Plan and record calls, meetings, emails, tasks, notes, and next actions.
4. Convert qualified demand into an opportunity and manage its pipeline.
5. Check product/service availability, pricing, and feasibility with the owning ERP areas.
6. Prepare, approve, send, revise, and track a quotation or proposal.
7. Record the decision and reasons for winning or losing.
8. Convert a won deal to the right operational records and track the handoff.
9. Keep the customer relationship active for renewals, repeat business, and service feedback.

## Desk experience

Create a dedicated **Sales CRM** Workspace as the salesperson's home, with role-aware shortcuts and reports. A workspace is a separate entry point and curated view inside the same ERPNext site; it is not a separate application, database, or security boundary. Enforce access using Frappe roles, DocType permissions, user permissions, and sharing rules—not by hiding sidebar links.

Workspace sections:

- **My day:** overdue and due-today activities, callbacks, tasks, meetings, and recently updated deals.
- **Sales snapshot:** new leads, unassigned leads, qualified leads, open opportunities, weighted pipeline, overdue next actions, quotations awaiting response, wins/losses, and target attainment.
- **Work queues:** My Leads, Unassigned Leads, My Opportunities, Stale Opportunities, Quotations to Follow Up, and Recently Won Deals.
- **Quick create:** Lead, Contact, Organization/Customer, Opportunity, Activity, and Quotation.
- **Sales records:** Leads, Contacts, Customers, Opportunities, Activities, Campaigns, Quotations, Sales Orders, and Sales Partners.
- **Reports:** funnel, pipeline, activity, conversion, forecast, quotation, win/loss, territory, campaign, and salesperson performance.
- **Configuration:** stages, lead sources, territories, sales teams, assignment rules, targets, approval rules, templates, and integrations (restricted to authorized managers/admins).

## Functional scope

### 1. Lead capture and intake

- Manual entry, website/web forms, email-to-lead, imports, partner/referral, events, phone, social, and API intake.
- Lead source, campaign, source detail, received date, company, person, contacts, territory, product/service interest, and consent/preferences.
- Duplicate detection and merge review using email, phone, tax/company identifiers, and normalized organization name.
- Required-field rules, validation, spam/invalid handling, ownership, assignment queues, round-robin or rule-based assignment, and SLA timers.
- Lead status and disqualification reasons; retain a clear audit trail instead of silently deleting poor-fit leads.
- Bulk import with preview, validation errors, deduplication, and an import log.

### 2. Qualification and conversion

- Configurable qualification checklist: need, fit, budget, decision process/authority, timing, competition, geography, and expected value.
- Lead scoring based on explicit configurable criteria; show why the score changed.
- Convert a qualified lead to an existing or new Customer/organization, Contact, and one or more Opportunities without duplicating records.
- Preserve source, campaign, activities, notes, attachments, and ownership through conversion.
- Allow nurture/recycle with a next-review date and reason; prevent accidental conversion of incomplete or disqualified leads.

### 3. Customer and contact context

- Organization hierarchy, multiple contacts and locations, roles in buying decisions, communication preferences, billing/shipping references, and relationship owner.
- Timeline combining CRM activities and linked commercial records, subject to permissions.
- Customer segmentation, industry, territory, lifecycle status, account plan, and relationship health.
- Show open opportunities, previous quotations/orders, renewals, and support/service references as linked context; Sales CRM must not duplicate their accounting or operational data.

### 4. Activities and collaboration

- Calls, meetings, emails, tasks, notes, follow-ups, reminders, calendar events, and reusable activity outcomes.
- Link an activity to a lead, contact, customer, opportunity, quotation, or campaign.
- Every active lead/opportunity should have an owner and a dated next action; highlight stale records and missed follow-ups.
- Email templates, email thread linking, calendar integration where available, attachments, @mentions/comments, and an auditable activity timeline.
- Configurable notifications and escalation for assignment, SLA breach, stalled deal, approval request, quotation expiry, and renewal dates.

### 5. Opportunity and pipeline

- Multiple configurable pipelines where different business lines have materially different sales processes.
- Stages with entry/exit criteria, probability, expected close date, amount, currency, owner, team, territory, source, products/services, and customer need.
- Buying committee and decision roles, competitors, risks, dependencies, next step, and close plan.
- Weighted and unweighted pipeline, stage aging, expected close slippage, forecast category, and manager override with audit trail.
- Stage changes recorded in history; won/lost closure requires outcome and reason, with competitor and loss notes where relevant.
- Reopen or amend closed records only through controlled, logged actions.

### 6. Products, services, pricing, and feasibility

- Use shared Item, price list, tax, currency, UOM, and customer pricing masters from ERPNext.
- Support product bundles/kits, services, optional lines, discounts, recurring/renewal offers, and customer-specific terms when supported by the installed ERP configuration.
- Show available-to-promise/stock and lead time as read-only operational signals; inventory remains owned by Stock.
- For made-to-order or capacity-dependent offers, capture a feasibility request and route it to Manufacturing/Planning before committing dates or quantities.
- Do not create duplicate item, stock, BOM, or production masters in Sales CRM.

### 7. Quotations and commercial approvals

- Create quotations from an opportunity with version history, validity, item/service lines, taxes, terms, delivery assumptions, attachments, and customer-specific templates.
- Track draft, approval, sent, viewed/response where integration supports it, revised, accepted, rejected, expired, and cancelled states.
- Configurable approval matrix for discount, margin, deal value, payment terms, credit risk, non-standard clauses, and exceptions.
- Preserve approved values and approver comments; approval must not be bypassed by editing a submitted document.
- Follow up before expiry and record customer response and competitor context.
- Use ERPNext Quotation and its standard downstream conversion where available; avoid parallel quotation records.

### 8. Won-deal handoff and delivery tracking

- On win, create or link the appropriate Sales Order and pass approved items, prices, terms, customer commitments, contacts, and attachments.
- Capture a handoff checklist: confirmed scope, delivery/installation needs, promised dates, dependencies, acceptance criteria, and customer owner.
- Show linked order, fulfillment/delivery, project/job, service, and invoice status in CRM as read-only progress where permissions allow.
- Projects/jobs, manufacturing, stock fulfillment, shipment, invoices, and payment collection belong to their owning modules. Sales owns the promise and relationship follow-up, with clear handoff and exception escalation.
- For service/renewal deals, link the relevant contract, subscription, maintenance, or support record available in the installed apps.

### 9. Campaigns and demand generation

- Campaigns, audiences/lists, channels, budget, dates, landing/source tracking, response, conversion, and attribution.
- Connect campaign touchpoints to leads and opportunities; make attribution rules explicit (first touch, last touch, or configurable multi-touch).
- Track cost and outcomes when spend data is available; do not present incomplete attribution as precise ROI.
- Consent, opt-out, suppression, and communication preferences must be respected by all outbound actions.

### 10. Forecasting, targets, and reporting

- Targets by period, salesperson/team, territory, and product/business line, with controlled visibility.
- Forecast by expected close date and category, comparing target, best case, commit, and closed results.
- Core reports: lead aging and source conversion; qualification conversion; opportunity funnel and aging; weighted/unweighted pipeline; forecast accuracy; activity coverage; quotation conversion and discount; win/loss reasons; sales cycle; target attainment; campaign attribution; customer/repeat/renewal pipeline.
- Filters by date, company, team, owner, territory, source, campaign, product, currency, and status where meaningful.
- Drill from chart/card to permission-filtered records; export permissions should follow the underlying data rules.

## Roles and access model

- **Sales Representative:** own/assigned leads, contacts, opportunities, activities, and quotations; limited editing after submission/approval.
- **Sales Manager:** team records, assignment, forecast review, approvals within authority, targets, and team reports.
- **Sales Operations:** configuration, import quality, deduplication, pipeline governance, and audit/reporting support.
- **Sales Administrator:** full setup and controlled maintenance; not a default role for daily users.
- **Other departments:** read only the handoff information they need, through linked records and existing ERP permissions.

Apply least privilege, company/territory/team scoping where required, field/document-level permissions, approval separation, and audit history. Validate permissions with representative users before rollout.

## Enterprise controls and non-functional requirements

- One source of truth for each master and transaction; linked records instead of duplicate records.
- Naming series, multi-company and multi-currency behavior aligned with the site's ERP settings.
- Required fields and controlled status transitions; validation for dates, values, customer identity, and conversion.
- Audit trail for ownership, stage, amount, probability, close date, approvals, merges, and important customer terms.
- Data retention, consent/opt-out, access logging, backup/restore, and export controls aligned with company policy and applicable law.
- Idempotent configuration/migrations, rollback notes, staging verification, and production deployment procedure.
- Performance for large lead/customer volumes; indexed search/filter fields and scheduled jobs for scoring, reminders, and stale-record checks.
- Integration failures must be visible and retryable; avoid silent loss of lead, email, or order data.

## Recommended implementation sequence

1. **Audit and baseline:** confirm ERPNext/Frappe versions, installed apps, current CRM doctypes/workspace, existing scripts/customizations, roles, and actual site data. Do not run legacy setup scripts blindly.
2. **Foundation:** establish data ownership, roles/permissions, naming, lead sources, stages, status rules, deduplication, assignment, and audit requirements.
3. **Sales CRM Workspace:** build the separate Desk entry point, role-aware shortcuts, queues, KPI cards, and only reports that are supported by verified fields and permissions.
4. **Lead-to-opportunity:** configure intake, qualification, conversion, activities, and pipeline; verify the full user journey.
5. **Opportunity-to-quotation:** configure shared item/pricing behavior, quote templates, approvals, expiry follow-up, and version controls.
6. **Won-deal handoff:** connect Sales Order and show linked project/job, manufacturing/stock, delivery, and billing status without moving ownership of those processes into CRM.
7. **Campaigns and management reporting:** add attribution, targets, forecast, and performance reporting after source and stage data are reliable.
8. **Rollout readiness:** permission checks, migration/rollback plan, sample-data walkthrough, user training, monitoring, and production release.

## Acceptance criteria for Sales CRM

- A user can open Sales CRM from Desk and sees only the queues/actions permitted by their role.
- A prospect can be captured, deduplicated, assigned, qualified, nurtured or disqualified, and converted without losing history.
- Every open opportunity has a valid owner, stage, amount basis, expected close date, and next action (with approved exceptions documented).
- A quotation can be prepared, routed for approval, revised with history, sent, followed up, and converted using the standard ERP transaction flow.
- A won deal produces a traceable handoff; sales users can see relevant delivery/job progress without editing records owned by other modules.
- Pipeline, conversion, forecast, and win/loss reports reconcile to the underlying records and respect permissions.
- Role, approval, audit, duplicate, import, and failure/retry paths are reviewed before production use.

## Current repository note

This repository is Frappe Docker deployment/configuration, not a standalone Sales CRM application. It currently targets ERPNext `v16.51.1` in the demo compose file and contains local CRM setup scripts/customizations. Those scripts must be audited against the live DocType schema and one another before execution; a workspace or role seeded by a script alone does not deliver the complete enterprise workflow described here.
