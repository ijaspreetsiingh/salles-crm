import frappe

print("-- HR-ish DocTypes registered --")
rows = frappe.get_all("DocType", filters={"module": ["in", ["HR", "Payroll", "HRMS"]]}, fields=["name", "module", "istable"], limit_page_length=200)
print("  count:", len(rows))
for r in rows:
    print("   ", r.name, "|", r.module)

print("\n-- modules of key doctypes --")
for dt in ["Employee", "Leave Type", "Leave Application", "Attendance", "Salary Slip",
           "Salary Component", "Employment Type", "Shift Type", "Expense Claim", "Job Applicant"]:
    exists = bool(frappe.db.exists("DocType", dt))
    mod = frappe.db.get_value("DocType", dt, "module") if exists else None
    has_table = False
    if exists:
        try:
            frappe.db.count(dt, limit=1)
            has_table = True
        except Exception:
            has_table = False
    print("  ", dt, "| doc:", exists, "| module:", mod, "| table:", has_table)

print("\n-- installed apps --")
print("  ", frappe.get_installed_apps())

frappe.db.rollback()
