import frappe

for dt in ["Employment Type", "Branch", "Shift Type"]:
    print("== " + dt + " ==")
    meta = frappe.get_meta(dt)
    print("  autoname:", meta.autoname)
    for f in meta.fields:
        if f.fieldname in ("docstatus", "name") or f.fieldtype in ("Section Break", "Column Break", "Tab Break"):
            continue
        print("   ", f.fieldname, "|", f.fieldtype, "| req:", f.reqd, "| label:", f.label)

print("\n-- existing Employment Types --")
try:
    for r in frappe.get_all("Employment Type", fields=["name"]):
        print("  ", r.name)
except Exception as e:
    print("  err:", e)

print("\n-- existing Branches --")
try:
    for r in frappe.get_all("Branch", fields=["name"]):
        print("  ", r.name)
except Exception as e:
    print("  err:", e)

print("\n-- existing Shift Types --")
try:
    for r in frappe.get_all("Shift Type", fields=["name"]):
        print("  ", r.name)
except Exception as e:
    print("  err:", e)

frappe.db.rollback()
