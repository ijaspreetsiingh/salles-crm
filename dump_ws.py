import frappe, json
names = ["Sales CRM", "Accounts App", "HRM App", "Invoicing"]
parts = []
summary = []
for n in names:
    try:
        d = frappe.get_doc("Workspace", n)
        parts.append("=== " + n + " ===")
        parts.append(d.content)
        try:
            blocks = json.loads(d.content)
            summary.append(n + ": " + ", ".join(sorted(set(b.get("type","?") for b in blocks))))
        except Exception as e:
            summary.append(n + ": JSON PARSE FAIL " + str(e))
    except Exception as e:
        summary.append(n + ": DOC ERR " + str(e))
open("/tmp/ws_content.txt", "w", encoding="utf-8").write("\n\n".join(parts))
open("/tmp/ws_summary.txt", "w", encoding="utf-8").write("\n".join(summary))
print("OK")
