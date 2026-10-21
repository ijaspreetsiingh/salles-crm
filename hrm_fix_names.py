import frappe

print("== Fix Employee names ==")
desired = {
    "Rahul Sharma": ("Rahul", "Sharma"),
    "Priya Patel": ("Priya", "Patel"),
    "Amit Kumar": ("Amit", "Kumar"),
    "Sneha Reddy": ("Sneha", "Reddy"),
    "Vikram Singh": ("Vikram", "Singh"),
    "Ananya Iyer": ("Ananya", "Iyer"),
    "Arjun Mehta": ("Arjun", "Mehta"),
    "Kavita Joshi": ("Kavita", "Joshi"),
}
for r in frappe.get_all("Employee", fields=["name", "first_name", "last_name"]):
    target = None
    for key, val in desired.items():
        if r.first_name == key or r.first_name.startswith(key + " "):
            target = val
            break
    if target is None and (r.last_name or "").endswith(" Joshi"):
        base = (r.first_name or "").split(" ")[0]
        for key, val in desired.items():
            if key.split(" ")[0] == base:
                target = val
                break
    if target is None:
        print("  skip:", r.name, "|", r.first_name, "|", r.last_name)
        continue
    frappe.db.set_value("Employee", r.name, {"first_name": target[0], "last_name": target[1], "employee_name": target[0] + " " + target[1]})
    frappe.db.commit()
    print("  fixed:", r.name, "->", target[0] + " " + target[1])

print("\n== Final list ==")
for r in frappe.get_all("Employee", fields=["name", "employee_name", "designation", "department", "status"], order_by="name"):
    print("  ", r.name, "|", r.employee_name, "|", r.designation, "|", r.department, "|", r.status)
frappe.db.commit()
