import frappe, json
parts = []
for n in ["Accounting", "Selling"]:
    try:
        d = frappe.get_doc("Workspace", n)
        parts.append("=== " + n + " content ===")
        parts.append(d.content or "(empty)")
        parts.append("=== " + n + " links ===")
        parts.append(d.get("links") or "(empty)")
    except Exception as e:
        parts.append(n + " ERR " + str(e))
open("/tmp/ws_ref.txt", "w", encoding="utf-8").write("\n\n".join(str(p) for p in parts))
print("OK")
