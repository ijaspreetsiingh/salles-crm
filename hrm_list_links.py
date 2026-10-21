import frappe
import json

ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
for i in items:
    if i.get("type") == "link":
        print("LINK:", i["data"].get("link_type"), "|", i["data"].get("link_to"), "|", i["data"].get("label"))
