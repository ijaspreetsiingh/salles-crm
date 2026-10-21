import frappe
import json

print("=" * 60)
print("PHASE 3: HRM MODULE - SETUP")
print("=" * 60)


def step(fn, label):
    try:
        fn()
        frappe.db.commit()
        print("  OK: " + label)
    except Exception as e:
        frappe.db.rollback()
        print("  FAIL: " + label + ": " + str(e)[:250])


def leave_types():
    data = [
        ("Casual Leave", 12, 1, 1),
        ("Sick Leave", 12, 1, 1),
        ("Earned Leave", 12, 1, 1),
        ("Annual Leave", 15, 1, 1),
        ("Maternity Leave", 180, 0, 1),
        ("Paternity Leave", 15, 0, 1),
        ("Compensatory Off", 5, 1, 0),
        ("Leave Without Pay", 0, 0, 0),
    ]
    for name, days, encash, carry in data:
        if frappe.db.exists("Leave Type", name):
            continue
        frappe.get_doc({
            "doctype": "Leave Type",
            "leave_type_name": name,
            "max_leaves_allowed": days,
            "is_lwp": 1 if name == "Leave Without Pay" else 0,
            "is_optional_leave": 1 if name == "Compensatory Off" else 0,
            "allow_encashment": encash,
            "is_carry_forward": carry,
        }).insert(ignore_permissions=True)
        print("    + Leave Type: " + name)


step(leave_types, "Leave Types")


def employment_types():
    for name in ["Full Time", "Part Time", "Intern", "Contract", "Probation"]:
        if frappe.db.exists("Employment Type", name):
            continue
        frappe.get_doc({
            "doctype": "Employment Type",
            "employment_type": name,
        }).insert(ignore_permissions=True)
        print("    + Employment Type: " + name)


step(employment_types, "Employment Types")


def branches():
    for name in ["Head Office", "Mumbai Branch", "Delhi Branch", "Bangalore Branch"]:
        if frappe.db.exists("Branch", name):
            continue
        frappe.get_doc({
            "doctype": "Branch",
            "branch_name": name,
        }).insert(ignore_permissions=True)
        print("    + Branch: " + name)


step(branches, "Branches")


def shift_types():
    data = [
        ("General Shift", "09:00:00", "18:00:00"),
        ("Morning Shift", "06:00:00", "14:00:00"),
        ("Evening Shift", "14:00:00", "22:00:00"),
        ("Night Shift", "22:00:00", "06:00:00"),
    ]
    for name, start, end in data:
        if frappe.db.exists("Shift Type", name):
            continue
        frappe.get_doc({
            "doctype": "Shift Type",
            "shift_type_name": name,
            "start_time": start,
            "end_time": end,
        }).insert(ignore_permissions=True)
        print("    + Shift Type: " + name)


step(shift_types, "Shift Types")


def salary_components():
    data = [
        ("Basic", "Earning", 1),
        ("House Rent Allowance", "Earning", 1),
        ("Conveyance Allowance", "Earning", 1),
        ("Medical Allowance", "Earning", 1),
        ("Special Allowance", "Earning", 1),
        ("Performance Bonus", "Earning", 0),
        ("Provident Fund", "Deduction", 1),
        ("Professional Tax", "Deduction", 1),
        ("Income Tax", "Deduction", 1),
        ("Employee Insurance", "Deduction", 0),
    ]
    for name, typ, do_payroll in data:
        if frappe.db.exists("Salary Component", name):
            continue
        frappe.get_doc({
            "doctype": "Salary Component",
            "salary_component": name,
            "type": typ,
            "depends_on_payment_days": 1,
            "do_not_include_in_total": 0,
            "company": "jass",
        }).insert(ignore_permissions=True)
        print("    + Salary Component: " + name)


step(salary_components, "Salary Components")


def departments_extra():
    dept_map = {
        "Human Resources": "All Departments",
        "Accounts": "All Departments",
        "Sales": "All Departments",
        "Marketing": "All Departments",
        "IT": "All Departments",
        "Operations": "All Departments",
    }
    for name, parent in dept_map.items():
        full = name + " - Jass"
        if frappe.db.exists("Department", full):
            continue
        frappe.get_doc({
            "doctype": "Department",
            "department_name": name,
            "parent_department": parent,
            "company": "jass",
        }).insert(ignore_permissions=True)
        print("    + Department: " + full)


step(departments_extra, "Departments")


def roles():
    for role_name in ["HR Manager", "HR User", "Employee Self Service"]:
        if frappe.db.exists("Role", role_name):
            continue
        frappe.get_doc({
            "doctype": "Role",
            "role_name": role_name,
            "desk_access": 1,
            "disabled": 0,
        }).insert(ignore_permissions=True)
        print("    + Role: " + role_name)


step(roles, "HR Roles")


def cards():
    data = [
        {"name": "Total Employees", "document_type": "Employee",
         "filters": [["Employee", "status", "=", "Active"]], "fn": "Count", "color": "blue"},
        {"name": "New Joinees", "document_type": "Employee",
         "filters": [["Employee", "status", "=", "Active"]], "fn": "Count", "color": "green"},
        {"name": "Leaves Pending", "document_type": "Leave Application",
         "filters": [["Leave Application", "status", "=", "Open"]], "fn": "Count", "color": "orange"},
        {"name": "Attendance Today", "document_type": "Attendance",
         "filters": [["Attendance", "docstatus", "=", "1"]], "fn": "Count", "color": "teal"},
        {"name": "Open Job Applicants", "document_type": "Job Applicant",
         "filters": [["Job Applicant", "status", "in", ["Open", "New"]]], "fn": "Count", "color": "purple"},
        {"name": "Pending Expense Claims", "document_type": "Expense Claim",
         "filters": [["Expense Claim", "docstatus", "=", "0"]], "fn": "Count", "color": "red"},
    ]
    for d in data:
        card_name = d["name"]
        if frappe.db.exists("Number Card", card_name):
            continue
        doc = {
            "doctype": "Number Card",
            "label": card_name,
            "name": card_name,
            "document_type": d["document_type"],
            "filters_json": json.dumps(d["filters"]),
            "function": d["fn"],
            "color": d["color"],
        }
        try:
            frappe.get_doc(doc).insert(ignore_permissions=True)
            print("    + Card: " + card_name)
        except Exception as e:
            print("    ! Card skipped " + card_name + ": " + str(e)[:100])


step(cards, "Number Cards")


def workspace():
    if frappe.db.exists("Workspace", "HRM App"):
        print("    workspace exists")
        return
    content = json.dumps([
        {"id": "h1", "type": "header", "data": {"text": "<span class=\"h4\">👥 HRM Dashboard</span>", "col": 12}},
        {"id": "c1", "type": "number_card", "data": {"number_card_name": "Total Employees", "col": 3}},
        {"id": "c2", "type": "number_card", "data": {"number_card_name": "New Joinees", "col": 3}},
        {"id": "c3", "type": "number_card", "data": {"number_card_name": "Leaves Pending", "col": 3}},
        {"id": "c4", "type": "number_card", "data": {"number_card_name": "Attendance Today", "col": 3}},
        {"id": "c5", "type": "number_card", "data": {"number_card_name": "Open Job Applicants", "col": 3}},
        {"id": "c6", "type": "number_card", "data": {"number_card_name": "Pending Expense Claims", "col": 3}},

        {"id": "h2", "type": "header", "data": {"text": "<span class=\"h4\">⚡ Quick Actions</span>", "col": 12}},
        {"id": "s1", "type": "shortcut", "data": {"label": "New Employee", "link_to": "Employee", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s2", "type": "shortcut", "data": {"label": "New Leave Application", "link_to": "Leave Application", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s3", "type": "shortcut", "data": {"label": "New Attendance", "link_to": "Attendance", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s4", "type": "shortcut", "data": {"label": "New Job Applicant", "link_to": "Job Applicant", "type": "DocType", "col": 3, "icon": "add"}},

        {"id": "h3", "type": "header", "data": {"text": "<span class=\"h4\">📋 Employee Records</span>", "col": 12}},
        {"id": "l1", "type": "link", "data": {"label": "Employees", "link_type": "DocType", "link_to": "Employee", "col": 3, "icon": "employee"}},
        {"id": "l2", "type": "link", "data": {"label": "Departments", "link_type": "DocType", "link_to": "Department", "col": 3, "icon": "org"}},
        {"id": "l3", "type": "link", "data": {"label": "Designations", "link_type": "DocType", "link_to": "Designation", "col": 3, "icon": "label"}},
        {"id": "l4", "type": "link", "data": {"label": "Branches", "link_type": "DocType", "link_to": "Branch", "col": 3, "icon": "branch"}},
        {"id": "l5", "type": "link", "data": {"label": "Employment Types", "link_type": "DocType", "link_to": "Employment Type", "col": 3, "icon": "tag"}},
        {"id": "l6", "type": "link", "data": {"label": "Shift Types", "link_type": "DocType", "link_to": "Shift Type", "col": 3, "icon": "clock"}},
        {"id": "l7", "type": "link", "data": {"label": "Employee Groups", "link_type": "DocType", "link_to": "Employee Group", "col": 3, "icon": "group"}},
        {"id": "l8", "type": "link", "data": {"label": "Staffing Plan", "link_type": "DocType", "link_to": "Staffing Plan", "col": 3, "icon": "plan"}},

        {"id": "h4", "type": "header", "data": {"text": "<span class=\"h4\">🌴 Leave & Attendance</span>", "col": 12}},
        {"id": "la1", "type": "link", "data": {"label": "Leave Applications", "link_type": "DocType", "link_to": "Leave Application", "col": 3, "icon": "leave"}},
        {"id": "la2", "type": "link", "data": {"label": "Leave Types", "link_type": "DocType", "link_to": "Leave Type", "col": 3, "icon": "leave"}},
        {"id": "la3", "type": "link", "data": {"label": "Leave Balance", "link_type": "Report", "link_to": "Leave Balance", "col": 3, "icon": "report"}},
        {"id": "la4", "type": "link", "data": {"label": "Attendance", "link_type": "DocType", "link_to": "Attendance", "col": 3, "icon": "attendance"}},
        {"id": "la5", "type": "link", "data": {"label": "Attendance Summary", "link_type": "Report", "link_to": "Attendance Summary", "col": 3, "icon": "report"}},
        {"id": "la6", "type": "link", "data": {"label": "Shift Assignment", "link_type": "DocType", "link_to": "Shift Assignment", "col": 3, "icon": "shift"}},
        {"id": "la7", "type": "link", "data": {"label": "Leave Policy", "link_type": "DocType", "link_to": "Leave Policy", "col": 3, "icon": "policy"}},
        {"id": "la8", "type": "link", "data": {"label": "Holiday List", "link_type": "DocType", "link_to": "Holiday List", "col": 3, "icon": "holiday"}},

        {"id": "h5", "type": "header", "data": {"text": "<span class=\"h4\">💰 Payroll & Expenses</span>", "col": 12}},
        {"id": "p1", "type": "link", "data": {"label": "Salary Slips", "link_type": "DocType", "link_to": "Salary Slip", "col": 3, "icon": "salary"}},
        {"id": "p2", "type": "link", "data": {"label": "Salary Structures", "link_type": "DocType", "link_to": "Salary Structure", "col": 3, "icon": "salary"}},
        {"id": "p3", "type": "link", "data": {"label": "Salary Components", "link_type": "DocType", "link_to": "Salary Component", "col": 3, "icon": "component"}},
        {"id": "p4", "type": "link", "data": {"label": "Payroll Entries", "link_type": "DocType", "link_to": "Payroll Entry", "col": 3, "icon": "payroll"}},
        {"id": "p5", "type": "link", "data": {"label": "Expense Claims", "link_type": "DocType", "link_to": "Expense Claim", "col": 3, "icon": "claim"}},
        {"id": "p6", "type": "link", "data": {"label": "Employee Tax Declaration", "link_type": "DocType", "link_to": "Employee Tax Declaration", "col": 3, "icon": "tax"}},
        {"id": "p7", "type": "link", "data": {"label": "Gratuity", "link_type": "DocType", "link_to": "Gratuity", "col": 3, "icon": "gift"}},
        {"id": "p8", "type": "link", "data": {"label": "Salary Register", "link_type": "Report", "link_to": "Salary Register", "col": 3, "icon": "report"}},

        {"id": "h6", "type": "header", "data": {"text": "<span class=\"h4\">🤝 Recruitment & Performance</span>", "col": 12}},
        {"id": "r1", "type": "link", "data": {"label": "Job Applicants", "link_type": "DocType", "link_to": "Job Applicant", "col": 3, "icon": "applicant"}},
        {"id": "r2", "type": "link", "data": {"label": "Job Openings", "link_type": "DocType", "link_to": "Job Opening", "col": 3, "icon": "job"}},
        {"id": "r3", "type": "link", "data": {"label": "Interview", "link_type": "DocType", "link_to": "Interview", "col": 3, "icon": "interview"}},
        {"id": "r4", "type": "link", "data": {"label": "Interview Feedback", "link_type": "DocType", "link_to": "Interview Feedback", "col": 3, "icon": "feedback"}},
        {"id": "r5", "type": "link", "data": {"label": "Appraisals", "link_type": "DocType", "link_to": "Appraisal", "col": 3, "icon": "appraisal"}},
        {"id": "r6", "type": "link", "data": {"label": "Employee Skill", "link_type": "DocType", "link_to": "Employee Skill", "col": 3, "icon": "skill"}},
        {"id": "r7", "type": "link", "data": {"label": "Training Result", "link_type": "DocType", "link_to": "Training Result", "col": 3, "icon": "training"}},
        {"id": "r8", "type": "link", "data": {"label": "Employee Transfer", "link_type": "DocType", "link_to": "Employee Transfer", "col": 3, "icon": "transfer"}},

        {"id": "h7", "type": "header", "data": {"text": "<span class=\"h4\">⚙️ HR Settings</span>", "col": 12}},
        {"id": "st1", "type": "link", "data": {"label": "HR Settings", "link_type": "DocType", "link_to": "HR Settings", "col": 3, "icon": "settings"}},
        {"id": "st2", "type": "link", "data": {"label": "Employee Grade", "link_type": "DocType", "link_to": "Employee Grade", "col": 3, "icon": "grade"}},
        {"id": "st3", "type": "link", "data": {"label": "Exit Interview", "link_type": "DocType", "link_to": "Exit Interview", "col": 3, "icon": "interview"}},
        {"id": "st4", "type": "link", "data": {"label": "Employee Reference", "link_type": "DocType", "link_to": "Employee Reference", "col": 3, "icon": "reference"}},
    ])

    ws = frappe.get_doc({
        "doctype": "Workspace",
        "label": "HRM App",
        "title": "HRM",
        "public": 1,
        "module": "HR",
        "icon": "people",
        "content": content,
        "is_hidden": 0,
        "indicator_color": "green",
    })
    ws.insert(ignore_permissions=True)
    print("    + Workspace: HRM App")


step(workspace, "HRM Workspace")


print("")
print("=" * 60)
print("PHASE 3: HRM SETUP COMPLETE")
print("=" * 60)
for dt in ["Leave Type", "Employment Type", "Branch", "Shift Type", "Salary Component",
           "Employee", "Number Card"]:
    print("  " + dt + ":", frappe.db.count(dt))
print("  HRM Workspace:", bool(frappe.db.exists("Workspace", "HRM App")))
frappe.db.commit()
