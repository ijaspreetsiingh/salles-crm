import frappe

print("=== LEAD DOCTYPE FIELDS ===")
meta = frappe.get_meta("Lead")
for f in meta.fields:
    print(f"  {f.fieldname} ({f.fieldtype}) - {f.label}")

print("\n=== SALES STAGE DOCTYPE FIELDS ===")
try:
    meta = frappe.get_meta("Sales Stage")
    for f in meta.fields:
        print(f"  {f.fieldname} ({f.fieldtype}) - {f.label}")
    print(f"  Name field: {meta.name_field}")
    print(f"  Autoname: {meta.autoname}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== OPPORTUNITY TYPE FIELDS ===")
try:
    meta = frappe.get_meta("Opportunity Type")
    for f in meta.fields:
        print(f"  {f.fieldname} ({f.fieldtype}) - {f.label}")
    print(f"  Name field: {meta.name_field}")
    print(f"  Autoname: {meta.autoname}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== EXISTING SALES STAGES ===")
print(frappe.get_all("Sales Stage", fields=["*"]))

print("\n=== EXISTING OPP TYPES ===")
print(frappe.get_all("Opportunity Type", fields=["*"]))

print("\n=== WORKSPACE FIELDS ===")
meta = frappe.get_meta("Workspace")
for f in meta.fields:
    print(f"  {f.fieldname} ({f.fieldtype})")

print("\n=== EXISTING CRM WORKSPACE ===")
if frappe.db.exists("Workspace", "CRM"):
    ws = frappe.get_doc("Workspace", "CRM")
    print(f"  Label: {ws.label}")
    print(f"  Content type: {type(ws.content)}")
    print(f"  Content preview: {str(ws.content)[:200]}")
    print(f"  Shortcuts: {len(ws.shortcuts) if hasattr(ws, 'shortcuts') else 'N/A'}")
    print(f"  Number Cards: {len(ws.number_cards) if hasattr(ws, 'number_cards') else 'N/A'}")
    print(f"  Charts: {len(ws.charts) if hasattr(ws, 'charts') else 'N/A'}")

print("\n=== LEAD SOURCE CHECK ===")
try:
    tables = frappe.db.get_tables()
    lead_tables = [t for t in tables if 'lead' in t.lower() or 'source' in t.lower()]
    print(f"  Lead-related tables: {lead_tables}")
except Exception as e:
    print(f"  Error: {e}")
