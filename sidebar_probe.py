import frappe
import json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
out = {}
sb = frappe.get_doc("Sidebar", "CRM")
out["fields"] = {"title": sb.title, "module": sb.module, "app": sb.app}
items = []
for it in sb.get("items") or []:
    d = it.as_dict()
    items.append({k: d.get(k) for k in ("label", "route", "link", "type", "icon", "hidden", "dependency") if k in d})
out["items"] = items
out["item_doctype"] = frappe.get_meta("Sidebar").get_field("items").options
try:
    out["ws_sales"] = frappe.get_doc("Workspace", "Sales").as_dict()["content"][:500]
except Exception as e:
    out["ws_err"] = str(e)[:150]
try:
    out["canonical"] = frappe.get_all("Workspace", fields=["name"], filters={"name": ["like", "%Sales%"]})
except Exception:
    pass
open("/tmp/sidebar_probe.json", "w", encoding="utf-8").write(json.dumps(out, indent=1, default=str))
print(json.dumps(out, indent=1, default=str))
frappe.destroy()
