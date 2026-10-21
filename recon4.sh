#!/bin/bash
B=/home/frappe/frappe-bench
OUT=/tmp/recon4.txt
{
echo "=== 1. home_shell ==="
sed -n '2360,2405p' $B/apps/frappe/frappe/desk/doctype/sidebar/sidebar.py
echo "=== 2. bundled_asset ==="
sed -n '1,70p' $B/apps/frappe/frappe/utils/bundled_asset.py
echo "=== 3. workspace view wrapper ==="
grep -rn "workspace-view\|make_wrapper\|this.wrapper\|class .workspace" $B/apps/frappe/frappe/public/js/frappe/views/workspace/workspace.js | head -15
echo "=== 4. router parse for /desk and home ==="
grep -n "async parse\|pathname\|\"desk\"\|routes\[" $B/apps/frappe/frappe/public/js/frappe/router.js | head -25
echo "=== 5. frappe.set_route workspace usage ==="
grep -rn "set_route(\"Workspaces\"\|set_route('Workspaces'\|Workspaces\"," $B/apps/frappe/frappe/public/js/frappe --include=*.js 2>/dev/null | grep -v dist | head -8
} > $OUT 2>&1
wc -l $OUT
