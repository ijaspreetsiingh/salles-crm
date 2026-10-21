import frappe, json
out = []
for n in ["Sales CRM", "Accounts App", "HRM App"]:
    d = frappe.get_doc("Workspace", n)
    out.append("=== " + n + " ===")
    out.append("module=" + str(d.module) + " public=" + str(d.public))
    rows = []
    for l in d.get("links") or []:
        rows.append({"label": l.label, "link_type": l.link_type, "link_to": l.link_to, "group": getattr(l, "group", None), "icon": getattr(l, "icon", None), "col": getattr(l, "col", None)})
    out.append("LINKROWS " + json.dumps(rows, ensure_ascii=False))
    try:
        blocks = json.loads(d.content or "[]")
        lc = []
        for b in blocks:
            if b.get("type") in ("link", "shortcut"):
                lc.append({"id": b.get("id"), "type": b.get("type"), "data": b.get("data")})
        out.append("OLDLINKBLOCKS " + json.dumps(lc, ensure_ascii=False))
        nc = [b["data"] for b in blocks if b.get("type") == "number_card"]
        ch = [b["data"] for b in blocks if b.get("type") == "chart"]
        out.append("NUMCARDS " + json.dumps(nc, ensure_ascii=False))
        out.append("CHARTS " + json.dumps(ch, ensure_ascii=False))
    except Exception as e:
        out.append("CONTENT ERR " + str(e))
out.append("=== ALL NUMBER CARDS ===")
out.append(json.dumps([x.name for x in frappe.get_all("Number Card")], ensure_ascii=False))
out.append("=== ALL DASHBOARD CHARTS ===")
out.append(json.dumps([x.name for x in frappe.get_all("Dashboard Chart")], ensure_ascii=False))
open("/tmp/ws_fix_data.txt", "w", encoding="utf-8").write("\n".join(out))
print("OK")
