(function () {
	"use strict";

	/*
	 * JassDBX app registry — the single source of truth for "apps".
	 *
	 * Every standalone app (Sales CRM, HRM, Accounts, ...) is one entry here.
	 * This array drives:
	 *   1. the home launcher tiles,
	 *   2. the in-desk app switcher in the navbar,
	 *   3. the app theme class body.jd-app-<key> used by app-themes/<key>.css,
	 *   4. route detection (URL prefix -> workspace name -> DocType module).
	 *
	 * Never hardcode an app route anywhere else. Add/adjust a route here.
	 * See APP_DESIGN_PLAN.md before changing keys or routes.
	 */
	var APPS = [
		{
			key: "sales",
			label: "JassDBX Sales CRM",
			short: "Sales CRM",
			sub: "Leads, quotations, orders & invoices",
			color: "#E2571F",
			href: "/desk/crm/sales",
			routes: ["/desk/crm"],
			workspaces: ["Sales", "Selling", "CRM"],
			modules: ["CRM", "Selling"]
		},
		{
			key: "hrm",
			label: "JassDBX HRM",
			short: "HRM",
			sub: "People, payroll & attendance",
			color: "#1E6E5C",
			href: "/desk/hrm-app",
			routes: ["/desk/hrm-app", "/desk/hr-app"],
			workspaces: ["HRM App", "HR Setup", "Leaves", "Payroll", "Recruitment", "Shift & Attendance", "Expenses", "Performance", "Tenure", "Tax & Benefits"],
			modules: ["HR", "HR Setup", "Leaves", "Payroll", "Recruitment", "Shift and Attendance", "Expenses", "Performance", "Tenure", "Tax and Benefits"]
		},
		{
			key: "accounts",
			label: "JassDBX Accounts",
			short: "Accounts",
			sub: "Ledger, invoices & cash",
			color: "#E5A100",
			href: "/desk/accounts-app",
			routes: ["/desk/accounts-app", "/desk/accounting"],
			workspaces: ["Accounts App", "Accounting", "Invoicing", "Payments", "Financial Reports"],
			modules: ["Accounts"]
		},
		{
			key: "inventory",
			label: "JassDBX Inventory",
			short: "Inventory",
			sub: "Stock, warehouses & moves",
			color: "#8B5BC7",
			href: "/desk/stock",
			routes: ["/desk/stock"],
			workspaces: ["Stock"],
			modules: ["Stock"]
		},
		{
			key: "purchase",
			label: "JassDBX Purchase",
			short: "Purchase",
			sub: "Suppliers & purchase orders",
			color: "#C63A5D",
			href: "/desk/buying",
			routes: ["/desk/buying"],
			workspaces: ["Buying"],
			modules: ["Buying"]
		},
		{
			key: "projects",
			label: "JassDBX Projects",
			short: "Projects",
			sub: "Tasks, timesheets & delivery",
			color: "#1FA3A3",
			href: "/desk/projects",
			routes: ["/desk/projects"],
			workspaces: ["Projects"],
			modules: ["Projects"]
		},
		{
			key: "manufacturing",
			label: "JassDBX Manufacturing",
			short: "Manufacturing",
			sub: "BOMs, work orders & output",
			color: "#6E5B4E",
			href: "/desk/manufacturing",
			routes: ["/desk/manufacturing"],
			workspaces: ["Manufacturing"],
			modules: ["Manufacturing"]
		}
	];

	var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';

	var ICONS = {
		sales: SVG_OPEN + '<path d="M22 7l-8.5 8.5-5-5L2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
		crm: SVG_OPEN + '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
		hrm: SVG_OPEN + '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M18.5 13.8v.9M18.5 20.3v.9M22.2 17.5h-.9M15.7 17.5h-.9"/></svg>',
		accounts: SVG_OPEN + '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
		inventory: SVG_OPEN + '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="m7.5 4.27 9 5.15"/></svg>',
		purchase: SVG_OPEN + '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
		projects: SVG_OPEN + '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/></svg>',
		manufacturing: SVG_OPEN + '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg>',
		search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
		bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
		logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
	};

	var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

	var overlay = null;

	function escape_html(s) {
		return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	function greeting_name() {
		var full = (window.frappe && frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "there";
		if (full === "Administrator") return "Admin";
		return String(full).split(" ")[0];
	}

	function tile_html(a) {
		return (
			'<a class="jd-tile" href="' + escape_html(a.href) + '" data-search="' +
			escape_html((a.label + " " + a.sub).toLowerCase()) + '">' +
			'<span class="jd-tile-icon" style="background:' + escape_html(a.color) + '">' + ICONS[a.key] + "</span>" +
			'<span class="jd-tile-label">' + escape_html(a.label) + "</span>" +
			'<span class="jd-tile-sub">' + escape_html(a.sub) + "</span>" +
			"</a>"
		);
	}

	function clock_strings(now) {
		var h = now.getHours();
		var m = now.getMinutes();
		var ap = h >= 12 ? "pm" : "am";
		var h12 = h % 12 || 12;
		return {
			time: (h12 < 10 ? "0" : "") + h12 + ":" + (m < 10 ? "0" : "") + m + " " + ap,
			date: DAYS[now.getDay()] + ", " + now.getDate() + " " + MONTHS[now.getMonth()]
		};
	}

	function update_clock() {
		if (!overlay) return;
		var t = overlay.querySelector(".jd-clock");
		var d = overlay.querySelector(".jd-date");
		if (!t || !d) return;
		var s = clock_strings(new Date());
		t.textContent = s.time;
		d.textContent = s.date;
	}

	function launcher_html() {
		var s = clock_strings(new Date());
		return (
			'<div class="jd-header">' +
			'<div class="jd-brand"><span class="jd-brand-dot">J</span><span>JassDBX</span></div>' +
			'<div class="jd-header-actions">' +
			'<a class="jd-icon-btn" href="/app/notification-log" title="Notifications" aria-label="Notifications">' + ICONS.bell + "</a>" +
			'<button class="jd-icon-btn jd-logout" title="Logout" aria-label="Logout">' + ICONS.logout + "</button>" +
			"</div></div>" +
			'<div class="jd-hero">' +
			'<div class="jd-date">' + escape_html(s.date) + "</div>" +
			'<div class="jd-clock">' + escape_html(s.time) + "</div>" +
			'<div class="jd-greet">Good to see you, ' + escape_html(greeting_name()) + "</div>" +
			'<div class="jd-search"><span class="jd-search-ic">' + ICONS.search + "</span>" +
			'<input type="text" class="jd-search-input" placeholder="Search apps" autocomplete="off"></div>' +
			"</div>" +
			'<div class="jd-panel"><div class="jd-grid">' + APPS.map(tile_html).join("") + "</div></div>"
		);
	}

	function remove_launcher() {
		if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
		overlay = null;
	}

	function is_home_route() {
		var p = location.pathname.replace(/\/+$/, "");
		return p === "/desk" || p === "/app";
	}

	function is_desk_path() {
		return location.pathname.indexOf("/desk") === 0 || location.pathname.indexOf("/app") === 0;
	}

	function is_crm_route() {
		var p = location.pathname.replace(/\/+$/, "");
		return p.indexOf("/desk/crm/") === 0;
	}

	/* ---------- app registry helpers ---------- */

	function app_by_key(key) {
		for (var i = 0; i < APPS.length; i++) {
			if (APPS[i].key === key) return APPS[i];
		}
		return null;
	}

	function slugify(value) {
		return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	}

	function path_matches(path, prefix) {
		return path === prefix || path.indexOf(prefix + "/") === 0;
	}

	function app_for_module(module) {
		if (!module) return null;
		for (var i = 0; i < APPS.length; i++) {
			var mods = APPS[i].modules || [];
			for (var j = 0; j < mods.length; j++) {
				if (mods[j] === module) return APPS[i].key;
			}
		}
		return null;
	}

	function app_for_workspace(name) {
		if (!name) return null;
		var slug = slugify(name);
		for (var i = 0; i < APPS.length; i++) {
			var spaces = APPS[i].workspaces || [];
			for (var j = 0; j < spaces.length; j++) {
				if (slugify(spaces[j]) === slug) return APPS[i].key;
			}
		}
		// Fall back to the workspace link target, e.g. /desk/hrm-app.
		for (var k = 0; k < APPS.length; k++) {
			var routes = APPS[k].routes || [];
			for (var m = 0; m < routes.length; m++) {
				if (slugify(routes[m]) === slug) return APPS[k].key;
			}
		}
		return null;
	}

	/**
	 * Which app owns the current page?
	 * Priority: URL prefix -> current workspace -> current DocType module.
	 * Returns an APPS key or null (generic desk shell).
	 */
	function current_app_key() {
		var path = location.pathname.replace(/\/+$/, "") || "/";

		for (var i = 0; i < APPS.length; i++) {
			var routes = APPS[i].routes || [];
			for (var j = 0; j < routes.length; j++) {
				if (path_matches(path, routes[j])) return APPS[i].key;
			}
		}

		var route = null;
		try {
			if (window.frappe && frappe.get_route) route = frappe.get_route();
		} catch (e) {
			route = null;
		}

		if (route && route.length) {
			var view = String(route[0] || "").toLowerCase();
			if (view === "workspaces" || view === "workspace") {
				var from_workspace = app_for_workspace(route[1]);
				if (from_workspace) return from_workspace;
			}
			var doctype = route[1];
			if (!doctype && window.frappe && frappe.container && frappe.container.page) {
				doctype = frappe.container.page.doctype;
			}
			var module = null;
			try {
				if (doctype && frappe.get_meta) {
					var meta = frappe.get_meta(doctype);
					module = meta && meta.module;
				}
			} catch (e) {
				module = null;
			}
			var from_module = app_for_module(module);
			if (from_module) return from_module;
		}

		// Workspace URLs can also look like /desk/workspaces/hrm-app.
		var marker = "/workspaces/";
		if (path.indexOf(marker) !== -1) {
			var slug = path.slice(path.indexOf(marker) + marker.length).split("/")[0];
			for (var n = 0; n < APPS.length; n++) {
				var spaces = APPS[n].workspaces || [];
				for (var p = 0; p < spaces.length; p++) {
					if (slugify(spaces[p]) === slug) return APPS[n].key;
				}
			}
		}

		return null;
	}

	/* ---------- app mode (per-app design hook) ---------- */

	function clear_crm_context() {
		var oldGuide = document.querySelector(".jd-crm-page-guide");
		if (oldGuide) oldGuide.remove();
		var oldFlow = document.querySelector(".jd-crm-sales-flow");
		if (oldFlow) oldFlow.remove();
	}

	function apply_app_mode() {
		if (!document.body) return;

		var key = current_app_key();
		var previous = window.__jd_app_key || null;

		if (previous && previous !== key) {
			document.documentElement.classList.remove("jd-app-" + previous);
			document.body.classList.remove("jd-app-" + previous);
		}

		if (key) {
			document.documentElement.classList.add("jd-app-" + key);
			document.body.classList.add("jd-app-" + key);
			document.documentElement.setAttribute("data-jd-app", key);
			document.body.setAttribute("data-jd-app", key);
		} else {
			document.documentElement.removeAttribute("data-jd-app");
			document.body.removeAttribute("data-jd-app");
		}
		window.__jd_app_key = key;

		// Sales CRM keeps its full custom design through the legacy class.
		var crm = key === "sales";
		document.body.classList.toggle("jd-crm-mode", crm);
		document.documentElement.classList.toggle("jd-crm-mode", crm);
		if (crm) render_crm_context();
		else clear_crm_context();

		update_apps_switcher();
	}

	// Backwards-compatible name: older code and notes call this "CRM mode".
	function apply_crm_mode() {
		apply_app_mode();
	}

	/* ---------- desk navbar: app switcher + theme toggle ---------- */

	function apps_switcher_html() {
		var key = window.__jd_app_key || current_app_key();
		var current = app_by_key(key);
		return (
			'<button type="button" class="jd-apps-toggle" aria-haspopup="true" aria-expanded="false" title="Switch JassDBX app">' +
			'<span class="jd-apps-dot" style="background:' + escape_html(current ? current.color : "#64748b") + '"></span>' +
			'<span class="jd-apps-toggle-label">' + escape_html(current ? current.short : "Apps") + "</span>" +
			'<span class="jd-apps-caret" aria-hidden="true">▾</span>' +
			"</button>" +
			'<div class="jd-apps-menu" hidden>' +
			'<div class="jd-apps-menu-head">JassDBX apps</div>' +
			APPS.map(function (a) {
				var active = a.key === key ? " is-active" : "";
				return '<a class="jd-apps-item' + active + '" data-app="' + escape_html(a.key) + '" href="' + escape_html(a.href) + '">' +
					'<span class="jd-apps-swatch" style="background:' + escape_html(a.color) + '"></span>' +
					'<span class="jd-apps-item-label">' + escape_html(a.label) +
					"<small>" + escape_html(a.sub) + "</small></span></a>";
			}).join("") +
			"</div>"
		);
	}

	function update_apps_switcher() {
		var roots = document.querySelectorAll(".jd-apps-panel, .jd-apps-nav-item");
		if (!roots.length) return;
		var key = window.__jd_app_key || null;
		var current = app_by_key(key);
		for (var r = 0; r < roots.length; r++) {
			var root = roots[r];
			var label = root.querySelector(".jd-apps-toggle-label");
			var dot = root.querySelector(".jd-apps-dot");
			if (label) label.textContent = current ? current.short : "Apps";
			if (dot) dot.style.background = current ? current.color : "#64748b";
			var items = root.querySelectorAll(".jd-apps-item");
			for (var i = 0; i < items.length; i++) {
				items[i].classList.toggle("is-active", items[i].getAttribute("data-app") === key);
			}
		}
	}

	function bind_apps_switcher(root) {
		var toggle = root.querySelector(".jd-apps-toggle");
		var menu = root.querySelector(".jd-apps-menu");
		if (!toggle || !menu) return;

		toggle.addEventListener("click", function (event) {
			event.stopPropagation();
			var willOpen = menu.hidden;
			menu.hidden = !willOpen;
			toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
		});

		menu.addEventListener("click", function () {
			menu.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
		});

		document.addEventListener("click", function (event) {
			if (menu.hidden) return;
			if (root.contains(event.target)) return;
			menu.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
		});

		document.addEventListener("keydown", function (event) {
			if (menu.hidden || event.key !== "Escape") return;
			menu.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
			toggle.focus();
		});
	}

	function set_theme(next) {
		document.documentElement.setAttribute("data-jd-theme", next);
		localStorage.setItem("jd_desk_theme", next);
		update_theme_toggle();
	}

	function update_theme_toggle() {
		var button = document.querySelector(".jd-theme-toggle");
		if (!button) return;
		var dark = document.documentElement.getAttribute("data-jd-theme") === "dark";
		button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
		button.title = dark ? "Switch to light theme" : "Switch to dark theme";
		button.innerHTML = '<span aria-hidden="true">' + (dark ? "☀" : "◐") + '</span><span class="jd-theme-label">' + (dark ? "Light mode" : "Dark mode") + "</span>";
	}

	function ensure_app_switcher() {
		// Frappe v16 desk: the app switcher lives in the sidebar's standard-items band.
		var band = document.querySelector(".body-sidebar .standard-items-band");
		if (band && !band.querySelector(".jd-apps-panel")) {
			var panel = document.createElement("div");
			panel.className = "jd-apps-panel";
			panel.innerHTML = apps_switcher_html();
			band.insertBefore(panel, band.firstChild);
			bind_apps_switcher(panel);
		}

		// Older desk layouts expose a navbar; keep the same switcher there too.
		var nav = document.querySelector(".navbar .navbar-nav");
		if (nav) {
			if (!nav.querySelector(".jd-apps-nav-item")) {
				var appsItem = document.createElement("li");
				appsItem.className = "nav-item dropdown jd-apps-nav-item";
				appsItem.innerHTML = apps_switcher_html();
				nav.insertBefore(appsItem, nav.firstChild);
				bind_apps_switcher(appsItem);
			}
			if (!nav.querySelector(".jd-theme-nav-item")) {
				var themeItem = document.createElement("li");
				themeItem.className = "nav-item jd-theme-nav-item";
				themeItem.innerHTML = '<button type="button" class="jd-theme-toggle" aria-label="Switch to dark theme" title="Switch theme"><span aria-hidden="true">◐</span><span class="jd-theme-label">Dark mode</span></button>';
				themeItem.querySelector("button").addEventListener("click", function () {
					var next = document.documentElement.getAttribute("data-jd-theme") === "dark" ? "light" : "dark";
					set_theme(next);
				});
				nav.appendChild(themeItem);
			}
			update_theme_toggle();
		}

		update_apps_switcher();
	}

	function apply_desk_theme() {
		var isDesk = is_desk_path();
		document.documentElement.classList.toggle("jd-desk-mode", isDesk);
		if (document.body) document.body.classList.toggle("jd-desk-mode", isDesk);
		var saved = localStorage.getItem("jd_desk_theme") || "light";
		document.documentElement.setAttribute("data-jd-theme", saved);
		if (!isDesk) return;
		ensure_app_switcher();
	}

	/* ---------- CRM context (existing sales redesign) ---------- */

	function render_crm_context() {
		var page = document.querySelector(".page-container[id^='page-']");
		if (!page) return;
		if (is_crm_route()) document.title = "JassDBX Sales CRM";

		var pageId = (page.id || "").replace(/^page-/, "");
		var parts = pageId.split("/");
		var record = (parts.length > 1 ? parts[1] : parts[0]).toLowerCase();
		var guidance = {
			lead: "Capture a prospect, confirm the basic fit, and set a dated follow-up.",
			opportunity: "Track a qualified deal through stages, ownership, value, and next action.",
			customer: "Keep the account and its contacts together with open sales work.",
			quotation: "Prepare the offer, check its status, and follow up before it expires.",
			"sales order": "Follow the confirmed order and its delivery and billing handoff.",
			"delivery note": "Check fulfillment progress for the customer’s confirmed order.",
			"sales invoice": "Review customer billing status and follow up on collection.",
			campaign: "Organize outreach and see which prospects respond.",
			contact: "Keep each person’s details connected to the right customer account.",
			todo: "Review assigned follow-ups and record the next action when complete.",
			event: "Schedule customer calls and meetings alongside other sales work.",
			item: "Select approved products and services for customer offers.",
			sales: "Start with a lead, qualify the need, send a quotation, then follow the order."
		};

		if (record === "workspaces" && parts[1]) record = parts[1].toLowerCase();
		if (record === "workspaces" && location.pathname.indexOf("/desk/crm/sales") === 0) record = "sales";
		var message = guidance[record];
		var header = document.querySelector(".page-head .container");
		if (message && header) {
			var guide = header.querySelector(":scope > .jd-crm-page-guide");
			if (!guide) {
				guide = document.createElement("div");
				guide.className = "jd-crm-page-guide";
				guide.setAttribute("role", "note");
				header.appendChild(guide);
			}
			guide.textContent = message;
		} else {
			var oldGuide = document.querySelector(".jd-crm-page-guide");
			if (oldGuide) oldGuide.remove();
		}

		if (record === "sales") {
			var workspace = document.querySelector("#page-Workspaces .layout-main-section-wrapper");
			if (workspace && !workspace.querySelector(":scope > .jd-crm-sales-flow")) {
				var flow = document.createElement("section");
				flow.className = "jd-crm-sales-flow";
				flow.setAttribute("aria-label", "JassDBX Sales CRM and Selling workspace");
				flow.innerHTML = '<div class="jd-crm-flow-heading"><div class="jd-crm-brand-mark">J</div><div class="jd-crm-flow-copy"><strong>JassDBX Sales CRM</strong><span>Customer relationships and the complete order-to-cash workflow, together in one workspace.</span></div></div>' +
					'<div class="jd-crm-flow-steps" aria-label="Sales process"><a href="/desk/crm/lead">Lead</a><i>→</i><a href="/desk/crm/opportunity">Opportunity</a><i>→</i><a href="/desk/crm/quotation">Quotation</a><i>→</i><a href="/desk/crm/sales-order">Sales Order</a><i>→</i><a href="/desk/crm/delivery-note">Delivery</a><i>→</i><a href="/desk/crm/sales-invoice">Invoice</a></div>' +
					'<div class="jd-crm-module-groups"><div class="jd-crm-module-group"><span class="jd-crm-module-label">CUSTOMER RELATIONSHIPS</span><div class="jd-crm-module-links"><a href="/desk/crm/lead">Leads</a><a href="/desk/crm/opportunity">Opportunities</a><a href="/desk/crm/customer">Customers</a><a href="/desk/crm/contact">Contacts</a><a href="/desk/crm/campaign">Campaigns</a><a href="/desk/crm/communication">Activities</a></div></div>' +
					'<div class="jd-crm-module-group"><span class="jd-crm-module-label">QUOTATION TO CASH</span><div class="jd-crm-module-links"><a href="/desk/crm/quotation">Quotations</a><a href="/desk/crm/sales-order">Sales Orders</a><a href="/desk/crm/delivery-note">Delivery Notes</a><a href="/desk/crm/sales-invoice">Sales Invoices</a><a href="/desk/crm/item">Products &amp; Services</a><a href="/desk/crm/pos-opening-entry">POS</a></div></div></div>';
				workspace.prepend(flow);
			}
		} else {
			var oldFlow = document.querySelector(".jd-crm-sales-flow");
			if (oldFlow) oldFlow.remove();
		}
	}

	/* ---------- home launcher ---------- */

	function render_launcher() {
		if (!is_home_route()) {
			remove_launcher();
			return;
		}
		if (overlay && document.body.contains(overlay)) {
			update_clock();
			return;
		}
		remove_launcher();
		overlay = document.createElement("div");
		overlay.id = "jd-launcher";
		overlay.innerHTML = launcher_html();
		document.body.appendChild(overlay);

		var input = overlay.querySelector(".jd-search-input");
		if (input) {
			input.addEventListener("input", function () {
				var q = input.value.trim().toLowerCase();
				var tiles = overlay.querySelectorAll(".jd-tile");
				for (var i = 0; i < tiles.length; i++) {
					var hay = tiles[i].getAttribute("data-search") || "";
					tiles[i].style.display = !q || hay.indexOf(q) !== -1 ? "" : "none";
				}
			});
		}
		var lo = overlay.querySelector(".jd-logout");
		if (lo) {
			lo.addEventListener("click", function () {
				if (window.frappe && frappe.app && frappe.app.logout) frappe.app.logout();
			});
		}
	}

	/* ---------- user menu app group ---------- */

	function apps_group() {
		return {
			group: "Apps",
			options: APPS.map(function (a) {
				return { name: "app-" + a.key, label: a.label, href: a.href };
			})
		};
	}

	function patch_user_menu() {
		if (!window.frappe || !frappe.ui || !frappe.ui.Dropdown) return;
		var proto = frappe.ui.Dropdown.prototype;
		if (proto.__jd_menu_patched) return;
		var orig_open = proto.open;
		proto.open = function () {
			try {
				var t = this.trigger_el;
				if (t && t.classList && t.classList.contains("dropdown-navbar-user") && !this.__jd_apps_added) {
					this.options = [apps_group()].concat(this.options || []);
					this.__jd_apps_added = true;
				}
			} catch (e) {
				console.warn("jd: menu inject failed", e);
			}
			return orig_open.apply(this, arguments);
		};
		proto.__jd_menu_patched = true;
	}

	function on_route_change() {
		apply_desk_theme();
		apply_app_mode();
		render_launcher();
	}

	function boot() {
		apply_desk_theme();
		apply_app_mode();
		patch_user_menu();
		render_launcher();
		if (is_desk_path()) ensure_app_switcher();
		if (!window.__jd_hooked && window.frappe && frappe.router && frappe.router.on) {
			frappe.router.on("change", on_route_change);
			window.__jd_hooked = true;
		}
	}

	setInterval(function () {
		apply_app_mode();
		if (is_desk_path()) ensure_app_switcher();
		if (overlay && !is_home_route()) {
			remove_launcher();
			return;
		}
		update_clock();
	}, 10000);

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
	setTimeout(boot, 500);
	setTimeout(boot, 1500);
})();
