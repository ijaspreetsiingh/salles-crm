import frappe
import json

out = []
ws = frappe.get_doc("Workspace", "HRM App")
items = json.loads(ws.content) if isinstance(ws.content, str) else ws.content
for i in items:
    out.append(str(i.get("id")) + " | " + str(i.get("type")) + " | " + json.dumps(i.get("data"))[:200])
open("/tmp/ws_dump.txt", "w").write("\n".join(out))
print("written", len(out))
