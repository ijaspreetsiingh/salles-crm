import frappe
import json

print("-- available reports (hr/attendance/leave/salary) --")
reps = frappe.get_all("Report", filters={"report_type": "Query Report", "ref_doctype": ["in", ["Employee", "Attendance", "Leave Application", "Salary Slip", "Leave Type"]]}, fields=["name", "ref_doctype"])
for r in reps:
    print("  ", r.name, "|", r.ref_doctype)

print("-- doctype similar to Employee Tax Declaration --")
for dt in frappe.get_all("DocType", filters={"name": ["like", "%Tax%"]}, fields=["name"]):
    print("  ", dt.name)

# fix workspace links
ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
report_map = {"Leave Balance": "Leave Balance Summary", "Attendance Summary": "Monthly Attendance Sheet"}
changed = False
for i in items:
    if i.get("type") == "link":
        d = i["data"]
        if d.get("link_type") == "Report" and not frappe.db.exists("Report", d.get("link_to")):
            new = report_map.get(d.get("link_to"))
            if new and frappe.db.exists("Report", new):
                d["label"] = new
                d["link_to"] = new
                changed = True
                print("  relinked report ->", new)
        if d.get("link_to") == "Employee Tax Declaration":
            if frappe.db.exists("DocType", "Employee Tax Declaration"):
                pass
            else:
                d["label"] = "Gratuity List"
                d["link_type"] = "DocType"
                d["link_to"] = "Gratuity"
                changed = True
                print("  replaced Employee Tax Declaration -> Gratuity")
if changed:
    ws.content = json.dumps(items)
    ws.save(ignore_permissions=True)
    frappe.db.commit()
    print("  workspace saved")
frappe.db.commit()
