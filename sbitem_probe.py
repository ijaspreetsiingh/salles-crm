import frappe
import json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
meta = frappe.get_meta("Sidebar Item")
print("FIELDS:", [f.fieldname + ":" + (f.fieldtype) + ":" + (f.options or "") for f in meta.fields])
rows = frappe.db.sql(
    "select label, link_type, link_to, type from `tabSidebar Item` where parent='CRM' limit 45",
    as_dict=True,
)
print("ROWS:", json.dumps(rows, default=str, indent=1))
frappe.destroy()
