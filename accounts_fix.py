import frappe
import json

print("=" * 60)
print("PHASE 2 FIX: ACCOUNTS MODULE")
print("=" * 60)

company = "jass"
abbr = "Jass"


def step(fn, label):
    try:
        fn()
        print(f"  OK: {label}")
    except Exception as e:
        print(f"  FAIL: {label}: {str(e)[:200]}")
        frappe.db.rollback()


# 1. TAX ACCOUNTS
def make_tax_accounts():
    targets = [
        ("CGST", "Duties and Taxes - Jass", "Liability"),
        ("SGST", "Duties and Taxes - Jass", "Liability"),
        ("IGST", "Duties and Taxes - Jass", "Liability"),
        ("Input CGST", "Tax Assets - Jass", "Asset"),
        ("Input SGST", "Tax Assets - Jass", "Asset"),
        ("Input IGST", "Tax Assets - Jass", "Asset"),
    ]
    for acc_name, parent, root in targets:
        full = f"{acc_name} - {abbr}"
        if frappe.db.exists("Account", full):
            continue
        if not frappe.db.exists("Account", parent):
            print(f"    parent missing: {parent}")
            continue
        frappe.get_doc({
            "doctype": "Account",
            "account_name": acc_name,
            "parent_account": parent,
            "company": company,
            "root_type": root,
            "is_group": 0,
            "report_type": "Balance Sheet",
        }).insert(ignore_permissions=True)
        print(f"    + Account: {full}")


step(make_tax_accounts, "GST tax accounts")


# 2. SALES TAX TEMPLATES
def make_sales_tax():
    for rate in [0, 5, 12, 18, 28]:
        name = f"GST {rate}%"
        if frappe.db.exists("Sales Taxes and Charges Template", name):
            continue
        frappe.get_doc({
            "doctype": "Sales Taxes and Charges Template",
            "title": name,
            "company": company,
            "taxes": [
                {"doctype": "Sales Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": f"CGST - {abbr}", "rate": rate / 2,
                 "description": f"CGST {rate / 2}%", "cost_center": f"Main - {abbr}"},
                {"doctype": "Sales Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": f"SGST - {abbr}", "rate": rate / 2,
                 "description": f"SGST {rate / 2}%", "cost_center": f"Main - {abbr}"},
            ],
        }).insert(ignore_permissions=True)
        print(f"    + Sales Tax: {name}")


step(make_sales_tax, "Sales GST templates")


# 3. PURCHASE TAX TEMPLATES
def make_purchase_tax():
    for rate in [0, 5, 12, 18, 28]:
        name = f"GST {rate}%"
        if frappe.db.exists("Purchase Taxes and Charges Template", name):
            continue
        frappe.get_doc({
            "doctype": "Purchase Taxes and Charges Template",
            "title": name,
            "company": company,
            "taxes": [
                {"doctype": "Purchase Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": f"Input CGST - {abbr}", "rate": rate / 2,
                 "description": f"Input CGST {rate / 2}%", "cost_center": f"Main - {abbr}"},
                {"doctype": "Purchase Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": f"Input SGST - {abbr}", "rate": rate / 2,
                 "description": f"Input SGST {rate / 2}%", "cost_center": f"Main - {abbr}"},
            ],
        }).insert(ignore_permissions=True)
        print(f"    + Purchase Tax: {name}")


step(make_purchase_tax, "Purchase GST templates")


# 4. PAYMENT TERMS (table field = terms, child = Payment Terms Template Detail)
def make_payment_terms():
    DUE = "Day(s) after invoice date"
    payment_terms = [
        ("Immediate Payment", [{"credit_days": 0, "invoice_portion": 100}]),
        ("Net 15", [{"credit_days": 15, "invoice_portion": 100}]),
        ("Net 30", [{"credit_days": 30, "invoice_portion": 100}]),
        ("Net 45", [{"credit_days": 45, "invoice_portion": 100}]),
        ("Net 60", [{"credit_days": 60, "invoice_portion": 100}]),
        ("Net 90", [{"credit_days": 90, "invoice_portion": 100}]),
        ("50% Advance, 50% on Delivery", [
            {"credit_days": 0, "invoice_portion": 50, "description": "Advance"},
            {"credit_days": 30, "invoice_portion": 50, "description": "On Delivery"}]),
        ("30% Advance, 70% on Delivery", [
            {"credit_days": 0, "invoice_portion": 30, "description": "Advance"},
            {"credit_days": 30, "invoice_portion": 70, "description": "On Delivery"}]),
        ("25% Quarterly Installment", [
            {"credit_days": 0, "invoice_portion": 25},
            {"credit_days": 90, "invoice_portion": 25},
            {"credit_days": 180, "invoice_portion": 25},
            {"credit_days": 270, "invoice_portion": 25}]),
    ]
    for name, terms in payment_terms:
        if frappe.db.exists("Payment Terms Template", name):
            continue
        rows = []
        for t in terms:
            rows.append({
                "doctype": "Payment Terms Template Detail",
                "invoice_portion": t["invoice_portion"],
                "due_date_based_on": DUE,
                "credit_days": t.get("credit_days", 0),
                "description": t.get("description", ""),
            })
        frappe.get_doc({
            "doctype": "Payment Terms Template",
            "template_name": name,
            "allocate_payment_based_on_payment_terms": 0,
            "terms": rows,
        }).insert(ignore_permissions=True)
        print(f"    + Payment Terms: {name}")


step(make_payment_terms, "Payment Terms templates")


# 5. COST CENTERS (parent must be group: jass - Jass)
def make_cost_centers():
    parent = "jass - Jass"
    for name in ["Sales", "Marketing", "HR", "IT", "Operations", "Finance",
                 "Admin", "Production", "R&D", "Logistics"]:
        full = f"{name} - {abbr}"
        if frappe.db.exists("Cost Center", full):
            continue
        frappe.get_doc({
            "doctype": "Cost Center",
            "cost_center_name": name,
            "parent_cost_center": parent,
            "company": company,
            "is_group": 0,
        }).insert(ignore_permissions=True)
        print(f"    + Cost Center: {full}")


step(make_cost_centers, "Cost Centers")


# 6. BANK ACCOUNTS (no account_type - Bank Account Type doctype empty, no iban)
def make_bank_accounts():
    data = [
        ("HDFC Bank Current", "HDFC Bank", "50200012345678", 1),
        ("SBI Current", "State Bank of India", "12345678901", 0),
        ("ICICI Bank Current", "ICICI Bank", "000705001234", 0),
    ]
    for name, bank, acc_no, is_def in data:
        if frappe.db.exists("Bank Account", name):
            continue
        frappe.get_doc({
            "doctype": "Bank Account",
            "account_name": name,
            "bank": bank,
            "bank_account_no": acc_no,
            "company": company,
            "is_default": is_def,
        }).insert(ignore_permissions=True)
        print(f"    + Bank Account: {name}")


step(make_bank_accounts, "Bank Accounts")


# 7. FIX BAD NUMBER CARD DATE FILTERS (本月 literal invalid)
def fix_cards():
    fixes = {
        "This Month Income": ("Total Income", [["Sales Invoice", "docstatus", "=", "1"]]),
        "This Month Expenses": ("Total Expenses", [["Purchase Invoice", "docstatus", "=", "1"]]),
        "Payments Received Today": ("Payments Received", [
            ["Payment Entry", "payment_type", "=", "Receive"],
            ["Payment Entry", "docstatus", "=", "1"]]),
        "Payments Made Today": ("Payments Made", [
            ["Payment Entry", "payment_type", "=", "Pay"],
            ["Payment Entry", "docstatus", "=", "1"]]),
        "Journal Entries This Month": ("Journal Entries", [
            ["Journal Entry", "docstatus", "=", "1"]]),
        "New Leads This Month": ("Total Leads", [
            ["Lead", "docstatus", "in", ["0", "1"]]),
    }
    for card_name, (label, filters) in fixes.items():
        if not frappe.db.exists("Number Card", card_name):
            continue
        frappe.db.set_value("Number Card", card_name, {
            "label": label,
            "filters_json": json.dumps(filters),
        })
        print(f"    ~ Fixed card: {card_name} -> {label}")


step(fix_cards, "Number Card filters")


# 8. TRY CHARTS AGAIN (optional)
def make_charts():
    if not frappe.db.exists("Dashboard Chart", "Receivables Ageing"):
        try:
            frappe.get_doc({
                "doctype": "Dashboard Chart",
                "chart_name": "Receivables Ageing",
                "chart_type": "Count",
                "document_type": "Sales Invoice",
                "group_by_based_on": "status",
                "filters_json": json.dumps([["Sales Invoice", "docstatus", "=", "1"]]),
                "timespan": "Last Year",
                "time_interval": "Monthly",
                "is_public": 1,
            }).insert(ignore_permissions=True)
            print("    + Chart: Receivables Ageing")
        except Exception as e:
            print(f"    ! Chart skipped: {str(e)[:120]}")


step(make_charts, "Dashboard charts")


frappe.db.commit()

print("\n" + "=" * 60)
print("FIX COMPLETE - SUMMARY")
print("=" * 60)
print("  Payment Terms:", frappe.db.count("Payment Terms Template"))
print("  Sales Tax Templates:", frappe.db.count("Sales Taxes and Charges Template"))
print("  Purchase Tax Templates:", frappe.db.count("Purchase Taxes and Charges Template"))
print("  Cost Centers:", frappe.db.count("Cost Center"))
print("  Bank Accounts:", frappe.db.count("Bank Account"))
print("  Bank Accounts (jass):", frappe.db.count("Bank Account", {"company": company}))
print("  CGST account:", bool(frappe.db.exists("Account", f"CGST - {abbr}")))
print("  Workspace:", bool(frappe.db.exists("Workspace", "Accounts App")))
bad = frappe.db.count("Number Card", {"filters_json": ["like", "%本月%"]})
print("  Cards with bad filters remaining:", bad)
