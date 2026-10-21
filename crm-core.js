/* ============================================================
   Rapport CRM Suite for ERPNext — core
   Shell (mesh/dock/header), router interception, overlays,
   data layer. Pages register into JDCRM.pages (crm-pages.js).
   ============================================================ */
(function () {
  "use strict";

  var CRM = (window.JDCRM = window.JDCRM || {});
  CRM.pages = CRM.pages || {};
  CRM.nav = [
    { key: "overview", label: "Overview", hint: "Your priorities and sales health" },
    { key: "pipeline", label: "Pipeline", hint: "Move opportunities forward" },
    { key: "growth", label: "Growth", hint: "Leads, results and targets" },
    { key: "customers", label: "Customers", hint: "Accounts and contacts" },
    { key: "finance", label: "Finance", hint: "Invoices and collections" },
    { key: "operations", label: "Operations", hint: "Items, POS and delivery" },
    { key: "schedule", label: "Schedule", hint: "Calls, meetings and follow-ups" },
    { key: "projects", label: "Projects", hint: "Customer handoffs and delivery" },
    { key: "settings", label: "Settings", hint: "CRM and system configuration" }
  ];

  /* ---------------------------------------------------------- utils */
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function on(root, sel, ev, fn, opts) {
    root.addEventListener(ev, function (e) {
      var t = e.target.closest(sel);
      if (t && root.contains(t)) fn.call(t, e, t);
    }, opts || false);
  }
  function bootCurrency() {
    return (window.frappe && frappe.boot && frappe.boot.currency) || "INR";
  }
  function money(v) {
    var n = Number(v) || 0;
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency", currency: bootCurrency(), maximumFractionDigits: 0
      }).format(n);
    } catch (e) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  }
  function moneyK(v) {
    var n = Number(v) || 0;
    if (Math.abs(n) >= 100000) return "₹" + (n / 100000).toFixed(n >= 1000000 ? 0 : 1) + "L";
    if (Math.abs(n) >= 1000) return "₹" + Math.round(n / 1000) + "K";
    return "₹" + n;
  }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(v, withYear) {
    if (!v) return "—";
    var d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 10);
    return MON[d.getMonth()] + " " + d.getDate() + (withYear ? " " + d.getFullYear() : "");
  }
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayStr() { return ymd(new Date()); }
  function ago(v) {
    if (!v) return "";
    var s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
  }
  function avatar(name, size, cls) {
    size = size || 32;
    var tint = (String(name || "x").charCodeAt(0) || 3) % 4;
    return '<span class="jd-avatar tint-' + tint + " " + (cls || "") + '" style="width:' + size + "px;height:" +
      size + "px;font-size:" + Math.round(size * 0.32) + 'px">' + esc(initials(name)) + "</span>";
  }

  /* ---------------------------------------------------------- icons */
  var P = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path d="M11.5 3.2a.6.6 0 0 1 1 0l2.2 4.6 5 .7a.6.6 0 0 1 .3 1l-3.6 3.5.9 5a.6.6 0 0 1-.9.6L12 16.3l-4.5 2.3a.6.6 0 0 1-.9-.6l.9-5-3.6-3.5a.6.6 0 0 1 .3-1l5-.7z"/>',
    star_fill: '<path fill="currentColor" stroke="none" d="M11.5 3.2a.6.6 0 0 1 1 0l2.2 4.6 5 .7a.6.6 0 0 1 .3 1l-3.6 3.5.9 5a.6.6 0 0 1-.9.6L12 16.3l-4.5 2.3a.6.6 0 0 1-.9-.6l.9-5-3.6-3.5a.6.6 0 0 1 .3-1l5-.7z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    send: '<path d="m22 2-11 11"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    user_check: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    mic_off: '<path d="M2 2l20 20"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7"/><path d="M19 10v2a7 7 0 0 1-.4 2.3M12 19v3"/>',
    phone_off: '<path d="M10.7 13.3a16 16 0 0 0 3.4 3.4l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9"/><path d="M2 2l20 20"/>',
    arrow_ur: '<path d="M7 17 17 7M7 7h10v10"/>',
    more_h: '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    pie: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    bars: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    trophy: '<path d="M6 4h12v6a6 6 0 0 1-12 0z"/><path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4M10 16h4M12 16v4M8 22h8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    chev_l: '<path d="m15 18-6-6 6-6"/>',
    chev_r: '<path d="m9 18 6-6-6-6"/>',
    kanban: '<rect x="3" y="3" width="5" height="14" rx="1.5"/><rect x="10" y="3" width="5" height="10" rx="1.5"/><rect x="17" y="3" width="4" height="17" rx="1.5"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.alert) + "</svg>";
  }

  /* ---------------------------------------------------------- toasts */
  function toast(kind, title, msg) {
    var host = document.getElementById("jd-toasts");
    if (!host) return;
    var ic = kind === "err" ? "alert" : kind === "info" ? "activity" : "check";
    var n = el(
      '<div class="jd-toast ' + esc(kind || "ok") + '">' +
      '<span class="jd-toast-ico">' + icon(ic) + "</span><div><b>" + esc(title) + "</b>" +
      (msg ? "<span>" + esc(msg) + "</span>" : "") + "</div></div>"
    );
    host.appendChild(n);
    setTimeout(function () {
      n.classList.add("is-out");
      setTimeout(function () { n.remove(); }, 260);
    }, 3400);
    while (host.children.length > 4) host.firstElementChild.remove();
  }

  /* ---------------------------------------------------------- overlay stack (modals/drawers) */
  var stack = [];
  function closeTop() {
    var top = stack.pop();
    if (!top) return false;
    top.destroy();
    return true;
  }
  function openModal(opts) {
    var scrim = el('<div class="jd-scrim"></div>');
    var m = el(
      '<div class="jd-modal" role="dialog" aria-modal="true">' +
      '<div class="jd-modal-head"><div><h3>' + esc(opts.title) + "</h3>" +
      (opts.sub ? '<p class="jd-modal-sub">' + esc(opts.sub) + "</p>" : "") +
      '</div><button class="jd-close-btn" aria-label="Close">' + icon("x") + "</button></div>" +
      '<div class="jd-modal-body"></div></div>'
    );
    m.querySelector(".jd-modal-body").appendChild(typeof opts.body === "string" ? el(opts.body) : opts.body);
    var host = document.getElementById("jd-overlays");
    host.appendChild(scrim); host.appendChild(m);
    function destroy() { scrim.remove(); m.remove(); if (opts.onClose) opts.onClose(); }
    scrim.addEventListener("click", function () { if (stack[stack.length - 1] && stack[stack.length - 1].node === m) closeTop(); });
    m.querySelector(".jd-close-btn").addEventListener("click", function () { closeTop(); });
    var entry = { node: m, destroy: destroy };
    stack.push(entry);
    if (opts.onMount) opts.onMount(m, function () { closeTop(); });
    var f = m.querySelector(".jd-modal-body input, .jd-modal-body select, .jd-modal-body textarea");
    if (f && opts.focus !== false) setTimeout(function () { f.focus(); }, 60);
    return { close: function () { if (stack[stack.length - 1] === entry) closeTop(); else destroy(); } };
  }
  function openDrawer(opts) {
    var scrim = el('<div class="jd-scrim"></div>');
    var d = el(
      '<aside class="jd-drawer" role="dialog" aria-modal="true">' +
      '<div class="jd-drawer-head"><span class="jd-drawer-kicker">' + esc(opts.kicker || "") + "</span>" +
      '<button class="jd-close-btn" title="Close" aria-label="Close">' + icon("x") + "</button></div>" +
      '<div class="jd-drawer-body"></div></aside>'
    );
    d.querySelector(".jd-drawer-body").appendChild(typeof opts.body === "string" ? el(opts.body) : opts.body);
    var host = document.getElementById("jd-overlays");
    host.appendChild(scrim); host.appendChild(d);
    function destroy() { scrim.remove(); d.remove(); if (opts.onClose) opts.onClose(); }
    scrim.addEventListener("click", function () { if (stack[stack.length - 1] && stack[stack.length - 1].node === d) closeTop(); });
    d.querySelector(".jd-close-btn").addEventListener("click", function () { closeTop(); });
    var entry = { node: d, destroy: destroy };
    stack.push(entry);
    if (opts.onMount) opts.onMount(d, function () { closeTop(); });
    return { close: function () { if (stack[stack.length - 1] === entry) closeTop(); else destroy(); } };
  }
  function closeAllOverlays() { while (stack.length) closeTop(); }
  CRM.closeAllOverlays = closeAllOverlays;

  /* ---------------------------------------------------------- data */
  function list(doctype, opts) {
    opts = opts || {};
    opts.limit_page_length = opts.limit_page_length || 500;
    return new Promise(function (res, rej) {
      if (!window.frappe || !frappe.db) { rej(new Error("frappe not ready")); return; }
      frappe.db.get_list(doctype, opts).done(res).fail(rej);
    });
  }
  function setVal(doctype, name, fields) {
    return new Promise(function (res, rej) {
      frappe.client.set_value(doctype, name, fields).done(function (r) { res(r); }).fail(rej);
    });
  }
  function insertDoc(doc) {
    return new Promise(function (res, rej) {
      frappe.client.insert({ doc: doc }).done(function (r) { res(r); }).fail(rej);
    });
  }
  function xcall(method, args) {
    return new Promise(function (res, rej) {
      frappe.xcall(method, args).done(res).fail(rej);
    });
  }
  CRM.list = list;
  CRM.setVal = setVal;
  CRM.insertDoc = insertDoc;
  CRM.xcall = xcall;

  /* ---------------------------------------------------------- helpers */
  function countUp(node, value, fmt) {
    fmt = fmt || function (v) { return Math.round(v).toLocaleString("en-IN"); };
    var start = performance.now(), from = 0, dur = 750;
    function tick(t) {
      var p = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (value - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  CRM.countUp = countUp;
  CRM.enhanceCounters = function (scope) {
    var nodes = (scope || document).querySelectorAll("[data-count][data-v]");
    nodes.forEach(function (n) {
      var v = parseFloat(n.getAttribute("data-v"));
      if (isNaN(v)) return;
      var kind = n.getAttribute("data-fmt");
      var fmt =
        kind === "money" ? function (x) { return money(x); } :
        kind === "moneyK" ? function (x) { return moneyK(x); } :
        kind === "pct" ? function (x) { return Math.round(x) + "%"; } :
        null;
      countUp(n, v, fmt || undefined);
    });
  };
  function emptyState(title, hint, btn) {
    return '<div class="jd-empty"><div class="big-ico">' + icon("layers") + "</div><b>" + esc(title) + "</b>" +
      esc(hint || "") + (btn ? '<div class="btn-row">' + btn + "</div>" : "") + "</div>";
  }
  CRM.emptyState = emptyState;
  function skelRows(n, h) {
    var s = "";
    for (var i = 0; i < (n || 5); i++) s += '<div class="jd-skel" style="height:' + (h || 54) + 'px;margin-bottom:10px"></div>';
    return s;
  }
  CRM.skelRows = skelRows;
  function pageHeader(o) {
    var stats = (o.stats || []).map(function (s, i) {
      return '<div class="jd-stat" style="--i:' + i + '"><span class="jd-stat-icon">' + icon(s.icon) + "</span><div>" +
        '<div class="jd-stat-value"><span data-count data-v="' + (s.raw != null ? s.raw : "") + '" data-fmt="' + (s.fmt || "") + '">' +
        esc(s.value) + "</span>" + (s.badge || "") + "</div>" +
        '<div class="jd-stat-label">' + esc(s.label) + "</div></div></div>";
    }).join("");
    return '<div class="jd-page-head"><div class="jd-page-head-left"><div class="jd-page-title"><h1>' +
      esc(o.title[0]) + "<br>" + esc(o.title[1]) + "</h1><p>" + esc(o.desc || "") + "</p></div>" +
      '<div class="jd-stat-row">' + stats + "</div></div>" +
      (o.right ? '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' + o.right + "</div>" : "") +
      "</div>";
  }
  CRM.pageHeader = pageHeader;
  CRM.esc = esc;
  CRM.el = el;
  CRM.icon = icon;
  CRM.money = money;
  CRM.moneyK = moneyK;
  CRM.fmtDate = fmtDate;
  CRM.ymd = ymd;
  CRM.todayStr = todayStr;
  CRM.ago = ago;
  CRM.avatar = avatar;
  CRM.on = on;
  CRM.toast = toast;
  CRM.openModal = openModal;
  CRM.openDrawer = openDrawer;

  /* ---------------------------------------------------------- CSV export */
  CRM.exportCSV = function (name, rows) {
    if (!rows || !rows.length) { toast("info", "Nothing to export"); return; }
    var keys = Object.keys(rows[0]);
    var csv = [keys.join(",")].concat(rows.map(function (r) {
      return keys.map(function (k) { return JSON.stringify(String(r[k] == null ? "" : r[k])); }).join(",");
    })).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("ok", "Exported " + rows.length + " rows", name + ".csv");
  };
  CRM.exportRows = function () { toast("info", "Nothing to export on this page"); };

  /* ---------------------------------------------------------- stage colors */
  CRM.stageTone = { Qualification: "sun", Proposal: "forest", Negotiation: "ember", Closing: "ink" };
  CRM.toneVar = { sun: "var(--butter)", forest: "var(--pine)", ember: "var(--tomato)", ink: "var(--ink)" };
  CRM.toneCls = { sun: "tone-sun", forest: "tone-forest", ember: "tone-ember", ink: "tone-ink" };
  CRM.stageProb = { Qualification: 20, Proposal: 40, Negotiation: 70, Closing: 90 };

  /* ---------------------------------------------------------- people (owners) */
  CRM.bootCur = bootCurrency();
  CRM._people = null;
  CRM.loadPeople = function () {
    if (CRM._people && CRM._people.length) return Promise.resolve(CRM._people);
    var dt = "Sales Person";
    try {
      var f = frappe.meta.get_docfield("Opportunity", "opportunity_owner");
      if (f && f.options) dt = f.options;
    } catch (e) {}
    return CRM.list(dt, { fields: ["name"], limit_page_length: 50 })
      .then(function (r) {
        CRM._people = (r || []).map(function (x) { return x.name; });
        return CRM._people;
      })
      .catch(function () { CRM._people = CRM._people || []; return CRM._people; });
  };

  /* ---------------------------------------------------------- favourites */
  CRM.getFavs = function () {
    try { return JSON.parse(localStorage.getItem("jd_crm_favs") || "[]"); } catch (e) { return []; }
  };
  CRM.toggleFav = function (id) {
    var favs = CRM.getFavs(), i = favs.indexOf(id);
    if (i >= 0) { favs.splice(i, 1); } else { favs.push(id); }
    try { localStorage.setItem("jd_crm_favs", JSON.stringify(favs)); } catch (e) {}
    return i < 0;
  };

  /* ============================================================
     Shell
     ============================================================ */
  var root, main, navHost, bellBtn, themeState;
  var current = null, mounted = false, pendingRecord = null, refreshing = false;

  function dockBtn(name, tip, kbd, attrs) {
    return '<button class="jd-dock-btn" ' + (attrs || "") + ' aria-label="' + esc(tip.split(" ")[0]) + '">' +
      icon(name) + '<span class="jd-dock-tip">' + esc(tip) + (kbd ? " <kbd>" + esc(kbd) + "</kbd>" : "") + "</span></button>";
  }

  function buildShell() {
    root = document.createElement("div");
    root.id = "jd-crm";
    root.setAttribute("data-theme", localStorage.getItem("jd_crm_theme") === "dark" ? "dark" : "light");
    root.innerHTML =
      '<div class="jd-mesh" aria-hidden="true"><i class="jd-mesh-a"></i><i class="jd-mesh-b"></i><i class="jd-mesh-c"></i></div>' +
      '<nav class="jd-dock" aria-label="Quick actions">' +
      dockBtn("search", "Search", "Ctrl K", 'data-act="search"') +
      dockBtn("plus", "Create", "", 'data-act="create"') +
      dockBtn("star", "Favourites", "", 'data-act="favs"') +
      dockBtn("calendar", "Today", "", 'data-act="agenda"') +
      dockBtn("phone", "Log a call", "", 'data-act="call"') +
      dockBtn("mail", "Compose", "", 'data-act="compose"') +
      dockBtn("share", "Copy link", "", 'data-act="copy"') +
      dockBtn("download", "Export CSV", "", 'data-act="export"') +
      '<span class="jd-dock-sep"></span>' +
      dockBtn("help", "Shortcuts", "?", 'data-act="shortcuts"') +
      dockBtn("moon", "Theme", "", 'data-act="theme" data-theme-btn') +
      '<span class="jd-dock-sep"></span>' +
      dockBtn("logout", "Exit CRM", "", 'data-act="exit"') +
      "</nav>" +
      '<div class="jd-app">' +
      '<header class="jd-header">' +
      '<button class="jd-brand" data-nav="overview" aria-label="Rapport CRM home">' +
      '<span class="jd-brand-mark">R</span><span class="jd-brand-word">rapport</span></button>' +
      '<nav class="jd-nav" id="jd-nav" aria-label="CRM sections"></nav>' +
      '<div class="jd-head-right">' +
      '<button class="jd-search-pill" data-act="search">' + icon("search") + "<span>Search</span><kbd>Ctrl K</kbd></button>" +
      '<button class="jd-create-btn" data-act="create">' + icon("plus") + "<span>Create</span></button>" +
      '<button class="jd-round-btn" data-act="activity" title="Activity" aria-label="Activity">' + icon("inbox") + "</button>" +
      '<button class="jd-round-btn" id="jd-bell" data-act="bell" title="Upcoming" aria-label="Upcoming">' + icon("bell") + "</button>" +
      '<div class="jd-menu-wrap"><button class="jd-round-btn" data-act="usermenu" id="jd-user-btn" aria-label="Account"></button></div>' +
      "</div></header>" +
      '<div class="jd-banner" role="note"><span class="jd-chip-live">Live</span>' +
      "<span>Real ERPNext data — every edit saves instantly. Records open in native forms whenever you need the full page.</span></div>" +
      '<main class="jd-main page-fade"></main></div>' +
      '<div id="jd-overlays"></div><div class="jd-toasts" id="jd-toasts"></div>';
    document.body.appendChild(root);
    main = root.querySelector(".jd-main");
    navHost = root.querySelector("#jd-nav");
    bellBtn = root.querySelector("#jd-bell");

    navHost.innerHTML = CRM.nav.map(function (n) {
      return '<button class="jd-nav-tab" data-nav="' + n.key + '" title="' + esc(n.hint) + '">' + esc(n.label) + "</button>";
    }).join("");

    var uname = (window.frappe && frappe.boot && frappe.boot.user && frappe.boot.user.full_name) || "Guest";
    root.querySelector("#jd-user-btn").innerHTML = avatar(uname, 34);

    root.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-nav]");
      if (nav) { go(nav.getAttribute("data-nav")); return; }
      var goto_ = e.target.closest("[data-goto]");
      if (goto_) { e.preventDefault(); CRM.go(goto_.getAttribute("data-goto")); return; }
      var act = e.target.closest("[data-act]");
      if (act) handleAct(act.getAttribute("data-act"), act);
    });
    closeMenusOnOutside();
  }

  function closeMenusOnOutside() {
    document.addEventListener("click", function (e) {
      var open = root && root.querySelector(".jd-menu");
      if (open && !open.contains(e.target) && !e.target.closest('[data-act="bell"],[data-act="usermenu"]')) open.remove();
    }, true);
  }

  function handleAct(act, node) {
    switch (act) {
      case "search": openPalette(); break;
      case "create": openCreate(); break;
      case "favs": openFavs(); break;
      case "agenda": openAgenda(); break;
      case "call": openCallDialog(); break;
      case "compose": openCompose(); break;
      case "copy":
        try { navigator.clipboard.writeText(location.href); } catch (e) {}
        toast("ok", "Link copied to clipboard"); break;
      case "export": CRM.exportRows(); break;
      case "shortcuts": openShortcuts(); break;
      case "theme": toggleTheme(); break;
      case "exit": exitCRM(); break;
      case "activity": openActivity(); break;
      case "bell": openBellMenu(node); break;
      case "usermenu": openUserMenu(node); break;
    }
  }

  function toggleTheme() {
    var dark = root.getAttribute("data-theme") === "dark";
    root.setAttribute("data-theme", dark ? "light" : "dark");
    try { localStorage.setItem("jd_crm_theme", dark ? "light" : "dark"); } catch (e) {}
    var b = root.querySelector("[data-theme-btn]");
    if (b) b.innerHTML = icon(dark ? "moon" : "sun") + '<span class="jd-dock-tip">Theme</span>';
    toast("ok", dark ? "Light theme enabled" : "Dark theme enabled");
  }
  CRM.toggleTheme = toggleTheme;

  function exitCRM() {
    closeAllOverlays();
    if (location.hash.indexOf("#/crm/") === 0) history.replaceState(null, "", location.pathname + location.search);
    if (window.frappe && frappe.set_route) { frappe.set_route("desk"); }
    else location.href = "/desk";
  }
  CRM.exit = exitCRM;

  /* ---------------------------------------------------------- header stats (bell) */
  function refreshHeaderStats() {
    if (!bellBtn) return;
    var t = todayStr();
    Promise.all([
      list("Event", { fields: ["name"], filters: { status: "Open" }, limit_page_length: 100 }).catch(function () { return []; }),
      list("To Do", {
        fields: ["name"],
        filters: [["status", "=", "Open"], ["date", "<=", t]],
        limit_page_length: 100
      }).catch(function () { return []; })
    ]).then(function (r) {
      var n = r[0].length + r[1].length;
      var dot = bellBtn.querySelector(".jd-dot-alert");
      if (n > 0 && !dot) bellBtn.appendChild(el('<span class="jd-dot-alert"></span>'));
      if (!n && dot) dot.remove();
      bellBtn.setAttribute("title", n + " upcoming item" + (n === 1 ? "" : "s"));
    });
  }
  CRM.refreshHeaderStats = refreshHeaderStats;

  function openBellMenu(node) {
    var exist = root.querySelector(".jd-menu");
    if (exist) { exist.remove(); return; }
    var t = todayStr();
    var menu = el('<div class="jd-menu" style="min-width:300px"><div class="jd-cmd-group">Up next</div>' +
      '<div class="jd-notif-list">' + skelRows(3, 40) + "</div></div>");
    node.parentNode.appendChild(menu);
    Promise.all([
      list("Event", {
        fields: ["subject", "starts_on", "event_category"],
        filters: { status: "Open" },
        order_by: "starts_on asc", limit_page_length: 6
      }).catch(function () { return []; }),
      list("To Do", {
        fields: ["description", "date", "status"],
        filters: [["status", "=", "Open"], ["date", "<=", t]],
        order_by: "date asc", limit_page_length: 6
      }).catch(function () { return []; })
    ]).then(function (r) {
      var html = r[0].map(function (ev) {
        var when = (ev.starts_on || "").slice(0, 10) === t ? "Today" : fmtDate(ev.starts_on);
        return '<div class="jd-notif-item"><p>' + esc(ev.subject) + "</p>" +
          '<span class="s">' + esc(ev.event_category || "Event") + " · " + esc(when) + "</span></div>";
      }).concat(r[1].map(function (td) {
        return '<div class="jd-notif-item"><p>' + esc(td.description) + "</p>" +
          '<span class="s">Task · due ' + esc(fmtDate(td.date)) + "</span></div>";
      })).join("");
      menu.querySelector(".jd-notif-list").innerHTML = html ||
        '<div class="jd-empty" style="padding:18px">All clear — nothing upcoming.</div>';
    });
  }

  function openUserMenu(node) {
    var exist = root.querySelector(".jd-menu");
    if (exist) { exist.remove(); return; }
    var uname = (window.frappe && frappe.boot && frappe.boot.user && frappe.boot.user.full_name) || "Guest";
    var urole = (window.frappe && frappe.boot && frappe.boot.user && (frappe.boot.user.roles || []).join(", ")) || "";
    var menu = el('<div class="jd-menu">' +
      '<div class="jd-menu-head">' + avatar(uname, 40) +
      '<div><div class="nm">' + esc(uname) + '</div><div class="rl">' + esc(urole.slice(0, 44)) + "</div></div></div>" +
      '<div class="jd-menu-sep"></div>' +
      '<button class="jd-menu-item" data-act="theme">' + icon("moon") + "Toggle theme</button>" +
      '<button class="jd-menu-item" data-act="shortcuts">' + icon("help") + "Keyboard shortcuts</button>" +
      '<div class="jd-menu-sep"></div>' +
      '<button class="jd-menu-item" data-act="exit">' + icon("logout") + "Exit to Desk" +
      '<span class="arr">/desk</span></button></div>');
    node.parentNode.appendChild(menu);
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (b) { menu.remove(); handleAct(b.getAttribute("data-act"), b); }
    });
  }

  /* ---------------------------------------------------------- generic form modal */
  function formModal(opts) {
    var fields = opts.fields.map(function (f) {
      var input;
      if (f.type === "select") {
        input = '<select name="' + f.name + '" ' + (f.req ? "required" : "") + ">" +
          (f.options || []).map(function (o) {
            var v = typeof o === "string" ? o : o.value, l = typeof o === "string" ? o : o.label;
            return '<option value="' + esc(v) + '"' + (f.value === v ? " selected" : "") + ">" + esc(l) + "</option>";
          }).join("") + "</select>";
      } else if (f.type === "textarea") {
        input = '<textarea name="' + f.name + '" rows="3" placeholder="' + esc(f.ph || "") + '">' + esc(f.value || "") + "</textarea>";
      } else {
        input = '<input name="' + f.name + '" type="' + (f.type || "text") + '"' +
          (f.req ? " required" : "") + (f.min != null ? ' min="' + f.min + '"' : "") +
          ' value="' + esc(f.value || "") + '" placeholder="' + esc(f.ph || "") + '">';
      }
      return '<div class="jd-field"><label>' + esc(f.label) + "</label>" + input + "</div>";
    }).join("");
    return openModal({
      title: opts.title, sub: opts.sub,
      body: '<form class="jd-fields" style="margin-top:14px">' + fields +
        '<button type="submit" class="jd-primary-btn" style="justify-content:center">' + icon("check") +
        esc(opts.submit || "Save") + "</button></form>",
      onMount: function (m, close) {
        m.querySelector("form").addEventListener("submit", function (e) {
          e.preventDefault();
          var vals = {};
          new FormData(e.target).forEach(function (v, k) { vals[k] = v; });
          opts.onSave(vals, close, m);
        });
      }
    });
  }
  CRM.formModal = formModal;

  /* ---------------------------------------------------------- create flows */
  function openCreate() {
    var tiles = [
      ["New Deal", "Opportunity in your pipeline", "deal"],
      ["New Customer", "Account directory", "customer"],
      ["New Lead", "Capture a prospect", "lead"],
      ["New Task", "Follow-up on your schedule", "task"]
    ];
    openModal({
      title: "Create New Record",
      sub: "Pick what you need — the form opens right here and saves to ERPNext.",
      body: '<div class="jd-create-grid" style="margin-top:4px">' + tiles.map(function (t) {
        return '<button class="jd-create-tile" data-new="' + t[2] + '"><span class="t">' + t[0] + '</span><span class="d">' + t[1] + "</span></button>";
      }).join("") + "</div>",
      onMount: function (m, close) {
        m.addEventListener("click", function (e) {
          var b = e.target.closest("[data-new]");
          if (!b) return;
          close();
          setTimeout(function () { startCreate(b.getAttribute("data-new")); }, 80);
        });
      }
    });
  }

  function stageOptions() {
    return list("Sales Stage", { fields: ["name"], order_by: "creation asc", limit_page_length: 50 })
      .then(function (r) { return r.map(function (x) { return x.name; }); })
      .catch(function () { return ["Qualification", "Proposal", "Negotiation", "Closing"]; });
  }
  CRM.stageOptions = stageOptions;

  function startCreate(kind, dflt) {
    dflt = dflt || {};
    if (kind === "deal") {
      Promise.all([stageOptions(), list("Customer", { fields: ["customer_name"], limit_page_length: 100 })]).then(function (r) {
        formModal({
          title: "New deal", sub: "Drops straight into your board", submit: "Create deal",
          fields: [
            { name: "title", label: "Deal name", req: true, ph: "Website redesign — Acme" },
            { name: "customer_name", label: "Customer", type: "select", options: r[1].map(function (c) { return c.customer_name; }), value: dflt.customer_name || "" },
            { name: "opportunity_amount", label: "Amount (" + bootCurrency() + ")", type: "number", min: 0, req: true, value: dflt.opportunity_amount || "250000" },
            { name: "sales_stage", label: "Stage", type: "select", options: r[0], value: dflt.sales_stage || r[0][0] },
            { name: "expected_closing", label: "Closing date", type: "date", value: dflt.expected_closing || CRM.ymd(new Date(Date.now() + 30 * 864e5)) }
          ],
          onSave: function (v, close) {
            insertDoc({
              doctype: "Opportunity",
              title: v.title,
              customer_name: v.customer_name || "",
              party_name: v.customer_name || "",
              opportunity_amount: Number(v.opportunity_amount) || 0,
              sales_stage: v.sales_stage,
              probability: CRM.stageProb[v.sales_stage] || 20,
              expected_closing: v.expected_closing,
              status: "Open"
            }).then(function () {
              close(); toast("ok", 'Created deal "' + v.title + '"'); CRM.refresh();
            }).catch(function (e) { toast("err", "Could not save deal", (e && e.message) || ""); });
          }
        });
      });
    } else if (kind === "customer") {
      list("Customer", { fields: ["customer_name", "customer_group", "territory"], limit_page_length: 1 }).then(function (r) {
        var dflt = r[0] || {};
        formModal({
          title: "New customer", submit: "Create customer",
          fields: [
            { name: "customer_name", label: "Customer name", req: true, ph: "Acme Industries" },
            { name: "customer_group", label: "Customer group", value: dflt.customer_group || "", ph: "All Customer Groups" },
            { name: "territory", label: "Territory", value: dflt.territory || "", ph: "All Territories" }
          ],
          onSave: function (v, close) {
            var doc = { doctype: "Customer", customer_name: v.customer_name };
            if (v.customer_group) doc.customer_group = v.customer_group;
            if (v.territory) doc.territory = v.territory;
            insertDoc(doc).then(function () {
              close(); toast("ok", 'Added customer "' + v.customer_name + '"'); CRM.refresh();
            }).catch(function (e) { toast("err", "Could not save customer", (e && e.message) || ""); });
          }
        });
      });
    } else if (kind === "lead") {
      formModal({
        title: "New lead", submit: "Create lead",
        fields: [
          { name: "lead_name", label: "Lead name", req: true, ph: "Priya Sharma" },
          { name: "company_name", label: "Company", ph: "Nova Retail" },
          { name: "email_id", label: "Email", type: "email" },
          { name: "mobile_no", label: "Phone", type: "tel" }
        ],
        onSave: function (v, close) {
          insertDoc({
            doctype: "Lead", lead_name: v.lead_name, company_name: v.company_name || "",
            email_id: v.email_id || "", mobile_no: v.mobile_no || "", status: "Open"
          }).then(function () {
            close(); toast("ok", 'Captured lead "' + v.lead_name + '"'); CRM.refresh();
          }).catch(function (e) { toast("err", "Could not save lead", (e && e.message) || ""); });
        }
      });
    } else if (kind === "task") {
      formModal({
        title: "New task", submit: "Add task",
        fields: [
          { name: "description", label: "Task", req: true, ph: "Follow up with Acme ops lead" },
          { name: "date", label: "Due date", type: "date", req: true, value: todayStr() },
          { name: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], value: "Medium" }
        ],
        onSave: function (v, close) {
          insertDoc({
            doctype: "To Do", description: v.description, date: v.date, priority: v.priority,
            status: "Open", allocated_to: (window.frappe && frappe.session && frappe.session.user) || "Administrator"
          }).then(function () {
            close(); toast("ok", "Task added"); CRM.refresh();
          }).catch(function (e) { toast("err", "Could not save task", (e && e.message) || ""); });
        }
      });
    }
  }
  CRM.startCreate = startCreate;

  /* ---------------------------------------------------------- agenda / favs / shortcuts / activity / compose */
  function openAgenda() {
    var t = todayStr();
    Promise.all([
      list("Event", {
        fields: ["name", "subject", "starts_on", "event_category", "status"],
        filters: { status: "Open" }, order_by: "starts_on asc", limit_page_length: 30
      }).catch(function () { return []; }),
      list("To Do", {
        fields: ["name", "description", "date", "status"],
        filters: [["status", "=", "Open"], ["date", "<=", t]], order_by: "date asc", limit_page_length: 30
      }).catch(function () { return []; })
    ]).then(function (r) {
      var evs = r[0], tds = r[1];
      var body = "";
      if (!evs.length && !tds.length) {
        body = emptyState("Nothing scheduled today", "Add a call, meeting or task to plan your day.",
          '<button class="jd-primary-btn" data-new-task>' + icon("plus") + "Add task</button>");
      } else {
        body = '<div class="jd-gap-list">' +
          tds.map(function (td) {
            return '<div class="jd-task" data-todo="' + esc(td.name) + '"><span class="jd-check">' + icon("check") + "</span>" +
              '<div class="body"><div class="t">' + esc(td.description) + '</div><div class="m">Task · due ' +
              esc(fmtDate(td.date)) + (td.date < t ? " · overdue" : "") + "</div></div></div>";
          }).join("") +
          evs.slice(0, 8).map(function (ev) {
            var when = (ev.starts_on || "").slice(0, 10) === t ? "Today " + (ev.starts_on || "").slice(11, 16) : fmtDate(ev.starts_on);
            return '<div class="jd-link-row" data-ev="' + esc(ev.name) + '"><span><b>' + esc(ev.subject) + "</b>" +
              '<div class="m">' + esc(ev.event_category || "Event") + " · " + esc(when) + "</div></span>" +
              '<span class="jd-status st-mute">Open</span></div>';
          }).join("") + "</div>";
      }
      openModal({
        title: "Today's Agenda", sub: "Calls, meetings and follow-ups due now.",
        body: body,
        onMount: function (m, close) {
          m.addEventListener("click", function (e) {
            if (e.target.closest("[data-new-task]")) { close(); setTimeout(function () { startCreate("task"); }, 80); return; }
            var td = e.target.closest("[data-todo]");
            if (td) {
              setVal("To Do", td.getAttribute("data-todo"), { status: "Completed" }).then(function () {
                td.classList.add("is-done");
                toast("ok", "Completed task"); refreshHeaderStats();
                setTimeout(function () { close(); CRM.refresh(); }, 450);
              }).catch(function (e2) { toast("err", "Update failed", (e2 && e2.message) || ""); });
            }
            var ev = e.target.closest("[data-ev]");
            if (ev) { close(); CRM.go("schedule"); }
          });
        }
      });
    });
  }

  function openFavs() {
    var favs = CRM.getFavs();
    Promise.all([
      list("Opportunity", {
        fields: ["name", "title", "opportunity_amount", "sales_stage", "status"],
        filters: [["status", "not in", ["Converted", "Lost", "Closed"]]],
        order_by: "opportunity_amount desc", limit_page_length: 10
      }).catch(function () { return []; }),
      list("Customer", { fields: ["customer_name"], order_by: "modified desc", limit_page_length: 6 }).catch(function () { return []; })
    ]).then(function (r) {
      var opps = r[0], cust = r[1];
      var starred = opps.filter(function (o) { return favs.indexOf(o.name) >= 0; });
      var rows = (starred.length ? starred : opps.slice(0, 4)).map(function (o) {
        return '<div class="jd-link-row" data-opp="' + esc(o.name) + '"><span><b>' + esc(o.title || o.name) + "</b>" +
          '<div class="m">' + esc(o.sales_stage || "") + " · " + esc(money(o.opportunity_amount)) + "</div></span>" +
          '<span class="jd-badge ' + (favs.indexOf(o.name) >= 0 ? "tone-sun" : "tone-light") + '">★</span></div>';
      }).join("");
      var custRows = cust.slice(0, 4).map(function (c) {
        return '<div class="jd-link-row" data-cust="' + esc(c.customer_name) + '"><span><b>' + esc(c.customer_name) + "</b>" +
          '<div class="m">Account</div></span>' + icon("arrow_ur", "jd-mut") + "</div>";
      }).join("");
      openModal({
        title: "Favourite Accounts", sub: starred.length ? "Your starred deals and key accounts." : "Star deals on the board to pin them here.",
        body: '<div class="jd-gap-list" style="margin-top:14px">' + (rows + custRows ||
          emptyState("No records yet", "Create your first deal to get started.")) + "</div>",
        onMount: function (m, close) {
          m.addEventListener("click", function (e) {
            var o = e.target.closest("[data-opp]");
            var c = e.target.closest("[data-cust]");
            if (o) { close(); pendingRecord = { doctype: "Opportunity", name: o.getAttribute("data-opp") }; CRM.go("pipeline"); }
            if (c) { close(); pendingRecord = { doctype: "Customer", name: c.getAttribute("data-cust") }; CRM.go("customers"); }
          });
        }
      });
    });
  }

  function openShortcuts() {
    var rows = [
      ["Ctrl K  or  /", "Open Search Finder"],
      ["N", "Create record"],
      ["G then O / P / C", "Overview · Pipeline · Customers"],
      ["G then S / F / G / J", "Schedule · Finance · Growth · Projects"],
      ["Esc", "Close dialog / drawer"],
      ["?", "This list"]
    ];
    openModal({
      title: "Keyboard Shortcuts", sub: "Navigate Rapport with speed and precision.",
      body: '<div style="margin-top:12px">' + rows.map(function (r) {
        return '<div class="jd-shortcut-row"><span>' + esc(r[1]) + '</span><kbd class="jd-kbd">' + esc(r[0]) + "</kbd></div>";
      }).join("") + "</div>"
    });
  }

  function openActivity() {
    list("Comment", {
      fields: ["name", "content", "comment_by", "creation", "reference_doctype", "reference_name"],
      order_by: "creation desc", limit_page_length: 12
    }).catch(function () { return []; }).then(function (rows) {
      var body;
      if (!rows.length) {
        body = emptyState("No activity yet", "Comments and updates on your records will appear here.");
      } else {
        body = '<ol class="jd-feed" style="margin-top:14px">' + rows.map(function (c, i) {
          var txt = String(c.content || "").replace(/<[^>]+>/g, " ").trim().slice(0, 140);
          return '<li class="jd-enter" style="--i:' + i + '">' + avatar(c.comment_by || "?", 32) +
            '<div class="txt"><p><b>' + esc((c.comment_by || "").split("@")[0]) + "</b> " + esc(txt) + "</p>" +
            '<span class="ago">' + esc(c.reference_doctype || "") + " · " + esc(c.reference_name || "") + " · " + esc(ago(c.creation)) + "</span></div></li>";
        }).join("") + "</ol>";
      }
      openModal({ title: "Recent Activity", sub: "Live from ERPNext comments.", body: body, focus: false });
    });
  }

  function openCompose() {
    formModal({
      title: "Compose email", sub: "Opens your mail client with everything filled in.", submit: "Open mail client",
      fields: [
        { name: "to", label: "To", type: "email", req: true, ph: "name@company.com" },
        { name: "subject", label: "Subject", req: true, ph: "Following up on our proposal" },
        { name: "body", label: "Message", type: "textarea", ph: "Hi — quick follow-up…" }
      ],
      onSave: function (v, close) {
        close();
        location.href = "mailto:" + encodeURIComponent(v.to) +
          "?subject=" + encodeURIComponent(v.subject) + "&body=" + encodeURIComponent(v.body || "");
        toast("ok", "Opening mail client");
      }
    });
  }

  /* ---------------------------------------------------------- live call bar */
  var callState = null;
  function openCallDialog() {
    list("Contact", { fields: ["name", "first_name", "last_name", "phone", "email_id"], limit_page_length: 20 })
      .catch(function () { return []; }).then(function (contacts) {
        var opts = contacts.map(function (c) {
          var nm = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name;
          return { value: nm, label: nm + (c.phone ? " · " + c.phone : "") };
        });
        if (!opts.length) opts = [{ value: "Unknown contact", label: "Unknown contact" }];
        formModal({
          title: "Log a call", sub: "Starts a live timer — saving writes a completed Call event.",
          submit: "Start call",
          fields: [{ name: "who", label: "Contact", type: "select", options: opts }],
          onSave: function (v, close) { close(); startCall(v.who); }
        });
      });
  }
  function startCall(who) {
    if (callState) { toast("info", "A call is already active"); return; }
    callState = { who: who, t0: Date.now(), muted: false };
    var bar = el('<div class="jd-callbar" role="status">' +
      '<div class="jd-call-who"><span class="jd-call-ring"></span>' + avatar(who, 36, "") + "</div>" +
      '<div class="jd-call-text"><b>' + esc(who) + '</b><small id="jd-call-time">00:00 · Connecting via Cloud Voice</small></div>' +
      '<button class="jd-call-mute" title="Mute">' + icon("mic") + "</button>" +
      '<button class="jd-call-end">' + icon("phone_off") + "End call</button></div>");
    root.appendChild(bar);
    toast("info", "Connecting call with " + who + "…");
    var iv = setInterval(function () {
      if (!callState) { clearInterval(iv); return; }
      var s = Math.floor((Date.now() - callState.t0) / 1000);
      var lbl = bar.querySelector("#jd-call-time");
      if (lbl) lbl.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") +
        " · " + (callState.muted ? "Muted" : "Connected via Cloud Voice");
    }, 1000);
    bar.querySelector(".jd-call-mute").addEventListener("click", function () {
      callState.muted = !callState.muted;
      this.innerHTML = icon(callState.muted ? "mic_off" : "mic");
      toast("info", callState.muted ? "Microphone muted" : "Microphone unmuted");
    });
    bar.querySelector(".jd-call-end").addEventListener("click", function () {
      var secs = Math.floor((Date.now() - callState.t0) / 1000);
      var mmss = Math.floor(secs / 60) + "m " + (secs % 60) + "s";
      var who2 = callState.who;
      callState = null;
      clearInterval(iv);
      bar.remove();
      var now = new Date();
      var start = new Date(now.getTime() - secs * 1000);
      function pad(x) { return String(x).padStart(2, "0"); }
      function dt(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
      insertDoc({
        doctype: "Event", subject: "Call — " + who2,
        event_category: "Call", status: "Completed",
        starts_on: dt(start), ends_on: dt(now)
      }).then(function () {
        toast("ok", "Call ended with " + who2, mmss + " · logged to Schedule");
        refreshHeaderStats();
        if (current === "schedule") CRM.refresh();
      }).catch(function (e) { toast("err", "Could not log the call", (e && e.message) || ""); });
    });
  }

  /* ---------------------------------------------------------- command palette */
  var palCache = null, palCacheAt = 0;
  function openPalette() {
    if (root.querySelector(".jd-cmd")) return;
    var scrim = el('<div class="jd-scrim"></div>');
    var pal = el('<div class="jd-cmd" role="dialog" aria-modal="true">' +
      '<div class="jd-cmd-input">' + icon("search") +
      '<input placeholder="Search customers, deals, pages…" aria-label="Search"><kbd class="jd-kbd">Esc</kbd></div>' +
      '<div class="jd-cmd-list"></div></div>');
    var host = document.getElementById("jd-overlays");
    host.appendChild(scrim); host.appendChild(pal);
    var entry = { node: pal, destroy: function () { scrim.remove(); pal.remove(); } };
    stack.push(entry);
    scrim.addEventListener("click", function () { if (stack[stack.length - 1] === entry) closeTop(); });

    var input = pal.querySelector("input"), listEl = pal.querySelector(".jd-cmd-list");
    var items = [];
    function pageItems() {
      return CRM.nav.map(function (n) {
        return { icon: "arrow_ur", label: "Go to " + n.label, right: "", group: "Pages", act: function () { go(n.key); } };
      });
    }
    function render(q) {
      q = (q || "").toLowerCase();
      var pool = pageItems().concat(items);
      var f = pool.filter(function (it) {
        return !q || (it.label + " " + (it.sub || "")).toLowerCase().indexOf(q) >= 0;
      });
      if (!f.length) { listEl.innerHTML = '<div class="jd-cmd-empty">No matching records or pages found.</div>'; return; }
      var html = "", lastG = null;
      f.slice(0, 24).forEach(function (it, i) {
        if (it.group !== lastG) { html += '<div class="jd-cmd-group">' + esc(it.group) + "</div>"; lastG = it.group; }
        html += '<button class="jd-cmd-item" data-i="' + i + '">' + icon(it.icon || "search") +
          "<span>" + esc(it.label) + (it.sub ? '<span class="muted">' + esc(it.sub) + "</span>" : "") + "</span>" +
          (it.right ? '<span class="right">' + esc(it.right) + "</span>" : "") + "</button>";
      });
      listEl.innerHTML = html;
      listEl.querySelectorAll("[data-i]").forEach(function (b) {
        b.addEventListener("click", function () { closeTop(); f[Number(b.getAttribute("data-i"))].act(); });
      });
    }
    if (!palCache || Date.now() - palCacheAt > 30000) {
      listEl.innerHTML = '<div class="jd-cmd-group">Pages</div>' +
        '<div style="padding:10px">' + skelRows(3, 34) + "</div>";
      Promise.all([
        list("Opportunity", { fields: ["name", "title", "opportunity_amount", "sales_stage", "status"], order_by: "modified desc", limit_page_length: 6 }).catch(function () { return []; }),
        list("Customer", { fields: ["customer_name"], order_by: "modified desc", limit_page_length: 6 }).catch(function () { return []; }),
        list("Lead", { fields: ["name", "lead_name", "status"], order_by: "modified desc", limit_page_length: 6 }).catch(function () { return []; })
      ]).then(function (r) {
        palCache = {
          deals: r[0].map(function (o) {
            return {
              icon: "dollar", group: "Deals", label: o.title || o.name,
              sub: (o.sales_stage || "") + " · " + money(o.opportunity_amount), right: o.status,
              act: function () { pendingRecord = { doctype: "Opportunity", name: o.name }; go("pipeline"); }
            };
          }),
          custs: r[1].map(function (c) {
            return {
              icon: "building", group: "Customers", label: c.customer_name, sub: "Account",
              act: function () { pendingRecord = { doctype: "Customer", name: c.customer_name }; go("customers"); }
            };
          }),
          leads: r[2].map(function (l) {
            return {
              icon: "user_check", group: "Leads", label: l.lead_name || l.name, right: l.status,
              act: function () { pendingRecord = { doctype: "Lead", name: l.name }; go("growth"); }
            };
          })
        };
        palCacheAt = Date.now();
        items = palCache.deals.concat(palCache.custs, palCache.leads);
        render(input.value);
      });
    } else {
      items = palCache.deals.concat(palCache.custs, palCache.leads);
      render("");
    }
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (e) {
      var btns = Array.prototype.slice.call(listEl.querySelectorAll(".jd-cmd-item"));
      var sel = listEl.querySelector(".jd-cmd-item.is-sel");
      var idx = btns.indexOf(sel);
      if (e.key === "ArrowDown") { e.preventDefault(); if (btns[idx + 1]) { btns.forEach(function (b) { b.classList.remove("is-sel"); }); btns[idx + 1].classList.add("is-sel"); btns[idx + 1].scrollIntoView({ block: "nearest" }); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (btns[idx - 1]) { btns.forEach(function (b) { b.classList.remove("is-sel"); }); btns[idx - 1].classList.add("is-sel"); btns[idx - 1].scrollIntoView({ block: "nearest" }); } }
      else if (e.key === "Enter") { e.preventDefault(); var target = sel || btns[0]; if (target) target.click(); }
    });
    render("");
    setTimeout(function () { input.focus(); }, 50);
  }
  CRM.openPalette = openPalette;

  /* ---------------------------------------------------------- router */
  var MAP = [
    { page: "overview", re: /^\/desk\/crm\/sales\/?$/ },
    { page: "overview", re: /^\/desk\/selling\/sales-crm\/?$/ },
    { page: "growth", re: /^\/desk\/crm\/lead\/?$/ },
    { page: "growth", re: /^\/desk\/crm\/campaign\/?$/ },
    { page: "growth", re: /^\/app\/lead(\/view\/[\w-]+)?\/?$/ },
    { page: "growth", re: /^\/app\/campaign(\/view\/[\w-]+)?\/?$/ },
    { page: "pipeline", re: /^\/desk\/crm\/opportunity(\/view\/[\w-]+)?\/?$/ },
    { page: "pipeline", re: /^\/app\/opportunity(\/view\/[\w-]+)?\/?$/ },
    { page: "customers", re: /^\/desk\/crm\/customer(\/view\/[\w-]+)?\/?$/ },
    { page: "customers", re: /^\/desk\/crm\/contact(\/view\/[\w-]+)?\/?$/ },
    { page: "customers", re: /^\/app\/customer(\/view\/[\w-]+)?\/?$/ },
    { page: "customers", re: /^\/app\/contact(\/view\/[\w-]+)?\/?$/ },
    { page: "finance", re: /^\/desk\/crm\/quotation(\/view\/[\w-]+)?\/?$/ },
    { page: "finance", re: /^\/app\/quotation(\/view\/[\w-]+)?\/?$/ },
    { page: "finance", re: /^\/app\/sales-invoice(\/view\/[\w-]+)?\/?$/ },
    { page: "operations", re: /^\/app\/item(\/view\/[\w-]+)?\/?$/ },
    { page: "operations", re: /^\/app\/delivery-note(\/view\/[\w-]+)?\/?$/ },
    { page: "operations", re: /^\/app\/pos-invoice(\/view\/[\w-]+)?\/?$/ },
    { page: "operations", re: /^\/app\/warranty-claim(\/view\/[\w-]+)?\/?$/ },
    { page: "operations", re: /^\/app\/maintenance-visit(\/view\/[\w-]+)?\/?$/ },
    { page: "settings", re: /^\/app\/crm-settings\/?$/ },
    { page: "settings", re: /^\/app\/sms-settings\/?$/ },
    { page: "settings", re: /^\/app\/lead-source\/?$/ },
    { page: "settings", re: /^\/app\/sales-stage\/?$/ },
    { page: "settings", re: /^\/app\/territory\/?$/ }
  ];
  var NATIVE_RE = /^\/(desk\/crm\/|app\/(lead|opportunity|customer|contact|quotation|sales-invoice|item|delivery-note|pos-invoice|warranty-claim|maintenance-visit|campaign|sales-person|lead-source|sales-stage|territory|event|communication|contract|appointment|crm-settings|sms-settings)\b)/;
  function matchPage(path) {
    path = (path || "").split("?")[0].replace(/\/$/, "");
    for (var i = 0; i < MAP.length; i++) if (MAP[i].re.test(path)) return MAP[i].page;
    return null;
  }
  function hashPage() {
    var m = /^#\/crm\/(\w[\w-]*)$/.exec(location.hash || "");
    if (!m) return null;
    for (var i = 0; i < CRM.nav.length; i++) if (CRM.nav[i].key === m[1]) return m[1];
    return null;
  }

  function evaluate() {
    var path = location.pathname;
    var page = matchPage(path);
    var hp = hashPage();
    if (page) {
      var want = hp || page;
      if (!mounted || current !== want) mount(want);
      document.body.classList.remove("jd-crm-native");
    } else {
      if (mounted) unmount();
      if (NATIVE_RE.test(path)) document.body.classList.add("jd-crm-native");
      else document.body.classList.remove("jd-crm-native");
    }
  }
  CRM.evaluate = evaluate;

  function mount(page) {
    var first = !mounted;
    mounted = true;
    root.classList.add("jd-mounted");
    document.body.classList.add("jd-crm-open");
    if (first) refreshHeaderStats();
    render(page);
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    root.classList.remove("jd-mounted");
    document.body.classList.remove("jd-crm-open");
    closeAllOverlays();
    current = null;
  }

  function render(page) {
    var def = CRM.pages[page];
    current = page;
    root.querySelectorAll(".jd-nav-tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-nav") === page);
    });
    root.querySelectorAll(".jd-dock-btn").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-nav") === page);
    });
    CRM.exportRows = function () { toast("info", "Nothing to export on this page"); };
    main.innerHTML = '<div style="display:grid;gap:16px">' + skelRows(6, 90) + "</div>";
    main.classList.remove("page-fade");
    void main.offsetWidth;
    main.classList.add("page-fade");
    if (!def) { main.innerHTML = emptyState("Section coming soon", "This part of the CRM is being built."); return; }
    try { def.render(main); } catch (e) {
      main.innerHTML = emptyState("Something went wrong", String((e && e.message) || e));
    }
  }
  CRM.refresh = function () {
    if (!mounted || !current) { if (!mounted) evaluate(); return; }
    if (refreshing) return;
    refreshing = true;
    refreshHeaderStats();
    var def = CRM.pages[current];
    if (def) { try { def.render(main); } catch (e) {} }
    setTimeout(function () { refreshing = false; }, 150);
  };
  CRM.go = function (key) {
    if (mounted && current === key) { CRM.refresh(); return; }
    if (hashPage() === key) { if (mounted) render(key); return; }
    try { location.hash = "#/crm/" + key; } catch (e) {}
    if (mounted) render(key);
  };
  CRM.setPending = function (rec) { pendingRecord = rec; };
  CRM.takePending = function () { var p = pendingRecord; pendingRecord = null; return p; };

  /* ---------------------------------------------------------- keyboard */
  var gAt = 0;
  function isTyping(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      if (mounted) { e.preventDefault(); openPalette(); }
      return;
    }
    if (!mounted || isTyping(e)) return;
    if (e.key === "Escape") { if (stack.length) { e.preventDefault(); closeTop(); } return; }
    if (e.key === "?" || (e.key === "/" && e.shiftKey)) { e.preventDefault(); openShortcuts(); return; }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); startCreate("deal"); return; }
    if (e.key === "g" || e.key === "G") { gAt = Date.now(); return; }
    if (Date.now() - gAt < 1200) {
      var k = e.key.toLowerCase();
      var seq = { o: "overview", p: "pipeline", c: "customers", s: "schedule", f: "finance", g: "growth", j: "projects" };
      if (seq[k]) { e.preventDefault(); gAt = 0; go(seq[k]); }
    }
  });

  /* ---------------------------------------------------------- boot */
  function boot() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", boot); return; }
    if (document.getElementById("jd-crm")) return;
    try { CRM.bootCur = bootCurrency(); } catch (e) {}
    buildShell();
    var lastKey = "";
    function tick() {
      var key = location.pathname + "|" + location.hash;
      if (key !== lastKey) { lastKey = key; evaluate(); }
    }
    document.addEventListener("click", function () { setTimeout(tick, 0); }, true);
    window.addEventListener("popstate", tick);
    window.addEventListener("hashchange", tick);
    try {
      if (window.frappe && frappe.router && typeof frappe.router.on === "function") {
        frappe.router.on("change", function () { setTimeout(tick, 0); });
      }
    } catch (e) {}
    setInterval(tick, 900);
    tick();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();
