import frappe
import json

reps = frappe.get_all("Report", filters={"name": ["like", "%Leave%"]}, fields=["name", "report_type", "ref_doctype"])
print("leave reports:", [(r.name, r.ref_doctype) for r in reps])

ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
changed = False
for i in items:
    if i.get("type") == "link":
        d = i["data"]
        if d.get("link_to") == "Leave Balance":
            new = None
            for r in reps:
                new = r.name
                break
            if not new:
                new = "Leave Application"
                d["link_type"] = "DocType"
            d["label"] = new
            d["link_to"] = new
            changed = True
            print("relinked Leave Balance ->", new, "|", d.get("link_type"))
if changed:
    ws.content = json.dumps(items)
    ws.save(ignore_permissions=True)
    frappe.db.commit()
    print("saved")
