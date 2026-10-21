#!/bin/bash
B=/home/frappe/frappe-bench
D=$B/apps/frappe/frappe/public/js/frappe/views/workspace
OUT=/tmp/recon6.txt
{
echo "=== error text search ==="
grep -rn "displayed correctly\|not be displayed\|failed to render" $B/apps/frappe/frappe/public/js --include=*.js 2>/dev/null | grep -v dist | head -8
echo "=== blocks/index.js ==="
cat $D/blocks/index.js
echo "=== block.js ==="
sed -n '1,80p' $D/blocks/block.js
echo "=== shortcut.js data usage ==="
grep -n "data\.\|this.data" $D/blocks/shortcut.js | head -25
echo "=== quick_list.js data usage ==="
grep -n "data\.\|this.data" $D/blocks/quick_list.js | head -25
echo "=== number_card.js data usage ==="
grep -n "data\.\|this.data" $D/blocks/number_card.js | head -20
echo "=== chart.js data usage ==="
grep -n "data\.\|this.data" $D/blocks/chart.js | head -20
echo "=== header.js data usage ==="
grep -n "data\.\|this.data" $D/blocks/header.js | head -15
echo "=== workspace.js links ==="
grep -n "links\|\.content" $D/workspace.js | head -30
} > $OUT 2>&1
wc -l $OUT
