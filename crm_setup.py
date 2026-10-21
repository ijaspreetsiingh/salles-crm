import frappe

def setup_crm():
    frappe.flags.in_import = True
    
    print("=" * 60)
    print("PHASE 1: SALES CRM COMPLETE SETUP")
    print("=" * 60)
    
    # 1. CREATE LEAD SOURCES
    print("\n[1/8] Creating Lead Sources...")
    lead_sources = [
        "Website", "Phone Call", "Email", "Reference", "Advertisement",
        "Walk-in", "Trade Show", "Webinar", "Social Media", "Cold Call",
        "Partner", "Existing Customer", "Mass Mailing", "Other"
    ]
    for source in lead_sources:
        if not frappe.db.exists("Lead Source", source):
            frappe.get_doc({"doctype": "Lead Source", "lead_source": source}).insert(ignore_permissions=True)
            print(f"  + Created: {source}")
    
    # 2. UPDATE SALES STAGES (Add missing stages)
    print("\n[2/8] Updating Sales Stages...")
    required_stages = [
        ("Prospecting", 1), ("Qualification", 2), ("Needs Analysis", 3),
        ("Value Proposition", 4), ("Identifying Decision Makers", 5),
        ("Perception Analysis", 6), ("Proposal/Price Quote", 7),
        ("Negotiation/Review", 8), ("Closed Won", 9), ("Closed Lost", 10)
    ]
    for stage, order in required_stages:
        if not frappe.db.exists("Sales Stage", stage):
            frappe.get_doc({
                "doctype": "Sales Stage",
                "sales_stage": stage,
                "stage_number": order
            }).insert(ignore_permissions=True)
            print(f"  + Created stage: {stage}")
    
    # 3. UPDATE OPPORTUNITY TYPES
    print("\n[3/8] Updating Opportunity Types...")
    opp_types = ["Sales", "Maintenance", "Support", "Service", "Product Sale", " AMC", "Custom Solution", "Renewal"]
    for opp_type in opp_types:
        if not frappe.db.exists("Opportunity Type", opp_type):
            frappe.get_doc({
                "doctype": "Opportunity Type",
                "title": opp_type
            }).insert(ignore_permissions=True)
            print(f"  + Created: {opp_type}")
    
    # 4. CREATE TERRITORIES (India focus)
    print("\n[4/8] Updating Territories...")
    territories = [
        ("North", "All Territories"), ("South", "All Territories"),
        ("East", "All Territories"), ("West", "All Territories"),
        ("Delhi NCR", "North"), ("Mumbai", "West"),
        ("Bangalore", "South"), ("Chennai", "South"),
        ("Hyderabad", "South"), ("Pune", "West"),
        ("Kolkata", "East"), ("Ahmedabad", "West"),
        ("Jaipur", "North"), ("Lucknow", "North"),
        ("Chandigarh", "North"), ("Indore", "West"),
        ("Kochi", "South"), ("Bhopal", "North"),
    ]
    for terr, parent in territories:
        if not frappe.db.exists("Territory", terr):
            frappe.get_doc({
                "doctype": "Territory",
                "territory_name": terr,
                "parent_territory": parent if frappe.db.exists("Territory", parent) else None,
                "is_group": 1 if terr in ["North", "South", "East", "West"] else 0
            }).insert(ignore_permissions=True)
            print(f"  + Created territory: {terr}")
    
    # 5. CREATE SALES PERSONS
    print("\n[5/8] Creating Sales Person hierarchy...")
    sales_persons = [
        ("Sales Head", None, "Sales Head"),
        ("Sales Manager", "Sales Head", "Sales Manager"),
        ("Sales Executive 1", "Sales Manager", "Sales Executive"),
        ("Sales Executive 2", "Sales Manager", "Sales Executive"),
        ("Sales Executive 3", "Sales Manager", "Sales Executive"),
    ]
    for name, parent, designation in sales_persons:
        if not frappe.db.exists("Sales Person", name):
            frappe.get_doc({
                "doctype": "Sales Person",
                "sales_person_name": name,
                "parent_sales_person": parent,
                "designation": designation,
                "is_group": 1 if "Head" in name or "Manager" in name else 0
            }).insert(ignore_permissions=True)
            print(f"  + Created sales person: {name}")
    
    # 6. CREATE NAMING SERIES
    print("\n[6/8] Setting up Naming Series...")
    naming_series = [
        ("Lead", "CRM-LEAD-.YYYY.-", "CRM-LEAD-2026-00001"),
        ("Opportunity", "CRM-OPP-.YYYY.-", "CRM-OPP-2026-00001"),
        ("Quotation", "CRM-QTN-.YYYY.-", "CRM-QTN-2026-00001"),
        ("Sales Order", "SO-.YYYY.-", "SO-2026-00001"),
        ("Sales Invoice", "SINV-.YYYY.-", "SINV-2026-00001"),
        ("Customer", "CUST-.YYYY.-", "CUST-2026-00001"),
        ("Campaign", "CRM-CAMP-.YYYY.-", "CRM-CAMP-2026-00001"),
    ]
    for doctype, series, example in naming_series:
        try:
            meta = frappe.get_meta(doctype)
            if meta.get("autoname") != series:
                frappe.db.set_value("DocType", doctype, "autoname", series)
                print(f"  + Series for {doctype}: {series}")
        except Exception as e:
            print(f"  ! Could not set series for {doctype}: {e}")
    
    # 7. CREATE CRM WORKSPACE
    print("\n[7/8] Creating CRM Workspace...")
    
    if not frappe.db.exists("Workspace", "Sales CRM"):
        workspace = frappe.get_doc({
            "doctype": "Workspace",
            "label": "Sales CRM",
            "title": "Sales CRM",
            "public": 1,
            "module": "Selling",
            "icon": "chart-bar",
            "content": "[]",
            "charts": "[]",
            "shortcuts": "[]",
            "number_cards": "[]",
            "is_hidden": 0
        })
        workspace.insert(ignore_permissions=True)
        print("  + Created workspace: Sales CRM")
    else:
        print("  - Workspace already exists")
    
    # 8. CREATE CRM ROLES
    print("\n[8/8] Creating CRM Roles...")
    roles = [
        ("CRM User", "CRM User for Sales Team"),
        ("CRM Manager", "CRM Manager with full access"),
    ]
    for role_name, desc in roles:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": 1,
                "disabled": 0
            }).insert(ignore_permissions=True)
            print(f"  + Created role: {role_name}")
    
    frappe.flags.in_import = False
    frappe.db.commit()
    
    print("\n" + "=" * 60)
    print("SALES CRM BASE SETUP COMPLETE!")
    print("=" * 60)
    
    # Summary
    print("\nSUMMARY:")
    print(f"  Lead Sources: {frappe.db.count('Lead Source')}")
    print(f"  Sales Stages: {frappe.db.count('Sales Stage')}")
    print(f"  Opportunity Types: {frappe.db.count('Opportunity Type')}")
    print(f"  Territories: {frappe.db.count('Territory')}")
    print(f"  Sales Persons: {frappe.db.count('Sales Person')}")
    print(f"  Workspaces: {frappe.db.count('Workspace')}")
    print(f"  Roles: {frappe.db.count('Role')}")

if __name__ == "__main__":
    setup_crm()
