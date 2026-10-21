import frappe
import json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
out = {}
out["workspaces"] = frappe.get_all("Workspace", fields=["name", "module", "public"], limit=50, order_by="name")
try:
    out["sidebar_fields"] = [f.fieldname for f in frappe.get_meta("Sidebar").fields]
    out["sidebars"] = frappe.get_all("Sidebar", fields=["name", "module"], limit=30)
    out["sidebar_links"] = frappe.get_all("Sidebar Link", fields=["parent", "label", "link_to", "type", "route"], limit=200)
except Exception as e:
    out["sidebar_err"] = str(e)[:200]
try:
    out["sales_stages"] = frappe.get_all("Sales Stage", fields=["name"], limit=30)
except Exception as e:
    out["stage_err"] = str(e)[:100]
try:
    out["lead_sources"] = frappe.get_all("Lead Source", fields=["name"], limit=30)
except Exception:
    pass
out["count_stage"] = frappe.db.count("Sales Stage") if frappe.db.exists("DocType", "Sales Stage") else -1
open("/tmp/route_probe.json", "w", encoding="utf-8").write(json.dumps(out, indent=1, default=str))
print(json.dumps(out, indent=1, default=str))
frappe.destroy()
