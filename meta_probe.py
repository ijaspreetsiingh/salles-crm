import frappe
import json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
out = {}
doctypes = ["Opportunity", "Lead", "Quotation", "Customer", "Sales Invoice", "Sales Order", "Event", "Project", "ToDo", "Communication", "Comment", "Sales Person", "Contact", "Campaign"]
meta_out = {}
for dt in doctypes:
    try:
        md = frappe.get_meta(dt)
        fields = {}
        for f in md.fields:
            info = {"type": f.fieldtype}
            if f.fieldtype in ("Select", "Link"):
                info["options"] = f.options if f.fieldtype == "Select" else None
            fields[f.fieldname] = info
        meta_out[dt] = {"fields": fields, "count": frappe.db.count(dt)}
    except Exception as e:
        meta_out[dt] = {"error": str(e)[:100]}
out["meta"] = meta_out
try:
    out["currency"] = frappe.db.get_single_value("Global Defaults", "default_currency")
except Exception:
    pass
out["users"] = [u.name for u in frappe.get_all("User", fields=["name"], filters={"enabled": 1}, limit=20)]
for key, args in {
    "opps_sample": ("Opportunity", ["name", "status", "opportunity_amount", "total_opportunity_amount", "probability", "sales_stage", "lead_name", "party_name", "customer_name", "expected_closing", "sales_person", "owner", "creation", "modified"]),
    "leads_sample": ("Lead", ["name", "status", "lead_name", "company_name", "source", "converted_to_customer", "owner", "creation"]),
    "quotes_sample": ("Quotation", ["name", "status", "quotation_to", "party_name", "customer_name", "grand_total", "order_status", "valid_till", "creation"]),
    "invoices_sample": ("Sales Invoice", ["name", "status", "customer", "grand_total", "outstanding_amount", "due_date", "posting_date", "creation"]),
    "events_sample": ("Event", ["name", "subject", "starts_on", "ends_on", "event_type", "status", "creation"]),
    "projects_sample": ("Project", ["name", "project_name", "status", "percent_complete", "expected_end_date", "customer", "project_type", "creation"]),
    "todos_sample": ("ToDo", ["name", "description", "status", "owner", "due_date", "reference_type", "reference_name", "creation"]),
    "comms_sample": ("Communication", ["name", "communication_type", "content", "reference_doctype", "reference_name", "sender_full_name", "creation"]),
}.items():
    try:
        out[key] = frappe.get_all(args[0], fields=args[1], limit=5, order_by="creation desc")
    except Exception as e:
        out[key] = "ERR: " + str(e)[:150]
out["counts"] = {dt: frappe.db.count(dt) for dt in ["Opportunity", "Lead", "Quotation", "Customer", "Sales Invoice", "Event", "Project", "ToDo", "Communication"]}
open("/tmp/meta_probe.json", "w", encoding="utf-8").write(json.dumps(out, indent=1, default=str))
print(json.dumps(out, indent=1, default=str))
frappe.destroy()
