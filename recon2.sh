#!/bin/bash
cd /home/frappe/frappe-bench/apps/frappe/frappe
OUT=/tmp/recon2.txt
{
echo "=== 1. include_script def ==="
grep -rn "def include_script" . --include=*.py 2>/dev/null | grep -v dist | head -5
echo "=== 2. default_workspace / home route ==="
grep -rn "default_workspace" public/js www/*.py sessions.py 2>/dev/null | grep -v dist | head -15
echo "=== 3. router home handling (45-115) ==="
sed -n '45,115p' public/js/frappe/router.js
echo "=== 4. menu.js structure ==="
grep -n "role=\|classList.add\|append\|<div\|<ul\|<li" public/js/frappe/ui/components/menu.js | head -40
echo "=== 5. dock css rules ==="
grep -oE "(\.dock[a-z-]*|body\.dock[a-z-]*|#desk-dock)[^{]*\{[^}]*\}" public/dist/css/desk.bundle.*.css 2>/dev/null | head -40
echo "=== 6. sidebar_setup / workspace_rendered events ==="
grep -rn "trigger(\"workspace\|workspace_rendered\|sidebar_setup" public/js 2>/dev/null | grep -v dist | head -10
} > $OUT 2>&1
wc -l $OUT
