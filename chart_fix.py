import frappe
import json

print("-- Dashboard Chart fields (reqd / time series) --")
for f in frappe.get_meta("Dashboard Chart").fields:
    if f.reqd or "time" in f.fieldname or "based" in f.fieldname:
        print("  ", f.fieldname, "|", f.fieldtype, "| reqd:", f.reqd, "| options:", f.options)

print("\n-- try create Count chart --")
try:
    if not frappe.db.exists("Dashboard Chart", "Receivables Ageing"):
        frappe.get_doc({
            "doctype": "Dashboard Chart",
            "chart_name": "Receivables Ageing",
            "chart_type": "Count",
            "document_type": "Sales Invoice",
            "based_on": "status",
            "group_by_based_on": "status",
            "filters_json": json.dumps([["Sales Invoice", "docstatus", "=", "1"]]),
            "timespan": "Select Date Range",
            "time_interval": "Monthly",
            "from_date": "2026-01-01",
            "to_date": "2026-12-31",
            "is_public": 1,
        }).insert(ignore_permissions=True)
        print("  + created")
    else:
        print("  exists")
except Exception as e:
    frappe.db.rollback()
    print("  FAIL:", str(e)[:300])

frappe.db.commit()

print("\n-- final counts --")
print("  Charts:", frappe.get_all("Dashboard Chart", pluck="name"))
print("  Workspace accounts-app exists:", bool(frappe.db.exists("Workspace", "Accounts App")))
