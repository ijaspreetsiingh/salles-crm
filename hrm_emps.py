import frappe

print("== Sample Employees ==")

designations = ["Sales Executive", "Accountant", "HR Executive", "Inventory Manager", "Project Manager", "Software Developer"]
for d in designations:
    if not frappe.db.exists("Designation", d):
        frappe.get_doc({"doctype": "Designation", "designation_name": d}).insert(ignore_permissions=True)
        print("  + Designation:", d)

emps = [
    ("Rahul Sharma", "Sales Executive", "Sales - Jass", "Full-time"),
    ("Priya Patel", "Accountant", "Accounts - Jass", "Full-time"),
    ("Amit Kumar", "HR Executive", "Human Resources - Jass", "Full-time"),
    ("Sneha Reddy", "Inventory Manager", "Operations - Jass", "Full-time"),
    ("Vikram Singh", "Project Manager", "Operations - Jass", "Full-time"),
    ("Ananya Iyer", "Software Developer", "IT - Jass", "Full-time"),
    ("Arjun Mehta", "Sales Executive", "Sales - Jass", "Part-time"),
    ("Kavita Joshi", "Accountant", "Accounts - Jass", "Probation"),
]

for first, desig, dept, emp_type in emps:
    full = first + " " + ("Sharma" if first == "Rahul" else "Patel" if first == "Priya" else "Kumar" if first == "Amit" else "Reddy" if first == "Sneha" else "Singh" if first == "Vikram" else "Iyer" if first == "Ananya" else "Mehta" if first == "Arjun" else "Joshi")
    if frappe.db.exists("Employee", {"first_name": first, "designation": desig}):
        continue
    try:
        doc = frappe.get_doc({
            "doctype": "Employee",
            "first_name": first,
            "last_name": full.split(" ", 1)[1],
            "gender": "Male" if first in ("Rahul", "Amit", "Vikram", "Arjun") else "Female",
            "date_of_birth": "1995-01-15",
            "date_of_joining": "2024-04-01",
            "designation": desig,
            "department": dept,
            "employment_type": emp_type,
            "company": "jass",
            "status": "Active",
            "branch": "Head Office",
            "mode_of_payment": "Bank Transfer",
        })
        doc.flags.ignore_mandatory = True
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print("  + Employee:", full, "|", desig)
    except Exception as e:
        frappe.db.rollback()
        print("  FAIL:", first, ":", str(e)[:250])

print("\n== Counts ==")
for dt in ["Employee", "Designation", "Leave Type", "Attendance", "Leave Application", "Job Applicant"]:
    try:
        print("  " + dt + ":", frappe.db.count(dt))
    except Exception as e:
        print("  " + dt + ": err", str(e)[:80])
frappe.db.commit()
