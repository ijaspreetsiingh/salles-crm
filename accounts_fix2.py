import frappe
import json

print("=" * 60)
print("PHASE 2 FIX v2: ACCOUNTS MODULE")
print("=" * 60)


def step(fn, label):
    try:
        fn()
        frappe.db.commit()
        print("  OK: " + label)
    except Exception as e:
        frappe.db.rollback()
        print("  FAIL: " + label + ": " + str(e)[:250])


def make_tax_accounts():
    targets = [
        ("CGST", "Duties and Taxes - Jass"),
        ("SGST", "Duties and Taxes - Jass"),
        ("IGST", "Duties and Taxes - Jass"),
        ("Input CGST", "Tax Assets - Jass"),
        ("Input SGST", "Tax Assets - Jass"),
        ("Input IGST", "Tax Assets - Jass"),
    ]
    for acc_name, parent in targets:
        full = acc_name + " - Jass"
        if frappe.db.exists("Account", full):
            continue
        if not frappe.db.exists("Account", parent):
            print("    parent missing: " + parent)
            continue
        frappe.get_doc({
            "doctype": "Account",
            "account_name": acc_name,
            "parent_account": parent,
            "company": "jass",
            "is_group": 0,
            "report_type": "Balance Sheet",
        }).insert(ignore_permissions=True)
        print("    + Account: " + full)


step(make_tax_accounts, "GST tax accounts")


def make_sales_tax():
    for rate in [0, 5, 12, 18, 28]:
        name = "GST " + str(rate) + "%"
        if frappe.db.exists("Sales Taxes and Charges Template", name):
            continue
        frappe.get_doc({
            "doctype": "Sales Taxes and Charges Template",
            "title": name,
            "company": "jass",
            "taxes": [
                {"doctype": "Sales Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": "CGST - Jass", "rate": rate / 2.0,
                 "description": "CGST " + str(rate / 2.0) + "%", "cost_center": "Main - Jass"},
                {"doctype": "Sales Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": "SGST - Jass", "rate": rate / 2.0,
                 "description": "SGST " + str(rate / 2.0) + "%", "cost_center": "Main - Jass"},
            ],
        }).insert(ignore_permissions=True)
        print("    + Sales Tax: " + name)


step(make_sales_tax, "Sales GST templates")


def make_purchase_tax():
    for rate in [0, 5, 12, 18, 28]:
        name = "GST " + str(rate) + "%"
        if frappe.db.exists("Purchase Taxes and Charges Template", name):
            continue
        frappe.get_doc({
            "doctype": "Purchase Taxes and Charges Template",
            "title": name,
            "company": "jass",
            "taxes": [
                {"doctype": "Purchase Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": "Input CGST - Jass", "rate": rate / 2.0,
                 "description": "Input CGST " + str(rate / 2.0) + "%", "cost_center": "Main - Jass"},
                {"doctype": "Purchase Taxes and Charges", "charge_type": "On Net Total",
                 "account_head": "Input SGST - Jass", "rate": rate / 2.0,
                 "description": "Input SGST " + str(rate / 2.0) + "%", "cost_center": "Main - Jass"},
            ],
        }).insert(ignore_permissions=True)
        print("    + Purchase Tax: " + name)


step(make_purchase_tax, "Purchase GST templates")


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
            row = {
                "doctype": "Payment Terms Template Detail",
                "invoice_portion": t["invoice_portion"],
                "due_date_based_on": DUE,
                "credit_days": t.get("credit_days", 0),
            }
            if t.get("description"):
                row["description"] = t["description"]
            rows.append(row)
        frappe.get_doc({
            "doctype": "Payment Terms Template",
            "template_name": name,
            "allocate_payment_based_on_payment_terms": 0,
            "terms": rows,
        }).insert(ignore_permissions=True)
        print("    + Payment Terms: " + name)


step(make_payment_terms, "Payment Terms templates")


def make_cost_centers():
    for name in ["Sales", "Marketing", "HR", "IT", "Operations", "Finance",
                 "Admin", "Production", "R&D", "Logistics"]:
        full = name + " - Jass"
        if frappe.db.exists("Cost Center", full):
            continue
        frappe.get_doc({
            "doctype": "Cost Center",
            "cost_center_name": name,
            "parent_cost_center": "jass - Jass",
            "company": "jass",
            "is_group": 0,
        }).insert(ignore_permissions=True)
        print("    + Cost Center: " + full)


step(make_cost_centers, "Cost Centers")


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
            "company": "jass",
            "is_default": is_def,
        }).insert(ignore_permissions=True)
        print("    + Bank Account: " + name)


step(make_bank_accounts, "Bank Accounts")


def fix_cards():
    fixes = {}
    fixes["This Month Income"] = ("Total Income", [["Sales Invoice", "docstatus", "=", "1"]])
    fixes["This Month Expenses"] = ("Total Expenses", [["Purchase Invoice", "docstatus", "=", "1"]])
    fixes["Payments Received Today"] = ("Payments Received", [
        ["Payment Entry", "payment_type", "=", "Receive"],
        ["Payment Entry", "docstatus", "=", "1"]])
    fixes["Payments Made Today"] = ("Payments Made", [
        ["Payment Entry", "payment_type", "=", "Pay"],
        ["Payment Entry", "docstatus", "=", "1"]])
    fixes["Journal Entries This Month"] = ("Journal Entries", [["Journal Entry", "docstatus", "=", "1"]])
    fixes["New Leads This Month"] = ("Total Leads", [["Lead", "docstatus", "in", ["0", "1"]]])
    for card_name in fixes:
        if not frappe.db.exists("Number Card", card_name):
            print("    card missing: " + card_name)
            continue
        label, filters = fixes[card_name]
        frappe.db.set_value("Number Card", card_name, "label", label)
        frappe.db.set_value("Number Card", card_name, "filters_json", json.dumps(filters))
        print("    ~ Fixed card: " + card_name + " -> " + label)


step(fix_cards, "Number Card filters")


def make_charts():
    if frappe.db.exists("Dashboard Chart", "Receivables Ageing"):
        return
    frappe.get_doc({
        "doctype": "Dashboard Chart",
        "chart_name": "Receivables Ageing",
        "chart_type": "Count",
        "document_type": "Sales Invoice",
        "group_by_based_on": "status",
        "filters_json": json.dumps([["Sales Invoice", "docstatus", "=", "1"]]),
        "timespan": "Select Date Range",
        "time_interval": "Monthly",
        "from_date": "2026-01-01",
        "to_date": "2026-12-31",
        "is_public": 1,
    }).insert(ignore_permissions=True)
    print("    + Chart: Receivables Ageing")


step(make_charts, "Dashboard charts")

print("")
print("=" * 60)
print("FIX v2 SUMMARY")
print("=" * 60)
print("  Payment Terms:", frappe.db.count("Payment Terms Template"))
print("  Sales Tax Templates:", frappe.db.count("Sales Taxes and Charges Template"))
print("  Purchase Tax Templates:", frappe.db.count("Purchase Taxes and Charges Template"))
print("  Cost Centers:", frappe.db.count("Cost Center"))
print("  Bank Accounts:", frappe.db.count("Bank Account"))
print("  CGST account:", bool(frappe.db.exists("Account", "CGST - Jass")))
print("  Workspace:", bool(frappe.db.exists("Workspace", "Accounts App")))
print("  Roles:", bool(frappe.db.exists("Role", "Accounts User")))
bad_cards = frappe.db.count("Number Card", {"filters_json": ["like", "%本月%"]})
print("  Cards with bad filters:", bad_cards)
frappe.db.commit()
