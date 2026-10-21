import frappe
import json
import re
import html as html_mod


def clean_text(t):
    t = re.sub(r"\?{2,}", "", t or "")
    t = re.sub(r"(<[^>]+>)\s+", r"\1", t)
    t = re.sub(r"\s+(</)", r"\1", t)
    return t


def plain_title(t):
    t = re.sub(r"<[^>]+>", "", t or "")
    t = re.sub(r"\?{2,}", "", t)
    t = html_mod.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    return t or "Links"


def target_ok(lt, lto):
    if not lto:
        return False
    if lt == "DocType":
        return bool(frappe.db.exists("DocType", lto))
    if lt == "Report":
        return bool(frappe.db.exists("Report", lto))
    if lt == "Page":
        return True
    return True


def ensure_lead_chart():
    if frappe.db.exists("Dashboard Chart", "Leads by Status"):
        return True
    attempts = [
        {"chart_type": "Group By", "group_by_based_on": "status"},
        {"chart_type": "Count"},
    ]
    for extra in attempts:
        try:
            doc = {
                "doctype": "Dashboard Chart",
                "chart_name": "Leads by Status",
                "document_type": "Lead",
                "is_public": 1,
                "timespan": "Last Year",
                "time_interval": "Monthly",
            }
            doc.update(extra)
            frappe.get_doc(doc).insert(ignore_permissions=True)
            frappe.db.commit()
            return True
        except Exception:
            frappe.db.rollback()
    return False


def fix(name):
    ws = frappe.get_doc("Workspace", name)
    blocks = json.loads(ws.content or "[]")
    ws.number_cards = []
    ws.charts = []
    ws.shortcuts = []
    ws.links = []
    new = []
    link_rows = []
    dropped = []
    pending = []
    title = [None]

    def flush():
        if pending and title[0]:
            link_rows.append({"type": "Card Break", "label": title[0]})
            for it in pending:
                link_rows.append({"type": "Link", "label": it[0], "link_type": it[1], "link_to": it[2]})
            cid = "card" + re.sub(r"[^a-z0-9]", "", title[0].lower())[:22]
            new.append({"id": cid, "type": "card", "data": {"card_name": title[0], "col": 4}})
        pending[:] = []

    for b in blocks:
        t = b.get("type")
        d = b.get("data") or {}
        if t == "header":
            flush()
            title[0] = plain_title(d.get("text"))
            new.append({"id": b.get("id"), "type": "header", "data": {"text": clean_text(d.get("text")), "col": int(d.get("col") or 12)}})
        elif t == "link":
            lt = d.get("link_type") or "DocType"
            lto = d.get("link_to")
            if target_ok(lt, lto):
                pending.append((d.get("label"), lt, lto))
            else:
                dropped.append(d.get("label") + " -> " + str(lto))
        elif t == "shortcut":
            label = d.get("label")
            sc_type = d.get("type") or "DocType"
            ws.append("shortcuts", {"type": sc_type, "link_to": d.get("link_to"), "label": label, "doc_view": "New"})
            new.append({"id": b.get("id"), "type": "shortcut", "data": {"shortcut_name": label, "col": int(d.get("col") or 3)}})
        elif t == "number_card":
            nm = d.get("number_card_name")
            if frappe.db.exists("Number Card", nm):
                ws.append("number_cards", {"number_card_name": nm, "label": nm})
                new.append({"id": b.get("id"), "type": "number_card", "data": {"number_card_name": nm, "col": int(d.get("col") or 4)}})
            else:
                dropped.append("number_card: " + str(nm))
        elif t == "chart":
            nm = d.get("chart_name")
            if not frappe.db.exists("Dashboard Chart", nm) and nm == "Leads by Status":
                ensure_lead_chart()
            if frappe.db.exists("Dashboard Chart", nm):
                ws.append("charts", {"chart_name": nm, "label": nm})
                new.append({"id": b.get("id"), "type": "chart", "data": {"chart_name": nm, "col": int(d.get("col") or 12)}})
            else:
                dropped.append("chart: " + str(nm))
        else:
            new.append(b)
    flush()

    for r in link_rows:
        ws.append("links", r)
    ws.content = json.dumps(new, ensure_ascii=False)
    ws.save(ignore_permissions=True)
    frappe.db.commit()
    return {
        "blocks": len(new),
        "cards": sum(1 for r in link_rows if r["type"] == "Card Break"),
        "links": sum(1 for r in link_rows if r["type"] == "Link"),
        "shortcuts": len(ws.get("shortcuts") or []),
        "number_cards": len(ws.get("number_cards") or []),
        "charts": len(ws.get("charts") or []),
        "dropped": dropped,
    }


results = {}
for nm in ["Sales CRM", "Accounts App", "HRM App"]:
    try:
        results[nm] = fix(nm)
    except Exception as e:
        frappe.db.rollback()
        results[nm] = {"error": str(e)}

frappe.clear_cache()
frappe.db.commit()
out = json.dumps(results, indent=1, ensure_ascii=False)
open("/tmp/fix_result.json", "w", encoding="utf-8").write(out)
print(out)
