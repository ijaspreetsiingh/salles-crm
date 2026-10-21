import frappe
import json

print("=" * 60)
print("PHASE 2: ACCOUNTS MODULE - COMPLETE SETUP")
print("=" * 60)

company = "jass"

# 1. CREATE PAYMENT TERMS
print("\n[1/8] Creating Payment Terms Templates...")
payment_terms = [
    ("Immediate Payment", [{"due_by": 0, "invoice_portion": 100}]),
    ("Net 15", [{"due_by": 15, "invoice_portion": 100}]),
    ("Net 30", [{"due_by": 30, "invoice_portion": 100}]),
    ("Net 45", [{"due_by": 45, "invoice_portion": 100}]),
    ("Net 60", [{"due_by": 60, "invoice_portion": 100}]),
    ("Net 90", [{"due_by": 90, "invoice_portion": 100}]),
    ("50% Advance, 50% on Delivery", [
        {"due_by": 0, "invoice_portion": 50, "description": "Advance"},
        {"due_by": 30, "invoice_portion": 50, "description": "On Delivery"}
    ]),
    ("30% Advance, 70% on Delivery", [
        {"due_by": 0, "invoice_portion": 30, "description": "Advance"},
        {"due_by": 30, "invoice_portion": 70, "description": "On Delivery"}
    ]),
    ("25% Monthly Installment", [
        {"due_by": 0, "invoice_portion": 25},
        {"due_by": 30, "invoice_portion": 25},
        {"due_by": 60, "invoice_portion": 25},
        {"due_by": 90, "invoice_portion": 25}
    ]),
]

for name, terms in payment_terms:
    if not frappe.db.exists("Payment Terms Template", name):
        doc = {
            "doctype": "Payment Terms Template",
            "template_name": name,
            "payment_terms": []
        }
        for t in terms:
            doc["payment_terms"].append({
                "doctype": "Payment Term",
                "due_by": t.get("due_by", 0),
                "invoice_portion": t.get("invoice_portion", 100),
                "description": t.get("description", "")
            })
        frappe.get_doc(doc).insert(ignore_permissions=True)
        print(f"  + Created: {name}")

# 2. CREATE GST TAX TEMPLATES (India)
print("\n[2/8] Creating GST Tax Templates...")
gst_rates = [
    ("GST 0%", 0),
    ("GST 5%", 5),
    ("GST 12%", 12),
    ("GST 18%", 18),
    ("GST 28%", 28),
]

for name, rate in gst_rates:
    if not frappe.db.exists("Sales Taxes and Charges Template", name):
        frappe.get_doc({
            "doctype": "Sales Taxes and Charges Template",
            "title": name,
            "company": company,
            "taxes": [{
                "doctype": "Sales Taxes and Charges",
                "charge_type": "On Net Total",
                "account_head": f"CGST - {company}" if frappe.db.exists("Account", f"CGST - {company}") else f"Tax Payable - {company}",
                "rate": rate / 2,
                "description": f"CGST {rate/2}%",
                "cost_center": f"Main - {company}"
            }, {
                "doctype": "Sales Taxes and Charges",
                "charge_type": "On Net Total",
                "account_head": f"SGST - {company}" if frappe.db.exists("Account", f"SGST - {company}") else f"Tax Payable - {company}",
                "rate": rate / 2,
                "description": f"SGST {rate/2}%",
                "cost_center": f"Main - {company}"
            }]
        }).insert(ignore_permissions=True)
        print(f"  + Created Sales Tax: {name}")

# Purchase Tax Templates
for name, rate in gst_rates:
    if not frappe.db.exists("Purchase Taxes and Charges Template", name):
        frappe.get_doc({
            "doctype": "Purchase Taxes and Charges Template",
            "title": name,
            "company": company,
            "taxes": [{
                "doctype": "Purchase Taxes and Charges",
                "charge_type": "On Net Total",
                "account_head": f"ITC CGST - {company}" if frappe.db.exists("Account", f"ITC CGST - {company}") else f"Tax Receivable - {company}",
                "rate": rate / 2,
                "description": f"ITC CGST {rate/2}%",
                "cost_center": f"Main - {company}"
            }, {
                "doctype": "Purchase Taxes and Charges",
                "charge_type": "On Net Total",
                "account_head": f"ITC SGST - {company}" if frappe.db.exists("Account", f"ITC SGST - {company}") else f"Tax Receivable - {company}",
                "rate": rate / 2,
                "description": f"ITC SGST {rate/2}%",
                "cost_center": f"Main - {company}"
            }]
        }).insert(ignore_permissions=True)
        print(f"  + Created Purchase Tax: {name}")

# 3. CREATE COST CENTERS (Department-wise)
print("\n[3/8] Creating Cost Centers...")
cost_centers = [
    ("Sales", f"Main - {company}"),
    ("Marketing", f"Main - {company}"),
    ("HR", f"Main - {company}"),
    ("IT", f"Main - {company}"),
    ("Operations", f"Main - {company}"),
    ("Finance", f"Main - {company}"),
    ("Admin", f"Main - {company}"),
    ("Production", f"Main - {company}"),
    ("R&D", f"Main - {company}"),
    ("Logistics", f"Main - {company}"),
]

for name, parent in cost_centers:
    cc_name = f"{name} - {company}"
    if not frappe.db.exists("Cost Center", cc_name):
        frappe.get_doc({
            "doctype": "Cost Center",
            "cost_center_name": name,
            "parent_cost_center": parent if frappe.db.exists("Cost Center", parent) else None,
            "company": company,
            "is_group": 0
        }).insert(ignore_permissions=True)
        print(f"  + Created Cost Center: {name}")

# 4. CREATE BANK ACCOUNTS
print("\n[4/8] Creating Bank Accounts...")
bank_accounts = [
    ("HDFC Bank Current", "HDFC Bank", "50200012345678", "IFSC-HDFC0001234"),
    ("SBI Current", "State Bank of India", "12345678901", "IFSC-SBIN0001234"),
    ("ICICI Bank Current", "ICICI Bank", "000705001234", "IFSC-ICIC0000123"),
]

for name, bank, acc_no, ifsc in bank_accounts:
    if not frappe.db.exists("Bank Account", name):
        # Create Bank first if not exists
        if not frappe.db.exists("Bank", bank):
            frappe.get_doc({
                "doctype": "Bank",
                "bank_name": bank,
                "swift_code": ifsc[:8],
                "country": "India"
            }).insert(ignore_permissions=True)
            print(f"  + Created Bank: {bank}")
        
        frappe.get_doc({
            "doctype": "Bank Account",
            "account_name": name,
            "bank": bank,
            "bank_account_no": acc_no,
            "iban": ifsc,
            "company": company,
            "account_type": "Checking",
            "is_default": 1 if "HDFC" in name else 0
        }).insert(ignore_permissions=True)
        print(f"  + Created Bank Account: {name}")

# 5. CREATE ACCOUNTING NUMBER CARDS
print("\n[5/8] Creating Accounting Number Cards...")
accounting_cards = [
    {"name": "Total Receivables", "document_type": "Sales Invoice", 
     "filters_json": json.dumps([["Sales Invoice", "status", "=", "Overdue"], ["Sales Invoice", "docstatus", "=", "1"]]),
     "function": "Sum", "aggregate_function_based_on": "outstanding_amount", "color": "red"},
    
    {"name": "Total Payables", "document_type": "Purchase Invoice",
     "filters_json": json.dumps([["Purchase Invoice", "status", "=", "Overdue"], ["Purchase Invoice", "docstatus", "=", "1"]]),
     "function": "Sum", "aggregate_function_based_on": "outstanding_amount", "color": "orange"},
    
    {"name": "This Month Income", "document_type": "Sales Invoice",
     "filters_json": json.dumps([["Sales Invoice", "docstatus", "=", "1"], ["Sales Invoice", "posting_date", ">", "本月"]]),
     "function": "Sum", "aggregate_function_based_on": "grand_total", "color": "green"},
    
    {"name": "This Month Expenses", "document_type": "Purchase Invoice",
     "filters_json": json.dumps([["Purchase Invoice", "docstatus", "=", "1"], ["Purchase Invoice", "posting_date", ">", "本月"]]),
     "function": "Sum", "aggregate_function_based_on": "grand_total", "color": "red"},
    
    {"name": "Pending Sales Invoices", "document_type": "Sales Invoice",
     "filters_json": json.dumps([["Sales Invoice", "status", "=", "Unpaid"], ["Sales Invoice", "docstatus", "=", "1"]]),
     "function": "Count", "color": "blue"},
    
    {"name": "Pending Purchase Invoices", "document_type": "Purchase Invoice",
     "filters_json": json.dumps([["Purchase Invoice", "status", "=", "Unpaid"], ["Purchase Invoice", "docstatus", "=", "1"]]),
     "function": "Count", "color": "orange"},
    
    {"name": "Payments Received Today", "document_type": "Payment Entry",
     "filters_json": json.dumps([["Payment Entry", "payment_type", "=", "Receive"], ["Payment Entry", "docstatus", "=", "1"], ["Payment Entry", "posting_date", "=", "本月"]]),
     "function": "Sum", "aggregate_function_based_on": "paid_amount", "color": "green"},
    
    {"name": "Payments Made Today", "document_type": "Payment Entry",
     "filters_json": json.dumps([["Payment Entry", "payment_type", "=", "Pay"], ["Payment Entry", "docstatus", "=", "1"], ["Payment Entry", "posting_date", "=", "本月"]]),
     "function": "Sum", "aggregate_function_based_on": "paid_amount", "color": "red"},
    
    {"name": "Journal Entries This Month", "document_type": "Journal Entry",
     "filters_json": json.dumps([["Journal Entry", "docstatus", "=", "1"], ["Journal Entry", "posting_date", ">", "本月"]]),
     "function": "Count", "color": "purple"},
    
    {"name": "Bank Balance", "document_type": "Bank Transaction",
     "filters_json": json.dumps([]),
     "function": "Sum", "aggregate_function_based_on": "debit", "color": "teal"},
]

for card_data in accounting_cards:
    card_name = card_data.pop("name")
    if not frappe.db.exists("Number Card", card_name):
        card_data["doctype"] = "Number Card"
        card_data["label"] = card_name
        card_data["name"] = card_name
        try:
            frappe.get_doc(card_data).insert(ignore_permissions=True)
            print(f"  + Created card: {card_name}")
        except Exception as e:
            print(f"  ! Skipped {card_name}: {str(e)[:50]}")

# 6. CREATE ACCOUNTING DASHBOARD CHARTS
print("\n[6/8] Creating Accounting Charts...")
charts = [
    {"name": "Income vs Expense Monthly", "chart_type": "Custom", "document_type": "GL Entry",
     "custom_options": json.dumps({
         "type": "bar",
         "colors": ["#4CAF50", "#F44336"],
         "x": "posting_date",
         "y": ["debit", "credit"],
         "yAxis": "Amount (INR)",
         "xAxis": "Month",
         "tooltip": "bar"
     }),
     "is_public": 1},
    
    {"name": "Receivables Ageing", "chart_type": "Count", "document_type": "Sales Invoice",
     "group_by_based_on": "status", "filters_json": json.dumps([["Sales Invoice", "docstatus", "=", "1"]]),
     "is_public": 1, "timespan": "Select Date Range", "time_interval": "Daily",
     "from_date": "2026-01-01", "to_date": "2026-12-31"},
]

for chart_data in charts:
    chart_name = chart_data.pop("name")
    if not frappe.db.exists("Dashboard Chart", chart_name):
        chart_data["doctype"] = "Dashboard Chart"
        chart_data["chart_name"] = chart_name
        chart_data["name"] = chart_name
        try:
            frappe.get_doc(chart_data).insert(ignore_permissions=True)
            print(f"  + Created chart: {chart_name}")
        except Exception as e:
            print(f"  ! Skipped {chart_name}: {str(e)[:50]}")

# 7. CREATE ACCOUNTS WORKSPACE
print("\n[7/8] Creating Accounts Workspace...")
if not frappe.db.exists("Workspace", "Accounts App"):
    workspace_content = json.dumps([
        {"id": "h1", "type": "header", "data": {"text": "<span class=\"h4\">💰 Accounts Dashboard</span>", "col": 12}},
        {"id": "c1", "type": "number_card", "data": {"number_card_name": "Total Receivables", "col": 3}},
        {"id": "c2", "type": "number_card", "data": {"number_card_name": "Total Payables", "col": 3}},
        {"id": "c3", "type": "number_card", "data": {"number_card_name": "This Month Income", "col": 3}},
        {"id": "c4", "type": "number_card", "data": {"number_card_name": "This Month Expenses", "col": 3}},
        {"id": "c5", "type": "number_card", "data": {"number_card_name": "Pending Sales Invoices", "col": 3}},
        {"id": "c6", "type": "number_card", "data": {"number_card_name": "Pending Purchase Invoices", "col": 3}},
        {"id": "c7", "type": "number_card", "data": {"number_card_name": "Payments Received Today", "col": 3}},
        {"id": "c8", "type": "number_card", "data": {"number_card_name": "Payments Made Today", "col": 3}},
        
        {"id": "h2", "type": "header", "data": {"text": "<span class=\"h4\">⚡ Quick Actions</span>", "col": 12}},
        {"id": "s1", "type": "shortcut", "data": {"label": "New Sales Invoice", "link_to": "Sales Invoice", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s2", "type": "shortcut", "data": {"label": "New Purchase Invoice", "link_to": "Purchase Invoice", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s3", "type": "shortcut", "data": {"label": "New Payment Entry", "link_to": "Payment Entry", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s4", "type": "shortcut", "data": {"label": "New Journal Entry", "link_to": "Journal Entry", "type": "DocType", "col": 3, "icon": "add"}},
        
        {"id": "h3", "type": "header", "data": {"text": "<span class=\"h4\">📋 Accounting Records</span>", "col": 12}},
        {"id": "l1", "type": "link", "data": {"label": "Sales Invoices", "link_type": "DocType", "link_to": "Sales Invoice", "col": 3, "icon": "invoice"}},
        {"id": "l2", "type": "link", "data": {"label": "Purchase Invoices", "link_type": "DocType", "link_to": "Purchase Invoice", "col": 3, "icon": "invoice"}},
        {"id": "l3", "type": "link", "data": {"label": "Payment Entries", "link_type": "DocType", "link_to": "Payment Entry", "col": 3, "icon": "payment"}},
        {"id": "l4", "type": "link", "data": {"label": "Journal Entries", "link_type": "DocType", "link_to": "Journal Entry", "col": 3, "icon": "journal"}},
        {"id": "l5", "type": "link", "data": {"label": "Customers", "link_type": "DocType", "link_to": "Customer", "col": 3, "icon": "customer"}},
        {"id": "l6", "type": "link", "data": {"label": "Suppliers", "link_type": "DocType", "link_to": "Supplier", "col": 3, "icon": "supplier"}},
        {"id": "l7", "type": "link", "data": {"label": "Bank Accounts", "link_type": "DocType", "link_to": "Bank Account", "col": 3, "icon": "bank"}},
        {"id": "l8", "type": "link", "data": {"label": "Cost Centers", "link_type": "DocType", "link_to": "Cost Center", "col": 3, "icon": "cost-center"}},
        
        {"id": "h4", "type": "header", "data": {"text": "<span class=\"h4\">🏦 Banking</span>", "col": 12}},
        {"id": "l9", "type": "link", "data": {"label": "Bank Transactions", "link_type": "DocType", "link_to": "Bank Transaction", "col": 3, "icon": "bank"}},
        {"id": "l10", "type": "link", "data": {"label": "Bank Reconciliation", "link_type": "DocType", "link_to": "Bank Transaction", "col": 3, "icon": "reconcile"}},
        {"id": "l11", "type": "link", "data": {"label": "Mode of Payment", "link_type": "DocType", "link_to": "Mode of Payment", "col": 3, "icon": "payment"}},
        {"id": "l12", "type": "link", "data": {"label": "Payment Terms", "link_type": "DocType", "link_to": "Payment Terms Template", "col": 3, "icon": "terms"}},
        
        {"id": "h5", "type": "header", "data": {"text": "<span class=\"h4\">📊 Financial Reports</span>", "col": 12}},
        {"id": "r1", "type": "link", "data": {"label": "General Ledger", "link_type": "Report", "link_to": "General Ledger", "col": 4, "icon": "report"}},
        {"id": "r2", "type": "link", "data": {"label": "Profit and Loss", "link_type": "Report", "link_to": "Profit and Loss", "col": 4, "icon": "report"}},
        {"id": "r3", "type": "link", "data": {"label": "Balance Sheet", "link_type": "Report", "link_to": "Balance Sheet", "col": 4, "icon": "report"}},
        {"id": "r4", "type": "link", "data": {"label": "Cash Flow", "link_type": "Report", "link_to": "Cash Flow", "col": 4, "icon": "report"}},
        {"id": "r5", "type": "link", "data": {"label": "Accounts Receivable Ageing", "link_type": "Report", "link_to": "Accounts Receivable Ageing", "col": 4, "icon": "report"}},
        {"id": "r6", "type": "link", "data": {"label": "Accounts Payable Ageing", "link_type": "Report", "link_to": "Accounts Payable Ageing", "col": 4, "icon": "report"}},
        {"id": "r7", "type": "link", "data": {"label": "Sales Register", "link_type": "Report", "link_to": "Sales Register", "col": 4, "icon": "report"}},
        {"id": "r8", "type": "link", "data": {"label": "Purchase Register", "link_type": "Report", "link_to": "Purchase Register", "col": 4, "icon": "report"}},
        {"id": "r9", "type": "link", "data": {"label": "Trial Balance", "link_type": "Report", "link_to": "Trial Balance", "col": 4, "icon": "report"}},
        
        {"id": "h6", "type": "header", "data": {"text": "<span class=\"h4\">⚙️ Settings</span>", "col": 12}},
        {"id": "st1", "type": "link", "data": {"label": "Chart of Accounts", "link_type": "DocType", "link_to": "Account", "col": 3, "icon": "chart"}},
        {"id": "st2", "type": "link", "data": {"label": "Tax Templates", "link_type": "DocType", "link_to": "Sales Taxes and Charges Template", "col": 3, "icon": "tax"}},
        {"id": "st3", "type": "link", "data": {"label": "Fiscal Years", "link_type": "DocType", "link_to": "Fiscal Year", "col": 3, "icon": "calendar"}},
        {"id": "st4", "type": "link", "data": {"label": "Accounts Settings", "link_type": "DocType", "link_to": "Accounts Settings", "col": 3, "icon": "settings"}},
    ])
    
    workspace = frappe.get_doc({
        "doctype": "Workspace",
        "label": "Accounts App",
        "title": "Accounts",
        "public": 1,
        "module": "Accounts",
        "icon": "money",
        "content": workspace_content,
        "is_hidden": 0,
        "indicator_color": "blue"
    })
    workspace.insert(ignore_permissions=True)
    print("  + Created workspace: Accounts App")
else:
    print("  - Workspace already exists")

# 8. CREATE ACCOUNTS ROLES
print("\n[8/8] Creating Accounts Roles...")
roles = [
    ("Accounts User", "Accounts User for billing and payments"),
    ("Accounts Manager", "Accounts Manager with full access"),
]
for role_name, desc in roles:
    if not frappe.db.exists("Role", role_name):
        frappe.get_doc({
            "doctype": "Role",
            "role_name": role_name,
            "desk_access": 1,
            "disabled": 0
        }).insert(ignore_permissions=True)
        print(f"  + Created role: {role_name}")

frappe.db.commit()

print("\n" + "=" * 60)
print("PHASE 2: ACCOUNTS MODULE SETUP COMPLETE!")
print("=" * 60)

# Summary
print("\n✅ SUMMARY:")
print(f"  Payment Terms: {frappe.db.count('Payment Terms Template')}")
print(f"  Sales Tax Templates: {frappe.db.count('Sales Taxes and Charges Template')}")
print(f"  Purchase Tax Templates: {frappe.db.count('Purchase Taxes and Charges Template')}")
print(f"  Cost Centers: {frappe.db.count('Cost Center')}")
print(f"  Bank Accounts: {frappe.db.count('Bank Account')}")
print(f"  Number Cards: {frappe.db.count('Number Card')}")
print(f"  Accounts Workspace: {'✅ YES' if frappe.db.exists('Workspace', 'Accounts App') else '❌ NO'}")
print(f"  Accounts User Role: {'✅ YES' if frappe.db.exists('Role', 'Accounts User') else '❌ NO'}")
print(f"  Accounts Manager Role: {'✅ YES' if frappe.db.exists('Role', 'Accounts Manager') else '❌ NO'}")

print("\n🎯 ACCESS:")
print("  Workspace URL: http://localhost:8081/app/accounts-app")
print("  Login: Administrator / admin")
