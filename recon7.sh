#!/bin/bash
B=/home/frappe/frappe-bench
W=$B/apps/frappe/frappe/desk/doctype/workspace
OUT=/tmp/recon7.txt
{
echo "=== workspace.py page_data ==="
grep -n "page_data\|shortcuts\|number_cards\|charts\|cards\|quick_lists\|def get_context" $W/workspace.py | head -40
echo "=== workspace_link fields ==="
grep -n '"fieldname"\|"fieldtype"\|"label"' $B/apps/frappe/frappe/doctype/workspace_link/workspace_link.json
echo "=== how cards map links ==="
grep -rn "group" $W/workspace.py | head -20
} > $OUT 2>&1
wc -l $OUT
