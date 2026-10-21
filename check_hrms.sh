#!/bin/bash
cd /home/frappe/frappe-bench
echo "--- pip list ---"
env/bin/pip list 2>/dev/null | grep -iE "hrms|erpnext|frappe" || true
echo "--- python import hrms ---"
env/bin/python 2>&1 <<'PYEOF' | tail -5
import sys
try:
    import hrms
    print("hrms import OK:", hrms.__file__)
except Exception as e:
    print("hrms import FAIL:", e)
print("sys.path[0:5]:", sys.path[:5])
PYEOF
echo "--- frappe get_active_apps ---"
env/bin/python 2>&1 <<'PYEOF' | tail -6
import frappe
frappe.init(site="frontend")
frappe.connect()
print("installed:", frappe.get_installed_apps())
print("paths:", frappe.get_app_paths("hrms") if hasattr(frappe, "get_app_paths") else "n/a")
frappe.db.close()
PYEOF
