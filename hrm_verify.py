import frappe
import json

print("== HRM VERIFICATION ==")

ws = frappe.get_doc("Workspace", "HRM App")
print("  Workspace: HRM App | public:", ws.public, "| module:", ws.module)
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
links = [i for i in items if i.get("type") in ("link", "shortcut")]
cards = [i for i in items if i.get("type") == "number_card"]
print("  blocks:", len(items), "| links:", len(links), "| cards:", len(cards))

bad = []
for i in links:
    lt = i["data"]["link_type"]
    lto = i["data"]["link_to"]
    if lt == "DocType":
        if not frappe.db.exists("DocType", lto):
            bad.append("missing DocType: " + lto)
    elif lt == "Report":
        try:
            from frappe.desk.query_report import Report
            if not frappe.db.exists("Report", lto):
                bad.append("missing Report: " + lto)
        except Exception:
            pass

for i in cards:
    cn = i["data"]["number_card_name"]
    if not frappe.db.exists("Number Card", cn):
        bad.append("missing Card: " + cn)
    else:
        card = frappe.get_doc("Number Card", cn)
        try:
            val = card.get_number() if hasattr(card, "get_number") else None
            print("  card:", cn, "=", val)
        except Exception as e:
            print("  card:", cn, "ERR:", str(e)[:80])

if bad:
    print("  BROKEN REFS:")
    for b in bad:
        print("   -", b)
else:
    print("  All workspace links + cards resolve OK")

print("  Installed apps:", frappe.get_installed_apps())
frappe.db.rollback()
