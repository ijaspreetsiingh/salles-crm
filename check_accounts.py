import frappe

print("=== ACCOUNTS CURRENT STATE ===")

print("\n[1] Company:")
companies = frappe.get_all("Company", fields=["name", "default_currency", "country"])
for c in companies:
    print(f"  {c.name} - {c.default_currency} - {c.country}")

print("\n[2] Chart of Accounts (top level):")
try:
    coa = frappe.get_all("Account", filters={"is_group": 1, "parent_account": ""}, fields=["name", "account_type"], limit=20)
    for a in coa:
        print(f"  {a.name} ({a.account_type})")
    print(f"  Total groups: {frappe.db.count('Account', {'is_group': 1})}")
    print(f"  Total accounts: {frappe.db.count('Account')}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[3] Payment Terms:")
try:
    pt = frappe.get_all("Payment Terms Template", fields=["name"])
    for p in pt:
        print(f"  {p.name}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[4] Tax Templates:")
try:
    tt = frappe.get_all("Sales Taxes and Charges Template", fields=["name"])
    print(f"  Sales Tax Templates: {len(tt)}")
    for t in tt[:5]:
        print(f"    {t.name}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[5] Cost Centers:")
try:
    cc = frappe.get_all("Cost Center", filters={"is_group": 1}, fields=["name"], limit=10)
    for c in cc:
        print(f"  {c.name}")
    print(f"  Total: {frappe.db.count('Cost Center')}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[6] Mode of Payment:")
try:
    mp = frappe.get_all("Mode of Payment", fields=["name"])
    for m in mp:
        print(f"  {m.name}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[7] Bank Accounts:")
try:
    ba = frappe.get_all("Bank Account", fields=["name", "bank"])
    for b in ba:
        print(f"  {b.name} - {b.bank}")
except Exception as e:
    print(f"  Error: {e}")

print("\n[8] Existing Accounting Workspace:")
if frappe.db.exists("Workspace", "Accounting"):
    ws = frappe.get_doc("Workspace", "Accounting")
    print(f"  Label: {ws.label}")
    print(f"  Items: {len(ws.number_cards)} cards, {len(ws.charts)} charts")

print("\n[9] Number Cards (Accounting):")
try:
    cards = frappe.get_all("Number Card", filters={"document_type": ["in", ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"]]}, fields=["name", "document_type"])
    for c in cards:
        print(f"  {c.name} ({c.document_type})")
except Exception as e:
    print(f"  Error: {e}")

print("\n[10] GST Settings:")
try:
    gst = frappe.db.get_single_value("GST Settings", "enable")
    print(f"  GST Enabled: {gst}")
except:
    print(f"  GST Settings: Not configured")
