#!/bin/bash
echo "--- PID 1 ---"
tr "\0" " " < /proc/1/cmdline; echo
echo "--- gunicorn procs ---"
for p in /proc/[0-9]*; do
  c=$(tr "\0" " " < "$p/cmdline" 2>/dev/null)
  case "$c" in *gunicorn*) echo "${p##*/}: $c";; esac
done
echo "--- env PYTHONPATH ---"
echo "$PYTHONPATH"
echo "--- apps.txt ---"
cat /home/frappe/frappe-bench/sites/apps.txt 2>/dev/null
