import frappe, json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
out = {}
res = set()
for p in ["%Lead%", "%Opportun%", "%Quotation%", "%Pipeline%", "%Territory%", "%Profit%", "%Ageing%", "%Sales Person%", "%Sales Analytics%", "%Sales Register%"]:
    for r in frappe.get_all("Report", fields=["name"], filters={"name": ("like", p)}):
        res.add(r.name)
out["reports"] = sorted(res)
try:
    frappe.get_doc({"doctype": "Dashboard Chart", "chart_name": "Leads by Status", "document_type": "Lead", "is_public": 1, "timespan": "Last Year", "time_interval": "Monthly", "chart_type": "Group By", "group_by_based_on": "status"}).insert(ignore_permissions=True)
    frappe.db.commit()
    out["chart"] = "groupby ok"
except Exception as e:
    frappe.db.rollback()
    out["chart_err_groupby"] = str(e)[:300]
    try:
        frappe.get_doc({"doctype": "Dashboard Chart", "chart_name": "Leads by Status", "document_type": "Lead", "is_public": 1, "timespan": "Last Year", "time_interval": "Monthly", "chart_type": "Count"}).insert(ignore_permissions=True)
        frappe.db.commit()
        out["chart"] = "count ok"
    except Exception as e2:
        frappe.db.rollback()
        out["chart_err_count"] = str(e2)[:300]
open("/tmp/probe_result.json", "w", encoding="utf-8").write(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
frappe.destroy()
