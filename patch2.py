import frappe
import json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()

report = {"chart_ok": False, "chart_err": None, "sales_add": [], "accounts_fix": [], "content": {}}

chart_doc = None
try:
    chart_doc = frappe.get_doc({
        "doctype": "Dashboard Chart",
        "chart_name": "Leads by Status",
        "document_type": "Lead",
        "is_public": 1,
        "chart_type": "Group By",
        "group_by_based_on": "status",
        "number_of_groups": 20,
        "filters_json": "[]",
    }).insert(ignore_permissions=True)
    frappe.db.commit()
    report["chart_ok"] = True
except Exception as e:
    frappe.db.rollback()
    report["chart_err"] = "groupby: " + str(e)[:200]
    try:
        chart_doc = frappe.get_doc({
            "doctype": "Dashboard Chart",
            "chart_name": "Leads by Status",
            "document_type": "Lead",
            "is_public": 1,
            "chart_type": "Count",
            "timeseries": 1,
            "timespan": "Last Year",
            "time_interval": "Monthly",
            "filters_json": "[]",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        report["chart_ok"] = True
        report["chart_err"] = report["chart_err"] + " | count ok"
    except Exception as e2:
        frappe.db.rollback()
        report["chart_err"] = report["chart_err"] + " | count: " + str(e2)[:200]

ws = frappe.get_doc("Workspace", "Sales CRM")
existing = set((l.label or "") for l in (ws.get("links") or []))
add_links = [
    ("Sales Pipeline Analytics", "Sales Pipeline Analytics"),
    ("Opportunity Summary by Sales Stage", "Opportunity Summary by Sales Stage"),
    ("Lost Quotations", "Lost Quotations"),
    ("Lost Opportunity", "Lost Opportunity"),
    ("Lead Conversion Time", "Lead Conversion Time"),
    ("Territory-wise Sales", "Territory-wise Sales"),
    ("Sales Person-wise Transaction Summary", "Sales Person-wise Transaction Summary"),
    ("Sales Analytics", "Sales Analytics"),
]
for lbl, lto in add_links:
    if lbl not in existing:
        ws.append("links", {"type": "Link", "label": lbl, "link_type": "Report", "link_to": lto})
        report["sales_add"].append(lbl)

blocks = json.loads(ws.content or "[]")
chart_idx = None
for i, b in enumerate(blocks):
    if b.get("type") == "chart" and (b.get("data") or {}).get("chart_name") == "Opportunity by Stage":
        chart_idx = i
if report["chart_ok"] and frappe.db.exists("Dashboard Chart", "Leads by Status"):
    if not any(b.get("type") == "chart" and (b.get("data") or {}).get("chart_name") == "Leads by Status" for b in blocks):
        if chart_idx is not None:
            blocks.insert(chart_idx + 1, {"id": "chartleads", "type": "chart", "data": {"chart_name": "Leads by Status", "col": 6}})
            ws.append("charts", {"chart_name": "Leads by Status", "label": "Leads by Status"})
        for b in blocks:
            if b.get("type") == "chart" and (b.get("data") or {}).get("chart_name") == "Opportunity by Stage":
                b["data"]["col"] = 6
        report["content"]["sales"] = "both charts"
    else:
        report["content"]["sales"] = "chart already present"
else:
    for b in blocks:
        if b.get("type") == "chart" and (b.get("data") or {}).get("chart_name") == "Opportunity by Stage":
            b["data"]["col"] = 12
    report["content"]["sales"] = "chart1 full width, no leads chart"
ws.content = json.dumps(blocks, ensure_ascii=False)
ws.save(ignore_permissions=True)
frappe.db.commit()

ws2 = frappe.get_doc("Workspace", "Accounts App")
fix_map = {
    "Profit and Loss": ("Profit and Loss", "Profit and Loss Statement"),
    "Accounts Receivable Ageing": ("Accounts Receivable", "Accounts Receivable"),
    "Accounts Payable Ageing": ("Accounts Payable", "Accounts Payable"),
}
for l in (ws2.get("links") or []):
    if l.type == "Link" and l.label in fix_map:
        new_label, new_to = fix_map[l.label]
        l.label = new_label
        l.link_to = new_to
        report["accounts_fix"].append(new_label)
ws2.save(ignore_permissions=True)
frappe.db.commit()

final = {}
for nm in ["Sales CRM", "Accounts App", "HRM App"]:
    d = frappe.get_doc("Workspace", nm)
    bl = json.loads(d.content or "[]")
    final[nm] = {
        "types": sorted(set(b.get("type") for b in bl)),
        "cards": sum(1 for b in bl if b.get("type") == "card"),
        "rows": {"links": len(d.get("links") or []), "shortcuts": len(d.get("shortcuts") or []), "number_cards": len(d.get("number_cards") or []), "charts": len(d.get("charts") or [])},
        "bad_q": sum((b.get("data") or {}).get("text", "").count("?") for b in bl if b.get("type") == "header"),
    }
report["final"] = final
frappe.clear_cache()
frappe.db.commit()
open("/tmp/patch2_result.json", "w", encoding="utf-8").write(json.dumps(report, indent=1))
print(json.dumps(report, indent=1))
frappe.destroy()
