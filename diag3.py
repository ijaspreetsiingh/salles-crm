import frappe
import json

print("Company abbr:", frappe.db.get_value("Company", "jass", "abbr"))

print("\n-- Payment Terms Template table field --")
for f in frappe.get_meta("Payment Terms Template").fields:
    print("  ", f.fieldname, "|", f.fieldtype, "| options:", f.options)

print("\n-- Sample tax/duty accounts (leaf) --")
for a in frappe.get_all("Account", filters={"company": "jass", "is_group": 0}, fields=["name"], limit_page_length=300):
    n = a.name.lower()
    if any(k in n for k in ["tax", "gst", "dut", "input", "output"]):
        print("  ", a.name)

print("\n-- Bank Account Type doctype --")
try:
    print("  ", frappe.get_all("Bank Account Type", pluck="name"))
except Exception as e:
    print("  err:", e)

print("\n-- Bank Account mandatory fields --")
for f in frappe.get_meta("Bank Account").fields:
    if f.reqd:
        print("  reqd:", f.fieldname, f.fieldtype, f.options)

print("\n-- Cards with bad date filters --")
for c in frappe.get_all("Number Card", filters={"filters_json": ["like", "%本月%"]}, fields=["name", "filters_json", "function"]):
    print("  ", c.name, "|", c.function, "|", c.filters_json)

print("\n-- All cost centers (any company) --")
for c in frappe.get_all("Cost Center", fields=["name", "company", "is_group"]):
    print("  ", c.name, "|", c.company, "| group:", c.is_group)

print("\n-- Payment Terms Template sample existing --")
print("  ", frappe.get_all("Payment Terms Template", pluck="name"))

frappe.db.rollback()
