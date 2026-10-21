import frappe
import json

ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
for i in items:
    d = i.get("data", {})
    if i.get("id") == "la3":
        d["label"] = "Employee Leave Balance"
        d["link_to"] = "Employee Leave Balance"
        print("la3 -> Employee Leave Balance")
    if i.get("id") == "p6":
        d["label"] = "Tax Exemption Declaration"
        d["link_to"] = "Employee Tax Exemption Declaration"
        print("p6 -> Employee Tax Exemption Declaration")
ws.content = json.dumps(items)
ws.save(ignore_permissions=True)
frappe.db.commit()

# re-verify
items2 = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
bad = []
for i in items2:
    d = i.get("data", {})
    if i.get("type") == "link":
        if d.get("link_type") == "DocType" and not frappe.db.exists("DocType", d.get("link_to")):
            bad.append("DocType " + str(d.get("link_to")))
        if d.get("link_type") == "Report" and not frappe.db.exists("Report", d.get("link_to")):
            bad.append("Report " + str(d.get("link_to")))
    if i.get("type") == "shortcut" and not frappe.db.exists("DocType", d.get("link_to")):
        bad.append("Shortcut " + str(d.get("link_to")))
    if i.get("type") == "number_card" and not frappe.db.exists("Number Card", d.get("number_card_name")):
        bad.append("Card " + str(d.get("number_card_name")))
if bad:
    print("BROKEN:", bad)
else:
    print("ALL 51 REFS OK")
