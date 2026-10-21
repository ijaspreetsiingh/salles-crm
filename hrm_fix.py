import frappe
import json

print("=" * 60)
print("PHASE 3 HRM: FIX")
print("=" * 60)

def step(fn, label):
    try:
        fn()
        frappe.db.commit()
        print("  OK: " + label)
    except Exception as e:
        frappe.db.rollback()
        print("  FAIL: " + label + ": " + str(e)[:300])

def employment_types():
    for name in ["Trainee", "Apprentice (Custom)"]:
        if frappe.db.exists("Employment Type", name):
            continue
        frappe.get_doc({"doctype": "Employment Type", "employee_type_name": name}).insert(ignore_permissions=True)
        print("    + Employment Type: " + name)
step(employment_types, "Employment Types")

def branches():
    for name in ["Head Office", "Mumbai Branch", "Delhi Branch", "Bangalore Branch"]:
        if frappe.db.exists("Branch", name):
            continue
        frappe.get_doc({"doctype": "Branch", "branch": name}).insert(ignore_permissions=True)
        print("    + Branch: " + name)
step(branches, "Branches")

def shift_types():
    data = [("General Shift", "09:00:00", "18:00:00"), ("Morning Shift", "06:00:00", "14:00:00"), ("Evening Shift", "14:00:00", "22:00:00"), ("Night Shift", "22:00:00", "06:00:00")]
    for name, start, end in data:
        if frappe.db.exists("Shift Type", name):
            continue
        doc = frappe.get_doc({"doctype": "Shift Type", "name": name, "start_time": start, "end_time": end})
        doc.flags.ignore_mandatory = True
        doc.insert(ignore_permissions=True)
        print("    + Shift Type: " + name)
step(shift_types, "Shift Types")

def workspace():
    if frappe.db.exists("Workspace", "HRM App"):
        print("    workspace exists, skipping")
        return
    content_list = [
        {"id": "h1", "type": "header", "data": {"text": "<span class=\"h4\">HRM Dashboard</span>", "col": 12}},
        {"id": "c1", "type": "number_card", "data": {"number_card_name": "Total Employees", "col": 3}},
        {"id": "c2", "type": "number_card", "data": {"number_card_name": "New Joinees", "col": 3}},
        {"id": "c3", "type": "number_card", "data": {"number_card_name": "Leaves Pending", "col": 3}},
        {"id": "c4", "type": "number_card", "data": {"number_card_name": "Attendance Today", "col": 3}},
        {"id": "c5", "type": "number_card", "data": {"number_card_name": "Open Job Applicants", "col": 3}},
        {"id": "c6", "type": "number_card", "data": {"number_card_name": "Pending Expense Claims", "col": 3}},
        {"id": "h2", "type": "header", "data": {"text": "<span class=\"h4\">Quick Actions</span>", "col": 12}},
        {"id": "s1", "type": "shortcut", "data": {"label": "New Employee", "link_to": "Employee", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s2", "type": "shortcut", "data": {"label": "New Leave Application", "link_to": "Leave Application", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s3", "type": "shortcut", "data": {"label": "New Attendance", "link_to": "Attendance", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "s4", "type": "shortcut", "data": {"label": "New Job Applicant", "link_to": "Job Applicant", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "h3", "type": "header", "data": {"text": "<span class=\"h4\">Employee Records</span>", "col": 12}},
        {"id": "l1", "type": "link", "data": {"label": "Employees", "link_type": "DocType", "link_to": "Employee", "col": 3}},
        {"id": "l2", "type": "link", "data": {"label": "Departments", "link_type": "DocType", "link_to": "Department", "col": 3}},
        {"id": "l3", "type": "link", "data": {"label": "Designations", "link_type": "DocType", "link_to": "Designation", "col": 3}},
        {"id": "l4", "type": "link", "data": {"label": "Branches", "link_type": "DocType", "link_to": "Branch", "col": 3}},
        {"id": "l5", "type": "link", "data": {"label": "Employment Types", "link_type": "DocType", "link_to": "Employment Type", "col": 3}},
        {"id": "l6", "type": "link", "data": {"label": "Shift Types", "link_type": "DocType", "link_to": "Shift Type", "col": 3}},
        {"id": "h4", "type": "header", "data": {"text": "<span class=\"h4\">Leave & Attendance</span>", "col": 12}},
        {"id": "la1", "type": "link", "data": {"label": "Leave Applications", "link_type": "DocType", "link_to": "Leave Application", "col": 3}},
        {"id": "la2", "type": "link", "data": {"label": "Leave Types", "link_type": "DocType", "link_to": "Leave Type", "col": 3}},
        {"id": "la3", "type": "link", "data": {"label": "Leave Balance", "link_type": "Report", "link_to": "Leave Balance", "col": 3}},
        {"id": "la4", "type": "link", "data": {"label": "Attendance", "link_type": "DocType", "link_to": "Attendance", "col": 3}},
        {"id": "la5", "type": "link", "data": {"label": "Attendance Summary", "link_type": "Report", "link_to": "Attendance Summary", "col": 3}},
        {"id": "la6", "type": "link", "data": {"label": "Shift Assignment", "link_type": "DocType", "link_to": "Shift Assignment", "col": 3}},
        {"id": "la7", "type": "link", "data": {"label": "Leave Policy", "link_type": "DocType", "link_to": "Leave Policy", "col": 3}},
        {"id": "la8", "type": "link", "data": {"label": "Holiday List", "link_type": "DocType", "link_to": "Holiday List", "col": 3}},
        {"id": "h5", "type": "header", "data": {"text": "<span class=\"h4\">Payroll & Expenses</span>", "col": 12}},
        {"id": "p1", "type": "link", "data": {"label": "Salary Slips", "link_type": "DocType", "link_to": "Salary Slip", "col": 3}},
        {"id": "p2", "type": "link", "data": {"label": "Salary Structures", "link_type": "DocType", "link_to": "Salary Structure", "col": 3}},
        {"id": "p3", "type": "link", "data": {"label": "Salary Components", "link_type": "DocType", "link_to": "Salary Component", "col": 3}},
        {"id": "p4", "type": "link", "data": {"label": "Payroll Entries", "link_type": "DocType", "link_to": "Payroll Entry", "col": 3}},
        {"id": "p5", "type": "link", "data": {"label": "Expense Claims", "link_type": "DocType", "link_to": "Expense Claim", "col": 3}},
        {"id": "p6", "type": "link", "data": {"label": "Employee Tax Declaration", "link_type": "DocType", "link_to": "Employee Tax Declaration", "col": 3}},
        {"id": "p7", "type": "link", "data": {"label": "Gratuity", "link_type": "DocType", "link_to": "Gratuity", "col": 3}},
        {"id": "p8", "type": "link", "data": {"label": "Salary Register", "link_type": "Report", "link_to": "Salary Register", "col": 3}},
        {"id": "h6", "type": "header", "data": {"text": "<span class=\"h4\">Recruitment & Performance</span>", "col": 12}},
        {"id": "r1", "type": "link", "data": {"label": "Job Applicants", "link_type": "DocType", "link_to": "Job Applicant", "col": 3}},
        {"id": "r2", "type": "link", "data": {"label": "Job Openings", "link_type": "DocType", "link_to": "Job Opening", "col": 3}},
        {"id": "r3", "type": "link", "data": {"label": "Interview", "link_type": "DocType", "link_to": "Interview", "col": 3}},
        {"id": "r4", "type": "link", "data": {"label": "Interview Feedback", "link_type": "DocType", "link_to": "Interview Feedback", "col": 3}},
        {"id": "r5", "type": "link", "data": {"label": "Appraisals", "link_type": "DocType", "link_to": "Appraisal", "col": 3}},
        {"id": "r6", "type": "link", "data": {"label": "Employee Skill", "link_type": "DocType", "link_to": "Employee Skill", "col": 3}},
        {"id": "r7", "type": "link", "data": {"label": "Training Result", "link_type": "DocType", "link_to": "Training Result", "col": 3}},
        {"id": "r8", "type": "link", "data": {"label": "Employee Transfer", "link_type": "DocType", "link_to": "Employee Transfer", "col": 3}},
        {"id": "h7", "type": "header", "data": {"text": "<span class=\"h4\">HR Settings</span>", "col": 12}},
        {"id": "st1", "type": "link", "data": {"label": "HR Settings", "link_type": "DocType", "link_to": "HR Settings", "col": 3}},
        {"id": "st2", "type": "link", "data": {"label": "Employee Grade", "link_type": "DocType", "link_to": "Employee Grade", "col": 3}},
        {"id": "st3", "type": "link", "data": {"label": "Exit Interview", "link_type": "DocType", "link_to": "Exit Interview", "col": 3}},
        {"id": "st4", "type": "link", "data": {"label": "Staffing Plan", "link_type": "DocType", "link_to": "Staffing Plan", "col": 3}},
    ]
    content = json.dumps(content_list)
    ws = frappe.get_doc({"doctype": "Workspace", "label": "HRM App", "title": "HRM", "public": 1, "module": "HR", "icon": "people", "content": content, "is_hidden": 0, "indicator_color": "green"})
    ws.insert(ignore_permissions=True)
    print("    + Workspace: HRM App")
step(workspace, "HRM Workspace")

print("")
print("=" * 60)
for dt in ["Leave Type", "Employment Type", "Branch", "Shift Type", "Salary Component", "Employee"]:
    print("  " + dt + ":", frappe.db.count(dt))
print("  HRM Workspace:", bool(frappe.db.exists("Workspace", "HRM App")))
print("  HR roles:", [r.role_name for r in frappe.get_all("Role", filters={"role_name": ["in", ["HR Manager", "HR User", "Employee Self Service"]]}, fields=["role_name"])])
print("=" * 60)
frappe.db.commit()
