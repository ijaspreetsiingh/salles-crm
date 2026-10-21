import frappe
import json

print("=" * 60)
print("PHASE 1: SALES CRM - FIXED SETUP")
print("=" * 60)

# 1. ADD MISSING SALES STAGES
print("\n[1/6] Adding missing Sales Stages...")
missing_stages = ["Closed Won", "Closed Lost"]
for stage in missing_stages:
    if not frappe.db.exists("Sales Stage", stage):
        frappe.get_doc({
            "doctype": "Sales Stage",
            "stage_name": stage
        }).insert(ignore_permissions=True)
        print(f"  + Created: {stage}")

# 2. ADD OPPORTUNITY TYPES
print("\n[2/6] Adding Opportunity Types...")
new_opp_types = ["Product Sale", "Service", "AMC", "Custom Solution", "Renewal"]
for opp in new_opp_types:
    if not frappe.db.exists("Opportunity Type", opp):
        frappe.get_doc({
            "doctype": "Opportunity Type",
            "name": opp,
            "description": opp
        }).insert(ignore_permissions=True)
        print(f"  + Created: {opp}")

# 3. CREATE NUMBER CARDS for CRM
print("\n[3/6] Creating Number Cards...")
number_cards = [
    {"name": "Open Leads", "document_type": "Lead", "filters_json": json.dumps([["Lead", "status", "in", ["Open", "Working", "New"]]]), "function": "Count", "color": "blue"},
    {"name": "Open Opportunities", "document_type": "Opportunity", "filters_json": json.dumps([["Opportunity", "status", "=", "Open"]]), "function": "Count", "color": "green"},
    {"name": "Pipeline Value", "document_type": "Opportunity", "filters_json": json.dumps([["Opportunity", "status", "=", "Open"]]), "function": "Sum", "aggregate_function_based_on": "opportunity_amount", "color": "orange"},
    {"name": "Won Opportunities", "document_type": "Opportunity", "filters_json": json.dumps([["Opportunity", "status", "=", "Won"]]), "function": "Count", "color": "green"},
    {"name": "Lost Opportunities", "document_type": "Opportunity", "filters_json": json.dumps([["Opportunity", "status", "=", "Lost"]]), "function": "Count", "color": "red"},
    {"name": "My Open Leads", "document_type": "Lead", "filters_json": json.dumps([["Lead", "status", "in", ["Open", "Working", "New"]], ["Lead", "lead_owner", "=", "user"]]), "function": "Count", "color": "blue"},
    {"name": "Open Quotations", "document_type": "Quotation", "filters_json": json.dumps([["Quotation", "status", "=", "Open"], ["Quotation", "docstatus", "=", "1"]]), "function": "Count", "color": "purple"},
    {"name": "New Leads This Month", "document_type": "Lead", "filters_json": json.dumps([["Lead", "creation", ">", "本月"]]), "function": "Count", "color": "teal"},
]

for card_data in number_cards:
    card_name = card_data.pop("name")
    if not frappe.db.exists("Number Card", card_name):
        card_data["doctype"] = "Number Card"
        card_data["label"] = card_name
        card_data["name"] = card_name
        try:
            frappe.get_doc(card_data).insert(ignore_permissions=True)
            print(f"  + Created card: {card_name}")
        except Exception as e:
            print(f"  ! Skipped {card_name}: {str(e)[:60]}")

# 4. CREATE DASHBOARD CHARTS
print("\n[4/6] Creating Dashboard Charts...")
charts = [
    {"name": "Opportunity by Stage", "chart_type": "Group By", "document_type": "Opportunity", "group_by_based_on": "sales_stage", "chart_type_label": "Funnel", "is_public": 1},
    {"name": "Leads by Status", "chart_type": "Count", "document_type": "Lead", "group_by_based_on": "status", "is_public": 1},
    {"name": "Monthly Opportunity Trend", "chart_type": "Count", "document_type": "Opportunity", "timespan": "Last Year", "time_interval": "Monthly", "is_public": 1},
]

for chart_data in charts:
    chart_name = chart_data.pop("name")
    if not frappe.db.exists("Dashboard Chart", chart_name):
        chart_data["doctype"] = "Dashboard Chart"
        chart_data["chart_name"] = chart_name
        chart_data["name"] = chart_name
        chart_data["filters_json"] = "[]"
        try:
            frappe.get_doc(chart_data).insert(ignore_permissions=True)
            print(f"  + Created chart: {chart_name}")
        except Exception as e:
            print(f"  ! Skipped {chart_name}: {str(e)[:60]}")

# 5. CREATE SALES CRM WORKSPACE
print("\n[5/6] Creating Sales CRM Workspace...")

if not frappe.db.exists("Workspace", "Sales CRM"):
    workspace_content = json.dumps([
        {"id": "header1", "type": "header", "data": {"text": "<span class=\"h4\">📊 Sales CRM Dashboard</span>", "col": 12}},
        {"id": "card1", "type": "number_card", "data": {"number_card_name": "Open Leads", "col": 4}},
        {"id": "card2", "type": "number_card", "data": {"number_card_name": "Open Opportunities", "col": 4}},
        {"id": "card3", "type": "number_card", "data": {"number_card_name": "Pipeline Value", "col": 4}},
        {"id": "card4", "type": "number_card", "data": {"number_card_name": "Won Opportunities", "col": 4}},
        {"id": "card5", "type": "number_card", "data": {"number_card_name": "Lost Opportunities", "col": 4}},
        {"id": "card6", "type": "number_card", "data": {"number_card_name": "Open Quotations", "col": 4}},
        {"id": "chart1", "type": "chart", "data": {"chart_name": "Opportunity by Stage", "col": 6}},
        {"id": "chart2", "type": "chart", "data": {"chart_name": "Leads by Status", "col": 6}},
        {"id": "header2", "type": "header", "data": {"text": "<span class=\"h4\">⚡ Quick Actions</span>", "col": 12}},
        {"id": "shortcut1", "type": "shortcut", "data": {"label": "New Lead", "link_to": "Lead", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "shortcut2", "type": "shortcut", "data": {"label": "New Opportunity", "link_to": "Opportunity", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "shortcut3", "type": "shortcut", "data": {"label": "New Quotation", "link_to": "Quotation", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "shortcut4", "type": "shortcut", "data": {"label": "New Customer", "link_to": "Customer", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "shortcut5", "type": "shortcut", "data": {"label": "New Campaign", "link_to": "Campaign", "type": "DocType", "col": 3, "icon": "add"}},
        {"id": "header3", "type": "header", "data": {"text": "<span class=\"h4\">📋 CRM Records</span>", "col": 12}},
        {"id": "link1", "type": "link", "data": {"label": "Leads", "link_type": "DocType", "link_to": "Lead", "col": 3, "icon": "lead"}},
        {"id": "link2", "type": "link", "data": {"label": "Opportunities", "link_type": "DocType", "link_to": "Opportunity", "col": 3, "icon": "opportunity"}},
        {"id": "link3", "type": "link", "data": {"label": "Quotations", "link_type": "DocType", "link_to": "Quotation", "col": 3, "icon": "quotation"}},
        {"id": "link4", "type": "link", "data": {"label": "Sales Orders", "link_type": "DocType", "link_to": "Sales Order", "col": 3, "icon": "sales-order"}},
        {"id": "link5", "type": "link", "data": {"label": "Customers", "link_type": "DocType", "link_to": "Customer", "col": 3, "icon": "customer"}},
        {"id": "link6", "type": "link", "data": {"label": "Campaigns", "link_type": "DocType", "link_to": "Campaign", "col": 3, "icon": "campaign"}},
        {"id": "link7", "type": "link", "data": {"label": "Sales Partners", "link_type": "DocType", "link_to": "Sales Partner", "col": 3, "icon": "partner"}},
        {"id": "link8", "type": "link", "data": {"label": "Sales Persons", "link_type": "DocType", "link_to": "Sales Person", "col": 3, "icon": "user"}},
        {"id": "header4", "type": "header", "data": {"text": "<span class=\"h4\">📈 CRM Reports</span>", "col": 12}},
        {"id": "link9", "type": "link", "data": {"label": "Sales Pipeline", "link_type": "Report", "link_to": "Sales Pipeline", "col": 4, "icon": "chart-bar"}},
        {"id": "link10", "type": "link", "data": {"label": "Lead Details", "link_type": "Report", "link_to": "Lead Details", "col": 4, "icon": "chart-bar"}},
        {"id": "link11", "type": "link", "data": {"label": "Opportunity Analysis", "link_type": "Report", "link_to": "Opportunity Analysis by Territory", "col": 4, "icon": "chart-bar"}},
        {"id": "link12", "type": "link", "data": {"label": "Quotation Analysis", "link_type": "Report", "link_to": "Quotation Analysis", "col": 4, "icon": "chart-bar"}},
        {"id": "link13", "type": "link", "data": {"label": "Sales Person Wise", "link_type": "Report", "link_to": "Sales Personwise Transaction Summary", "col": 4, "icon": "chart-bar"}},
        {"id": "link14", "type": "link", "data": {"label": "Territory Wise Sales", "link_type": "Report", "link_to": "Territory-Wise Sales Transaction Summary", "col": 4, "icon": "chart-bar"}},
    ])
    
    workspace = frappe.get_doc({
        "doctype": "Workspace",
        "label": "Sales CRM",
        "title": "Sales CRM",
        "public": 1,
        "module": "Selling",
        "icon": "chart-bar",
        "content": workspace_content,
        "is_hidden": 0,
        "indicator_color": "green"
    })
    workspace.insert(ignore_permissions=True)
    print("  + Created workspace: Sales CRM")
else:
    print("  - Workspace already exists")

# 6. CREATE CLIENT SCRIPT FOR SIDEBAR
print("\n[6/6] Creating Client Script for CRM Sidebar...")
if not frappe.db.exists("Client Script", "CRM Sidebar Filter"):
    frappe.get_doc({
        "doctype": "Client Script",
        "name": "CRM Sidebar Filter",
        "doc_type": "Workspace",
        "doc_event": "Loading",
        "script": """
frappe.ui.form.on('Workspace', {
    onload: function(frm) {
        // CRM specific - this runs on workspace load
    }
});

// Hide non-CRM sidebar items globally
$(document).on('app-loaded', function() {
    if (window.location.href.includes('sales-crm') || window.location.href.includes('crm-workspace')) {
        var allowedMenus = ['CRM', 'Selling', 'Home', 'Sales CRM'];
        $('.desk-sidebar .standard-sidebar-item').each(function() {
            var label = $(this).find('.sidebar-item-label').text().trim();
            if (label && !allowedMenus.includes(label)) {
                $(this).hide();
            }
        });
    }
});
""",
        "enabled": 1
    }).insert(ignore_permissions=True)
    print("  + Created Client Script: CRM Sidebar Filter")

frappe.db.commit()

print("\n" + "=" * 60)
print("SALES CRM SETUP COMPLETE!")
print("=" * 60)
print("\nSUMMARY:")
print(f"  Sales Stages: {frappe.db.count('Sales Stage')}")
print(f"  Opportunity Types: {frappe.db.count('Opportunity Type')}")
print(f"  Territories: {frappe.db.count('Territory')}")
print(f"  Sales Persons: {frappe.db.count('Sales Person')}")
print(f"  Number Cards: {frappe.db.count('Number Card')}")
print(f"  Dashboard Charts: {frappe.db.count('Dashboard Chart')}")
print(f"  Workspaces: {frappe.db.count('Workspace')}")
print(f"\n  Sales CRM Workspace: {'YES' if frappe.db.exists('Workspace', 'Sales CRM') else 'NO'}")
print(f"  CRM User Role: {'YES' if frappe.db.exists('Role', 'CRM User') else 'NO'}")
print(f"  CRM Manager Role: {'YES' if frappe.db.exists('Role', 'CRM Manager') else 'NO'}")
