import frappe, json
out = []
for n in ["Sales CRM", "Accounts App", "HRM App"]:
    d = frappe.get_doc("Workspace", n)
    out.append(n + " childrows: number_cards=" + str(len(d.get("number_cards") or [])) + " charts=" + str(len(d.get("charts") or [])) + " shortcuts=" + str(len(d.get("shortcuts") or [])) + " quick_lists=" + str(len(d.get("quick_lists") or [])) + " links=" + str(len(d.get("links") or [])))
    if d.get("number_cards"):
        out.append("  nc: " + json.dumps([r.number_card for r in d.get("number_cards")]))
    if d.get("charts"):
        out.append("  ch: " + json.dumps([r.chart for r in d.get("charts")]))
print("\n".join(out))
