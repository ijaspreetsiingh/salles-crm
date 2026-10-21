#!/bin/bash
B=/home/frappe/frappe-bench
OUT=/tmp/recon5.txt
{
echo "=== error message location ==="
grep -rn "can not be displayed correctly\|cannot be displayed" $B/apps/frappe/frappe/public/js $B/apps/frappe/frappe/website 2>/dev/null | grep -v dist | head -6
echo "=== workspace block render switch ==="
grep -rn "case \"\|block.type\|get_block\|render_block" $B/apps/frappe/frappe/public/js/frappe/views/workspace/blocks.js 2>/dev/null | head -40
ls $B/apps/frappe/frappe/public/js/frappe/views/workspace/ $B/apps/frappe/frappe/public/js/frappe/views/workspace/blocks/ 2>/dev/null
} > $OUT 2>&1
wc -l $OUT
