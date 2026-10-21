#!/bin/bash
cd /home/frappe/frappe-bench
echo "=== bench/assets ==="
ls -la assets/ 2>/dev/null | head -20
echo "=== sites/assets ==="
ls -la sites/assets/ 2>/dev/null | head -20
echo "=== nginx assets conf ==="
grep -rn "assets" /home/frappe/frappe-bench/sites/../ 2>/dev/null | head -0
grep -rn "location /assets" /etc/nginx/ 2>/dev/null | head -5
echo "=== workspaces boot ==="
grep -rn "workspaces" frappe/frappe/__init__.py frappe/frappe/desk/__init__.py 2>/dev/null | head -5
grep -rn "frappe.workspaces\s*=" frappe/frappe/public/js -r 2>/dev/null | head -5
