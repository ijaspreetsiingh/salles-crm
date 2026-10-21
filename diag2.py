import frappe

company = "jass"
abbr = frappe.get_value("Company", company, "abbreviation")
print("Company abbr:", abbr)

print("\n-- Tax-ish accounts --")
for a in frappe.get_all("Account", filters={"company": company, "is_group": 0}, fields=["name"], limit_page_length=500):
    n = a.name.lower()
    if any(k in n for k in ["tax", "gst", "dut", "cgst", "sgst", "igst", "input", "output"]):
        print("  ", a.name)

print("\n-- Cost Centers --")
for c in frappe.get_all("Cost Center", filters={"company": company}, fields=["name", "is_group", "parent_cost_center"]):
    print("  ", c.name, "| group:", c.is_group, "| parent:", c.parent_cost_center)

print("\n-- Payment Term fields --")
meta = frappe.get_meta("Payment Term")
for f in meta.fields:
    print("  ", f.fieldname, "|", f.fieldtype, "| reqd:", f.reqd)

print("\n-- Bank Account account_type field --")
meta = frappe.get_meta("Bank Account")
for f in meta.fields:
    if f.fieldname in ("account_type", "iban"):
        print("  ", f.fieldname, "|", f.fieldtype, "| options:", f.options)

print("\n-- Bank Accounts / Banks --")
print("  Bank Accounts:", frappe.db.count("Bank Account"))
print("  Banks:", frappe.get_all("Bank", pluck="name"))

print("\n-- Payment Terms / Tax Templates counts --")
print("  Payment Terms:", frappe.db.count("Payment Terms Template"))
print("  Sales Tax:", frappe.db.count("Sales Taxes and Charges Template"))
print("  Purchase Tax:", frappe.db.count("Purchase Taxes and Charges Template"))

print("\n-- Existing sales tax templates --")
print("  ", frappe.get_all("Sales Taxes and Charges Template", pluck="name"))

print("\n-- Number Cards (accounts-related) --")
for n in ["Total Receivables", "This Month Income", "Payments Received Today", "Journal Entries This Month"]:
    print("  ", n, "exists:", bool(frappe.db.exists("Number Card", n)))

frappe.db.rollback()
