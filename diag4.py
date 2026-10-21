import frappe

print("-- leaf accounts matching tax/gst/duty --")
for a in frappe.get_all("Account", filters={"company": "jass", "is_group": 0}, fields=["name"], limit_page_length=300):
    nm = str(a["name"]).lower()
    hit = False
    for k in ["tax", "gst", "dut", "input", "output", "payable", "receivable"]:
        if k in nm:
            hit = True
    if hit:
        print("  ", a["name"])

print("\n-- group accounts Duties/Tax --")
for a in frappe.get_all("Account", filters={"company": "jass", "is_group": 1}, fields=["name"], limit_page_length=300):
    nm = str(a["name"]).lower()
    if "tax" in nm or "dut" in nm:
        print("  ", a["name"])

print("\n-- Payment Terms Template Detail fields --")
try:
    for f in frappe.get_meta("Payment Terms Template Detail").fields:
        print("  ", f.fieldname, "|", f.fieldtype, "| reqd:", f.reqd)
except Exception as e:
    print("  err:", e)

print("\n-- GST-ish accounts exist checks --")
for cand in ["CGST - Jass", "SGST - Jass", "IGST - Jass", "Tax Payable - Jass", "Tax Receivable - Jass",
             "Input CGST - Jass", "Output CGST - Jass", "Duties & Taxes - Jass"]:
    print("  ", cand, "->", bool(frappe.db.exists("Account", cand)))

frappe.db.rollback()
