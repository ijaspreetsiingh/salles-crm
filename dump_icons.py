import frappe, json
out = []
d = frappe.get_doc("Workspace", "Accounting")
rows = []
for l in (d.get("links") or [])[:40]:
    rows.append({"t": l.type, "label": l.label, "icon": l.icon, "lt": l.link_type, "lto": l.link_to})
out.append("ACC_LINKS " + json.dumps(rows, ensure_ascii=False))
d2 = frappe.get_doc("Workspace", "Selling")
rows2 = []
for l in (d2.get("links") or [])[:25]:
    rows2.append({"t": l.type, "label": l.label, "icon": l.icon, "lt": l.link_type, "lto": l.link_to})
out.append("SELL_LINKS " + json.dumps(rows2, ensure_ascii=False))
out.append("LEAD_STATUS_CHART " + str(frappe.db.exists("Dashboard Chart", "Leads by Status")))
open("/tmp/ws_icons.txt", "w", encoding="utf-8").write("\n".join(out))
print("OK")
