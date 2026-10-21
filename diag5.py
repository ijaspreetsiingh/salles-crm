import frappe

print("-- due_date_based_on options --")
f = frappe.get_meta("Payment Terms Template Detail").get_field("due_date_based_on")
print("  options:", repr(f.options))

print("\n-- payment_term link options --")
f2 = frappe.get_meta("Payment Terms Template Detail").get_field("payment_term")
print("  options:", f2.options)

print("\n-- validate_terms source --")
import inspect
import erpnext.accounts.doctype.payment_terms_template.payment_terms_template as m
print(inspect.getsource(m.PaymentTermsTemplate.validate))
print(inspect.getsource(m.PaymentTermsTemplate.validate_terms))

print("\n-- bank account meta iban/account_type --")
for fn in ["iban", "account_type", "is_default"]:
    fld = frappe.get_meta("Bank Account").get_field(fn)
    if fld:
        print("  ", fn, "|", fld.fieldtype, "| options:", fld.options, "| reqd:", fld.reqd)

frappe.db.rollback()
