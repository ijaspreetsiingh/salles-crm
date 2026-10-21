# JassDBX UI Redesign File Map

This document maps the current CRM, Selling, Accounts, and HRM screens to the files and data that control them. It is the working guide for a full redesign while preserving existing business data and actions.

> For the app-by-app design direction, route ownership and theming rules, read `APP_DESIGN_PLAN.md`. This file stays the screen-to-file map.

## Three UI layers in this repository

| Layer | What it controls | Current files | Live Desk UI? |
| --- | --- | --- | --- |
| Shared Frappe Desk styling | Desk navigation, headers, lists, forms, cards, fields, buttons, light/dark tokens | `launcher.css`, `launcher.js`, `site_config.json` | Yes. The local site config references the launcher assets. |
| Rapport CRM visual prototype | Standalone React/TanStack CRM concept with Overview, Pipeline, Customers, Schedule, Finance, Growth, Projects | `design/src/routes/`, `design/src/components/crm/`, `design/src/lib/crm-data.ts`, `design/src/styles.css` | No. It is separate from live Desk routes and live data. |
| Older custom CRM Desk implementation | Custom CRM shell and page renderers that call Frappe client APIs | `crm-core.js`, `crm-pages.js`, `crm.css` | Not via the current site config; only launcher assets are included there. |

The screenshot URL `/desk/crm/lead` is a native Frappe Lead list. It is not rendered by the React prototype or by `crm-pages.js`.

## Quick answer: which files should change?

- Shared look across Desk modules: design tokens and shared selectors in `launcher.css`; theme toggle and route behavior in `launcher.js`.
- A custom CRM page layout: build it in a Frappe custom app, or intentionally wire the older `crm-core.js` + `crm-pages.js` implementation into the site. The `design/` prototype does not replace Desk pages by itself.
- One DocType list, such as Lead or Sales Invoice: use that DocType's list override in a Frappe custom app (`doctype_list_js`).
- One DocType form, such as Employee or Account: use that DocType's form override (`doctype_js`).
- A Workspace landing page such as Accounts App or HRM App: edit its sections, shortcuts, number cards, and links. The setup scripts create Workspace content, but the saved Workspace is database content.
- Live values in cards, tables, and charts: fetch them from Frappe DocTypes, reports, or APIs. Do not use prototype sample data from `design/src/lib/crm-data.ts` in production screens.

## Module-by-module map

### 1. CRM

**Current live entry points**

- Lead list from the screenshot: `/desk/crm/lead`.
- Related native records: Opportunity, Customer, Contact, Campaign, Communication, ToDo, and Event.
- CRM routes receive an extra visual class and page guidance from `launcher.js`.

| Goal | File/layer |
| --- | --- |
| Restyle the shared Desk shell, native lists, forms, filters, and buttons | `launcher.css` |
| Change CRM route detection, theme toggle, page guide, or launcher workspace additions | `launcher.js` |
| Change the standalone Rapport CRM design | `design/src/routes/index.tsx`, `pipeline.tsx`, `customers.tsx`, `schedule.tsx`, `finance.tsx`, `growth.tsx`, `projects.tsx`; common shell in `design/src/components/crm/shell.tsx`; tokens in `design/src/styles.css` |
| Change the older custom CRM shell, overlays, routing, and Frappe API helpers | `crm-core.js` |
| Change individual screens in the older custom CRM | `crm-pages.js`: `CRM.pages.overview`, `pipeline`, `customers`, `schedule`, `finance`, `growth`, `projects`, `operations`, `settings` |
| Change the older custom CRM visual system | `crm.css`, scoped to `#jd-crm` and `.jd-` selectors |

**Data/content**

- Live records come from Frappe DocTypes such as Lead, Opportunity, Customer, Contact, Campaign, ToDo, and Event.
- `crm-core.js` exposes helpers such as `CRM.list`, `CRM.setVal`, `CRM.insertDoc`, and `CRM.xcall`. `crm-pages.js` uses them to render the older custom implementation.
- `design/src/lib/crm-data.ts` contains illustrative in-memory deals, people, and customers for the prototype; it is not live CRM data.
- `seed_crm.py` and `crm_setup*.py` are setup/seed scripts, not page-rendering files.

**Important:** `crm-core.js`, `crm-pages.js`, and `crm.css` are not currently listed in `site_config.json`. Editing them alone will not change the screenshot page.

### 2. Selling

In this setup, the Sales launcher entry opens the CRM/Selling workspace. Its flow includes native records such as Quotation, Sales Order, Delivery Note, Sales Invoice, Item, and POS.

| Goal | File/layer |
| --- | --- |
| Change the Sales launcher tile, route label, or links added by the launcher | `launcher.js`: `APPS` and `render_crm_context` |
| Apply the shared Desk redesign to native Selling lists/forms | `launcher.css` |
| Redesign one list, such as Quotation or Sales Invoice | Frappe custom-app DocType list override (`doctype_list_js`) |
| Redesign one form, such as Sales Order or Delivery Note | Frappe custom-app DocType form override (`doctype_js`) |
| Change the fully custom dashboard/pipeline concept | `crm-pages.js` + `crm-core.js` + `crm.css`, after deliberately wiring those assets into the app |

**Data/content**

- Business records are native ERPNext DocTypes: Quotation, Sales Order, Delivery Note, Sales Invoice, Item, and related customer/contact records.
- `seed_crm.py` may create sample records; it does not define native list or form layouts.
- Workspace links and flow labels belong in `launcher.js` or the saved Frappe Workspace, depending on which element is being changed.

### 3. Accounts

**Current entry point**

- The Accounts workspace is created as `Accounts App`. `accounts_setup.py` prints the route `/app/accounts-app`.
- Its links open native Accounts records and reports; each target loads the standard ERPNext/Frappe list or form for that DocType.

| Goal | File/layer |
| --- | --- |
| Change shared Desk shell and Accounts list/form styling | `launcher.css` |
| Change launcher tile or route label | `launcher.js`: `APPS` |
| Change Accounts Workspace sections, shortcuts, cards, and report links | Saved Workspace document `Accounts App`; initial `workspace_content` is in `accounts_setup.py` |
| Redesign an Account, Journal Entry, Payment Entry, Sales Invoice, or Bank Account list | Frappe custom-app DocType list override (`doctype_list_js`) |
| Redesign a specific Accounts form | Frappe custom-app DocType form override (`doctype_js`) |

**Data/content**

- Live accounting data is stored in native ERPNext DocTypes such as Account, Journal Entry, Payment Entry, Sales Invoice, Purchase Invoice, Bank Account, and Cost Center.
- `accounts_setup.py` creates/configures payment terms, tax templates, number cards, charts, the Accounts Workspace, and roles. It is setup/data configuration, not the runtime renderer for every Accounts screen.
- `accounts_fix.py` and `accounts_fix2.py` are repair scripts, not the normal place to implement visual design.

### 4. HRM

**Current entry point**

- The HRM workspace is `HRM App`, created by `hrm_setup.py` / `hrm_fix.py`.
- Its links open native HRMS lists, forms, and reports.

| Goal | File/layer |
| --- | --- |
| Change shared Desk shell and light/dark tokens | `launcher.css` |
| Change launcher tile or route label | `launcher.js`: `APPS` |
| Change HRM Workspace sections, shortcuts, cards, and links | Saved Workspace document `HRM App`; initial layout is in `hrm_setup.py`; a later workspace definition is in `hrm_fix.py` |
| Change an Employee, Leave Application, Attendance, Salary Slip, or Job Applicant list | Frappe custom-app DocType list override (`doctype_list_js`) |
| Change a specific HR form | Frappe custom-app DocType form override (`doctype_js`) |

**Data/content**

- Live data is in HRMS DocTypes such as Employee, Department, Leave Application, Attendance, Shift Assignment, Salary Slip, Expense Claim, Job Applicant, and Appraisal.
- `hrm_setup.py`, `hrm_fix.py`, `hrm_final_fix.py`, and other `hrm_*` files configure or repair records and Workspace content. They are not a per-screen frontend component system.
- HRM cards read configured Number Cards/reports; setup scripts name and connect those cards.

## Data versus presentation

| Change… | Update… |
| --- | --- |
| Background, spacing, typography, shared sidebar/header, theme colors | Shared CSS tokens/selectors in `launcher.css` |
| Light/dark switch and saved preference | `launcher.js` |
| Links and sections on a Workspace | Workspace document, then version/export it in the custom app |
| Fields/columns in one DocType list | DocType list settings or `doctype_list_js` |
| Sections/field arrangement in one DocType form | DocType layout/custom fields or `doctype_js` |
| Number or chart value | Number Card/Dashboard Chart/report/query and live DocType data |
| A business record's actual value | Its Frappe/ERPNext/HRMS document, not CSS or markup |
| A fully custom data-driven page | Frappe Page/custom-app frontend and Frappe API methods |

The safest full redesign keeps DocTypes, permissions, validation, and actions intact and replaces presentation through reusable components. Avoid editing Frappe or ERPNext core files; updates can overwrite those changes.

## Recommended structure for the full redesign

This repository is a Frappe Docker deployment repo; it does not currently contain a dedicated Frappe custom app for JassDBX UI overrides. The launcher assets are useful for shared styling, but a complete, update-friendly redesign should live in a custom app, for example:

    jassdbx_ui/
      hooks.py                         # app-wide assets and page hooks
      public/
        css/desk-theme.css             # shared light/dark tokens and shell
        js/desk-theme.js               # theme toggle and shared behavior
        js/doctype/
          lead_list.js                 # optional per-DocType list behavior
          employee_form.js             # optional per-DocType form behavior
      jassdbx_ui/
        workspace/
          accounts_app/                # versioned Workspace layout
          hrm_app/
        page/
          crm_overview/                # custom page only when needed

Use Frappe hooks `app_include_css` / `app_include_js` for shared assets and `doctype_list_js` / `doctype_js` for targeted DocType overrides. Keep route-specific selectors/classes so CRM styles do not accidentally affect HRM or Accounts. Use Frappe APIs and permissions for data; keep visual code separate from setup scripts.

## Current asset loading and deployment

- `site_config.json` references `/files/jd/launcher.js` and `/files/jd/launcher.css`.
- Repository files are source copies. The running site's File records under `/files/jd/` must also contain the latest copies for the browser to receive changes.
- The `rev` query parameter in `site_config.json` is used to bust browser caches after asset updates.
- Docker/server access was unavailable during this mapping task, so this document records the repo integration and deployment boundary; it does not claim every prototype/custom asset is live.

## Suggested redesign order

1. Finalize one shared design system: light/dark colors, typography, density, spacing, focus states, and responsive rules.
2. Redesign the Desk shell and common native components once: navigation, page title/actions, filters, tables, cards, inputs, and form sections.
3. Refine CRM and Selling screens: Lead list/detail, Opportunity pipeline/detail, Customer, Quotation, Sales Order, Delivery, and Invoice.
4. Apply the component system to Accounts: workspace, account list/tree, invoices, payments, journals, and reports.
5. Apply it to HRM: workspace, Employee, attendance/leave, payroll, and recruitment.
6. Tune each module's workspace and unique workflows without changing the underlying records or permissions.
7. Validate representative list, form/detail, workspace, report, empty/loading, responsive, and dark-mode states before rolling out to all DocTypes.

## Runtime frontend source inventory (verified from the running image)

The container image in `pwd.yml` is ERPNext `v16.51.1`; the site has the `frappe`, `erpnext`, and `hrms` apps installed. The following appendix lists every source `.js`, `.css`, `.html`, and `.vue` file found under the listed CRM, Selling, Accounts, related ERPNext master/stock, and HRMS module source roots in that running image. Paths are relative to `/home/frappe/frappe-bench/`. Generated `public/dist` bundles and `node_modules` are intentionally excluded; those are build outputs, not the source files to edit.

The shared Frappe list/form/workspace renderer is separate and used by all four modules. Its main source roots are `apps/frappe/frappe/public/js/frappe/list/`, `apps/frappe/frappe/public/js/frappe/form/`, and `apps/frappe/frappe/public/js/frappe/views/`; shared Desk theme CSS lives in `apps/frappe/frappe/public/scss/desk/` and `apps/frappe/frappe/public/scss/common/`. Use these paths to understand which shared renderer owns a visual element. Do not patch these core files for the redesign; put overrides in the JassDBX custom app.

### ERPNext CRM module source files


#### ERPNext CRM

    apps/erpnext/erpnext/crm/doctype/appointment/appointment.js
    apps/erpnext/erpnext/crm/doctype/appointment_booking_settings/appointment_booking_settings.js
    apps/erpnext/erpnext/crm/doctype/campaign/campaign.js
    apps/erpnext/erpnext/crm/doctype/competitor/competitor.js
    apps/erpnext/erpnext/crm/doctype/contract/contract.js
    apps/erpnext/erpnext/crm/doctype/contract/contract_list.js
    apps/erpnext/erpnext/crm/doctype/contract_fulfilment_checklist/contract_fulfilment_checklist.js
    apps/erpnext/erpnext/crm/doctype/contract_template/contract_template.js
    apps/erpnext/erpnext/crm/doctype/crm_settings/crm_settings.js
    apps/erpnext/erpnext/crm/doctype/email_campaign/email_campaign.js
    apps/erpnext/erpnext/crm/doctype/email_campaign/email_campaign_list.js
    apps/erpnext/erpnext/crm/doctype/lead/lead.js
    apps/erpnext/erpnext/crm/doctype/lead/lead_kanban.js
    apps/erpnext/erpnext/crm/doctype/lead/lead_list.js
    apps/erpnext/erpnext/crm/doctype/lost_reason_detail/lost_reason_detail.js
    apps/erpnext/erpnext/crm/doctype/market_segment/market_segment.js
    apps/erpnext/erpnext/crm/doctype/opportunity/opportunity.js
    apps/erpnext/erpnext/crm/doctype/opportunity/opportunity_kanban.js
    apps/erpnext/erpnext/crm/doctype/opportunity/opportunity_list.js
    apps/erpnext/erpnext/crm/doctype/opportunity_lost_reason/opportunity_lost_reason.js
    apps/erpnext/erpnext/crm/doctype/opportunity_type/opportunity_type.js
    apps/erpnext/erpnext/crm/doctype/prospect/prospect.js
    apps/erpnext/erpnext/crm/doctype/sales_stage/sales_stage.js
    apps/erpnext/erpnext/crm/report/campaign_efficiency/campaign_efficiency.js
    apps/erpnext/erpnext/crm/report/first_response_time_for_opportunity/first_response_time_for_opportunity.js
    apps/erpnext/erpnext/crm/report/lead_conversion_time/lead_conversion_time.js
    apps/erpnext/erpnext/crm/report/lead_details/lead_details.js
    apps/erpnext/erpnext/crm/report/lead_owner_efficiency/lead_owner_efficiency.js
    apps/erpnext/erpnext/crm/report/lost_opportunity/lost_opportunity.js
    apps/erpnext/erpnext/crm/report/opportunity_summary_by_sales_stage/opportunity_summary_by_sales_stage.js
    apps/erpnext/erpnext/crm/report/prospects_engaged_but_not_converted/prospects_engaged_but_not_converted.js
    apps/erpnext/erpnext/crm/report/sales_pipeline_analytics/sales_pipeline_analytics.js

#### ERPNext Selling

    apps/erpnext/erpnext/selling/doctype/customer/customer.js
    apps/erpnext/erpnext/selling/doctype/customer/customer_list.js
    apps/erpnext/erpnext/selling/doctype/delivery_schedule_item/delivery_schedule_item.js
    apps/erpnext/erpnext/selling/doctype/industry_type/industry_type.js
    apps/erpnext/erpnext/selling/doctype/installation_note/installation_note.js
    apps/erpnext/erpnext/selling/doctype/party_specific_item/party_specific_item.js
    apps/erpnext/erpnext/selling/doctype/product_bundle/product_bundle.js
    apps/erpnext/erpnext/selling/doctype/product_bundle/product_bundle_list.js
    apps/erpnext/erpnext/selling/doctype/quotation/quotation.js
    apps/erpnext/erpnext/selling/doctype/quotation/quotation_list.js
    apps/erpnext/erpnext/selling/doctype/sales_order/sales_order.js
    apps/erpnext/erpnext/selling/doctype/sales_order/sales_order_calendar.js
    apps/erpnext/erpnext/selling/doctype/sales_order/sales_order_list.js
    apps/erpnext/erpnext/selling/doctype/sales_partner_type/sales_partner_type.js
    apps/erpnext/erpnext/selling/doctype/selling_settings/selling_settings.js
    apps/erpnext/erpnext/selling/doctype/sms_center/sms_center.js
    apps/erpnext/erpnext/selling/page/point_of_sale/point_of_sale.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_controller.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_item_cart.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_item_details.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_item_selector.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_number_pad.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_past_order_list.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_past_order_summary.js
    apps/erpnext/erpnext/selling/page/point_of_sale/pos_payment.js
    apps/erpnext/erpnext/selling/page/sales_funnel/sales_funnel.css
    apps/erpnext/erpnext/selling/page/sales_funnel/sales_funnel.js
    apps/erpnext/erpnext/selling/report/address_and_contacts/address_and_contacts.js
    apps/erpnext/erpnext/selling/report/available_stock_for_packing_items/available_stock_for_packing_items.js
    apps/erpnext/erpnext/selling/report/customer_acquisition_and_loyalty/customer_acquisition_and_loyalty.js
    apps/erpnext/erpnext/selling/report/customer_credit_balance/customer_credit_balance.js
    apps/erpnext/erpnext/selling/report/customer_wise_item_price/customer_wise_item_price.js
    apps/erpnext/erpnext/selling/report/customers_without_any_sales_transactions/customers_without_any_sales_transactions.js
    apps/erpnext/erpnext/selling/report/inactive_customers/inactive_customers.js
    apps/erpnext/erpnext/selling/report/item_wise_sales_history/item_wise_sales_history.js
    apps/erpnext/erpnext/selling/report/lost_quotations/lost_quotations.js
    apps/erpnext/erpnext/selling/report/payment_terms_status_for_sales_order/payment_terms_status_for_sales_order.js
    apps/erpnext/erpnext/selling/report/pending_so_items_for_purchase_request/pending_so_items_for_purchase_request.js
    apps/erpnext/erpnext/selling/report/quotation_trends/quotation_trends.js
    apps/erpnext/erpnext/selling/report/sales_analytics/sales_analytics.js
    apps/erpnext/erpnext/selling/report/sales_order_analysis/sales_order_analysis.js
    apps/erpnext/erpnext/selling/report/sales_order_trends/sales_order_trends.js
    apps/erpnext/erpnext/selling/report/sales_partner_commission_summary/sales_partner_commission_summary.js
    apps/erpnext/erpnext/selling/report/sales_partner_target_variance_based_on_item_group/sales_partner_target_variance_based_on_item_group.js
    apps/erpnext/erpnext/selling/report/sales_partner_transaction_summary/sales_partner_transaction_summary.js
    apps/erpnext/erpnext/selling/report/sales_person_commission_summary/sales_person_commission_summary.js
    apps/erpnext/erpnext/selling/report/sales_person_target_variance_based_on_item_group/sales_person_target_variance_based_on_item_group.js
    apps/erpnext/erpnext/selling/report/sales_person_wise_transaction_summary/sales_person_wise_transaction_summary.js
    apps/erpnext/erpnext/selling/report/territory_target_variance_based_on_item_group/territory_target_variance_based_on_item_group.js
    apps/erpnext/erpnext/selling/report/territory_wise_sales/territory_wise_sales.js

#### ERPNext Accounts

    apps/erpnext/erpnext/accounts/dashboard_chart_source/account_balance_timeline/account_balance_timeline.js
    apps/erpnext/erpnext/accounts/doctype/account/account.js
    apps/erpnext/erpnext/accounts/doctype/account/account_tree.js
    apps/erpnext/erpnext/accounts/doctype/account_category/account_category.js
    apps/erpnext/erpnext/accounts/doctype/account_closing_balance/account_closing_balance.js
    apps/erpnext/erpnext/accounts/doctype/accounting_dimension/accounting_dimension.js
    apps/erpnext/erpnext/accounts/doctype/accounting_dimension_filter/accounting_dimension_filter.js
    apps/erpnext/erpnext/accounts/doctype/accounting_period/accounting_period.js
    apps/erpnext/erpnext/accounts/doctype/accounts_settings/accounts_settings.js
    apps/erpnext/erpnext/accounts/doctype/accounts_settings/regional/united_states.js
    apps/erpnext/erpnext/accounts/doctype/advance_payment_ledger_entry/advance_payment_ledger_entry.js
    apps/erpnext/erpnext/accounts/doctype/bank/bank.js
    apps/erpnext/erpnext/accounts/doctype/bank_account/bank_account.js
    apps/erpnext/erpnext/accounts/doctype/bank_account_balance/bank_account_balance.js
    apps/erpnext/erpnext/accounts/doctype/bank_account_subtype/bank_account_subtype.js
    apps/erpnext/erpnext/accounts/doctype/bank_account_type/bank_account_type.js
    apps/erpnext/erpnext/accounts/doctype/bank_clearance/bank_clearance.js
    apps/erpnext/erpnext/accounts/doctype/bank_guarantee/bank_guarantee.js
    apps/erpnext/erpnext/accounts/doctype/bank_reconciliation_tool/bank_reconciliation_tool.js
    apps/erpnext/erpnext/accounts/doctype/bank_statement_import/bank_statement_import.css
    apps/erpnext/erpnext/accounts/doctype/bank_statement_import/bank_statement_import.js
    apps/erpnext/erpnext/accounts/doctype/bank_statement_import/bank_statement_import_list.js
    apps/erpnext/erpnext/accounts/doctype/bank_statement_import_log/bank_statement_import_log.js
    apps/erpnext/erpnext/accounts/doctype/bank_transaction/bank_transaction.js
    apps/erpnext/erpnext/accounts/doctype/bank_transaction/bank_transaction_list.js
    apps/erpnext/erpnext/accounts/doctype/bank_transaction_rule/bank_transaction_rule.js
    apps/erpnext/erpnext/accounts/doctype/bisect_accounting_statements/bisect_accounting_statements.js
    apps/erpnext/erpnext/accounts/doctype/bisect_nodes/bisect_nodes.js
    apps/erpnext/erpnext/accounts/doctype/budget/budget.js
    apps/erpnext/erpnext/accounts/doctype/cashier_closing/cashier_closing.js
    apps/erpnext/erpnext/accounts/doctype/chart_of_accounts_importer/chart_of_accounts_importer.js
    apps/erpnext/erpnext/accounts/doctype/cheque_print_template/cheque_print_template.js
    apps/erpnext/erpnext/accounts/doctype/cost_center/cost_center.js
    apps/erpnext/erpnext/accounts/doctype/cost_center/cost_center_tree.js
    apps/erpnext/erpnext/accounts/doctype/cost_center_allocation/cost_center_allocation.js
    apps/erpnext/erpnext/accounts/doctype/coupon_code/coupon_code.js
    apps/erpnext/erpnext/accounts/doctype/currency_exchange_settings/currency_exchange_settings.js
    apps/erpnext/erpnext/accounts/doctype/dunning/dunning.js
    apps/erpnext/erpnext/accounts/doctype/dunning/dunning_list.js
    apps/erpnext/erpnext/accounts/doctype/dunning_type/dunning_type.js
    apps/erpnext/erpnext/accounts/doctype/exchange_rate_revaluation/exchange_rate_revaluation.js
    apps/erpnext/erpnext/accounts/doctype/finance_book/finance_book.js
    apps/erpnext/erpnext/accounts/doctype/financial_report_template/financial_report_template.js
    apps/erpnext/erpnext/accounts/doctype/fiscal_year/fiscal_year.js
    apps/erpnext/erpnext/accounts/doctype/gl_entry/gl_entry.js
    apps/erpnext/erpnext/accounts/doctype/invoice_discounting/invoice_discounting.js
    apps/erpnext/erpnext/accounts/doctype/invoice_discounting/invoice_discounting_list.js
    apps/erpnext/erpnext/accounts/doctype/item_tax_template/item_tax_template.js
    apps/erpnext/erpnext/accounts/doctype/journal_entry/journal_entry.js
    apps/erpnext/erpnext/accounts/doctype/journal_entry/journal_entry_list.js
    apps/erpnext/erpnext/accounts/doctype/journal_entry_template/journal_entry_template.js
    apps/erpnext/erpnext/accounts/doctype/ledger_health/ledger_health.js
    apps/erpnext/erpnext/accounts/doctype/ledger_health_monitor/ledger_health_monitor.js
    apps/erpnext/erpnext/accounts/doctype/ledger_merge/ledger_merge.js
    apps/erpnext/erpnext/accounts/doctype/loyalty_point_entry/loyalty_point_entry.js
    apps/erpnext/erpnext/accounts/doctype/loyalty_program/loyalty_program.js
    apps/erpnext/erpnext/accounts/doctype/mode_of_payment/mode_of_payment.js
    apps/erpnext/erpnext/accounts/doctype/monthly_distribution/monthly_distribution.js
    apps/erpnext/erpnext/accounts/doctype/opening_invoice_creation_tool/opening_invoice_creation_tool.js
    apps/erpnext/erpnext/accounts/doctype/opening_invoice_creation_tool/opening_invoice_creation_tool_dashboard.html
    apps/erpnext/erpnext/accounts/doctype/party_link/party_link.js
    apps/erpnext/erpnext/accounts/doctype/payment_entry/payment_entry.js
    apps/erpnext/erpnext/accounts/doctype/payment_entry/payment_entry_list.js
    apps/erpnext/erpnext/accounts/doctype/payment_gateway_account/payment_gateway_account.js
    apps/erpnext/erpnext/accounts/doctype/payment_ledger_entry/payment_ledger_entry.js
    apps/erpnext/erpnext/accounts/doctype/payment_order/payment_order.js
    apps/erpnext/erpnext/accounts/doctype/payment_reconciliation/payment_reconciliation.js
    apps/erpnext/erpnext/accounts/doctype/payment_request/payment_request.js
    apps/erpnext/erpnext/accounts/doctype/payment_request/payment_request_list.js
    apps/erpnext/erpnext/accounts/doctype/payment_term/payment_term.js
    apps/erpnext/erpnext/accounts/doctype/payment_terms_template/payment_terms_template.js
    apps/erpnext/erpnext/accounts/doctype/pegged_currencies/pegged_currencies.js
    apps/erpnext/erpnext/accounts/doctype/period_closing_voucher/period_closing_voucher.js
    apps/erpnext/erpnext/accounts/doctype/pos_closing_entry/closing_voucher_details.html
    apps/erpnext/erpnext/accounts/doctype/pos_closing_entry/pos_closing_entry.js
    apps/erpnext/erpnext/accounts/doctype/pos_closing_entry/pos_closing_entry_list.js
    apps/erpnext/erpnext/accounts/doctype/pos_invoice/pos_invoice.js
    apps/erpnext/erpnext/accounts/doctype/pos_invoice/pos_invoice_list.js
    apps/erpnext/erpnext/accounts/doctype/pos_invoice_merge_log/pos_invoice_merge_log.js
    apps/erpnext/erpnext/accounts/doctype/pos_opening_entry/pos_opening_entry.js
    apps/erpnext/erpnext/accounts/doctype/pos_opening_entry/pos_opening_entry_list.js
    apps/erpnext/erpnext/accounts/doctype/pos_profile/pos_profile.js
    apps/erpnext/erpnext/accounts/doctype/pos_profile_user/pos_profile_user.js
    apps/erpnext/erpnext/accounts/doctype/pos_settings/pos_settings.js
    apps/erpnext/erpnext/accounts/doctype/pricing_rule/pricing_rule.js
    apps/erpnext/erpnext/accounts/doctype/process_deferred_accounting/process_deferred_accounting.js
    apps/erpnext/erpnext/accounts/doctype/process_payment_reconciliation/process_payment_reconciliation.js
    apps/erpnext/erpnext/accounts/doctype/process_payment_reconciliation/process_payment_reconciliation_list.js
    apps/erpnext/erpnext/accounts/doctype/process_payment_reconciliation_log/process_payment_reconciliation_log.js
    apps/erpnext/erpnext/accounts/doctype/process_payment_reconciliation_log/process_payment_reconciliation_log_list.js
    apps/erpnext/erpnext/accounts/doctype/process_period_closing_voucher/process_period_closing_voucher.js
    apps/erpnext/erpnext/accounts/doctype/process_period_closing_voucher/process_period_closing_voucher_list.js
    apps/erpnext/erpnext/accounts/doctype/process_statement_of_accounts/process_statement_of_accounts.html
    apps/erpnext/erpnext/accounts/doctype/process_statement_of_accounts/process_statement_of_accounts.js
    apps/erpnext/erpnext/accounts/doctype/process_statement_of_accounts/process_statement_of_accounts_accounts_receivable.html
    apps/erpnext/erpnext/accounts/doctype/process_subscription/process_subscription.js
    apps/erpnext/erpnext/accounts/doctype/promotional_scheme/promotional_scheme.js
    apps/erpnext/erpnext/accounts/doctype/purchase_invoice/purchase_invoice.js
    apps/erpnext/erpnext/accounts/doctype/purchase_invoice/purchase_invoice_list.js
    apps/erpnext/erpnext/accounts/doctype/purchase_taxes_and_charges_template/purchase_taxes_and_charges_template.js
    apps/erpnext/erpnext/accounts/doctype/repost_accounting_ledger/repost_accounting_ledger.html
    apps/erpnext/erpnext/accounts/doctype/repost_accounting_ledger/repost_accounting_ledger.js
    apps/erpnext/erpnext/accounts/doctype/repost_accounting_ledger/repost_accounting_ledger_list.js
    apps/erpnext/erpnext/accounts/doctype/repost_payment_ledger/repost_payment_ledger.js
    apps/erpnext/erpnext/accounts/doctype/repost_payment_ledger/repost_payment_ledger_list.js
    apps/erpnext/erpnext/accounts/doctype/sales_invoice/regional/italy.js
    apps/erpnext/erpnext/accounts/doctype/sales_invoice/sales_invoice.js
    apps/erpnext/erpnext/accounts/doctype/sales_invoice/sales_invoice_list.js
    apps/erpnext/erpnext/accounts/doctype/sales_taxes_and_charges_template/sales_taxes_and_charges_template.js
    apps/erpnext/erpnext/accounts/doctype/share_transfer/share_transfer.js
    apps/erpnext/erpnext/accounts/doctype/share_type/share_type.js
    apps/erpnext/erpnext/accounts/doctype/shareholder/shareholder.js
    apps/erpnext/erpnext/accounts/doctype/shipping_rule/shipping_rule.js
    apps/erpnext/erpnext/accounts/doctype/subscription/subscription.js
    apps/erpnext/erpnext/accounts/doctype/subscription/subscription_list.js
    apps/erpnext/erpnext/accounts/doctype/subscription_invoice/subscription_invoice.js
    apps/erpnext/erpnext/accounts/doctype/subscription_plan/subscription_plan.js
    apps/erpnext/erpnext/accounts/doctype/subscription_settings/subscription_settings.js
    apps/erpnext/erpnext/accounts/doctype/tax_category/tax_category.js
    apps/erpnext/erpnext/accounts/doctype/tax_rule/tax_rule.js
    apps/erpnext/erpnext/accounts/doctype/tax_withholding_category/tax_withholding_category.js
    apps/erpnext/erpnext/accounts/doctype/tax_withholding_group/tax_withholding_group.js
    apps/erpnext/erpnext/accounts/doctype/unreconcile_payment/unreconcile_payment.js
    apps/erpnext/erpnext/accounts/letterhead/company_letterhead.html
    apps/erpnext/erpnext/accounts/letterhead/company_letterhead_grey.html
    apps/erpnext/erpnext/accounts/notification/notification_for_new_fiscal_year/notification_for_new_fiscal_year.html
    apps/erpnext/erpnext/accounts/print_format/bank_and_cash_payment_voucher/bank_and_cash_payment_voucher.html
    apps/erpnext/erpnext/accounts/print_format/journal_auditing_voucher/journal_auditing_voucher.html
    apps/erpnext/erpnext/accounts/print_format/payment_receipt_voucher/payment_receipt_voucher.html
    apps/erpnext/erpnext/accounts/print_format/purchase_auditing_voucher/purchase_auditing_voucher.html
    apps/erpnext/erpnext/accounts/print_format/sales_auditing_voucher/sales_auditing_voucher.html
    apps/erpnext/erpnext/accounts/print_format/sales_invoice_return/sales_invoice_return.html
    apps/erpnext/erpnext/accounts/report/account_balance/account_balance.js
    apps/erpnext/erpnext/accounts/report/accounts_payable/accounts_payable.html
    apps/erpnext/erpnext/accounts/report/accounts_payable/accounts_payable.js
    apps/erpnext/erpnext/accounts/report/accounts_payable_summary/accounts_payable_summary.html
    apps/erpnext/erpnext/accounts/report/accounts_payable_summary/accounts_payable_summary.js
    apps/erpnext/erpnext/accounts/report/accounts_receivable/accounts_receivable.html
    apps/erpnext/erpnext/accounts/report/accounts_receivable/accounts_receivable.js
    apps/erpnext/erpnext/accounts/report/accounts_receivable_summary/accounts_receivable_summary.html
    apps/erpnext/erpnext/accounts/report/accounts_receivable_summary/accounts_receivable_summary.js
    apps/erpnext/erpnext/accounts/report/asset_depreciation_ledger/asset_depreciation_ledger.js
    apps/erpnext/erpnext/accounts/report/asset_depreciations_and_balances/asset_depreciations_and_balances.js
    apps/erpnext/erpnext/accounts/report/balance_sheet/balance_sheet.html
    apps/erpnext/erpnext/accounts/report/balance_sheet/balance_sheet.js
    apps/erpnext/erpnext/accounts/report/bank_clearance_summary/bank_clearance_summary.js
    apps/erpnext/erpnext/accounts/report/bank_reconciliation_statement/bank_reconciliation_statement.html
    apps/erpnext/erpnext/accounts/report/bank_reconciliation_statement/bank_reconciliation_statement.js
    apps/erpnext/erpnext/accounts/report/billed_items_to_be_received/billed_items_to_be_received.js
    apps/erpnext/erpnext/accounts/report/budget_variance_report/budget_variance_report.js
    apps/erpnext/erpnext/accounts/report/calculated_discount_mismatch/calculated_discount_mismatch.js
    apps/erpnext/erpnext/accounts/report/cash_flow/cash_flow.html
    apps/erpnext/erpnext/accounts/report/cash_flow/cash_flow.js
    apps/erpnext/erpnext/accounts/report/cheques_and_deposits_incorrectly_cleared/cheques_and_deposits_incorrectly_cleared.js
    apps/erpnext/erpnext/accounts/report/consolidated_financial_statement/consolidated_financial_statement.js
    apps/erpnext/erpnext/accounts/report/consolidated_trial_balance/consolidated_trial_balance.html
    apps/erpnext/erpnext/accounts/report/consolidated_trial_balance/consolidated_trial_balance.js
    apps/erpnext/erpnext/accounts/report/custom_financial_statement/custom_financial_statement.js
    apps/erpnext/erpnext/accounts/report/customer_ledger_summary/customer_ledger_summary.js
    apps/erpnext/erpnext/accounts/report/deferred_revenue_and_expense/deferred_revenue_and_expense.js
    apps/erpnext/erpnext/accounts/report/delivered_items_to_be_billed/delivered_items_to_be_billed.js
    apps/erpnext/erpnext/accounts/report/dimension_wise_accounts_balance_report/dimension_wise_accounts_balance_report.js
    apps/erpnext/erpnext/accounts/report/financial_ratios/financial_ratios.js
    apps/erpnext/erpnext/accounts/report/financial_statements.html
    apps/erpnext/erpnext/accounts/report/general_and_payment_ledger_comparison/general_and_payment_ledger_comparison.js
    apps/erpnext/erpnext/accounts/report/general_ledger/general_ledger.html
    apps/erpnext/erpnext/accounts/report/general_ledger/general_ledger.js
    apps/erpnext/erpnext/accounts/report/gross_and_net_profit_report/gross_and_net_profit_report.html
    apps/erpnext/erpnext/accounts/report/gross_and_net_profit_report/gross_and_net_profit_report.js
    apps/erpnext/erpnext/accounts/report/gross_profit/gross_profit.js
    apps/erpnext/erpnext/accounts/report/inactive_sales_items/inactive_sales_items.js
    apps/erpnext/erpnext/accounts/report/invalid_ledger_entries/invalid_ledger_entries.js
    apps/erpnext/erpnext/accounts/report/item_wise_purchase_register/item_wise_purchase_register.js
    apps/erpnext/erpnext/accounts/report/item_wise_sales_register/item_wise_sales_register.js
    apps/erpnext/erpnext/accounts/report/payment_ledger/payment_ledger.js
    apps/erpnext/erpnext/accounts/report/payment_period_based_on_invoice_date/payment_period_based_on_invoice_date.js
    apps/erpnext/erpnext/accounts/report/pos_register/pos_register.js
    apps/erpnext/erpnext/accounts/report/profit_and_loss_statement/profit_and_loss_statement.html
    apps/erpnext/erpnext/accounts/report/profit_and_loss_statement/profit_and_loss_statement.js
    apps/erpnext/erpnext/accounts/report/profitability_analysis/profitability_analysis.html
    apps/erpnext/erpnext/accounts/report/profitability_analysis/profitability_analysis.js
    apps/erpnext/erpnext/accounts/report/purchase_invoice_trends/purchase_invoice_trends.js
    apps/erpnext/erpnext/accounts/report/purchase_register/purchase_register.js
    apps/erpnext/erpnext/accounts/report/received_items_to_be_billed/received_items_to_be_billed.js
    apps/erpnext/erpnext/accounts/report/sales_invoice_trends/sales_invoice_trends.js
    apps/erpnext/erpnext/accounts/report/sales_payment_summary/sales_payment_summary.js
    apps/erpnext/erpnext/accounts/report/sales_register/sales_register.js
    apps/erpnext/erpnext/accounts/report/share_balance/share_balance.js
    apps/erpnext/erpnext/accounts/report/share_ledger/share_ledger.js
    apps/erpnext/erpnext/accounts/report/supplier_ledger_summary/supplier_ledger_summary.js
    apps/erpnext/erpnext/accounts/report/tax_withholding_details/tax_withholding_details.js
    apps/erpnext/erpnext/accounts/report/tds_computation_summary/tds_computation_summary.js
    apps/erpnext/erpnext/accounts/report/trial_balance/trial_balance.html
    apps/erpnext/erpnext/accounts/report/trial_balance/trial_balance.js
    apps/erpnext/erpnext/accounts/report/trial_balance_for_party/trial_balance_for_party.js
    apps/erpnext/erpnext/accounts/report/voucher_wise_balance/voucher_wise_balance.js

#### ERPNext shared master DocTypes

    apps/erpnext/erpnext/setup/doctype/authorization_rule/authorization_rule.js
    apps/erpnext/erpnext/setup/doctype/branch/branch.js
    apps/erpnext/erpnext/setup/doctype/brand/brand.js
    apps/erpnext/erpnext/setup/doctype/company/company.js
    apps/erpnext/erpnext/setup/doctype/company/company_list.js
    apps/erpnext/erpnext/setup/doctype/company/company_tree.js
    apps/erpnext/erpnext/setup/doctype/currency_exchange/currency_exchange.js
    apps/erpnext/erpnext/setup/doctype/customer_group/customer_group.js
    apps/erpnext/erpnext/setup/doctype/customer_group/customer_group_tree.js
    apps/erpnext/erpnext/setup/doctype/department/department.js
    apps/erpnext/erpnext/setup/doctype/department/department_tree.js
    apps/erpnext/erpnext/setup/doctype/designation/designation.js
    apps/erpnext/erpnext/setup/doctype/driver/driver.js
    apps/erpnext/erpnext/setup/doctype/email_digest/email_digest.css
    apps/erpnext/erpnext/setup/doctype/email_digest/email_digest.js
    apps/erpnext/erpnext/setup/doctype/email_digest/templates/default.html
    apps/erpnext/erpnext/setup/doctype/employee/employee.js
    apps/erpnext/erpnext/setup/doctype/employee/employee_list.js
    apps/erpnext/erpnext/setup/doctype/employee/employee_tree.js
    apps/erpnext/erpnext/setup/doctype/employee_group/employee_group.js
    apps/erpnext/erpnext/setup/doctype/global_defaults/global_defaults.js
    apps/erpnext/erpnext/setup/doctype/holiday_list/holiday_list.js
    apps/erpnext/erpnext/setup/doctype/holiday_list/holiday_list_calendar.js
    apps/erpnext/erpnext/setup/doctype/incoterm/incoterm.js
    apps/erpnext/erpnext/setup/doctype/item_group/item_group.js
    apps/erpnext/erpnext/setup/doctype/item_group/item_group_tree.js
    apps/erpnext/erpnext/setup/doctype/party_type/party_type.js
    apps/erpnext/erpnext/setup/doctype/quotation_lost_reason/quotation_lost_reason.js
    apps/erpnext/erpnext/setup/doctype/sales_partner/sales_partner.js
    apps/erpnext/erpnext/setup/doctype/sales_person/sales_person.js
    apps/erpnext/erpnext/setup/doctype/sales_person/sales_person_tree.js
    apps/erpnext/erpnext/setup/doctype/supplier_group/supplier_group.js
    apps/erpnext/erpnext/setup/doctype/supplier_group/supplier_group_tree.js
    apps/erpnext/erpnext/setup/doctype/terms_and_conditions/terms_and_conditions.js
    apps/erpnext/erpnext/setup/doctype/territory/territory.js
    apps/erpnext/erpnext/setup/doctype/territory/territory_tree.js
    apps/erpnext/erpnext/setup/doctype/transaction_deletion_record/transaction_deletion_record.js
    apps/erpnext/erpnext/setup/doctype/transaction_deletion_record/transaction_deletion_record_list.js
    apps/erpnext/erpnext/setup/doctype/uom/uom.js
    apps/erpnext/erpnext/setup/doctype/uom_conversion_factor/uom_conversion_factor.js
    apps/erpnext/erpnext/setup/doctype/vehicle/vehicle.js

#### ERPNext stock and fulfillment DocTypes

    apps/erpnext/erpnext/stock/doctype/batch/batch.js
    apps/erpnext/erpnext/stock/doctype/batch/batch_list.js
    apps/erpnext/erpnext/stock/doctype/bin/bin.js
    apps/erpnext/erpnext/stock/doctype/customs_tariff_number/customs_tariff_number.js
    apps/erpnext/erpnext/stock/doctype/delivery_note/delivery_note.js
    apps/erpnext/erpnext/stock/doctype/delivery_note/delivery_note_list.js
    apps/erpnext/erpnext/stock/doctype/delivery_settings/delivery_settings.js
    apps/erpnext/erpnext/stock/doctype/delivery_trip/delivery_trip.js
    apps/erpnext/erpnext/stock/doctype/delivery_trip/delivery_trip_list.js
    apps/erpnext/erpnext/stock/doctype/delivery_trip/dispatch_notification_template.html
    apps/erpnext/erpnext/stock/doctype/inventory_dimension/inventory_dimension.js
    apps/erpnext/erpnext/stock/doctype/item/item.js
    apps/erpnext/erpnext/stock/doctype/item/item_list.js
    apps/erpnext/erpnext/stock/doctype/item/templates/item.html
    apps/erpnext/erpnext/stock/doctype/item/templates/item_row.html
    apps/erpnext/erpnext/stock/doctype/item_alternative/item_alternative.js
    apps/erpnext/erpnext/stock/doctype/item_attribute/item_attribute.js
    apps/erpnext/erpnext/stock/doctype/item_lead_time/item_lead_time.js
    apps/erpnext/erpnext/stock/doctype/item_manufacturer/item_manufacturer.js
    apps/erpnext/erpnext/stock/doctype/item_price/item_price.js
    apps/erpnext/erpnext/stock/doctype/item_price/item_price_list.js
    apps/erpnext/erpnext/stock/doctype/item_variant_settings/item_variant_settings.js
    apps/erpnext/erpnext/stock/doctype/landed_cost_voucher/landed_cost_voucher.js
    apps/erpnext/erpnext/stock/doctype/manufacturer/manufacturer.js
    apps/erpnext/erpnext/stock/doctype/material_request/material_request.js
    apps/erpnext/erpnext/stock/doctype/material_request/material_request_list.js
    apps/erpnext/erpnext/stock/doctype/packing_slip/packing_slip.js
    apps/erpnext/erpnext/stock/doctype/pick_list/pick_list.js
    apps/erpnext/erpnext/stock/doctype/pick_list/pick_list_list.js
    apps/erpnext/erpnext/stock/doctype/price_list/price_list.css
    apps/erpnext/erpnext/stock/doctype/price_list/price_list.js
    apps/erpnext/erpnext/stock/doctype/purchase_receipt/purchase_receipt.js
    apps/erpnext/erpnext/stock/doctype/purchase_receipt/purchase_receipt_list.js
    apps/erpnext/erpnext/stock/doctype/putaway_rule/putaway_rule.js
    apps/erpnext/erpnext/stock/doctype/putaway_rule/putaway_rule_list.js
    apps/erpnext/erpnext/stock/doctype/quality_inspection/quality_inspection.js
    apps/erpnext/erpnext/stock/doctype/quality_inspection_parameter/quality_inspection_parameter.js
    apps/erpnext/erpnext/stock/doctype/quality_inspection_parameter_group/quality_inspection_parameter_group.js
    apps/erpnext/erpnext/stock/doctype/quality_inspection_template/quality_inspection_template.js
    apps/erpnext/erpnext/stock/doctype/quick_stock_balance/quick_stock_balance.js
    apps/erpnext/erpnext/stock/doctype/repost_item_valuation/repost_item_valuation.js
    apps/erpnext/erpnext/stock/doctype/repost_item_valuation/repost_item_valuation_list.js
    apps/erpnext/erpnext/stock/doctype/serial_and_batch_bundle/serial_and_batch_bundle.js
    apps/erpnext/erpnext/stock/doctype/serial_and_batch_bundle/serial_and_batch_bundle_list.js
    apps/erpnext/erpnext/stock/doctype/serial_no/serial_no.js
    apps/erpnext/erpnext/stock/doctype/shipment/shipment.js
    apps/erpnext/erpnext/stock/doctype/shipment/shipment_list.js
    apps/erpnext/erpnext/stock/doctype/shipment_parcel_template/shipment_parcel_template.js
    apps/erpnext/erpnext/stock/doctype/stock_closing_balance/stock_closing_balance.js
    apps/erpnext/erpnext/stock/doctype/stock_closing_entry/stock_closing_entry.js
    apps/erpnext/erpnext/stock/doctype/stock_closing_entry/stock_closing_entry_list.js
    apps/erpnext/erpnext/stock/doctype/stock_entry/stock_entry.js
    apps/erpnext/erpnext/stock/doctype/stock_entry/stock_entry_list.js
    apps/erpnext/erpnext/stock/doctype/stock_entry_type/stock_entry_type.js
    apps/erpnext/erpnext/stock/doctype/stock_ledger_entry/stock_ledger_entry.js
    apps/erpnext/erpnext/stock/doctype/stock_reconciliation/stock_reconciliation.js
    apps/erpnext/erpnext/stock/doctype/stock_reposting_settings/stock_reposting_settings.js
    apps/erpnext/erpnext/stock/doctype/stock_reservation_entry/stock_reservation_entry.js
    apps/erpnext/erpnext/stock/doctype/stock_reservation_entry/stock_reservation_entry_list.js
    apps/erpnext/erpnext/stock/doctype/stock_settings/stock_settings.js
    apps/erpnext/erpnext/stock/doctype/uom_category/uom_category.js
    apps/erpnext/erpnext/stock/doctype/variant_field/variant_field.js
    apps/erpnext/erpnext/stock/doctype/warehouse/warehouse.js
    apps/erpnext/erpnext/stock/doctype/warehouse/warehouse_tree.js
    apps/erpnext/erpnext/stock/doctype/warehouse_type/warehouse_type.js

#### HRMS HR and recruitment

    apps/hrms/hrms/hr/dashboard_chart_source/employees_by_age/employees_by_age.js
    apps/hrms/hrms/hr/dashboard_chart_source/hiring_vs_attrition_count/hiring_vs_attrition_count.js
    apps/hrms/hrms/hr/doctype/appointment_letter/appointment_letter.js
    apps/hrms/hrms/hr/doctype/appointment_letter_template/appointment_letter_template.js
    apps/hrms/hrms/hr/doctype/appraisal/appraisal.js
    apps/hrms/hrms/hr/doctype/appraisal_cycle/appraisal_cycle.js
    apps/hrms/hrms/hr/doctype/appraisal_template/appraisal_template.js
    apps/hrms/hrms/hr/doctype/attendance/attendance.js
    apps/hrms/hrms/hr/doctype/attendance/attendance_calendar.js
    apps/hrms/hrms/hr/doctype/attendance/attendance_list.js
    apps/hrms/hrms/hr/doctype/attendance_request/attendance_request.js
    apps/hrms/hrms/hr/doctype/attendance_request/attendance_warnings.html
    apps/hrms/hrms/hr/doctype/compensatory_leave_request/compensatory_leave_request.js
    apps/hrms/hrms/hr/doctype/employee_advance/employee_advance.js
    apps/hrms/hrms/hr/doctype/employee_attendance_tool/employee_attendance_tool.css
    apps/hrms/hrms/hr/doctype/employee_attendance_tool/employee_attendance_tool.js
    apps/hrms/hrms/hr/doctype/employee_checkin/employee_checkin.js
    apps/hrms/hrms/hr/doctype/employee_checkin/employee_checkin_list.js
    apps/hrms/hrms/hr/doctype/employee_feedback_criteria/employee_feedback_criteria.js
    apps/hrms/hrms/hr/doctype/employee_grade/employee_grade.js
    apps/hrms/hrms/hr/doctype/employee_grievance/employee_grievance.js
    apps/hrms/hrms/hr/doctype/employee_grievance/employee_grievance_list.js
    apps/hrms/hrms/hr/doctype/employee_health_insurance/employee_health_insurance.js
    apps/hrms/hrms/hr/doctype/employee_onboarding/employee_onboarding.js
    apps/hrms/hrms/hr/doctype/employee_onboarding/employee_onboarding_list.js
    apps/hrms/hrms/hr/doctype/employee_onboarding_template/employee_onboarding_template.js
    apps/hrms/hrms/hr/doctype/employee_performance_feedback/employee_performance_feedback.js
    apps/hrms/hrms/hr/doctype/employee_promotion/employee_promotion.js
    apps/hrms/hrms/hr/doctype/employee_referral/employee_referral.js
    apps/hrms/hrms/hr/doctype/employee_referral/employee_referral_list.js
    apps/hrms/hrms/hr/doctype/employee_separation/employee_separation.js
    apps/hrms/hrms/hr/doctype/employee_separation/employee_separation_list.js
    apps/hrms/hrms/hr/doctype/employee_separation_template/employee_separation_template.js
    apps/hrms/hrms/hr/doctype/employee_skill_map/employee_skill_map.js
    apps/hrms/hrms/hr/doctype/employee_transfer/employee_transfer.js
    apps/hrms/hrms/hr/doctype/exit_interview/exit_interview.js
    apps/hrms/hrms/hr/doctype/exit_interview/exit_interview_list.js
    apps/hrms/hrms/hr/doctype/exit_interview/exit_questionnaire_notification_template.html
    apps/hrms/hrms/hr/doctype/expense_claim/expense_claim.js
    apps/hrms/hrms/hr/doctype/expense_claim/expense_claim_list.js
    apps/hrms/hrms/hr/doctype/expense_claim_type/expense_claim_type.js
    apps/hrms/hrms/hr/doctype/full_and_final_asset/full_and_final_asset.js
    apps/hrms/hrms/hr/doctype/full_and_final_statement/full_and_final_statement.js
    apps/hrms/hrms/hr/doctype/full_and_final_statement/full_and_final_statement_list.js
    apps/hrms/hrms/hr/doctype/goal/goal.js
    apps/hrms/hrms/hr/doctype/goal/goal_list.js
    apps/hrms/hrms/hr/doctype/goal/goal_tree.js
    apps/hrms/hrms/hr/doctype/grievance_type/grievance_type.js
    apps/hrms/hrms/hr/doctype/holiday_list_assignment/holiday_list_assignment.js
    apps/hrms/hrms/hr/doctype/hr_settings/hr_settings.js
    apps/hrms/hrms/hr/doctype/identification_document_type/identification_document_type.js
    apps/hrms/hrms/hr/doctype/interest/interest.js
    apps/hrms/hrms/hr/doctype/interview/interview.js
    apps/hrms/hrms/hr/doctype/interview/interview_calendar.js
    apps/hrms/hrms/hr/doctype/interview/interview_feedback_reminder_template.html
    apps/hrms/hrms/hr/doctype/interview/interview_list.js
    apps/hrms/hrms/hr/doctype/interview/interview_reminder_notification_template.html
    apps/hrms/hrms/hr/doctype/interview_feedback/interview_feedback.js
    apps/hrms/hrms/hr/doctype/interview_type/interview_type.js
    apps/hrms/hrms/hr/doctype/job_applicant/job_applicant.js
    apps/hrms/hrms/hr/doctype/job_applicant/job_applicant_dashboard.html
    apps/hrms/hrms/hr/doctype/job_applicant/job_applicant_list.js
    apps/hrms/hrms/hr/doctype/job_applicant_source/job_applicant_source.js
    apps/hrms/hrms/hr/doctype/job_offer/job_offer.js
    apps/hrms/hrms/hr/doctype/job_offer/job_offer_list.js
    apps/hrms/hrms/hr/doctype/job_offer_term_template/job_offer_term_template.js
    apps/hrms/hrms/hr/doctype/job_opening/job_opening.js
    apps/hrms/hrms/hr/doctype/job_opening/templates/job_opening.html
    apps/hrms/hrms/hr/doctype/job_opening/templates/job_opening_list.html
    apps/hrms/hrms/hr/doctype/job_opening/templates/job_opening_row.html
    apps/hrms/hrms/hr/doctype/job_opening_template/job_opening_template.js
    apps/hrms/hrms/hr/doctype/job_requisition/job_requisition.js
    apps/hrms/hrms/hr/doctype/job_requisition/job_requisition_list.js
    apps/hrms/hrms/hr/doctype/kra/kra.js
    apps/hrms/hrms/hr/doctype/leave_adjustment/leave_adjustment.js
    apps/hrms/hrms/hr/doctype/leave_allocation/leave_allocation.js
    apps/hrms/hrms/hr/doctype/leave_allocation/leave_allocation_list.js
    apps/hrms/hrms/hr/doctype/leave_application/leave_application.js
    apps/hrms/hrms/hr/doctype/leave_application/leave_application_calendar.js
    apps/hrms/hrms/hr/doctype/leave_application/leave_application_calendar_summary.html
    apps/hrms/hrms/hr/doctype/leave_application/leave_application_dashboard.html
    apps/hrms/hrms/hr/doctype/leave_application/leave_application_email_template.html
    apps/hrms/hrms/hr/doctype/leave_application/leave_application_list.js
    apps/hrms/hrms/hr/doctype/leave_block_list/leave_block_list.js
    apps/hrms/hrms/hr/doctype/leave_control_panel/leave_control_panel.js
    apps/hrms/hrms/hr/doctype/leave_encashment/leave_encashment.js
    apps/hrms/hrms/hr/doctype/leave_ledger_entry/leave_ledger_entry.js
    apps/hrms/hrms/hr/doctype/leave_ledger_entry/leave_ledger_entry_list.js
    apps/hrms/hrms/hr/doctype/leave_period/leave_period.js
    apps/hrms/hrms/hr/doctype/leave_policy/leave_policy.js
    apps/hrms/hrms/hr/doctype/leave_policy_assignment/leave_policy_assignment.js
    apps/hrms/hrms/hr/doctype/leave_policy_assignment/leave_policy_assignment_list.js
    apps/hrms/hrms/hr/doctype/leave_policy_detail/leave_policy_detail.js
    apps/hrms/hrms/hr/doctype/leave_type/leave_type.js
    apps/hrms/hrms/hr/doctype/offer_term/offer_term.js
    apps/hrms/hrms/hr/doctype/overtime_slip/overtime_slip.js
    apps/hrms/hrms/hr/doctype/overtime_type/overtime_type.js
    apps/hrms/hrms/hr/doctype/purpose_of_travel/purpose_of_travel.js
    apps/hrms/hrms/hr/doctype/pwa_notification/pwa_notification.js
    apps/hrms/hrms/hr/doctype/shift_assignment/shift_assignment.js
    apps/hrms/hrms/hr/doctype/shift_assignment/shift_assignment_calendar.js
    apps/hrms/hrms/hr/doctype/shift_assignment/shift_assignment_list.js
    apps/hrms/hrms/hr/doctype/shift_assignment_tool/shift_assignment_tool.js
    apps/hrms/hrms/hr/doctype/shift_location/shift_location.js
    apps/hrms/hrms/hr/doctype/shift_location/shift_location_list.js
    apps/hrms/hrms/hr/doctype/shift_request/shift_request.js
    apps/hrms/hrms/hr/doctype/shift_request/shift_request_list.js
    apps/hrms/hrms/hr/doctype/shift_schedule/shift_schedule.js
    apps/hrms/hrms/hr/doctype/shift_schedule/shift_schedule_list.js
    apps/hrms/hrms/hr/doctype/shift_schedule_assignment/shift_schedule_assignment.js
    apps/hrms/hrms/hr/doctype/shift_schedule_assignment/shift_schedule_assignment_list.js
    apps/hrms/hrms/hr/doctype/shift_type/shift_type.js
    apps/hrms/hrms/hr/doctype/shift_type/shift_type_list.js
    apps/hrms/hrms/hr/doctype/skill/skill.js
    apps/hrms/hrms/hr/doctype/staffing_plan/staffing_plan.js
    apps/hrms/hrms/hr/doctype/training_event/training_event.js
    apps/hrms/hrms/hr/doctype/training_event/training_event_calendar.js
    apps/hrms/hrms/hr/doctype/training_feedback/training_feedback.js
    apps/hrms/hrms/hr/doctype/training_program/training_program.js
    apps/hrms/hrms/hr/doctype/training_result/training_result.js
    apps/hrms/hrms/hr/doctype/travel_request/travel_request.js
    apps/hrms/hrms/hr/doctype/vehicle_log/vehicle_log.js
    apps/hrms/hrms/hr/doctype/vehicle_service_item/vehicle_service_item.js
    apps/hrms/hrms/hr/employee_property_update.js
    apps/hrms/hrms/hr/notification/training_feedback/training_feedback.html
    apps/hrms/hrms/hr/notification/training_scheduled/training_scheduled.html
    apps/hrms/hrms/hr/page/organizational_chart/organizational_chart.js
    apps/hrms/hrms/hr/print_format/standard_appointment_letter/standard_appointment_letter.html
    apps/hrms/hrms/hr/report/appraisal_overview/appraisal_overview.js
    apps/hrms/hrms/hr/report/employee_advance_summary/employee_advance_summary.js
    apps/hrms/hrms/hr/report/employee_analytics/employee_analytics.js
    apps/hrms/hrms/hr/report/employee_birthday/employee_birthday.js
    apps/hrms/hrms/hr/report/employee_exits/employee_exits.js
    apps/hrms/hrms/hr/report/employee_hours_utilization_based_on_timesheet/employee_hours_utilization_based_on_timesheet.js
    apps/hrms/hrms/hr/report/employee_leave_balance/employee_leave_balance.js
    apps/hrms/hrms/hr/report/employee_leave_balance_summary/employee_leave_balance_summary.js
    apps/hrms/hrms/hr/report/employees_working_on_a_holiday/employees_working_on_a_holiday.js
    apps/hrms/hrms/hr/report/leave_ledger/leave_ledger.js
    apps/hrms/hrms/hr/report/monthly_attendance_sheet/monthly_attendance_sheet.js
    apps/hrms/hrms/hr/report/project_profitability/project_profitability.js
    apps/hrms/hrms/hr/report/recruitment_analytics/recruitment_analytics.js
    apps/hrms/hrms/hr/report/shift_attendance/shift_attendance.js
    apps/hrms/hrms/hr/report/unpaid_expense_claim/unpaid_expense_claim.js
    apps/hrms/hrms/hr/report/vehicle_expenses/vehicle_expenses.js
    apps/hrms/hrms/hr/web_form/job_application/job_application.js

#### HRMS payroll

    apps/hrms/hrms/payroll/doctype/additional_salary/additional_salary.js
    apps/hrms/hrms/payroll/doctype/arrear/arrear.js
    apps/hrms/hrms/payroll/doctype/bulk_salary_structure_assignment/bulk_salary_structure_assignment.js
    apps/hrms/hrms/payroll/doctype/employee_benefit_application/employee_benefit_application.js
    apps/hrms/hrms/payroll/doctype/employee_benefit_claim/employee_benefit_claim.js
    apps/hrms/hrms/payroll/doctype/employee_benefit_ledger/employee_benefit_ledger.js
    apps/hrms/hrms/payroll/doctype/employee_benefit_ledger/employee_benefit_ledger_list.js
    apps/hrms/hrms/payroll/doctype/employee_incentive/employee_incentive.js
    apps/hrms/hrms/payroll/doctype/employee_other_income/employee_other_income.js
    apps/hrms/hrms/payroll/doctype/employee_tax_exemption_category/employee_tax_exemption_category.js
    apps/hrms/hrms/payroll/doctype/employee_tax_exemption_declaration/employee_tax_exemption_declaration.js
    apps/hrms/hrms/payroll/doctype/employee_tax_exemption_proof_submission/employee_tax_exemption_proof_submission.js
    apps/hrms/hrms/payroll/doctype/employee_tax_exemption_sub_category/employee_tax_exemption_sub_category.js
    apps/hrms/hrms/payroll/doctype/gratuity/gratuity.js
    apps/hrms/hrms/payroll/doctype/gratuity/gratuity_list.js
    apps/hrms/hrms/payroll/doctype/gratuity_rule/gratuity_rule.js
    apps/hrms/hrms/payroll/doctype/income_tax_slab/income_tax_slab.js
    apps/hrms/hrms/payroll/doctype/payroll_correction/payroll_correction.js
    apps/hrms/hrms/payroll/doctype/payroll_entry/payroll_entry.js
    apps/hrms/hrms/payroll/doctype/payroll_entry/payroll_entry_list.js
    apps/hrms/hrms/payroll/doctype/payroll_period/payroll_period.js
    apps/hrms/hrms/payroll/doctype/payroll_settings/payroll_settings.js
    apps/hrms/hrms/payroll/doctype/retention_bonus/retention_bonus.js
    apps/hrms/hrms/payroll/doctype/salary_component/salary_component.js
    apps/hrms/hrms/payroll/doctype/salary_slip/salary_slip.js
    apps/hrms/hrms/payroll/doctype/salary_slip/salary_slip_list.js
    apps/hrms/hrms/payroll/doctype/salary_structure/condition_and_formula_help.html
    apps/hrms/hrms/payroll/doctype/salary_structure/salary_structure.js
    apps/hrms/hrms/payroll/doctype/salary_structure/salary_structure_list.js
    apps/hrms/hrms/payroll/doctype/salary_structure_assignment/salary_structure_assignment.js
    apps/hrms/hrms/payroll/doctype/salary_withholding/salary_withholding.js
    apps/hrms/hrms/payroll/report/accrued_earnings_report/accrued_earnings_report.js
    apps/hrms/hrms/payroll/report/bank_remittance/bank_remittance.js
    apps/hrms/hrms/payroll/report/employee_ctc_break_up/employee_ctc_break_up.js
    apps/hrms/hrms/payroll/report/employee_ctc_break_up/employee_profile_card.html
    apps/hrms/hrms/payroll/report/income_tax_computation/income_tax_computation.js
    apps/hrms/hrms/payroll/report/income_tax_deductions/income_tax_deductions.js
    apps/hrms/hrms/payroll/report/salary_payments_based_on_payment_mode/salary_payments_based_on_payment_mode.js
    apps/hrms/hrms/payroll/report/salary_payments_via_ecs/salary_payments_via_ecs.js
    apps/hrms/hrms/payroll/report/salary_register/salary_register.html
    apps/hrms/hrms/payroll/report/salary_register/salary_register.js

#### HRMS shared public JavaScript

    apps/hrms/hrms/public/js/erpnext/bank_transaction.js
    apps/hrms/hrms/public/js/erpnext/company.js
    apps/hrms/hrms/public/js/erpnext/delivery_trip.js
    apps/hrms/hrms/public/js/erpnext/department.js
    apps/hrms/hrms/public/js/erpnext/employee.js
    apps/hrms/hrms/public/js/erpnext/journal_entry.js
    apps/hrms/hrms/public/js/erpnext/payment_entry.js
    apps/hrms/hrms/public/js/erpnext/timesheet.js
    apps/hrms/hrms/public/js/hierarchy-chart.bundle.js
    apps/hrms/hrms/public/js/hierarchy_chart/hierarchy_chart_desktop.js
    apps/hrms/hrms/public/js/hierarchy_chart/hierarchy_chart_mobile.js
    apps/hrms/hrms/public/js/hrms.bundle.js
    apps/hrms/hrms/public/js/interview.bundle.js
    apps/hrms/hrms/public/js/performance.bundle.js
    apps/hrms/hrms/public/js/performance/performance_feedback.js
    apps/hrms/hrms/public/js/salary_slip_deductions_report_filters.js
    apps/hrms/hrms/public/js/setup_wizard.js
    apps/hrms/hrms/public/js/templates/circular_progress_bar.html
    apps/hrms/hrms/public/js/templates/employees_with_unmarked_attendance.html
    apps/hrms/hrms/public/js/templates/feedback_history.html
    apps/hrms/hrms/public/js/templates/feedback_summary.html
    apps/hrms/hrms/public/js/templates/hierarchy_empty_state.html
    apps/hrms/hrms/public/js/templates/interview_feedback.html
    apps/hrms/hrms/public/js/templates/node_card.html
    apps/hrms/hrms/public/js/templates/performance_feedback.html
    apps/hrms/hrms/public/js/templates/rating.html
    apps/hrms/hrms/public/js/utils/index.js
    apps/hrms/hrms/public/js/utils/leave_utils.js
    apps/hrms/hrms/public/js/utils/payroll_utils.js
    apps/hrms/hrms/public/js/utils/telemetry.js

### Shared Frappe Desk renderer source files

    apps/frappe/frappe/desk/doctype/sidebar/sidebar.js
    apps/frappe/frappe/desk/doctype/sidebar_item_group/sidebar_item_group.js
    apps/frappe/frappe/desk/doctype/workspace/workspace.js
    apps/frappe/frappe/public/js/frappe/form/column.js
    apps/frappe/frappe/public/js/frappe/form/controls/attach.js
    apps/frappe/frappe/public/js/frappe/form/controls/attach_image.js
    apps/frappe/frappe/public/js/frappe/form/controls/attachment_gallery.js
    apps/frappe/frappe/public/js/frappe/form/controls/autocomplete.js
    apps/frappe/frappe/public/js/frappe/form/controls/barcode.js
    apps/frappe/frappe/public/js/frappe/form/controls/base_control.js
    apps/frappe/frappe/public/js/frappe/form/controls/base_input.js
    apps/frappe/frappe/public/js/frappe/form/controls/button.js
    apps/frappe/frappe/public/js/frappe/form/controls/check.js
    apps/frappe/frappe/public/js/frappe/form/controls/code.js
    apps/frappe/frappe/public/js/frappe/form/controls/color.js
    apps/frappe/frappe/public/js/frappe/form/controls/comment.js
    apps/frappe/frappe/public/js/frappe/form/controls/control.js
    apps/frappe/frappe/public/js/frappe/form/controls/currency.js
    apps/frappe/frappe/public/js/frappe/form/controls/data.js
    apps/frappe/frappe/public/js/frappe/form/controls/date.js
    apps/frappe/frappe/public/js/frappe/form/controls/date_range.js
    apps/frappe/frappe/public/js/frappe/form/controls/datepicker_i18n.js
    apps/frappe/frappe/public/js/frappe/form/controls/datetime.js
    apps/frappe/frappe/public/js/frappe/form/controls/duration.js
    apps/frappe/frappe/public/js/frappe/form/controls/dynamic_link.js
    apps/frappe/frappe/public/js/frappe/form/controls/float.js
    apps/frappe/frappe/public/js/frappe/form/controls/geolocation.js
    apps/frappe/frappe/public/js/frappe/form/controls/heading.js
    apps/frappe/frappe/public/js/frappe/form/controls/html.js
    apps/frappe/frappe/public/js/frappe/form/controls/html_editor.js
    apps/frappe/frappe/public/js/frappe/form/controls/icon.js
    apps/frappe/frappe/public/js/frappe/form/controls/image.js
    apps/frappe/frappe/public/js/frappe/form/controls/int.js
    apps/frappe/frappe/public/js/frappe/form/controls/json.js
    apps/frappe/frappe/public/js/frappe/form/controls/link.js
    apps/frappe/frappe/public/js/frappe/form/controls/markdown_editor.js
    apps/frappe/frappe/public/js/frappe/form/controls/multicheck.js
    apps/frappe/frappe/public/js/frappe/form/controls/multiselect.js
    apps/frappe/frappe/public/js/frappe/form/controls/multiselect_list.js
    apps/frappe/frappe/public/js/frappe/form/controls/multiselect_pills.js
    apps/frappe/frappe/public/js/frappe/form/controls/password.js
    apps/frappe/frappe/public/js/frappe/form/controls/percent.js
    apps/frappe/frappe/public/js/frappe/form/controls/phone.js
    apps/frappe/frappe/public/js/frappe/form/controls/quill-mention/blots/mention.js
    apps/frappe/frappe/public/js/frappe/form/controls/quill-mention/constants/keys.js
    apps/frappe/frappe/public/js/frappe/form/controls/quill-mention/quill.mention.js
    apps/frappe/frappe/public/js/frappe/form/controls/rating.js
    apps/frappe/frappe/public/js/frappe/form/controls/select.js
    apps/frappe/frappe/public/js/frappe/form/controls/signature.js
    apps/frappe/frappe/public/js/frappe/form/controls/switch.js
    apps/frappe/frappe/public/js/frappe/form/controls/table.js
    apps/frappe/frappe/public/js/frappe/form/controls/table_multiselect.js
    apps/frappe/frappe/public/js/frappe/form/controls/text.js
    apps/frappe/frappe/public/js/frappe/form/controls/text_editor.js
    apps/frappe/frappe/public/js/frappe/form/controls/time.js
    apps/frappe/frappe/public/js/frappe/form/dashboard.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/doctype_settings.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/list_panel.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/registry.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/email_template.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/global_search.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/naming.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/notification.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/print_format.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/roles.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/settings_map.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/user_permissions.js
    apps/frappe/frappe/public/js/frappe/form/doctype_settings/tabs/workflow.js
    apps/frappe/frappe/public/js/frappe/form/footer/base_timeline.js
    apps/frappe/frappe/public/js/frappe/form/footer/footer.js
    apps/frappe/frappe/public/js/frappe/form/footer/form_timeline.js
    apps/frappe/frappe/public/js/frappe/form/footer/version_timeline_content_builder.js
    apps/frappe/frappe/public/js/frappe/form/form.js
    apps/frappe/frappe/public/js/frappe/form/form_tour.js
    apps/frappe/frappe/public/js/frappe/form/form_viewers.js
    apps/frappe/frappe/public/js/frappe/form/formatters.js
    apps/frappe/frappe/public/js/frappe/form/grid.js
    apps/frappe/frappe/public/js/frappe/form/grid_pagination.js
    apps/frappe/frappe/public/js/frappe/form/grid_row.js
    apps/frappe/frappe/public/js/frappe/form/grid_row_form.js
    apps/frappe/frappe/public/js/frappe/form/info_card.js
    apps/frappe/frappe/public/js/frappe/form/layout.js
    apps/frappe/frappe/public/js/frappe/form/link_selector.js
    apps/frappe/frappe/public/js/frappe/form/linked_with.js
    apps/frappe/frappe/public/js/frappe/form/multi_select_dialog.js
    apps/frappe/frappe/public/js/frappe/form/print_utils.js
    apps/frappe/frappe/public/js/frappe/form/quick_entry.js
    apps/frappe/frappe/public/js/frappe/form/reminders.js
    apps/frappe/frappe/public/js/frappe/form/save.js
    apps/frappe/frappe/public/js/frappe/form/script_helpers.js
    apps/frappe/frappe/public/js/frappe/form/script_manager.js
    apps/frappe/frappe/public/js/frappe/form/section.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/assign_to.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/attachments.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/form_sidebar.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/form_sidebar_users.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/share.js
    apps/frappe/frappe/public/js/frappe/form/sidebar/user_image.js
    apps/frappe/frappe/public/js/frappe/form/success_action.js
    apps/frappe/frappe/public/js/frappe/form/tab.js
    apps/frappe/frappe/public/js/frappe/form/templates/address_list.html
    apps/frappe/frappe/public/js/frappe/form/templates/contact_list.html
    apps/frappe/frappe/public/js/frappe/form/templates/form_dashboard.html
    apps/frappe/frappe/public/js/frappe/form/templates/form_footer.html
    apps/frappe/frappe/public/js/frappe/form/templates/form_links.html
    apps/frappe/frappe/public/js/frappe/form/templates/form_sidebar.html
    apps/frappe/frappe/public/js/frappe/form/templates/print_layout.html
    apps/frappe/frappe/public/js/frappe/form/templates/report_links.html
    apps/frappe/frappe/public/js/frappe/form/templates/set_sharing.html
    apps/frappe/frappe/public/js/frappe/form/templates/timeline_message_box.html
    apps/frappe/frappe/public/js/frappe/form/templates/users_in_sidebar.html
    apps/frappe/frappe/public/js/frappe/form/toolbar.js
    apps/frappe/frappe/public/js/frappe/form/undo_manager.js
    apps/frappe/frappe/public/js/frappe/form/workflow.js
    apps/frappe/frappe/public/js/frappe/list/base_list.js
    apps/frappe/frappe/public/js/frappe/list/bulk_operations.js
    apps/frappe/frappe/public/js/frappe/list/list_factory.js
    apps/frappe/frappe/public/js/frappe/list/list_filter.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/layout_dialog.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/layout_field_selector.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/list_filter.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/list_filter_api.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/list_filter_menu.js
    apps/frappe/frappe/public/js/frappe/list/list_filter/manage_layouts_dialog.js
    apps/frappe/frappe/public/js/frappe/list/list_settings.js
    apps/frappe/frappe/public/js/frappe/list/list_sidebar_group_by.js
    apps/frappe/frappe/public/js/frappe/list/list_sidebar_stat.html
    apps/frappe/frappe/public/js/frappe/list/list_view.js
    apps/frappe/frappe/public/js/frappe/list/list_view_permission_restrictions.html
    apps/frappe/frappe/public/js/frappe/list/list_view_select.js
    apps/frappe/frappe/public/js/frappe/list/list_view_virtualization.js
    apps/frappe/frappe/public/js/frappe/views/breadcrumbs.js
    apps/frappe/frappe/public/js/frappe/views/calendar/calendar.js
    apps/frappe/frappe/public/js/frappe/views/communication.js
    apps/frappe/frappe/public/js/frappe/views/container.js
    apps/frappe/frappe/public/js/frappe/views/dashboard/dashboard_view.js
    apps/frappe/frappe/public/js/frappe/views/factory.js
    apps/frappe/frappe/public/js/frappe/views/file/file_view.js
    apps/frappe/frappe/public/js/frappe/views/formview.js
    apps/frappe/frappe/public/js/frappe/views/gantt/gantt_view.js
    apps/frappe/frappe/public/js/frappe/views/image/image_view.js
    apps/frappe/frappe/public/js/frappe/views/image/image_view_item_row.html
    apps/frappe/frappe/public/js/frappe/views/image/photoswipe_dom.html
    apps/frappe/frappe/public/js/frappe/views/inbox/inbox_view.js
    apps/frappe/frappe/public/js/frappe/views/interaction.js
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_board.bundle.js
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_board.html
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_card.html
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_column.html
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_pagination.js
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_settings.js
    apps/frappe/frappe/public/js/frappe/views/kanban/kanban_view.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/adapters/vanilla.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/core/drag.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/core/events.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/core/kanban_core.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/core/virtualization.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/kanban.bundle.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/kanban_page.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/kanban_settings.bundle.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/providers/frappe_data_provider.js
    apps/frappe/frappe/public/js/frappe/views/kanban_v2/settings.js
    apps/frappe/frappe/public/js/frappe/views/map/map_view.js
    apps/frappe/frappe/public/js/frappe/views/pageview.js
    apps/frappe/frappe/public/js/frappe/views/render_preview.js
    apps/frappe/frappe/public/js/frappe/views/reports/link_side_panel.js
    apps/frappe/frappe/public/js/frappe/views/reports/print_grid.html
    apps/frappe/frappe/public/js/frappe/views/reports/print_tree.html
    apps/frappe/frappe/public/js/frappe/views/reports/query_report.js
    apps/frappe/frappe/public/js/frappe/views/reports/report_factory.js
    apps/frappe/frappe/public/js/frappe/views/reports/report_utils.js
    apps/frappe/frappe/public/js/frappe/views/reports/report_view.js
    apps/frappe/frappe/public/js/frappe/views/translation_manager.js
    apps/frappe/frappe/public/js/frappe/views/treeview.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/block.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/card.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/chart.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/custom_block.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/header.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/header_size.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/index.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/number_card.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/onboarding.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/paragraph.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/quick_list.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/shortcut.js
    apps/frappe/frappe/public/js/frappe/views/workspace/blocks/spacer.js
    apps/frappe/frappe/public/js/frappe/views/workspace/workspace.js
    apps/frappe/frappe/public/scss/common/about.scss
    apps/frappe/frappe/public/scss/common/alert.scss
    apps/frappe/frappe/public/scss/common/awesomeplete.scss
    apps/frappe/frappe/public/scss/common/buttons.scss
    apps/frappe/frappe/public/scss/common/color_picker.scss
    apps/frappe/frappe/public/scss/common/controls.scss
    apps/frappe/frappe/public/scss/common/css_variables.scss
    apps/frappe/frappe/public/scss/common/datepicker.scss
    apps/frappe/frappe/public/scss/common/email_composer.scss
    apps/frappe/frappe/public/scss/common/flex.scss
    apps/frappe/frappe/public/scss/common/form.scss
    apps/frappe/frappe/public/scss/common/global.scss
    apps/frappe/frappe/public/scss/common/grid.scss
    apps/frappe/frappe/public/scss/common/icon_picker.scss
    apps/frappe/frappe/public/scss/common/icons.scss
    apps/frappe/frappe/public/scss/common/indicator.scss
    apps/frappe/frappe/public/scss/common/mixins.scss
    apps/frappe/frappe/public/scss/common/modal.scss
    apps/frappe/frappe/public/scss/common/phone_picker.scss
    apps/frappe/frappe/public/scss/common/quill.scss
    apps/frappe/frappe/public/scss/common/utilities.scss
    apps/frappe/frappe/public/scss/desk/arrangement_editor.scss
    apps/frappe/frappe/public/scss/desk/avatar.scss
    apps/frappe/frappe/public/scss/desk/calendar.scss
    apps/frappe/frappe/public/scss/desk/card.scss
    apps/frappe/frappe/public/scss/desk/charts.scss
    apps/frappe/frappe/public/scss/desk/css_variables.scss
    apps/frappe/frappe/public/scss/desk/dark.scss
    apps/frappe/frappe/public/scss/desk/dashboard_view.scss
    apps/frappe/frappe/public/scss/desk/data_import.scss
    apps/frappe/frappe/public/scss/desk/data_import_wizard.scss
    apps/frappe/frappe/public/scss/desk/desktop.scss
    apps/frappe/frappe/public/scss/desk/dock.scss
    apps/frappe/frappe/public/scss/desk/doctype_settings.scss
    apps/frappe/frappe/public/scss/desk/driver.scss
    apps/frappe/frappe/public/scss/desk/embedded_list.scss
    apps/frappe/frappe/public/scss/desk/file_view.scss
    apps/frappe/frappe/public/scss/desk/filters.scss
    apps/frappe/frappe/public/scss/desk/form.scss
    apps/frappe/frappe/public/scss/desk/form_sidebar.scss
    apps/frappe/frappe/public/scss/desk/frappe_datatable.scss
    apps/frappe/frappe/public/scss/desk/frappe_gantt.scss
    apps/frappe/frappe/public/scss/desk/full_height_page.scss
    apps/frappe/frappe/public/scss/desk/global.scss
    apps/frappe/frappe/public/scss/desk/global_search.scss
    apps/frappe/frappe/public/scss/desk/image_view.scss
    apps/frappe/frappe/public/scss/desk/index.scss
    apps/frappe/frappe/public/scss/desk/kanban.scss
    apps/frappe/frappe/public/scss/desk/kanban_v2.scss
    apps/frappe/frappe/public/scss/desk/link_preview.scss
    apps/frappe/frappe/public/scss/desk/list.scss
    apps/frappe/frappe/public/scss/desk/list_sidebar.scss
    apps/frappe/frappe/public/scss/desk/main.scss
    apps/frappe/frappe/public/scss/desk/mobile.scss
    apps/frappe/frappe/public/scss/desk/module.scss
    apps/frappe/frappe/public/scss/desk/navbar.scss
    apps/frappe/frappe/public/scss/desk/notification.scss
    apps/frappe/frappe/public/scss/desk/page.scss
    apps/frappe/frappe/public/scss/desk/plyr.scss
    apps/frappe/frappe/public/scss/desk/print_preview.scss
    apps/frappe/frappe/public/scss/desk/report.scss
    apps/frappe/frappe/public/scss/desk/role_editor.scss
    apps/frappe/frappe/public/scss/desk/scrollbar.scss
    apps/frappe/frappe/public/scss/desk/search_widget.scss
    apps/frappe/frappe/public/scss/desk/settings_dialog.scss
    apps/frappe/frappe/public/scss/desk/side_panel.scss
    apps/frappe/frappe/public/scss/desk/sidebar.scss
    apps/frappe/frappe/public/scss/desk/sidebar_header.scss
    apps/frappe/frappe/public/scss/desk/sidebar_panel.scss
    apps/frappe/frappe/public/scss/desk/slides.scss
    apps/frappe/frappe/public/scss/desk/tags.scss
    apps/frappe/frappe/public/scss/desk/theme_switcher.scss
    apps/frappe/frappe/public/scss/desk/timeline.scss
    apps/frappe/frappe/public/scss/desk/tree.scss
    apps/frappe/frappe/public/scss/desk/typography.scss
    apps/frappe/frappe/public/scss/desk/user_profile.scss
    apps/frappe/frappe/public/scss/desk/user_settings_dialog.scss
    apps/frappe/frappe/public/scss/desk/variables.scss
    apps/frappe/frappe/public/scss/desk/version.scss

### Paired DocType metadata (layout/content fields)

    For each module DocType folder listed above, the sibling <doctype>.json defines fields, sections, and metadata; it is not a JS/CSS file, so it is not repeated in the frontend inventory.
    Workspace content is stored as the Frappe Workspace document and is configured by the setup scripts named in the module map.
