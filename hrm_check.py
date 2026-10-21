import frappe

print("-- HR-related existing data --")
for dt in ["Department", "Designation", "Branch", "Employee", "Employment Type",
           "Leave Type", "Shift Type", "Salary Component"]:
    try:
        print("  ", dt, ":", frappe.db.count(dt))
    except Exception as e:
        print("  ", dt, "ERR", str(e)[:60])

print("\n-- Departments --")
for d in frappe.get_all("Department", fields=["name", "parent_department", "company"]):
    print("  ", d.name, "| parent:", d.parent_department, "| co:", d.company)

print("\n-- Designations --")
print("  ", frappe.get_all("Designation", pluck="name"))

print("\n-- Leave Types --")
print("  ", frappe.get_all("Leave Type", pluck="name"))

print("\n-- Salary Components (sample) --")
print("  ", frappe.get_all("Salary Component", pluck="name")[:20])

print("\n-- Branches / Employment Types --")
print("  ", frappe.get_all("Branch", pluck="name"))
print("  ", frappe.get_all("Employment Type", pluck="name"))

print("\n-- Shift Types --")
print("  ", frappe.get_all("Shift Type", pluck="name"))

print("\n-- Workspaces with HR --")
print("  ", frappe.get_all("Workspace", filters={"label": ["like", "%HR%"]}, pluck="name"))
print("  ", frappe.get_all("Workspace", pluck="name"))

print("\n-- Roles HR --")
for r in ["HR User", "HR Manager", "Employee Self Service"]:
    print("  ", r, ":", bool(frappe.db.exists("Role", r)))

print("\n-- Employee naming series / fields --")
for f in frappe.get_meta("Employee").fields:
    if f.fieldname in ["naming_series", "employee_number", "date_of_joining", "reports_to", "department", "designation", "branch", "employment_type"]:
        print("  ", f.fieldname, "|", f.fieldtype, "| reqd:", f.reqd, "| options:", (f.options or "")[:60])

frappe.db.rollback()
