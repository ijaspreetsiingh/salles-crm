import frappe
import json

ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
bad = []
for i in items:
    if i.get("type") == "link":
        lt = i["data"].get("link_type")
        lto = i["data"].get("link_to")
        if lt == "DocType" and not frappe.db.exists("DocType", lto):
            bad.append("DocType: " + str(lto))
        if lt == "Report" and not frappe.db.exists("Report", lto):
            bad.append("Report: " + str(lto))
    if i.get("type") == "shortcut":
        if not frappe.db.exists("DocType", i["data"].get("link_to")):
            bad.append("Shortcut DocType: " + str(i["data"].get("link_to")))
    if i.get("type") == "number_card":
        if not frappe.db.exists("Number Card", i["data"].get("number_card_name")):
            bad.append("Card: " + str(i["data"].get("number_card_name")))
if bad:
    print("BROKEN:")
    for b in bad:
        print("  -", b)
else:
    print("ALL WORKSPACE REFS OK")
frappe.db.rollback()
