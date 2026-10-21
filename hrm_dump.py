import frappe
import json

ws = frappe.get_doc("Workspace", "HRM App")
raw = ws.content
print("type:", type(raw).__name__)
items = json.loads(raw) if isinstance(raw, str) else raw
print("items:", len(items))
for i in items:
    print(" id:", i.get("id"), "| type:", i.get("type"), "| data:", json.dumps(i.get("data"))[:160])
