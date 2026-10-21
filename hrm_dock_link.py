import frappe

print("=" * 60)
print("HRM APP DESK LINK -> /desk/hrm-app")
print("=" * 60)

WORKSPACE = "HRM App"
APP = "hrms"
MODULE = "HR Setup"


def step(fn, label):
	try:
		fn()
		frappe.db.commit()
		print("  OK: " + label)
	except Exception as e:
		frappe.db.rollback()
		print("  FAIL: " + label + ": " + str(e)[:250])


def workspace_module():
	"""A dock Workspace row is dropped when its module has no sidebar.
	HRM App lives in HR Setup so the desk can resolve a shell for it."""
	if not frappe.db.exists("Workspace", WORKSPACE):
		raise frappe.DoesNotExistError("Workspace %s not found" % WORKSPACE)
	current = frappe.db.get_value("Workspace", WORKSPACE, "module")
	if current == MODULE:
		print("    module already %s, skipping" % MODULE)
		return
	ws = frappe.get_doc("Workspace", WORKSPACE)
	ws.module = MODULE
	ws.save(ignore_permissions=True)
	print("    module %s -> %s" % (current, MODULE))


step(workspace_module, "Workspace module")


def dock_link():
	"""Put Workspace / HRM App first on the hrms dock so the HR app icon
	(and the first rail button) open /desk/hrm-app instead of /desk/hr-setup."""
	from frappe.desk.doctype.dock.dock import get_dock, resolve_app_dock

	base = resolve_app_dock(APP, upto="site", gated=False)

	items = [{
		"link_type": "Workspace",
		"link_to": WORKSPACE,
		"url": "",
		"icon": "people",
		"title": "HRM Dashboard",
		"added": 1,
		"hidden": 0,
	}]

	for row in base:
		if row["link_type"] == "Workspace" and row["link_to"] == WORKSPACE:
			continue
		items.append({
			"link_type": row["link_type"],
			"link_to": row.get("link_to") or "",
			"url": row.get("url") or "",
			"icon": row.get("icon") or "",
			"title": row.get("title") or "",
			"added": 0,
			"hidden": int(row.get("hidden") or 0),
		})

	existing = get_dock(APP)
	if existing:
		doc = frappe.get_doc("Dock", existing.name)
		doc.items = []
		for row in items:
			doc.append("items", row)
		doc.save(ignore_permissions=True)
		print("    dock updated: " + doc.name)
	else:
		doc = frappe.get_doc({"doctype": "Dock", "app": APP, "standard": 0, "items": items})
		doc.insert(ignore_permissions=True)
		print("    dock created: " + doc.name)


step(dock_link, "Desk dock link")

print("  HR app lands on:", "/desk/hrm-app")
