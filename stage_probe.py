import frappe
frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
meta = frappe.get_meta("Sales Stage")
print("FIELDS:", [(f.fieldname, f.fieldtype, f.reqd) for f in meta.fields])
print("COUNT:", frappe.db.count("Sales Stage"))
print("NAMES:", [d.name for d in frappe.get_all("Sales Stage", fields=["name"])])
print("OPP STAGE COUNT:", frappe.db.count("Opportunity"))
frappe.destroy()
