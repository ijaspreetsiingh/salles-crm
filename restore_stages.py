import frappe
frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()

DEFAULTS = [
    ("Prospecting", 10), ("Qualification", 20), ("Needs Analysis", 30),
    ("Value Proposition", 40), ("Identifying Decision Makers", 50),
    ("Perception Analysis", 60), ("Proposal/Price Quote", 70),
    ("Negotiation/Review", 80), ("Closed Won", 100), ("Closed Lost", 0),
]
have = set(d.name for d in frappe.get_all("Sales Stage", fields=["name"]))
n = 0
for stage, prob in DEFAULTS:
    if stage not in have:
        frappe.get_doc({"doctype": "Sales Stage", "stage_name": stage, "probability": prob}).insert(ignore_permissions=True)
        n += 1
frappe.db.commit()
print("restored:", n, "| total:", frappe.db.count("Sales Stage"))
frappe.destroy()
