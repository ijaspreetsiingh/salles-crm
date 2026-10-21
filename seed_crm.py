import frappe, random, datetime, json

frappe.init(site="frontend", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()

random.seed(11)
TODAY = datetime.date.today()

DESIGN_STAGES = [("Qualification", 20), ("Proposal", 40), ("Negotiation", 70), ("Closing", 90)]
DESIGN_NAMES = [s[0] for s in DESIGN_STAGES]
report = {"stages": [], "customers": 0, "opportunities": 0, "leads": 0,
          "quotations": 0, "events": 0, "todos": 0, "contacts": 0, "projects": 0}


def ins(d):
    try:
        doc = frappe.get_doc(d)
        doc.insert(ignore_permissions=True)
        return doc.name
    except Exception as e:
        print("SKIP", d.get("doctype"), d.get("project_name") or d.get("title") or d.get("lead_name") or d.get("subject") or "", str(e)[:160])
        return None


def dstr(delta_days):
    return (TODAY + datetime.timedelta(days=delta_days)).isoformat()


# ---------------------------------------------------------------- 1. Sales Stage reset (4 design stages)
try:
    all_stages = [d.name for d in frappe.get_all("Sales Stage", fields=["name"], order_by="creation asc")]
    bad_refs = frappe.get_all(
        "Opportunity",
        filters=[["sales_stage", "is", "set"], ["sales_stage", "not in", DESIGN_NAMES]],
        pluck="sales_stage",
    )
    if set(all_stages) != set(DESIGN_NAMES):
        if bad_refs:
            report["stages"] = ["KEPT existing stages, custom stages in use: " + ",".join(sorted(set(bad_refs)))]
        else:
            if all_stages:
                frappe.db.delete("Sales Stage")
            for name, prob in DESIGN_STAGES:
                ins({"doctype": "Sales Stage", "sales_stage": name, "probability": prob})
            frappe.db.commit()
            report["stages"] = ["reset -> " + ", ".join(DESIGN_NAMES)]
    else:
        report["stages"] = ["already 4 design stages"]
except Exception as e:
    report["stages"] = ["ERROR " + str(e)[:120]]

# ---------------------------------------------------------------- 2. customers (3 -> 10)
existing_custs = frappe.get_all("Customer", fields=["name", "customer_name", "customer_group", "territory"],
                                order_by="creation asc")
if len(existing_custs) < 10:
    groups = [d.name for d in frappe.get_all("Customer Group", pluck="name")]
    terrs = [d.name for d in frappe.get_all("Territory", pluck="name")]
    base_g = existing_custs[0]["customer_group"] if existing_custs and existing_custs[0].get("customer_group") else (groups[0] if groups else "")
    base_t = existing_custs[0]["territory"] if existing_custs and existing_custs[0].get("territory") else (terrs[0] if terrs else "")
    new_names = ["Aurora Textiles", "Bluepeak Logistics", "Chandra Motors", "Deccan Agro",
                 "Everest Packagers", "Fusion Bistro", "Ganpati Traders"]
    for i, nm in enumerate(new_names):
        if frappe.db.exists("Customer", nm):
            continue
        d = {"doctype": "Customer", "customer_name": nm}
        g = groups[i % len(groups)] if groups else base_g
        t = terrs[i % len(terrs)] if terrs else base_t
        if g:
            d["customer_group"] = g
        if t:
            d["territory"] = t
        if ins(d):
            report["customers"] += 1

existing_custs = frappe.get_all("Customer", fields=["name", "customer_name"], order_by="creation asc")
cust_names = [c["name"] for c in existing_custs]

# ---------------------------------------------------------------- 3. opportunities (0 -> 15)
if frappe.db.count("Opportunity") < 15 and cust_names:
    owners = []
    try:
        f = frappe.get_meta("Opportunity").get_field("opportunity_owner")
        link_dt = (f.options if f else "Sales Person") or "Sales Person"
        owners = [d.name for d in frappe.get_all(link_dt, pluck="name", limit_page_length=20)]
    except Exception:
        owners = []
    company = frappe.defaults.get_global_default("company")
    topics = ["Website redesign", "Annual support retainer", "Warehouse rollout", "POS migration",
              "Fleet tracking pilot", "eCommerce replatform", "CRM implementation", "Cloud backup setup",
              "Payroll automation", "Inventory module", "Field service app", "Analytics dashboard",
              "Multi-branch ERP", "Production planning", "Vendor portal"]
    stages12 = ["Qualification"] * 3 + ["Proposal"] * 3 + ["Negotiation"] * 3 + ["Closing"] * 3
    statuses12 = ["Open"] * 12
    # 2 converted + 1 lost
    plan_rows = list(zip(stages12, statuses12)) + [("Closing", "Converted"), ("Closing", "Converted"), ("Proposal", "Lost")]
    random.shuffle(cust_names)
    for i, (stage, status) in enumerate(plan_rows):
        cust = cust_names[i % len(cust_names)]
        amount = random.choice([180000, 260000, 340000, 475000, 620000, 780000, 950000, 1250000])
        prob = {"Qualification": 20, "Proposal": 40, "Negotiation": 70, "Closing": 90}.get(stage, 20)
        if status == "Converted":
            prob = 100
            # keep close date inside current month so "Won this month" lights up
            back = min(max(TODAY.day - 1, 0), random.randint(1, 12))
            close = dstr(-back)
        elif status == "Lost":
            prob = 0
            close = dstr(random.randint(-25, -5))
        else:
            close = dstr(random.randint(5, 55))
        doc = {"doctype": "Opportunity",
               "title": "%s — %s" % (topics[i % len(topics)], cust),
               "party_name": cust,
               "customer_name": cust,
               "opportunity_amount": amount,
               "sales_stage": stage,
               "probability": prob,
               "status": status,
               "expected_closing": close}
        if owners:
            doc["opportunity_owner"] = owners[i % len(owners)]
        if company and frappe.get_meta("Opportunity").get_field("company"):
            doc["company"] = company
        if ins(doc):
            report["opportunities"] += 1

# ---------------------------------------------------------------- 4. leads (1 -> 9)
if frappe.db.count("Lead") < 9:
    sources = [d.name for d in frappe.get_all("Lead Source", pluck="name")]
    if not sources:
        sources = ["Website", "Cold Calling", "Reference"]
    rows = [
        ("Aarav Mehta", "Nova Retail"), ("Priya Nair", "Skyline Foods"),
        ("Rohan Gupta", "Vantage Textiles"), ("Sana Kapoor", "Orbital Labs"),
        ("Vikram Iyer", "GreenWheel Agro"), ("Neha Verma", "Meridian Health"),
        ("Arjun Rao", "Copperleaf Studio"), ("Kavya Joshi", "Indus Furnishings"),
    ]
    for i, (nm, co) in enumerate(rows):
        if frappe.db.exists("Lead", {"lead_name": nm}):
            continue
        src = sources[i % len(sources)]
        if ins({"doctype": "Lead", "lead_name": nm, "company_name": co, "status": "Open",
                "lead_source": src, "utm_source": src,
                "email_id": nm.split()[0].lower() + "@" + co.split()[0].lower() + ".in",
                "mobile_no": "+91 98" + str(random.randint(10000000, 99999999))}):
            report["leads"] += 1

# ---------------------------------------------------------------- 5. quotations (0 -> 6)
if frappe.db.count("Quotation") < 6 and cust_names:
    items = [d.name for d in frappe.get_all("Item", pluck="name", limit_page_length=6)]
    company = frappe.defaults.get_global_default("company")
    if items:
        for i in range(6):
            cust = cust_names[i % len(cust_names)]
            qty = random.randint(1, 5)
            rate = random.choice([4500, 12000, 26000, 48000])
            doc = {"doctype": "Quotation", "quotation_to": "Customer",
                   "party_name": cust, "customer_name": cust,
                   "transaction_date": dstr(-random.randint(1, 20)),
                   "valid_till": dstr(random.randint(3, 25)),
                   "items": [{"item_code": items[i % len(items)], "qty": qty, "rate": rate}]}
            if company and frappe.get_meta("Quotation").get_field("company"):
                doc["company"] = company
            name = ins(doc)
            if name:
                report["quotations"] += 1
                try:
                    frappe.get_doc("Quotation", name).submit()
                    frappe.db.commit()
                except Exception as e:
                    print("QUOTE submit skipped", name, str(e)[:100])

# ---------------------------------------------------------------- 6. events (0 -> 10)
if frappe.db.count("Event") < 10:
    ev_rows = [
        ("Demo — Bluepeak Logistics", "Meeting", -2, "11:00"),
        ("Follow-up call — Aurora Textiles", "Call", -1, "15:30"),
        ("Discovery call — Chandra Motors", "Call", 0, "10:00"),
        ("Proposal review — Deccan Agro", "Meeting", 0, "14:00"),
        ("Pricing email — Everest Packagers", "Sent-Received Email", 1, "09:30"),
        ("Onsite visit — Fusion Bistro", "Meeting", 2, "11:30"),
        ("Quarterly business review — Ganpati", "Meeting", 3, "16:00"),
        ("Contract renewal call — Nova Retail", "Call", 5, "12:00"),
        ("Technical scoping — Orbital Labs", "Meeting", 7, "15:00"),
        ("Handover call — GreenWheel Agro", "Call", 9, "10:30"),
    ]
    for subj, cat, delta, hm in ev_rows:
        day = dstr(delta)
        h, m = hm.split(":")
        end_h = str((int(h) + 1) % 24).zfill(2)
        if ins({"doctype": "Event", "subject": subj, "event_category": cat,
                "starts_on": day + " " + hm + ":00", "ends_on": day + " " + end_h + ":" + m + ":00"}):
            report["events"] += 1

# ---------------------------------------------------------------- 7. to-dos (0 -> 8)
if frappe.db.count("To Do") < 8:
    user = frappe.session.user or "Administrator"
    td_rows = [
        ("Send revised quote to Aurora Textiles", -3, "High"),
        ("Chase payment — Deccan Agro invoice", -1, "High"),
        ("Prep demo environment for Bluepeak", 0, "Medium"),
        ("Call back Chandra Motors decision maker", 0, "High"),
        ("Update forecast in pipeline", 0, "Medium"),
        ("Share case study with Orbital Labs", 2, "Low"),
        ("Schedule QBR with Ganpati Traders", 4, "Medium"),
        ("Review contract draft — Fusion Bistro", 6, "Low"),
    ]
    for desc, delta, prio in td_rows:
        if ins({"doctype": "To Do", "description": desc, "date": dstr(delta),
                "priority": prio, "status": "Open", "allocated_to": user}):
            report["todos"] += 1

# ---------------------------------------------------------------- 8. contacts linked to customers
if frappe.db.count("Contact") < 10 and cust_names:
    people = [("Meera", "Shah", "ops"), ("Karthik", "Reddy", "it"), ("Ananya", "Das", "purchase"),
              ("Imran", "Sheikh", "finance"), ("Divya", "Menon", "hr"), ("Suresh", "Patel", "director"),
              ("Ritu", "Kapoor", "store"), ("Ajay", "Singh", "logistics")]
    for i, (fn, ln, role) in enumerate(people):
        cust = cust_names[i % len(cust_names)]
        if frappe.db.exists("Contact", {"first_name": fn, "last_name": ln}):
            continue
        if ins({"doctype": "Contact", "first_name": fn, "last_name": ln,
                "email_id": fn.lower() + "." + ln.lower() + "@" + cust.lower().replace(" ", "") + ".in",
                "phone": "+91 99" + str(random.randint(10000000, 99999999)),
                "links": [{"link_doctype": "Customer", "link_name": cust}]}):
            report["contacts"] += 1

# ---------------------------------------------------------------- 9. projects (0 -> 4)
if frappe.db.count("Project") < 4 and cust_names:
    pr_rows = [
        ("Onboarding & data migration", 0, "Open", 21),
        ("POS rollout — phase 1", 45, "Open", 14),
        ("Training & go-live support", 80, "Open", 7),
        ("Inventory cleanup engagement", 100, "Completed", -3),
    ]
    for i, (nm, pctv, status, delta) in enumerate(pr_rows):
        cust = cust_names[i % len(cust_names)]
        doc = {"doctype": "Project", "project_name": "%s — %s" % (cust, nm),
               "customer": cust, "percent_complete": pctv, "status": status,
               "expected_end_date": dstr(delta)}
        if frappe.get_meta("Project").get_field("company"):
            doc["company"] = frappe.defaults.get_global_default("company")
        if ins(doc):
            report["projects"] += 1

frappe.db.commit()

print("SEED REPORT:")
for k, v in report.items():
    print("  %-14s %s" % (k, v))
print("counts:",
      "Opp", frappe.db.count("Opportunity"),
      "Lead", frappe.db.count("Lead"),
      "Quote", frappe.db.count("Quotation"),
      "Cust", frappe.db.count("Customer"),
      "Event", frappe.db.count("Event"),
      "ToDo", frappe.db.count("To Do"),
      "Proj", frappe.db.count("Project"),
      "Stage", frappe.db.count("Sales Stage"))
frappe.destroy()
