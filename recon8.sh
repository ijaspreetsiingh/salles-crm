#!/bin/bash
B=/home/frappe/frappe-bench/apps/frappe/frappe/desk/doctype
OUT=/tmp/recon8.txt
{
echo "=== page_data py ==="
grep -rn "page_data" $B/workspace $B/../../ --include=*.py 2>/dev/null | grep -v test | head -8
echo "=== workspace.py 115-150 ==="
sed -n '115,150p' $B/workspace/workspace.py
echo "=== get_link_groups ==="
sed -n '470,510p' $B/workspace/workspace.py
echo "=== workspace_link.json ==="
grep -n "fieldname\|fieldtype\|label\|options" $B/workspace_link/workspace_link.json | head -30
echo "=== workspace_shortcut.json ==="
grep -n "fieldname\|fieldtype\|label\|options" $B/workspace_shortcut/workspace_shortcut.json | head -30
echo "=== workspace_number_card.json ==="
grep -n "fieldname\|fieldtype" $B/workspace_number_card/workspace_number_card.json | head -12
echo "=== workspace_chart.json ==="
grep -n "fieldname\|fieldtype" $B/workspace_chart/workspace_chart.json | head -12
echo "=== page_data js ==="
grep -rn "page_data" $B/workspace/../../public/js/frappe/views/workspace/workspace.js | head -8
} > $OUT 2>&1
wc -l $OUT
