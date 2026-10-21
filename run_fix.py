import frappe

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
exec(open("/tmp/fix_ws.py", encoding="utf-8").read())
frappe.destroy()
