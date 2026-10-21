#!/bin/bash
B=/home/frappe/frappe-bench
OUT=/tmp/recon3.txt
{
echo "=== 1. include_script impl ==="
sed -n '90,140p' $B/apps/frappe/frappe/utils/jinja_globals.py
echo "=== 2. hooks app_include_js/css ==="
grep -n -A6 '"app_include_js"\|"app_include_css"' $B/apps/frappe/frappe/hooks.py | head -30
echo "=== 3. nginx locations ==="
grep -n "location\|alias\|root" /etc/nginx/conf.d/nginx.conf | head -40
echo "=== 4. site_config ==="
cat $B/sites/frontend/site_config.json 2>/dev/null
echo "=== 5. workspace route shape in boot ==="
grep -o '"workspaces":\[[^]]*\]' $B/sites/frontend/*.html 2>/dev/null | head -3
echo "=== 6. workspace href in sidebar js ==="
grep -rn "workspace" $B/apps/frappe/frappe/public/js/frappe/ui/sidebar/sidebar_item.js | head -10
grep -rn "href\|route" $B/apps/frappe/frappe/public/js/frappe/ui/sidebar/sidebar.js | grep -i "work" | head -10
echo "=== 7. default_workspace py ==="
grep -rn "default_workspace" $B/apps/frappe/frappe --include=*.py | grep -v test | head -10
echo "=== 8. home route resolve ==="
grep -n "set_initial\|initial\|current_route =\|shell_for_route\|\"home\"" $B/apps/frappe/frappe/public/js/frappe/router.js | head -20
} > $OUT 2>&1
wc -l $OUT
