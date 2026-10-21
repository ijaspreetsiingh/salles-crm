/* ============================================================
   Rapport CRM Suite — pages (Overview · Pipeline · Customers ·
   Schedule · Finance · Growth · Projects)
   ============================================================ */
(function () {
  "use strict";
  var CRM = window.JDCRM;
  var el = CRM.el, esc = CRM.esc, icon = CRM.icon, money = CRM.money, moneyK = CRM.moneyK;
  var list = CRM.list, setVal = CRM.setVal, insertDoc = CRM.insertDoc;
  var toast = CRM.toast, pageHeader = CRM.pageHeader, emptyState = CRM.emptyState;
  var avatar = CRM.avatar, fmtDate = CRM.fmtDate, ymd = CRM.ymd, ago = CRM.ago;
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TODAY = new Date();

  var DESCS = {
    overview: "Start here: review what needs attention, then follow the next step for each deal.",
    pipeline: "Track each opportunity from qualification to close. Move a deal when its stage changes.",
    customers: "Find an account, see its relationship context, and open the next follow-up.",
    schedule: "Plan calls, meetings, tasks, and follow-ups in one shared agenda.",
    finance: "Review invoice status and collection progress linked to customer accounts.",
    growth: "See team results, conversion trends, and progress toward sales targets.",
    projects: "Follow customer work after a deal is won and keep handoffs visible."
  };

  /* ---------------------------------------------------- small builders */
  function panel(inner, cls) { return '<section class="jd-glass jd-panel ' + (cls || "") + '">' + inner + "</section>"; }
  function phead(title, actions) {
    return '<div class="jd-panel-head"><h2>' + esc(title) + '</h2><div class="jd-ph-actions">' + (actions || "") + "</div></div>";
  }
  function icoBtn(name, ico, label, cls) {
    return '<button class="jd-icon-btn ' + (cls || "sm") + '" data-p="' + name + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon(ico) + "</button>";
  }
  function openBtn(gotoPage) {
    return '<button class="jd-icon-btn sm" data-goto="' + gotoPage + '" title="Open" aria-label="Open">' + icon("arrow_ur") + "</button>";
  }
  function seg(name, opts, active) {
    return '<div class="jd-segmented" data-seg="' + name + '">' + opts.map(function (o) {
      return '<button data-v="' + esc(o) + '" class="' + (o === active ? "is-active" : "") + '">' + esc(o) + "</button>";
    }).join("") + "</div>";
  }
  function searchField(name, ph, val) {
    return '<label class="jd-search-field">' + icon("search") +
      '<input data-search="' + name + '" placeholder="' + esc(ph || "Search…") + '" value="' + esc(val || "") + '" aria-label="' + esc(ph) + '"></label>';
  }
  function badge(tone, txt) { return '<span class="jd-badge tone-' + tone + '">' + esc(txt) + "</span>"; }
  function statusChip(txt) {
    var t = String(txt || "").toLowerCase();
    var cls = /paid|won|converted|completed|done|ordered/.test(t) ? "st-good" :
      /overdue|lost|cancel/.test(t) ? "st-bad" :
      /draft|open|reply|due|hold/.test(t) ? "st-warn" : "st-mute";
    return '<span class="jd-status ' + cls + '">' + esc(txt || "—") + "</span>";
  }
  function ownerName(o) {
    if (!o) return "Unassigned";
    return String(o).split("@")[0].replace(/[._]/g, " ");
  }
  function isWon(o) { return o.status === "Converted" || o.status === "Closed Won"; }
  function isLost(o) { return o.status === "Lost" || o.status === "Closed Lost"; }
  function isOpen(o) { return !isWon(o) && !isLost(o) && o.status !== "Closed"; }

  /* ---------------------------------------------------- charts */
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p1 = pts[i], p2 = pts[i + 1];
      var p0 = pts[i - 1] || p1, p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += " C" + c1x + "," + c1y + " " + c2x + "," + c2y + " " + p2[0] + "," + p2[1];
    }
    return d;
  }
  var chartSeq = 0;
  function lineChart(container, o) {
    // o: labels[], series[{name,color,values,area?}], fmtAxis, fmtTip, target{v,label}, height
    var W = 900, H = o.height || 210, pad = { l: 46, r: 8, t: 10, b: 24 };
    var labels = o.labels;
    var all = [];
    o.series.forEach(function (s) { all = all.concat(s.values); });
    var maxV = Math.max.apply(null, all.concat([1]));
    if (o.target) maxV = Math.max(maxV, o.target.v);
    var max = o.max || Math.ceil((maxV * 1.12) / 10) * 10;
    var fmtAxis = o.fmtAxis || moneyK;
    var x = function (i) { return pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, labels.length - 1); };
    var y = function (v) { return pad.t + (H - pad.t - pad.b) * (1 - v / max); };
    var gid = "g" + (++chartSeq);

    var ticks = [0, max / 2, max];
    var svg = '<svg viewBox="0 0 ' + W + " " + (H + 18) + '" class="draw-in">';
    svg += "<defs>" + o.series.map(function (s, si) {
      return '<linearGradient id="' + gid + si + '" x1="0" x2="0" y1="0" y2="1">' +
        '<stop offset="0%" stop-color="' + s.color + '" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient>';
    }).join("") + "</defs>";
    ticks.forEach(function (v) {
      svg += '<line x1="' + pad.l + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-dasharray="3 4"/>' +
        '<text x="0" y="' + (y(v) + 4) + '" font-size="11" fill="var(--muted)">' + esc(fmtAxis(v)) + "</text>";
    });
    if (o.target) {
      svg += '<line x1="' + pad.l + '" x2="' + W + '" y1="' + y(o.target.v) + '" y2="' + y(o.target.v) +
        '" stroke="var(--text)" stroke-width="1.8" stroke-dasharray="6 6" stroke-opacity="0.8"/>';
    }
    var pts0;
    o.series.forEach(function (s, si) {
      var pts = s.values.map(function (v, i) { return [x(i), y(v)]; });
      if (si === 0) pts0 = pts;
      var line = smoothPath(pts);
      if (s.area !== false) {
        svg += '<path d="' + line + " L" + pts[pts.length - 1][0] + "," + y(0) + " L" + pts[0][0] + "," + y(0) +
          ' Z" fill="url(#' + gid + si + ')"/>';
      }
      svg += '<path class="jd-line" d="' + line + '" fill="none" stroke="' + s.color +
        '" stroke-width="2.5" stroke-linecap="round" style="animation-delay:' + (si * 0.18 + 0.1) + 's"' +
        (s.dash ? ' stroke-dasharray="6 6"' : "") + "/>";
    });
    var last = pts0[pts0.length - 1];
    svg += '<g class="xh" style="display:none"><line stroke="var(--tomato)" stroke-width="1.5" stroke-dasharray="3 3" stroke-opacity="0.75" y1="' + pad.t + '" y2="' + y(0) + '"/></g>';
    labels.forEach(function (m, i) {
      svg += '<text x="' + x(i) + '" y="' + (H + 14) + '" font-size="11" text-anchor="middle" fill="var(--muted)" font-weight="500">' + esc(m) + "</text>";
    });
    pts0.forEach(function (p, i) {
      svg += '<circle class="hit" cx="' + p[0] + '" cy="' + p[1] + '" r="16" fill="transparent" data-i="' + i + '"/>';
    });
    svg += "</svg>";
    var tip = '<div class="jd-chart-tip" style="display:none"></div>';
    container.classList.add("jd-chart");
    container.innerHTML = svg + tip;

    var tipEl = container.querySelector(".jd-chart-tip");
    var xh = container.querySelector(".xh");
    container.querySelectorAll(".hit").forEach(function (c) {
      c.addEventListener("mouseenter", function () {
        var i = Number(c.getAttribute("data-i"));
        var px = x(i), py = y(o.series[0].values[i]);
        xh.style.display = "";
        xh.querySelector("line").setAttribute("x1", px);
        xh.querySelector("line").setAttribute("x2", px);
        var dots = "";
        tipEl.innerHTML = '<span>' + esc(labels[i]) + "</span>" + o.series.map(function (s) {
          return "<b>" + esc(fmtTipVal(o, s.values[i])) + "</b><span>" + esc(s.name) + "</span>";
        }).join("");
        tipEl.style.display = "";
        tipEl.style.left = (px / W) * 100 + "%";
        tipEl.style.top = py + "px";
      });
    });
    container.addEventListener("mouseleave", function () {
      tipEl.style.display = "none";
      xh.style.display = "none";
    });
    function fmtTipVal(o2, v) { return (o2.fmtTip || fmtAxis)(v); }
  }
  function barChart(container, items, o) {
    o = o || {};
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    var h = o.height || 150;
    container.innerHTML = '<div class="jd-bars" style="height:' + h + 'px">' + items.map(function (it, i) {
      var px = Math.max(6, Math.round((it.v / max) * (h - 26)));
      return '<div class="jd-bar-col" title="' + esc(it.k + ": " + (it.label || it.v)) + '">' +
        '<span class="v">' + esc(it.label != null ? it.label : moneyK(it.v)) + "</span>" +
        '<i class="jd-bar ' + (it.cls || "") + '" style="height:0;transition-delay:' + i * 60 + 'ms" data-h="' + px + '"></i>' +
        '<span class="k">' + esc(it.k) + "</span></div>";
    }).join("") + "</div>";
    requestAnimationFrame(function () {
      container.querySelectorAll(".jd-bar").forEach(function (b) {
        b.style.height = b.getAttribute("data-h") + "px";
      });
    });
  }
  function monthsBack(n) {
    var out = [], d = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
    for (var i = 0; i < n; i++) { out.unshift(MON[d.getMonth()] + (n <= 6 ? "" : " " + String(d.getFullYear()).slice(2))); d.setMonth(d.getMonth() - 1); }
    return out;
  }
  function bucketByMonth(rows, dateField, amountField, n) {
    var out = new Array(n).fill(0);
    rows.forEach(function (r) {
      var dt = new Date(r[dateField] || r.creation);
      if (isNaN(dt)) return;
      var diff = (TODAY.getFullYear() - dt.getFullYear()) * 12 + (TODAY.getMonth() - dt.getMonth());
      if (diff >= 0 && diff < n) out[n - 1 - diff] += Number(r[amountField]) || 0;
    });
    return out;
  }

  /* ---------------------------------------------------- shared deal card */
  function dealTone(o) {
    if (isWon(o)) return "forest";
    if (isLost(o)) return "ink";
    return CRM.stageTone[o.sales_stage] || "sun";
  }
  function dealCard(o, opts) {
    opts = opts || {};
    var tone = dealTone(o);
    var prob = Number(o.probability) || CRM.stageProb[o.sales_stage] || 10;
    var closes = fmtDate(o.expected_closing);
    var favs = CRM.getFavs();
    var starred = favs.indexOf(o.name) >= 0;
    var owner = ownerName(o.opportunity_owner);
    return '<article class="jd-deal-card jd-tone-' + tone + (opts.tall ? " tall" : "") + '" draggable="true" data-opp="' + esc(o.name) + '">' +
      '<div class="jd-deal-top"><span class="jd-deal-closes">Closes ' + esc(closes) + "</span>" +
      '<div class="jd-deal-acts">' +
      '<button data-star="' + esc(o.name) + '" aria-label="Star deal" title="Star">' + icon(starred ? "star_fill" : "star") + "</button>" +
      '<button data-more="' + esc(o.name) + '" aria-label="Deal actions">' + icon("more_h") + "</button>" +
      "</div></div>" +
      '<h3 class="jd-deal-title">' + esc(o.title || o.name) + "</h3>" +
      '<p class="jd-deal-company">' + esc(o.customer_name || o.party_name || "—") + "</p>" +
      '<div class="jd-prob"><div class="jd-prob-row"><span>' + esc(isWon(o) ? "Won" : isLost(o) ? "Lost" : (o.sales_stage || "")) +
      '</span><span>' + prob + '% probability</span></div>' +
      '<div class="jd-prob-track"><div class="jd-prob-fill" style="width:' + prob + '%"></div></div></div>' +
      '<div class="jd-deal-foot"><div><div class="jd-deal-value">' + money(o.opportunity_amount) + "</div>" +
      (opts.showStage ? '<div class="jd-deal-weighted">Weighted: ' + money(Math.round((Number(o.opportunity_amount) || 0) * prob / 100)) + "</div>" : "") +
      "</div>" + avatar(owner, 26) + "</div></article>";
  }

  /* ---------------------------------------------------- shared deal drawer */
  function openDealDrawer(o, afterChange) {
    var people = CRM.loadPeople ? CRM.loadPeople() : Promise.resolve();
    people.then(function () { openDealDrawerInner(o, afterChange); });
  }
  function openDealDrawerInner(o, afterChange) {
    var stageSeq = ["Qualification", "Proposal", "Negotiation", "Closing"];
    var tone = CRM.stageTone[o.sales_stage] || "sun";
    var won = isWon(o);
    var prob = Number(o.probability) || CRM.stageProb[o.sales_stage] || 10;
    var body = el("<div></div>");
    var cur = stageSeq.indexOf(o.sales_stage);
    body.innerHTML =
      '<div class="jd-hero jd-tone-' + (won ? "forest" : tone) + '">' +
      '<div class="jd-hero-top"><span>Closes ' + esc(fmtDate(o.expected_closing)) + "</span>" +
      '<span class="jd-hero-stage"><i style="width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block"></i>' +
      esc(won ? "Won" : isLost(o) ? "Lost" : (o.sales_stage || "Open")) + "</span></div>" +
      '<h2>' + esc(o.title || o.name) + "</h2>" +
      '<p class="sub">' + esc(o.customer_name || o.party_name || "—") + "</p>" +
      '<div class="jd-hero-foot"><span class="jd-hero-amount">' + money(o.opportunity_amount) + "</span>" +
      avatar(ownerName(o.opportunity_owner), 28) + "</div></div>" +
      '<div class="jd-stepper">' + stageSeq.concat(["Won"]).map(function (st, i) {
        var isWonStep = st === "Won";
        var passed = isWonStep ? won : i <= cur;
        var color = isWonStep ? "var(--pine)" : CRM.toneVar[CRM.stageTone[st]];
        var isCur = isWonStep ? won : (!won && !isLost(o) && st === o.sales_stage);
        return '<button data-stage="' + esc(st) + '"><span class="bar ' + (passed ? "passed" : "") +
          '" style="--bar-color:' + color + '"></span><span class="lbl ' + (isCur ? "is-current" : "") + '">' + esc(st) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="jd-fields"><div class="jd-fields-2">' +
      '<div class="jd-field"><label>Amount (' + esc(CRM.bootCur || "INR") + ')</label><input type="number" data-f="opportunity_amount" min="0" value="' +
      (Number(o.opportunity_amount) || 0) + '"></div>' +
      '<div class="jd-field"><label>Expected close</label><input type="date" data-f="expected_closing" value="' + esc((o.expected_closing || "").slice(0, 10)) + '"></div>' +
      "</div>" +
      '<div class="jd-field"><label>Probability (%)</label><input type="number" data-f="probability" min="0" max="100" value="' + prob + '"></div>' +
      '<div class="jd-field"><label>Owner</label><select data-f="opportunity_owner"><option value="">Unassigned</option>' +
      (CRM._people || []).map(function (p) {
        return '<option value="' + esc(p) + '"' + (o.opportunity_owner === p ? " selected" : "") + ">" + esc(ownerName(p)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="jd-field"><label>Notes</label><textarea rows="3" data-note placeholder="Add a note for the team…"></textarea>' +
      '<button class="jd-ghost-btn" data-savenote style="justify-self:start">Save note</button></div>' +
      "</div>" +
      '<div class="jd-drawer-actions">' +
      '<button class="jd-primary-btn" data-won ' + (won ? "disabled style=opacity:.5" : "") + ">" + icon("trophy") + (won ? "Won ✓" : "Mark won") + "</button>" +
      '<button class="jd-ghost-btn" data-lost ' + (isLost(o) ? "disabled style=opacity:.5" : "") + ">Mark lost</button>" +
      '<a class="jd-ghost-btn" href="/app/opportunity/' + esc(o.name) + '">' + icon("external") + "Open in ERPNext</a>" +
      "</div>";

    CRM.openDrawer({
      kicker: "Deal · " + (o.customer_name || o.party_name || o.name),
      body: body,
      onMount: function (d, close) {
        function save(fields, label) {
          setVal("Opportunity", o.name, fields).then(function () {
            toast("ok", label + " saved");
            Object.keys(fields).forEach(function (k) { o[k] = fields[k]; });
            if (afterChange) afterChange(o, fields);
          }).catch(function (e) { toast("err", "Save failed", (e && e.message) || ""); });
        }
        d.addEventListener("change", function (e) {
          var f = e.target.getAttribute && e.target.getAttribute("data-f");
          if (!f) return;
          var v = e.target.value;
          if (e.target.type === "number") v = Number(v) || 0;
          var label = f === "opportunity_amount" ? "Amount" : f === "expected_closing" ? "Close date" :
            f === "probability" ? "Probability" : "Owner";
          if (f === "opportunity_owner" && !v) { toast("info", "Pick an owner"); return; }
          save(toDefine(f, v), label);
        });
        function toDefine(f, v) {
          var payload = {}; payload[f] = v;
          if (f === "sales_stage" && payload.probability == null) payload.probability = CRM.stageProb[v] || 10;
          return payload;
        }
        d.querySelectorAll("[data-stage]").forEach(function (b) {
          b.addEventListener("click", function () {
            var st = b.getAttribute("data-stage");
            if (st === "Won") { markWon(); return; }
            save({ sales_stage: st, probability: CRM.stageProb[st] || 10, status: isOpen(o) || o.status === "Quotation" ? "Open" : o.status }, "Stage → " + st);
            close();
          });
        });
        d.querySelector("[data-won]").addEventListener("click", markWon);
        function markWon() {
          setVal("Opportunity", o.name, { status: "Converted", probability: 100 }).then(function () {
            o.status = "Converted"; o.probability = 100;
            toast("ok", "🎉 " + (o.title || o.name) + " marked Won!", money(o.opportunity_amount) + " revenue closed");
            close();
            if (afterChange) afterChange(o, { status: "Converted" });
            CRM.refreshHeaderStats();
          }).catch(function (e) { toast("err", "Could not update", (e && e.message) || ""); });
        }
        d.querySelector("[data-lost]").addEventListener("click", function () {
          setVal("Opportunity", o.name, { status: "Lost" }).then(function () {
            o.status = "Lost";
            toast("info", "Closed " + (o.title || o.name) + " as lost");
            close();
            if (afterChange) afterChange(o, { status: "Lost" });
          }).catch(function (e) { toast("err", "Could not update", (e && e.message) || ""); });
        });
        d.querySelector("[data-savenote]").addEventListener("click", function () {
          var ta = d.querySelector("[data-note]");
          var txt = (ta.value || "").trim();
          if (!txt) { toast("info", "Write a note first"); return; }
          insertDoc({
            doctype: "Comment", comment_type: "Comment", content: esc(txt),
            reference_doctype: "Opportunity", reference_name: o.name
          }).then(function () { ta.value = ""; toast("ok", "Note added to activity"); })
            .catch(function (e) { toast("err", "Could not save note", (e && e.message) || ""); });
        });
      }
    });
  }

  /* ============================================================
     PAGE: Overview
     ============================================================ */
  var ovRange = "12M";
  CRM.pages.overview = {
    render: function (main) {
      var OPP_FIELDS = ["name", "title", "opportunity_amount", "probability", "sales_stage", "status",
        "expected_closing", "opportunity_owner", "customer_name", "party_name", "creation", "modified"];
      Promise.all([
        list("Opportunity", { fields: OPP_FIELDS, limit_page_length: 500 }).catch(function () { return []; }),
        list("Event", {
          fields: ["name", "subject", "starts_on", "event_category", "status"],
          filters: { status: "Open" }, order_by: "starts_on asc", limit_page_length: 60
        }).catch(function () { return []; }),
        list("To Do", {
          fields: ["name", "description", "date", "priority", "status"],
          filters: [["status", "=", "Open"], ["date", "<=", ymd(new Date(Date.now() + 7 * 864e5))]],
          order_by: "date asc", limit_page_length: 60
        }).catch(function () { return []; }),
        list("Comment", {
          fields: ["content", "comment_by", "creation", "reference_name", "reference_doctype"],
          order_by: "creation desc", limit_page_length: 8
        }).catch(function () { return []; })
      ]).then(function (r) {
        var opps = r[0], events = r[1], todos = r[2], comments = r[3];
        var open = opps.filter(isOpen);
        var wonRows = opps.filter(isWon), lostRows = opps.filter(isLost);

        var t = new Date();
        function inMonth(dt, off) {
          dt = new Date(dt); if (isNaN(dt)) return false;
          var d = new Date(t.getFullYear(), t.getMonth() - (off || 0), 1);
          return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
        }
        var amt = function (x) { return Number(x.opportunity_amount) || 0; };
        var wonMonth = wonRows.filter(function (o) { return inMonth(o.expected_closing || o.creation); }).reduce(function (s, o) { return s + amt(o); }, 0);
        var wonPrev = wonRows.filter(function (o) { return inMonth(o.expected_closing || o.creation, 1); }).reduce(function (s, o) { return s + amt(o); }, 0);
        var openPipe = open.reduce(function (s, o) { return s + amt(o); }, 0);
        var closedN = wonRows.length + lostRows.length;
        var winRate = closedN ? Math.round((wonRows.length / closedN) * 100) : 0;
        var delta = wonPrev ? Math.round(((wonMonth - wonPrev) / wonPrev) * 100) : 0;

        /* revenue series */
        var n = ovRange === "12M" ? 12 : 6;
        var rev = bucketByMonth(wonRows, "expected_closing", "opportunity_amount", n);
        var revTotal = rev.reduce(function (a, b) { return a + b; }, 0);
        var target = Math.round((Math.max.apply(null, rev.concat([1])) * 1.05) / 10) * 10;

        /* stage mix over open deals */
        var stageNames = ["Qualification", "Proposal", "Negotiation", "Closing"];
        var mix = stageNames.map(function (s, i) {
          var rows = open.filter(function (o) { return o.sales_stage === s; });
          return {
            name: s, n: rows.length,
            v: rows.reduce(function (a, o) { return a + amt(o); }, 0),
            cls: ["bg-sun tone-sun", "tone-forest", "tone-ember", "tone-ink"][i],
            tone: CRM.toneVar[CRM.stageTone[s]]
          };
        });
        var mixTotal = mix.reduce(function (s, m) { return s + m.v; }, 0);
        var mixCount = mix.reduce(function (s, m) { return s + m.n; }, 0);

        /* leaderboard: won this month by owner */
        var board = {};
        wonRows.forEach(function (o) {
          if (!inMonth(o.expected_closing || o.creation)) return;
          var k = o.opportunity_owner || "Unassigned";
          board[k] = board[k] || { rep: k, won: 0, deals: 0 };
          board[k].won += amt(o); board[k].deals++;
        });
        var leaders = Object.keys(board).map(function (k) { return board[k]; })
          .sort(function (a, b) { return b.won - a.won; }).slice(0, 5);
        if (!leaders.length) {
          leaders = open.slice(0, 3).map(function (o) {
            return { rep: o.opportunity_owner || "Unassigned", won: 0, deals: 1, open: true };
          });
        }

        /* hot deals: weighted value */
        var hot = open.slice().sort(function (a, b) {
          var wa = amt(a) * ((Number(a.probability) || 10) / 100);
          var wb = amt(b) * ((Number(b.probability) || 10) / 100);
          return wb - wa;
        }).slice(0, 4);

        /* today */
        var tStr = ymd(TODAY);
        var todayEvs = events.filter(function (e) { return (e.starts_on || "").slice(0, 10) === tStr || (e.starts_on || "").slice(0, 10) < tStr; });
        var todayTodos = todos.filter(function (x) { return (x.date || "") <= tStr; }).slice(0, 6);
        var tomorrow = events.filter(function (e) {
          var d = (e.starts_on || "").slice(0, 10);
          return d === ymd(new Date(Date.now() + 864e5));
        }).slice(0, 4);
        var doneN = 0;

        var html =
          pageHeader({
            title: ["Sales", "Overview"], desc: DESCS.overview,
            stats: [
              { icon: "trophy", value: money(wonMonth), raw: wonMonth, fmt: "money", label: "Won this month",
                badge: wonPrev ? badge(delta >= 0 ? "forest" : "ember", (delta >= 0 ? "+" : "") + delta + "% vs last month") : "" },
              { icon: "bars", value: money(openPipe), raw: openPipe, fmt: "money", label: "Open pipeline" },
              { icon: "pie", value: winRate + "%", raw: winRate, fmt: "pct", label: "Win rate, closed deals" }
            ],
            right: '<button class="jd-primary-btn" data-new-deal>' + icon("plus") + "New deal</button>"
          }) +
          '<div class="jd-grid-overview">' +
          '<div class="jd-grid-stack">' +
          panel(
            phead("Revenue",
              seg("range", ["6M", "12M"], ovRange) + icoBtn("rev-more", "more_h", "More") + icoBtn("rev-focus", "arrow_ur", "Focus", "")) +
            '<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:12px">' +
            '<span class="jd-big-num" data-count data-v="' + revTotal + '" data-fmt="money">' + money(revTotal) + "</span>" +
            '<span class="jd-sub-text">won in ' + n + " months · run-rate target <b>" + moneyK(target * n) + "</b></span></div>" +
            '<div class="jd-legend"><span><i></i>Won revenue</span><span><i class="dash"></i>Monthly target · ' + moneyK(target) + "</span></div>" +
            '<div id="jd-rev-chart" style="margin-top:6px"></div>') +
          '<div class="jd-grid-quota">' +
          '<section class="jd-quota"><div class="jd-quota-top"><h2>Team quota</h2>' +
          icoBtn("quota-info", "more_h", "More", "tone-dark") + "</div>" +
          '<div class="jd-ring-wrap"><div class="jd-ring"><svg viewBox="0 0 100 100">' +
          '<circle class="trk" cx="50" cy="50" r="44" fill="none" stroke-width="7"/>' +
          '<circle class="val" cx="50" cy="50" r="44" fill="none" stroke-width="7" stroke-dasharray="276.5" stroke-dashoffset="276.5" data-ring="' + winRate + '"/></svg>' +
          '<div class="jd-ring-center"><span class="pct" data-count data-v="' + winRate + '" data-fmt="pct">' + winRate + '%</span><span class="cap">win rate</span></div></div></div>' +
          '<div class="jd-quota-foot">' +
          '<div><div class="l">Won</div><div class="v">' + moneyK(wonRows.reduce(function (s2, o) { return s2 + amt(o); }, 0)) + "</div></div>" +
          '<div><div class="l">Open</div><div class="v">' + moneyK(openPipe) + "</div></div>" +
          '<div><div class="l">Deals</div><div class="v">' + open.length + "</div></div></div>" +
          '<div class="jd-quota-strip">Weighted forecast <b>' + moneyK(open.reduce(function (s2, o) {
            return s2 + amt(o) * ((Number(o.probability) || 10) / 100);
          }, 0)) + "</b> in play</div></section>" +
          panel(
            phead("Stage mix", icoBtn("mix-focus", "arrow_ur", "Focus", "")) +
            '<div style="display:flex;align-items:baseline;gap:8px"><span class="jd-big-num" style="font-size:30px" data-count data-v="' + mixTotal + '" data-fmt="money">' +
            money(mixTotal) + '</span><span class="jd-sub-text">open across ' + mixCount + " deals</span></div>" +
            '<div class="jd-mix-bar">' + mix.map(function (m) {
              var pct = mixTotal ? Math.max(2, Math.round((m.v / mixTotal) * 100)) : 25;
              return '<i class="' + m.cls + '" style="flex:' + pct + '" title="' + esc(m.name + ": " + pct + "%") + '"></i>';
            }).join("") + "</div>" +
            '<ul class="jd-mix-list">' + mix.map(function (m) {
              var pct = mixTotal ? Math.round((m.v / mixTotal) * 100) : 0;
              return '<li><span class="nm"><i style="background:' + m.tone + '"></i>' + esc(m.name) + "</span>" +
                '<span class="r">' + m.n + '</span><span class="b">' + moneyK(m.v) + '</span><span class="r">' + pct + "%</span></li>";
            }).join("") + "</ul>") +
          "</div>" +
          panel(
            phead("Hot deals", '<span class="jd-ph-sub">by weighted value</span>' +
              icoBtn("hot-add", "plus", "Add deal") + openBtn("pipeline")) +
            '<div class="jd-grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">' +
            (hot.length ? hot.map(function (o) { return dealCard(o, { tall: true, showStage: true }); }).join("") :
              emptyState("No open deals", "Create your first deal to fill the pipeline.",
                '<button class="jd-primary-btn" data-new-deal>' + icon("plus") + "New deal</button>")) +
            "</div>") +
          "</div>" +
          '<div class="jd-grid-3">' +
          panel(
            phead("Team leaderboard", '<span class="jd-ph-sub">Won this month</span>' + openBtn("growth")) +
            '<ol class="jd-rank-list">' + leaders.map(function (l, i) {
              var sub = l.open ? "open deals" : (l.deals + " deals won");
              return '<li class="jd-rank ' + (i === 0 ? "top" : "") + '"><span class="pos">' + (i + 1) + "</span>" +
                avatar(l.rep, 36) + '<div class="who"><div class="nm">' + esc(ownerName(l.rep)) + "</div>" +
                '<div class="sub">' + esc(sub) + "</div></div>" +
                '<span class="amt">' + (l.won ? money(l.won) : "—") + "</span></li>";
            }).join("") + "</ol>") +
          panel(
            phead("Today", '<button class="jd-ghost-btn" data-add-task>' + icon("plus") + "Add</button>") +
            '<div class="jd-progress"><span><b>' + doneN + "</b> of " + (todayTodos.length + todayEvs.length) + ' done</span>' +
            '<div class="track"><div class="fill" style="width:0%"></div></div></div>' +
            '<ul class="jd-list">' +
            todayTodos.map(function (td) {
              return '<li class="jd-task" data-todo="' + esc(td.name) + '"><span class="jd-check">' + icon("check") + "</span>" +
                '<div class="body"><div class="t">' + esc(td.description) + '</div><div class="m">Task · due ' + esc(fmtDate(td.date)) +
                ((td.date || "") < tStr ? " · overdue" : "") + "</div></div>" +
                avatar(ownerName(td.allocated_to), 28) + "</li>";
            }).join("") +
            todayEvs.slice(0, 4).map(function (ev) {
              return '<li class="jd-task" data-goto="schedule" style="cursor:pointer"><span class="jd-check" style="border-radius:50%">' +
                icon("calendar") + '</span><div class="body"><div class="t">' + esc(ev.subject) + '</div><div class="m">' +
                esc(ev.event_category || "Event") + " · " + esc((ev.starts_on || "").slice(11, 16) || "all day") + "</div></div></li>";
            }).join("") +
            "</ul>" +
            (tomorrow.length ? '<div class="jd-coming"><div class="jd-coming-head"><span>Coming up</span>' +
              '<button data-goto="schedule">Open schedule</button></div><ul>' +
              tomorrow.map(function (e2) {
                var d = new Date(e2.starts_on);
                return '<li><span class="jd-day-chip"><span class="d">' + MON[d.getDay()] + '</span><span class="n">' + d.getDate() + "</span></span>" +
                  "<span><b>" + esc(e2.subject) + '</b> <span style="color:var(--muted)">' + esc((e2.starts_on || "").slice(11, 16)) + "</span></span></li>";
              }).join("") + "</ul></div>" : "")) +
          panel(
            phead("Recent activity", icoBtn("act-more", "more_h", "More") + openBtn("customers")) +
            (comments.length ?
              '<ol class="jd-feed">' + comments.slice(0, 6).map(function (c, i) {
                var txt = String(c.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
                return '<li class="jd-enter" style="--i:' + i + '">' + avatar(c.comment_by || "?", 32) +
                  '<div class="txt"><p><b>' + esc(String(c.comment_by || "?").split("@")[0]) + "</b> " + esc(txt) + "</p>" +
                  '<span class="ago">' + esc(c.reference_name || "") + " · " + esc(ago(c.creation)) + "</span></div></li>";
              }).join("") + "</ol>" :
              emptyState("No activity yet", "Comments on your records will show up here.")) +
            '<p class="jd-table-foot">Total open pipeline: ' + money(openPipe) + "</p>") +
          "</div></div>";

        main.innerHTML = html;
        CRM.enhanceCounters(main);
        var ring = main.querySelector("[data-ring]");
        if (ring) requestAnimationFrame(function () {
          ring.style.strokeDashoffset = 276.5 * (1 - Math.max(1, winRate) / 100);
        });
        lineChart(main.querySelector("#jd-rev-chart"), {
          labels: monthsBack(n), height: 220,
          series: [{ name: "Won revenue", color: "var(--tomato)", values: rev }],
          target: target ? { v: target, label: "target" } : null,
          fmtTip: function (v) { return money(v); }
        });

        CRM.exportRows = function () {
          CRM.exportCSV("sales_overview", open.map(function (o) {
            return { deal: o.title || o.name, company: o.customer_name, amount: o.opportunity_amount, stage: o.sales_stage, closes: o.expected_closing };
          }));
        };

        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { ovRange = s.getAttribute("data-v"); CRM.refresh(); return; }
          var card = e.target.closest("[data-opp]");
          if (card) {
            var name = card.getAttribute("data-opp");
            var o = opps.filter(function (x) { return x.name === name; })[0];
            if (o) openDealDrawer(o, function () { CRM.refresh(); });
            return;
          }
          var star = e.target.closest("[data-star]");
          if (star) {
            e.stopPropagation();
            var on = CRM.toggleFav(star.getAttribute("data-star"));
            star.innerHTML = icon(on ? "star_fill" : "star");
            toast("ok", on ? "Starred deal" : "Unstarred deal");
            return;
          }
          var task = e.target.closest("[data-todo]");
          if (task) {
            setVal("To Do", task.getAttribute("data-todo"), { status: "Completed" }).then(function () {
              task.classList.add("is-done");
              toast("ok", "Completed"); CRM.refreshHeaderStats();
              var pr = main.querySelector(".jd-progress .fill");
              doneN++;
              var total = todayTodos.length + todayEvs.length;
              if (pr) pr.style.width = Math.round((doneN / Math.max(1, total)) * 100) + "%";
              var lbl = main.querySelector(".jd-progress b");
              if (lbl) lbl.textContent = doneN;
              if (doneN >= total) toast("ok", "🎉 All priorities complete!");
            }).catch(function (e2) { toast("err", "Update failed", (e2 && e2.message) || ""); });
            return;
          }
          var p = e.target.closest("[data-p]");
          if (p) {
            var act = p.getAttribute("data-p");
            if (act === "rev-focus") focusModal("Revenue Analytics", main.querySelector("#jd-rev-chart").outerHTML, rev, n, target);
            else if (act === "mix-focus" || act === "quota-info") focusMix(mix, mixTotal, mixCount);
            else if (act === "hot-add") CRM.startCreate("deal");
            else if (act === "act-more") document.querySelector('[data-act="activity"]').click();
            else if (act === "rev-more") toast("info", "Revenue options", "Export from the dock, focus for detail");
            return;
          }
          if (e.target.closest("[data-new-deal]")) { CRM.startCreate("deal"); return; }
          if (e.target.closest("[data-add-task]")) { CRM.startCreate("task"); return; }
        });

        function focusModal(title, chartHtml, rev2, n2, target2) {
          CRM.openModal({
            title: title, sub: money(rev2.reduce(function (a, b) { return a + b; }, 0)) + " won in " + n2 + " months",
            body: '<div id="jd-focus-chart" style="margin-top:8px"></div>', focus: false,
            onMount: function (m) {
              lineChart(m.querySelector("#jd-focus-chart"), {
                labels: monthsBack(n2), height: 230,
                series: [{ name: "Won revenue", color: "var(--tomato)", values: rev2 }],
                target: target2 ? { v: target2 } : null,
                fmtTip: function (v) { return money(v); }
              });
            }
          });
        }
        function focusMix(mix2, mixTotal2, mixCount2) {
          CRM.openModal({
            title: "Stage Mix Breakdown", sub: mixCount2 + " open deals across 4 stages",
            body: '<div class="jd-mix-bar" style="margin-top:14px">' + mix2.map(function (m) {
              var pct = mixTotal2 ? Math.max(2, Math.round((m.v / mixTotal2) * 100)) : 25;
              return '<i class="' + m.cls + '" style="flex:' + pct + '"></i>';
            }).join("") + "</div><ul class='jd-mix-list'>" + mix2.map(function (m) {
              var pct = mixTotal2 ? Math.round((m.v / mixTotal2) * 100) : 0;
              return '<li><span class="nm"><i style="background:' + m.tone + '"></i>' + esc(m.name) + "</span>" +
                '<span class="r">' + m.n + ' deals</span><span class="b">' + moneyK(m.v) + '</span><span class="r">' + pct + "%</span></li>";
            }).join("") + "</ul>"
          });
        }

        var pend = CRM.takePending();
        if (pend && pend.doctype === "Opportunity") {
          var target2 = opps.filter(function (x) { return x.name === pend.name; })[0];
          if (target2) openDealDrawer(target2, function () { CRM.refresh(); });
        }
      });
    }
  };

  /* ============================================================
     PAGE: Pipeline
     ============================================================ */
  var pipeState = { q: "", owner: "", view: "Board" };
  var STAGE_ORDER = ["Qualification", "Proposal", "Negotiation", "Closing"];
  CRM.pages.pipeline = {
    render: function (main) {
      var OPPF = ["name", "title", "opportunity_amount", "probability", "sales_stage", "status",
        "expected_closing", "opportunity_owner", "customer_name", "party_name"];
      Promise.all([
        list("Opportunity", { fields: OPPF, limit_page_length: 500 }).catch(function () { return []; }),
        CRM.stageOptions()
      ]).then(function (r) {
        var opps = r[0];
        var stages = r[1].filter(function (s) { return STAGE_ORDER.indexOf(s) >= 0; });
        STAGE_ORDER.forEach(function (s) { if (stages.indexOf(s) < 0) stages.push(s); });
        r[1].forEach(function (s) { if (stages.indexOf(s) < 0) stages.push(s); });

        var owners = [];
        opps.forEach(function (o) { if (o.opportunity_owner && owners.indexOf(o.opportunity_owner) < 0) owners.push(o.opportunity_owner); });
        if (CRM._people && CRM._people.length) owners = CRM._people.slice(0, 6);

        function visible() {
          return opps.filter(function (o) {
            if (!isOpen(o)) return false;
            var q = pipeState.q.toLowerCase();
            if (q && ((o.title || "") + " " + (o.customer_name || "") + " " + o.name).toLowerCase().indexOf(q) < 0) return false;
            if (pipeState.owner && o.opportunity_owner !== pipeState.owner) return false;
            return true;
          });
        }
        function totals() {
          var vis = visible();
          var total = vis.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0);
          var weighted = vis.reduce(function (s, o) {
            return s + (Number(o.opportunity_amount) || 0) * ((Number(o.probability) || 10) / 100);
          }, 0);
          var closeMonth = vis.filter(function (o) {
            var d = new Date(o.expected_closing);
            return !isNaN(d) && d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear();
          });
          return { total: total, weighted: weighted, closeN: closeMonth.length, closeSum: closeMonth.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0) };
        }
        function wonLost() {
          var won = opps.filter(isWon), lost = opps.filter(isLost);
          var wonM = won.filter(function (o) {
            var d = new Date(o.expected_closing || o.creation);
            return !isNaN(d) && d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear();
          });
          return {
            wonN: wonM.length, wonSum: wonM.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0),
            lostN: lost.length
          };
        }

        function paint() {
          var tt = totals(), wl = wonLost();
          main.innerHTML =
            pageHeader({
              title: ["Deal", "Pipeline"], desc: DESCS.pipeline,
              stats: [
                { icon: "trophy", value: money(tt.total), raw: tt.total, fmt: "money", label: "Open pipeline" },
                { icon: "trending", value: money(tt.weighted), raw: tt.weighted, fmt: "money", label: "Weighted forecast" },
                { icon: "calendar", value: String(tt.closeN), label: "Deals closing this month", badge: badge("sun", moneyK(tt.closeSum)) }
              ]
            }) +
            '<div class="jd-toolbar">' + searchField("pipe", "Search deals…", pipeState.q) +
            owners.map(function (o) {
              return '<button class="jd-chip ' + (pipeState.owner === o ? "is-active" : "") + '" data-owner="' + esc(o) + '">' +
                avatar(ownerName(o), 21) + esc(ownerName(o).split(" ")[0]) + "</button>";
            }).join("") +
            '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
            seg("view", ["Board", "List"], pipeState.view) +
            icoBtn("pipe-export", "download", "Export CSV", "") +
            '<button class="jd-primary-btn" data-new-deal>' + icon("plus") + "New deal</button></div></div>" +
            (pipeState.view === "Board" ? boardHTML() : listHTML());

          CRM.enhanceCounters(main);
          wire();
          var pend = CRM.takePending();
          if (pend && pend.doctype === "Opportunity") {
            var o0 = opps.filter(function (x) { return x.name === pend.name; })[0];
            if (o0) openDealDrawer(o0, function () { CRM.refresh(); });
          }
        }

        function boardHTML() {
          var vis = visible();
          var cols = stages.map(function (st) {
            var rows = vis.filter(function (o) { return o.sales_stage === st; });
            var sum = rows.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0);
            var tone = CRM.stageTone[st] || "sun";
            var extraCls = stages.indexOf(st) >= 4 ? " jd-col-extra" : "";
            return '<section class="jd-col' + extraCls + '" data-col="' + esc(st) + '">' +
              '<div class="jd-col-head"><i class="jd-col-dot" style="background:' + CRM.toneVar[tone] + '"></i>' +
              "<h2>" + esc(st) + '</h2><span class="jd-col-count">' + rows.length + "</span>" +
              '<span class="jd-col-sum">' + moneyK(sum) + "</span>" +
              '<button class="jd-col-add" data-add-stage="' + esc(st) + '" title="Add ' + esc(st) + ' deal">' + icon("plus") + "</button></div>" +
              '<div class="jd-col-cards">' + rows.map(function (o) { return dealCard(o, {}); }).join("") + "</div>" +
              (rows.length ? "" : '<div class="jd-col-empty">No deals<br><span style="font-size:10px">Drop one here</span></div>') +
              "</section>";
          }).join("");
          var wl = wonLost();
          var outcomes = '<div class="jd-outcome-cols">' +
            '<section class="jd-outcome won" data-outcome="won"><span class="jd-outcome-icon">' + icon("trophy") + "</span>" +
            "<h2>Won</h2><p>" + wl.wonN + " this month</p><p class='big'>" + moneyK(wl.wonSum) + "</p>" +
            '<span class="hint">Drop to mark won</span></section>' +
            '<section class="jd-outcome lost" data-outcome="lost"><span class="jd-outcome-icon">' + icon("x") + "</span>" +
            "<h2>Lost</h2><p>" + wl.lostN + " closed lost</p>" +
            '<span class="hint">Drop to close lost</span></section></div>';
          return '<div class="jd-board-scroll jd-scroll-thin"><div class="jd-board">' + cols + outcomes + "</div></div>";
        }

        function listHTML() {
          var vis = visible();
          var sum = vis.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0);
          return '<div class="jd-glass jd-panel jd-enter"><div class="jd-table-wrap"><table class="jd-table"><thead><tr>' +
            ["Deal", "Company", "Value", "Stage", "Owner", "Closes"].map(function (h, i) {
              return "<th" + (h === "Value" ? ' class="cell-num"' : "") + ">" + h + "</th>";
            }).join("") + "</tr></thead><tbody>" +
            vis.map(function (o) {
              return '<tr class="is-clickable" data-opp="' + esc(o.name) + '">' +
                '<td class="cell-main">' + esc(o.title || o.name) + "</td>" +
                '<td class="cell-muted">' + esc(o.customer_name || "—") + "</td>" +
                '<td class="cell-num">' + money(o.opportunity_amount) + "</td>" +
                "<td><span class='jd-status st-mute'>" + esc(o.sales_stage || "—") + "</span></td>" +
                '<td class="cell-muted">' + esc(ownerName(o.opportunity_owner)) + "</td>" +
                '<td class="cell-muted">' + esc(fmtDate(o.expected_closing)) + "</td></tr>";
            }).join("") + "</tbody></table></div>" +
            (vis.length ? "" : emptyState("No matching records", "Try a different search or owner.")) +
            '<p class="jd-table-foot">' + vis.length + " deals · " + money(sum) + "</p></div>";
        }

        function wire() {
          var inp = main.querySelector("[data-search]");
          if (inp) {
            inp.addEventListener("input", function () {
              pipeState.q = inp.value;
              var pos = inp.selectionStart;
              paint();
              var ni = main.querySelector("[data-search]");
              if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
            });
          }
          main.addEventListener("click", onClick);
          main.querySelectorAll("[data-col]").forEach(function (col) {
            col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("is-dragover"); });
            col.addEventListener("dragleave", function () { col.classList.remove("is-dragover"); });
            col.addEventListener("drop", function (e) {
              e.preventDefault(); col.classList.remove("is-dragover");
              var name = e.dataTransfer.getData("text/plain");
              var st = col.getAttribute("data-col");
              move(name, { sales_stage: st, probability: CRM.stageProb[st] || 10, status: "Open" }, "Moved to " + st);
            });
          });
          main.querySelectorAll("[data-outcome]").forEach(function (col) {
            col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("is-dragover"); });
            col.addEventListener("dragleave", function () { col.classList.remove("is-dragover"); });
            col.addEventListener("drop", function (e) {
              e.preventDefault(); col.classList.remove("is-dragover");
              var name = e.dataTransfer.getData("text/plain");
              var kind = col.getAttribute("data-outcome");
              if (kind === "won") move(name, { status: "Converted", probability: 100 }, "won");
              else move(name, { status: "Lost" }, "lost");
            });
          });
          main.querySelectorAll("[data-opp]").forEach(function (card) {
            card.addEventListener("dragstart", function (e) {
              e.dataTransfer.setData("text/plain", card.getAttribute("data-opp"));
              card.classList.add("jd-dragging");
            });
            card.addEventListener("dragend", function () { card.classList.remove("jd-dragging"); });
          });
        }
        function move(name, fields, label) {
          var o = opps.filter(function (x) { return x.name === name; })[0];
          if (!o) return;
          var before = {};
          Object.keys(fields).forEach(function (k) { before[k] = o[k]; });
          Object.keys(fields).forEach(function (k) { o[k] = fields[k]; });
          setVal("Opportunity", name, fields).then(function () {
            if (label === "won") {
              toast("ok", "🎉 " + (o.title || name) + " WON!", money(o.opportunity_amount) + " revenue closed");
              CRM.refreshHeaderStats();
            } else if (label === "lost") toast("info", "Closed " + (o.title || name) + " as lost");
            else toast("ok", (o.title || name) + " → " + label);
            paint();
          }).catch(function (e) {
            Object.keys(before).forEach(function (k) { o[k] = before[k]; });
            toast("err", "Move failed", (e && e.message) || "");
            paint();
          });
        }
        function onClick(e) {
          var ownerBtn = e.target.closest("[data-owner]");
          if (ownerBtn) {
            var ow = ownerBtn.getAttribute("data-owner");
            pipeState.owner = pipeState.owner === ow ? "" : ow;
            paint(); return;
          }
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { pipeState.view = s.getAttribute("data-v"); paint(); return; }
          if (e.target.closest("[data-new-deal]")) { CRM.startCreate("deal"); return; }
          var addSt = e.target.closest("[data-add-stage]");
          if (addSt) { CRM.startCreate("deal", { sales_stage: addSt.getAttribute("data-add-stage") }); return; }
          if (e.target.closest('[data-p="pipe-export"]')) {
            CRM.exportCSV("deals", visible().map(function (o) {
              return { deal: o.title || o.name, company: o.customer_name, value: o.opportunity_amount, stage: o.sales_stage, closes: o.expected_closing, owner: o.opportunity_owner };
            }));
            return;
          }
          var star = e.target.closest("[data-star]");
          if (star) {
            e.stopPropagation();
            var on = CRM.toggleFav(star.getAttribute("data-star"));
            star.innerHTML = icon(on ? "star_fill" : "star");
            toast("ok", on ? "Starred deal" : "Unstarred deal");
            return;
          }
          var more = e.target.closest("[data-more]");
          if (more) {
            e.stopPropagation();
            var om = opps.filter(function (x) { return x.name === more.getAttribute("data-more"); })[0];
            if (om) openDealDrawer(om, function () { paint(); });
            return;
          }
          var card = e.target.closest("[data-opp]");
          if (card) {
            var o = opps.filter(function (x) { return x.name === card.getAttribute("data-opp"); })[0];
            if (o) openDealDrawer(o, function () { paint(); });
          }
        }
        CRM.exportRows = function () { CRM.exportCSV("deals", visible().map(function (o) {
          return { deal: o.title || o.name, value: o.opportunity_amount, stage: o.sales_stage };
        })); };
        paint();
      });
    }
  };

  /* ============================================================
     PAGE: Customers
     ============================================================ */
  var csState = { q: "", seg: "", view: "Grid" };
  CRM.pages.customers = {
    render: function (main) {
      Promise.all([
        list("Customer", { fields: ["name", "customer_name", "customer_group", "territory"], limit_page_length: 200 }).catch(function () { return []; }),
        list("Opportunity", { fields: ["name", "title", "opportunity_amount", "status", "sales_stage", "probability", "customer_name", "party_name", "expected_closing", "opportunity_owner"], limit_page_length: 500 }).catch(function () { return []; }),
        list("Quotation", { fields: ["name", "party_name", "customer_name", "grand_total", "status", "valid_till", "transaction_date"], limit_page_length: 200 }).catch(function () { return []; }),
        list("Sales Invoice", { fields: ["name", "customer", "party_name", "grand_total", "outstanding_amount", "due_date", "posting_date", "status"], limit_page_length: 200 }).catch(function () { return []; }),
        list("Contact", { fields: ["name", "first_name", "last_name", "email_id", "phone", "company_name"], limit_page_length: 300 }).catch(function () { return []; })
      ]).then(function (r) {
        var custs = r[0], opps = r[1], quotes = r[2], invs = r[3], contacts = r[4];
        var segs = [];
        custs.forEach(function (c) { if (c.customer_group && segs.indexOf(c.customer_group) < 0) segs.push(c.customer_group); });

        function openOf(name) { return opps.filter(function (o) { return isOpen(o) && (o.customer_name === name || o.party_name === name); }); }
        function pipeOf(name) { return openOf(name).reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0); }
        function quotesOf(name) { return quotes.filter(function (q) { return q.party_name === name || q.customer_name === name; }); }
        function invOf(name) { return invs.filter(function (i) { return i.customer === name || i.party_name === name; }); }
        function contactsOf(name) {
          var linked = contacts.filter(function (c) { return c.company_name === name; });
          return linked;
        }
        function visible() {
          var q = csState.q.toLowerCase();
          return custs.filter(function (c) {
            if (q && (c.customer_name + " " + c.territory + " " + c.customer_group).toLowerCase().indexOf(q) < 0) return false;
            if (csState.seg && c.customer_name && c.customer_group !== csState.seg) return false;
            return true;
          });
        }
        var openPipeAll = opps.filter(isOpen).reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0);
        var openQuotes = quotes.filter(function (q2) { return /open|replied|draft/i.test(q2.status || ""); });

        function paint() {
          var vis = visible();
          main.innerHTML =
            pageHeader({
              title: ["Customer", "Directory"], desc: DESCS.customers,
              stats: [
                { icon: "building", value: String(custs.length), label: "Accounts on file" },
                { icon: "dollar", value: money(openPipeAll), raw: openPipeAll, fmt: "money", label: "Open pipeline across accounts" },
                { icon: "file", value: String(openQuotes.length), label: "Quotes awaiting reply" }
              ],
              right: '<button class="jd-primary-btn" data-new-cust>' + icon("plus") + "New customer</button>"
            }) +
            '<div class="jd-toolbar">' + searchField("cust", "Search accounts…", csState.q) +
            '<label class="jd-select-pill"><select data-seg-filter aria-label="Segment">' +
            '<option value="">All segments</option>' + segs.map(function (s) {
              return '<option value="' + esc(s) + '"' + (csState.seg === s ? " selected" : "") + ">" + esc(s) + "</option>";
            }).join("") + "</select></label>" +
            '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
            seg("cview", ["Grid", "Table"], csState.view) +
            icoBtn("cust-export", "download", "Export CSV", "") + "</div></div>" +
            (csState.view === "Grid" ?
              (vis.length ? '<div class="jd-grid-cards">' + vis.map(function (c, i) {
                var pipe = pipeOf(c.customer_name), qs = quotesOf(c.customer_name).length;
                return '<article class="jd-cust-card jd-enter" style="--i:' + i + '" data-cust="' + esc(c.customer_name) + '">' +
                  '<div class="jd-cust-top">' + avatar(c.customer_name, 42) +
                  '<div><div class="nm">' + esc(c.customer_name) + "</div><div class='rl'>" + esc(c.customer_group || "—") + "</div></div></div>" +
                  '<div class="jd-cust-meta"><div><div class="k">Open pipeline</div><div class="v">' + moneyK(pipe) + "</div></div>" +
                  "<div><div class='k'>Quotes</div><div class='v'>" + qs + "</div></div></div>" +
                  '<div class="jd-cust-foot"><span class="jd-status st-mute">' + esc(c.territory || "—") + "</span>" +
                  '<span style="color:var(--faint)">' + icon("arrow_ur") + "</span></div></article>";
              }).join("") + "</div>" :
                emptyState("No matching records", "Adjust the search or add a new account.",
                  '<button class="jd-primary-btn" data-new-cust>' + icon("plus") + "New customer</button>")) :
              '<div class="jd-glass jd-panel"><div class="jd-table-wrap"><table class="jd-table"><thead><tr>' +
              "<th>Account</th><th>Segment</th><th>Territory</th><th class='cell-num'>Pipeline</th><th class='cell-num'>Quotes</th><th class='cell-num'>Outstanding</th>" +
              "</tr></thead><tbody>" + vis.map(function (c) {
                var out = invOf(c.customer_name).reduce(function (s, i) { return s + (Number(i.outstanding_amount) || 0); }, 0);
                return '<tr class="is-clickable" data-cust="' + esc(c.customer_name) + '">' +
                  '<td class="cell-main">' + esc(c.customer_name) + "</td>" +
                  '<td class="cell-muted">' + esc(c.customer_group || "—") + "</td>" +
                  '<td class="cell-muted">' + esc(c.territory || "—") + "</td>" +
                  '<td class="cell-num">' + money(pipeOf(c.customer_name)) + "</td>" +
                  '<td class="cell-num">' + quotesOf(c.customer_name).length + "</td>" +
                  '<td class="cell-num">' + money(out) + "</td></tr>";
              }).join("") + "</tbody></table></div>" +
              (vis.length ? "" : emptyState("No matching records", "Try a different search.")) +
              '<p class="jd-table-foot">' + vis.length + " accounts</p></div>");
          CRM.enhanceCounters(main);
        }

        function openCust(name) {
          var c = custs.filter(function (x) { return x.customer_name === name; })[0];
          if (!c) return;
          var ds = openOf(name), qs = quotesOf(name).slice(0, 6), ivs = invOf(name).slice(0, 6);
          var cs = contactsOf(name).slice(0, 5);
          var out = invOf(name).reduce(function (s, i) { return s + (Number(i.outstanding_amount) || 0); }, 0);
          function rows(title, items, renderRow, emptyHint) {
            return '<div class="jd-field" style="gap:8px;margin-top:16px"><label>' + esc(title) + " · " + items.length + "</label>" +
              (items.length ? '<div class="jd-gap-list">' + items.map(renderRow).join("") + "</div>" :
                '<div style="font-size:12px;color:var(--faint)">' + esc(emptyHint) + "</div>") + "</div>";
          }
          var body = el("<div></div>");
          body.innerHTML =
            '<div class="jd-hero tone-ink" style="display:flex;gap:14px;align-items:center">' +
            avatar(c.customer_name, 48) +
            '<div style="min-width:0"><h2 style="font-size:20px;margin:0">' + esc(c.customer_name) + "</h2>" +
            '<p class="sub">' + esc(c.customer_group || "Account") + " · " + esc(c.territory || "—") + "</p></div>" +
            '<div style="margin-left:auto;text-align:right"><div class="jd-hero-amount" style="font-size:22px">' + moneyK(pipeOf(name)) +
            '</div><div style="font-size:11px;opacity:.75">open pipeline</div></div></div>' +
            '<div class="jd-fields-2" style="margin-top:14px">' +
            '<div class="jd-fin-tile" style="min-width:0"><div class="k">Outstanding</div><div class="v" style="font-size:17px">' + money(out) + "</div></div>" +
            '<div class="jd-fin-tile" style="min-width:0"><div class="k">Open deals</div><div class="v" style="font-size:17px">' + ds.length + "</div></div></div>" +
            rows("Contacts", cs, function (ct) {
              var nm = [ct.first_name, ct.last_name].filter(Boolean).join(" ") || ct.name;
              return '<div class="jd-link-row"><span><b>' + esc(nm) + "</b><div class='m'>" + esc(ct.email_id || ct.phone || "") + "</div></span>" +
                (ct.phone ? '<a class="jd-ghost-btn" href="tel:' + esc(ct.phone) + '" style="height:28px">Call</a>' : "") + "</div>";
            }, "No contacts linked — add one in ERPNext.") +
            rows("Open deals", ds, function (o) {
              return '<div class="jd-link-row" data-opp="' + esc(o.name) + '"><span><b>' + esc(o.title || o.name) + "</b>" +
                "<div class='m'>" + esc(o.sales_stage || "") + " · " + money(o.opportunity_amount) + "</div></span>" +
                '<span class="jd-status st-warn">' + esc(o.status || "Open") + "</span></div>";
            }, "No open deals.") +
            rows("Quotes", qs, function (q) {
              return '<div class="jd-link-row" data-quote="' + esc(q.name) + '"><span><b>' + esc(q.name) + "</b>" +
                "<div class='m'>" + money(q.grand_total) + " · valid till " + esc(fmtDate(q.valid_till)) + "</div></span>" +
                statusChip(q.status) + "</div>";
            }, "No quotations yet.") +
            rows("Invoices", ivs, function (i2) {
              return '<div class="jd-link-row" data-inv="' + esc(i2.name) + '"><span><b>' + esc(i2.name) + "</b>" +
                "<div class='m'>" + money(i2.grand_total) + " · due " + esc(fmtDate(i2.due_date)) + "</div></span>" +
                statusChip(i2.status) + "</div>";
            }, "No invoices yet.") +
            '<div class="jd-drawer-actions"><a class="jd-ghost-btn" href="/app/customer/' + encodeURIComponent(name).replace(/%20/g, "+") + '">' +
            icon("external") + "Open in ERPNext</a>" +
            '<button class="jd-primary-btn" data-new-deal-cust>' + icon("plus") + "New deal</button></div>";

          CRM.openDrawer({
            kicker: "Account · " + (c.customer_group || "Customer"),
            body: body,
            onMount: function (d, close) {
              d.addEventListener("click", function (e) {
                var ob = e.target.closest("[data-opp]");
                if (ob) {
                  var oo = opps.filter(function (x) { return x.name === ob.getAttribute("data-opp"); })[0];
                  if (oo) { close(); setTimeout(function () { openDealDrawer(oo, function () { CRM.refresh(); }); }, 120); }
                  return;
                }
                var qb = e.target.closest("[data-quote]");
                if (qb) { close(); openDocDrawer("Quotation", qb.getAttribute("data-quote")); return; }
                var ib = e.target.closest("[data-inv]");
                if (ib) { close(); openDocDrawer("Sales Invoice", ib.getAttribute("data-inv")); return; }
                if (e.target.closest("[data-new-deal-cust]")) { close(); setTimeout(function () { CRM.startCreate("deal", { customer_name: name }); }, 120); }
              });
            }
          });
        }
        function openDocDrawer(dt, name) {
          var row = (dt === "Quotation" ? quotes : invs).filter(function (x) { return x.name === name; })[0] || {};
          var body = el("<div></div>");
          var isInv = dt === "Sales Invoice";
          body.innerHTML =
            '<div class="jd-hero tone-ink"><div class="jd-hero-top"><span>' + esc(isInv ? "Invoice" : "Quotation") + "</span>" +
            '<span class="jd-hero-stage">' + esc(row.status || "") + "</span></div>" +
            "<h2>" + esc(name) + '</h2><p class="sub">' + esc(row.customer || row.party_name || "") + "</p>" +
            '<div class="jd-hero-foot"><span class="jd-hero-amount">' + money(row.grand_total) + "</span></div></div>" +
            '<div class="jd-fields-2" style="margin-top:14px">' +
            '<div class="jd-field"><label>' + (isInv ? "Outstanding" : "Valid till") + "</label><input readonly value='" +
            esc(isInv ? money(row.outstanding_amount) : fmtDate(row.valid_till, true)) + "'></div>" +
            '<div class="jd-field"><label>' + (isInv ? "Due date" : "Dated") + "</label><input readonly value='" +
            esc(fmtDate(isInv ? row.due_date : row.transaction_date, true)) + "'></div></div>" +
            '<div class="jd-drawer-actions"><a class="jd-ghost-btn" href="/app/' + (isInv ? "sales-invoice" : "quotation") + "/" +
            encodeURIComponent(name) + '">' + icon("external") + "Open in ERPNext</a></div>";
          CRM.openDrawer({ kicker: dt + " · " + name, body: body });
        }

        paint();
        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { csState.view = s.getAttribute("data-v"); paint(); return; }
          if (e.target.closest("[data-new-cust]")) { CRM.startCreate("customer"); return; }
          if (e.target.closest('[data-p="cust-export"]')) {
            CRM.exportCSV("customers", visible().map(function (c) {
              return { account: c.customer_name, segment: c.customer_group, territory: c.territory, pipeline: pipeOf(c.customer_name) };
            }));
            return;
          }
          var card = e.target.closest("[data-cust]");
          if (card) openCust(card.getAttribute("data-cust"));
        });
        var sf = main.querySelector("[data-search]");
        sf.addEventListener("input", function () {
          csState.q = sf.value;
          var pos = sf.selectionStart; paint();
          var ni = main.querySelector("[data-search]");
          if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        var sg = main.querySelector("[data-seg-filter]");
        if (sg) sg.addEventListener("change", function () { csState.seg = sg.value; paint(); });

        CRM.exportRows = function () { CRM.exportCSV("customers", visible().map(function (c) {
          return { account: c.customer_name, segment: c.customer_group, pipeline: pipeOf(c.customer_name) };
        })); };

        var pend = CRM.takePending();
        if (pend && pend.doctype === "Customer") openCust(pend.name);
      });
    }
  };

  /* ============================================================
     PAGE: Schedule
     ============================================================ */
  var schState = { view: "Month", y: TODAY.getFullYear(), m: TODAY.getMonth(), kinds: [] };
  var KINDS = ["Call", "Meeting", "Task", "Email"];
  function evKindClass(cat) {
    var s = String(cat || "").toLowerCase();
    if (s.indexOf("call") >= 0) return "Call";
    if (s.indexOf("meet") >= 0 || s.indexOf("event") >= 0) return "Meeting";
    if (s.indexOf("mail") >= 0) return "Email";
    return "Task";
  }
  CRM.pages.schedule = {
    render: function (main) {
      Promise.all([
        list("Event", {
          fields: ["name", "subject", "starts_on", "ends_on", "event_category", "status", "owner"],
          order_by: "starts_on asc", limit_page_length: 400
        }).catch(function () { return []; }),
        list("To Do", {
          fields: ["name", "description", "date", "priority", "status", "allocated_to"],
          filters: [["status", "=", "Open"]], order_by: "date asc", limit_page_length: 300
        }).catch(function () { return []; })
      ]).then(function (r) {
        var events = r[0], todos = r[1];
        var tStr = ymd(TODAY);
        function evPass(e) {
          if (!schState.kinds.length) return true;
          return schState.kinds.indexOf(evKindClass(e.event_category)) >= 0;
        }
        function tdPass(td) { return !schState.kinds.length || schState.kinds.indexOf("Task") >= 0; }
        function dayItems(ds) {
          var evs = events.filter(function (e) { return (e.starts_on || "").slice(0, 10) === ds && evPass(e); });
          var tds = todos.filter(function (td) { return td.date === ds && tdPass(td); });
          return { evs: evs, tds: tds };
        }
        var overdueEvs = events.filter(function (e) { return e.status === "Open" && (e.starts_on || "") < new Date().toISOString().slice(0, 19).replace("T", " "); });
        var overdueTds = todos.filter(function (td) { return (td.date || "") < tStr; });
        var weekAhead = events.filter(function (e) {
          var d = (e.starts_on || "").slice(0, 10);
          return d >= tStr && d <= ymd(new Date(Date.now() + 7 * 864e5));
        }).length + todos.filter(function (td) { return td.date >= tStr && td.date <= ymd(new Date(Date.now() + 7 * 864e5)); }).length;

        function paint() {
          var first = new Date(schState.y, schState.m, 1);
          var title = ["Team", "Schedule"];
          main.innerHTML =
            pageHeader({
              title: title, desc: DESCS.schedule,
              stats: [
                { icon: "calendar", value: String(todos.filter(function (t2) { return t2.date === tStr; }).length), label: "Tasks today" },
                { icon: "clock", value: String(weekAhead), label: "This week" },
                { icon: "alert", value: String(overdueEvs.length + overdueTds.length), label: "Overdue, unfinished", badge: overdueEvs.length + overdueTds.length ? badge("ember", "needs love") : "" }
              ]
            }) +
            '<div class="jd-toolbar">' +
            '<button class="jd-chip ' + (!schState.kinds.length ? "is-active" : "") + '" data-kind="__all">Everyone</button>' +
            KINDS.map(function (k) {
              return '<button class="jd-chip ' + (schState.kinds.indexOf(k) >= 0 ? "is-active" : "") + '" data-kind="' + k + '">' +
                '<i style="width:8px;height:8px;border-radius:50%;background:' + (k === "Call" ? "var(--pine)" : k === "Meeting" ? "var(--tomato)" : k === "Task" ? "var(--butter)" : "var(--ink)") + '"></i>' + k + "s</button>";
            }).join("") +
            '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
            '<button class="jd-ghost-btn" data-new-task>' + icon("plus") + "New task</button>" +
            '<button class="jd-primary-btn" data-new-event>' + icon("plus") + "New event</button></div></div>" +
            '<div class="jd-grid-2" style="grid-template-columns:3fr 1.05fr;align-items:start">' +
            panel(
              phead(capMonth(first),
                icoBtn("m-prev", "chev_l", "Previous month", "") +
                '<button class="jd-chip" data-today style="height:32px">Today</button>' +
                icoBtn("m-next", "chev_r", "Next month", "") +
                seg("schview", ["Month", "Week"], schState.view)) +
              '<div class="' + (schState.view === "Week" ? "jd-week " : "") + '" id="jd-cal"></div>') +
          panel(
            phead("Overdue & up next", '<span class="jd-ph-sub">' + (overdueEvs.length + overdueTds.length) + " overdue</span>") +
            '<div class="jd-gap-list">' +
            (overdueTds.length + overdueEvs.length ?
              overdueTds.slice(0, 5).map(function (td) {
                return '<div class="jd-task" data-todo="' + esc(td.name) + '"><span class="jd-check">' + icon("check") + "</span>" +
                  '<div class="body"><div class="t">' + esc(td.description) + '</div><div class="m" style="color:var(--tomato)">overdue · ' +
                  esc(fmtDate(td.date)) + "</div></div></div>";
              }).join("") +
              overdueEvs.slice(0, 4).map(function (e) {
                return '<div class="jd-link-row"><span><b>' + esc(e.subject) + "</b><div class='m'>" +
                  esc(fmtDate(e.starts_on)) + " · missed</div></span>" + statusChip("Overdue") + "</div>";
              }).join("")
              : '<div class="jd-empty" style="padding:18px"><b>All caught up</b>Nothing overdue.</div>') +
            "</div>" +
            '<div class="jd-coming"><div class="jd-coming-head"><span>Up next</span></div><ul>' +
            events.filter(function (e) { return e.status === "Open" && (e.starts_on || "").slice(0, 10) >= tStr; }).slice(0, 5).map(function (e) {
              var d = new Date(e.starts_on);
              return '<li><span class="jd-day-chip"><span class="d">' + MON[d.getMonth()] + '</span><span class="n">' + d.getDate() + "</span></span>" +
                "<span><b>" + esc(e.subject) + '</b> <span style="color:var(--muted)">' + esc((e.starts_on || "").slice(11, 16)) + "</span></span></li>";
            }).join("") + "</ul></div>") +
            "</div>";
          paintCal();
          CRM.enhanceCounters(main);
        }

        function capMonth(d) {
          return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        }
        function paintCal() {
          var host = main.querySelector("#jd-cal");
          if (!host) return;
          var days = [];
          if (schState.view === "Week") {
            var base = new Date(schState.y, schState.m, TODAY.getDate());
            var dow = (base.getDay() + 6) % 7;
            var start = new Date(base); start.setDate(base.getDate() - dow);
            for (var i = 0; i < 7; i++) { var d0 = new Date(start); d0.setDate(start.getDate() + i); days.push({ d: d0, in: true }); }
          } else {
            var first = new Date(schState.y, schState.m, 1);
            var lead = (first.getDay() + 6) % 7;
            var startD = new Date(first); startD.setDate(1 - lead);
            for (var j = 0; j < 42; j++) {
              var dd = new Date(startD); dd.setDate(startD.getDate() + j);
              days.push({ d: dd, in: dd.getMonth() === schState.m });
              if (j >= 34 && dd.getMonth() !== schState.m && days.length % 7 === 0) break;
            }
          }
          var head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (w) {
            return '<div class="jd-cal-head">' + w + "</div>";
          }).join("");
          var cells = days.map(function (x) {
            var ds = ymd(x.d);
            var it = dayItems(ds);
            var isToday = ds === tStr;
            var evHtml = it.evs.slice(0, 3).map(function (e) {
              var k = evKindClass(e.event_category);
              return '<button class="jd-ev k-' + k + '" data-ev="' + esc(e.name) + '" title="' + esc(e.subject) + '">' +
                esc((e.starts_on || "").slice(11, 16) ? (e.starts_on || "").slice(11, 16) + " " : "") + esc(e.subject) + "</button>";
            }).join("") +
              it.tds.slice(0, 2).map(function (td) {
                return '<button class="jd-ev k-Task" data-todo="' + esc(td.name) + '" title="' + esc(td.description) + '">☑ ' + esc(td.description) + "</button>";
              }).join("");
            var more = (it.evs.length + it.tds.length) > 5 ? '<button class="jd-cal-more" data-day="' + ds + '">+' + (it.evs.length + it.tds.length - 5) + " more</button>" : "";
            return '<div class="jd-cal-day ' + (x.in ? "" : "muted ") + (isToday ? "today " : "") + (schState.sel === ds ? "sel" : "") +
              '" data-day="' + ds + '">' +
              '<div class="jd-cal-num"><span class="num">' + x.d.getDate() + '</span><span class="wd">' +
              MON[x.d.getMonth()] + "</span></div>" + evHtml + more + "</div>";
          }).join("");
          host.className = schState.view === "Week" ? "jd-cal jd-week" : "jd-cal";
          host.innerHTML = head + cells;
        }

        function openDay(ds) {
          var it = dayItems(ds);
          var dObj = new Date(ds + "T12:00:00");
          var body = "";
          if (!it.evs.length && !it.tds.length) body = emptyState("Nothing planned", "Add a call, meeting or task for this day.");
          else body = '<div class="jd-gap-list">' +
            it.tds.map(function (td) {
              return '<div class="jd-task" data-todo="' + esc(td.name) + '"><span class="jd-check">' + icon("check") + "</span>" +
                '<div class="body"><div class="t">' + esc(td.description) + '</div><div class="m">Task · ' + esc(td.priority || "") + "</div></div></div>";
            }).join("") +
            it.evs.map(function (e) {
              return '<div class="jd-link-row" data-ev="' + esc(e.name) + '"><span><b>' + esc(e.subject) + "</b>" +
                "<div class='m'>" + esc((e.starts_on || "").slice(11, 16) || "all day") + " · " + esc(e.event_category || "Event") + "</div></span>" +
                statusChip(e.status || "Open") + "</div>";
            }).join("") + "</div>";
          CRM.openModal({
            title: dObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
            sub: it.evs.length + " events · " + it.tds.length + " tasks",
            body: body,
            onMount: function (m, close) {
              m.addEventListener("click", function (e) {
                var td = e.target.closest("[data-todo]");
                if (td) {
                  setVal("To Do", td.getAttribute("data-todo"), { status: "Completed" }).then(function () {
                    toast("ok", "Completed"); close(); CRM.refresh();
                  }).catch(function (e2) { toast("err", "Update failed", (e2 && e2.message) || ""); });
                }
              });
            }
          });
        }

        function newEvent() {
          CRM.formModal({
            title: "New event", sub: "Lands on the shared calendar", submit: "Add event",
            fields: [
              { name: "subject", label: "Title", req: true, ph: "Demo with Bluepeak team" },
              { name: "date", label: "Date", type: "date", req: true, value: ymd(TODAY) },
              { name: "time", label: "Time", type: "time", value: "10:00" },
              { name: "kind", label: "Type", type: "select", options: ["Meeting", "Call", "Email", "Other"], value: "Meeting" }
            ],
            onSave: function (v, close) {
              var catMap = { Meeting: "Meeting", Call: "Call", Email: "Sent-Received Email", Other: "Other" };
              var hh = v.time || "10:00";
              function plusHour(t) {
                var p = t.split(":"); var h = (Number(p[0]) + 1) % 24;
                return String(h).padStart(2, "0") + ":" + (p[1] || "00");
              }
              insertDoc({
                doctype: "Event", subject: v.subject,
                starts_on: v.date + " " + hh + ":00",
                ends_on: v.date + " " + plusHour(hh) + ":00",
                event_category: catMap[v.kind] || "Meeting"
              }).then(function () {
                close(); toast("ok", "Event scheduled"); CRM.refreshHeaderStats(); CRM.refresh();
              }).catch(function (e) { toast("err", "Could not save event", (e && e.message) || ""); });
            }
          });
        }

        paint();
        main.addEventListener("click", function (e) {
          var k = e.target.closest("[data-kind]");
          if (k) {
            var val = k.getAttribute("data-kind");
            if (val === "__all") schState.kinds = [];
            else {
              var i = schState.kinds.indexOf(val);
              if (i >= 0) schState.kinds.splice(i, 1); else schState.kinds.push(val);
            }
            paint(); return;
          }
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { schState.view = s.getAttribute("data-v"); paint(); return; }
          if (e.target.closest('[data-p="m-prev"]')) { schState.m--; if (schState.m < 0) { schState.m = 11; schState.y--; } paint(); return; }
          if (e.target.closest('[data-p="m-next"]')) { schState.m++; if (schState.m > 11) { schState.m = 0; schState.y++; } paint(); return; }
          if (e.target.closest("[data-today]")) { schState.y = TODAY.getFullYear(); schState.m = TODAY.getMonth(); paint(); return; }
          if (e.target.closest("[data-new-event]")) { newEvent(); return; }
          if (e.target.closest("[data-new-task]")) { CRM.startCreate("task"); return; }
          var ev = e.target.closest("[data-ev]");
          if (ev) {
            var eo = events.filter(function (x) { return x.name === ev.getAttribute("data-ev"); })[0];
            if (eo) {
              CRM.openModal({
                title: eo.subject, sub: (eo.event_category || "Event") + " · " + fmtDate(eo.starts_on, true) + " " + (eo.starts_on || "").slice(11, 16),
                body: '<div style="display:flex;gap:8px;align-items:center;margin-top:12px">' + statusChip(eo.status || "Open") +
                  '<span style="font-size:12px;color:var(--muted)">' + esc(eo.owner ? ownerName(eo.owner) : "Everyone") + "</span></div>" +
                  '<div class="jd-drawer-actions"><a class="jd-ghost-btn" href="/app/event/' + encodeURIComponent(eo.name) + '">' +
                  icon("external") + "Open in ERPNext</a></div>"
              });
            }
            return;
          }
          var day = e.target.closest("[data-day]");
          if (day) { openDay(day.getAttribute("data-day")); return; }
          var td = e.target.closest("[data-todo]");
          if (td) {
            setVal("To Do", td.getAttribute("data-todo"), { status: "Completed" }).then(function () {
              toast("ok", "Completed"); CRM.refreshHeaderStats(); CRM.refresh();
            }).catch(function (e2) { toast("err", "Update failed", (e2 && e2.message) || ""); });
          }
        });
        CRM.exportRows = function () {
          CRM.exportCSV("schedule", events.map(function (e) {
            return { title: e.subject, when: e.starts_on, kind: e.event_category, status: e.status };
          }));
        };
      });
    }
  };

  /* ============================================================
     PAGE: Finance
     ============================================================ */
  var finState = { range: "12M", q: "", seg: "All" };
  function invStatus(i, tStr) {
    if (Number(i.docstatus) === 0) return "Draft";
    if (!(Number(i.outstanding_amount) > 0)) return "Paid";
    var d = (i.due_date || "").slice(0, 10);
    if (d && d < tStr) return "Overdue";
    return "Due";
  }
  CRM.pages.finance = {
    render: function (main) {
      var tStr = ymd(TODAY);
      Promise.all([
        list("Sales Invoice", {
          fields: ["name", "customer", "party_name", "grand_total", "outstanding_amount", "posting_date", "due_date", "docstatus"],
          order_by: "posting_date desc", limit_page_length: 400
        }).catch(function () { return []; }),
        list("Payment Entry", {
          fields: ["name", "posting_date", "paid_amount", "party"],
          order_by: "posting_date asc", limit_page_length: 600
        }).catch(function () { return []; }),
        list("Quotation", {
          fields: ["name", "party_name", "grand_total", "status", "valid_till"],
          order_by: "transaction_date desc", limit_page_length: 100
        }).catch(function () { return []; })
      ]).then(function (r) {
        var invs = r[0], pays = r[1], quotes = r[2];
        var collRows = pays.length ? pays.map(function (p) { return { posting_date: p.posting_date, amt: Number(p.paid_amount) || 0 }; }) :
          invs.map(function (i) { return { posting_date: i.posting_date, amt: Math.max(0, (Number(i.grand_total) || 0) - (Number(i.outstanding_amount) || 0)) }; });

        var live = invs.filter(function (i) { return Number(i.docstatus) !== 2; });
        var thisM = TODAY.getMonth(), thisY = TODAY.getFullYear();
        var collThis = collRows.reduce(function (s, x) {
          var d = new Date(x.posting_date);
          return (d.getMonth() === thisM && d.getFullYear() === thisY) ? s + x.amt : s;
        }, 0);
        var notDue = 0, odSum = 0, odN = 0;
        live.forEach(function (i) {
          var out = Number(i.outstanding_amount) || 0;
          if (out <= 0) return;
          var d = (i.due_date || i.posting_date || "").slice(0, 10);
          if (d && d < tStr) { odSum += out; odN++; } else notDue += out;
        });

        function aging() {
          var b = [[], [], [], []];
          live.forEach(function (i) {
            var out = Number(i.outstanding_amount) || 0;
            if (out <= 0) return;
            var days = Math.floor((new Date(tStr) - new Date((i.posting_date || tStr).slice(0, 10))) / 864e5);
            if (days <= 30) b[0].push(out); else if (days <= 60) b[1].push(out);
            else if (days <= 90) b[2].push(out); else b[3].push(out);
          });
          return b.map(function (rows) { return { n: rows.length, v: rows.reduce(function (s, x) { return s + x; }, 0) }; });
        }
        function visible() {
          var q = finState.q.toLowerCase();
          return live.filter(function (i) {
            if (finState.seg !== "All" && invStatus(i, tStr) !== finState.seg) return false;
            if (q && (i.name + " " + (i.customer || i.party_name || "")).toLowerCase().indexOf(q) < 0) return false;
            return true;
          });
        }

        function openInv(i) {
          var st = invStatus(i, tStr);
          var tone = st === "Paid" ? "forest" : st === "Overdue" ? "ember" : "sun";
          var body = el("<div></div>");
          body.innerHTML =
            '<div class="jd-hero jd-tone-' + tone + '">' +
            '<div class="jd-hero-top"><span>Invoice · ' + esc(i.posting_date ? fmtDate(i.posting_date, true) : "—") + "</span>" +
            '<span class="jd-hero-stage">' + esc(st) + "</span></div>" +
            "<h2>" + esc(i.name) + "</h2>" +
            '<p class="sub">' + esc(i.customer || i.party_name || "—") + "</p>" +
            '<div class="jd-hero-foot"><span class="jd-hero-amount">' + money(i.grand_total) + "</span></div></div>" +
            '<div class="jd-fields-2" style="margin-top:14px">' +
            '<div class="jd-fin-tile"><div class="k">Outstanding</div><div class="v">' + money(i.outstanding_amount) + "</div></div>" +
            '<div class="jd-fin-tile"><div class="k">Due date</div><div class="v" style="font-size:16px">' + esc(fmtDate(i.due_date, true)) + "</div></div></div>" +
            '<div class="jd-drawer-actions"><a class="jd-ghost-btn" href="/app/sales-invoice/' + encodeURIComponent(i.name) + '">' +
            icon("external") + "Open in ERPNext</a></div>";
          CRM.openDrawer({ kicker: "Invoice · " + st, body: body });
        }

        function paint() {
          var n = finState.range === "6M" ? 6 : 12;
          var labels = monthsBack(n);
          var coll = bucketByMonth(collRows, "posting_date", "amt", n);
          var invo = bucketByMonth(invs.map(function (i) { return { posting_date: i.posting_date, amt: Number(i.grand_total) || 0 }; }), "posting_date", "amt", n);
          var collSum = coll.reduce(function (s, x) { return s + x; }, 0);
          var invoSum = invo.reduce(function (s, x) { return s + x; }, 0);
          var ag = aging();
          var agLabels = ["0–30", "31–60", "61–90", "90+"];

          main.innerHTML =
            pageHeader({
              title: ["Revenue &", "Invoices"], desc: DESCS.finance,
              stats: [
                { icon: "dollar", value: money(collThis), raw: collThis, fmt: "money", label: "Collected this month" },
                { icon: "file", value: money(notDue), raw: notDue, fmt: "money", label: "Outstanding, not yet due" },
                { icon: "clock", value: money(odSum), raw: odSum, fmt: "money", label: "Overdue", badge: odN ? badge("ember", odN + " late") : "" }
              ]
            }) +
            '<div class="jd-grid-2">' +
            panel(
              phead("Cash flow", seg("finrange", ["6M", "12M"], finState.range) +
                icoBtn("fin-export", "download", "Export CSV", "")) +
              '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 8px">' +
              '<span style="font-size:30px;font-weight:750;letter-spacing:-1px">' + money(collSum) + "</span>" +
              '<span style="font-size:12px;color:var(--muted)">collected in ' + n + " months · " +
              (invoSum ? Math.round((collSum / invoSum) * 100) : 0) + "% of " + moneyK(invoSum) + " invoiced</span></div>" +
              '<div id="jd-fin-flow"></div>' +
              '<div class="jd-dual-legend"><span><i style="background:var(--pine)"></i>Collected</span>' +
              '<span><i style="background:var(--tomato)"></i>Invoiced</span></div>') +
            panel(
              phead("Aging") +
              '<p style="font-size:12px;color:var(--muted);margin:0 0 8px">Unpaid invoices by age since issue</p>' +
              '<div id="jd-fin-aging"></div>' +
              '<ul class="jd-list" style="margin-top:10px">' + ag.map(function (b, bi) {
                return '<li class="jd-link-row" style="cursor:default"><span><b>' + agLabels[bi] + " days</b></span>" +
                  '<span style="display:flex;gap:14px;align-items:center"><span style="color:var(--muted);font-size:12px">' + b.n + " invoices</span>" +
                  "<b>" + money(b.v) + "</b></span></li>";
              }).join("") + "</ul>") +
            "</div>" +
            panel(
              phead("Invoices",
                searchField("inv", "Search invoices…", finState.q) +
                seg("finstatus", ["All", "Due", "Overdue", "Paid", "Draft"], finState.seg) +
                '<a class="jd-primary-btn" href="/app/sales-invoice/new" style="margin-left:8px">' + icon("plus") + "New invoice</a>") +
              (visible().length ?
                '<div class="jd-table-wrap"><table class="jd-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Dated</th>' +
                "<th>Due</th><th class='cell-num'>Amount</th><th class='cell-num'>Outstanding</th><th>Status</th></tr></thead><tbody>" +
                visible().map(function (i) {
                  var st = invStatus(i, tStr);
                  return '<tr class="is-clickable" data-inv="' + esc(i.name) + '">' +
                    '<td class="cell-main">' + esc(i.name) + "</td>" +
                    '<td class="cell-muted">' + esc(i.customer || i.party_name || "—") + "</td>" +
                    '<td class="cell-muted">' + esc(fmtDate(i.posting_date)) + "</td>" +
                    '<td class="cell-muted">' + esc(fmtDate(i.due_date)) + "</td>" +
                    '<td class="cell-num">' + money(i.grand_total) + "</td>" +
                    '<td class="cell-num">' + money(i.outstanding_amount) + "</td>" +
                    "<td>" + statusChip(st) + "</td></tr>";
                }).join("") + "</tbody></table></div>" +
                '<p class="jd-table-foot">' + visible().length + " invoices · " +
                money(visible().reduce(function (s, i) { return s + (Number(i.outstanding_amount) || 0); }, 0)) + " outstanding</p>"
                : emptyState("No matching invoices", "Try another status or search.")) +
              (quotes.length ? phead("Recent quotes", openBtn("finance")) +
                '<div class="jd-gap-list">' + quotes.slice(0, 4).map(function (q) {
                  return '<div class="jd-link-row"><span><b>' + esc(q.name) + "</b><div class='m'>" +
                    esc(q.party_name || "—") + " · " + money(q.grand_total) + "</div></span>" + statusChip(q.status || "Open") + "</div>";
                }).join("") + "</div>" : ""));

          var flow = main.querySelector("#jd-fin-flow");
          if (flow) lineChart(flow, {
            labels: labels, height: 200,
            series: [
              { name: "Collected", color: "var(--pine)", values: coll },
              { name: "Invoiced", color: "var(--tomato)", values: invo, area: false, dash: true }
            ],
            fmtAxis: moneyK, fmtTip: money
          });
          var agEl = main.querySelector("#jd-fin-aging");
          if (agEl) barChart(agEl, ag.map(function (b, bi) {
            return { k: agLabels[bi], v: b.v, label: moneyK(b.v), cls: bi === 3 && b.v > 0 ? "ember" : bi === 2 && b.v > 0 ? "sun" : "" };
          }), { height: 130 });
          CRM.enhanceCounters(main);
        }

        paint();
        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) {
            var name = s.closest("[data-seg]").getAttribute("data-seg");
            if (name === "finrange") finState.range = s.getAttribute("data-v");
            if (name === "finstatus") finState.seg = s.getAttribute("data-v");
            paint(); return;
          }
          if (e.target.closest('[data-p="fin-export"]')) {
            CRM.exportCSV("invoices", visible().map(function (i) {
              return { invoice: i.name, customer: i.customer || i.party_name, dated: i.posting_date, due: i.due_date, amount: i.grand_total, outstanding: i.outstanding_amount, status: invStatus(i, tStr) };
            }));
            return;
          }
          var row = e.target.closest("[data-inv]");
          if (row) {
            var iv = live.filter(function (x) { return x.name === row.getAttribute("data-inv"); })[0];
            if (iv) openInv(iv);
          }
        });
        var sf = main.querySelector("[data-search]");
        if (sf) sf.addEventListener("input", function () {
          finState.q = sf.value;
          var pos = sf.selectionStart; paint();
          var ni = main.querySelector("[data-search]");
          if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        CRM.exportRows = function () {
          CRM.exportCSV("invoices", visible().map(function (i) {
            return { invoice: i.name, customer: i.customer || i.party_name, amount: i.grand_total, outstanding: i.outstanding_amount, status: invStatus(i, tStr) };
          }));
        };
      });
    }
  };

  /* ============================================================
     PAGE: Growth
     ============================================================ */
  var grState = { n: 6, unit: "$", q: "" };
  var DONUT_C = ["var(--pine)", "var(--tomato)", "var(--butter)", "#3f6b5d", "#8fae9f", "#b98b4d", "var(--ink)"];
  function donutSVG(segs, total, size) {
    size = size || 170;
    var C = 251.32, off = 0, tt = total || 1;
    var circles = segs.map(function (s) {
      var len = Math.max(0.5, (s.v / tt) * C - 2);
      var o = -(off / tt) * C;
      off += s.v;
      return '<circle cx="50" cy="50" r="40" fill="none" stroke="' + s.color + '" stroke-width="11" stroke-dasharray="' + len + " " + C + '" stroke-dashoffset="' + o + '"/>';
    }).join("");
    return '<svg viewBox="0 0 100 100" class="draw-in" style="width:' + size + "px;height:" + size + 'px;transform:rotate(-90deg)">' + circles + "</svg>";
  }
  function monthKeys(n) {
    var keys = [], dd = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
    for (var i = 0; i < n; i++) { keys.unshift(dd.getFullYear() + "-" + dd.getMonth()); dd.setMonth(dd.getMonth() - 1); }
    return keys;
  }
  function mkey(dstr) { var d = new Date(dstr); return d.getFullYear() + "-" + d.getMonth(); }

  CRM.pages.growth = {
    render: function (main) {
      Promise.all([
        list("Customer", { fields: ["name", "customer_name", "customer_group", "creation"], limit_page_length: 300 }).catch(function () { return []; }),
        list("Lead", {
          fields: ["name", "lead_name", "company_name", "status", "utm_source", "email_id", "mobile_no", "creation"],
          order_by: "creation desc", limit_page_length: 400
        }).catch(function () { return []; }),
        list("Opportunity", {
          fields: ["name", "title", "status", "opportunity_amount", "sales_stage", "probability", "creation", "expected_closing", "customer_name", "opportunity_owner"],
          order_by: "creation desc", limit_page_length: 500
        }).catch(function () { return []; }),
        list("DocField", { filters: { parent: "Lead", fieldname: "status" }, fields: ["options"], limit_page_length: 5 }).catch(function () { return []; })
      ]).then(function (r) {
        var custs = r[0], leads = r[1], opps = r[2];
        var leadStatusOpts = (r[3] && r[3][0] && r[3][0].options ? String(r[3][0].options).split("\n") : [])
          .map(function (s) { return s.trim(); }).filter(Boolean);
        if (!leadStatusOpts.length) leadStatusOpts = ["Open", "Working", "Nurturing", "Opportunity", "Do Not Contact", "Converted", "Replied", "Unqualified"];
        var custByName = {};
        custs.forEach(function (c) { custByName[c.customer_name] = c; });

        function inRange(dstr, n) {
          var d = new Date(dstr);
          if (isNaN(d)) return false;
          var diff = (TODAY.getFullYear() - d.getFullYear()) * 12 + (TODAY.getMonth() - d.getMonth());
          return diff >= 0 && diff < n;
        }
        function visible() {
          var q = grState.q.toLowerCase();
          return leads.filter(function (l) {
            if (!q) return true;
            return (l.lead_name + " " + (l.company_name || "") + " " + (l.utm_source || "")).toLowerCase().indexOf(q) >= 0;
          });
        }

        function openLead(l) {
          var body = el("<div></div>");
          body.innerHTML =
            '<div class="jd-hero tone-ink" style="display:flex;gap:14px;align-items:center">' +
            avatar(l.lead_name || l.name, 46) +
            '<div style="min-width:0"><h2 style="font-size:19px;margin:0">' + esc(l.lead_name || l.name) + "</h2>" +
            '<p class="sub">' + esc(l.company_name || "Lead") + " · " + esc(l.utm_source || "source n/a") + "</p></div></div>" +
            '<div class="jd-fields" style="margin-top:14px">' +
            '<div class="jd-field"><label>Status</label><select data-f="status">' +
            leadStatusOpts.map(function (s) {
              return '<option value="' + esc(s) + '"' + (l.status === s ? " selected" : "") + ">" + esc(s) + "</option>";
            }).join("") + "</select></div>" +
            '<div class="jd-fields-2">' +
            '<div class="jd-field"><label>Email</label><input readonly value="' + esc(l.email_id || "—") + '"></div>' +
            '<div class="jd-field"><label>Phone</label><input readonly value="' + esc(l.mobile_no || l.phone_no || "—") + '"></div></div>' +
            '<div class="jd-field"><label>Captured</label><input readonly value="' + esc(fmtDate(l.creation, true)) + '"></div></div>' +
            '<div class="jd-drawer-actions">' +
            '<button class="jd-primary-btn" data-convert ' + (l.status === "Converted" ? "disabled style=opacity:.5" : "") + ">" +
            icon("trophy") + (l.status === "Converted" ? "Converted ✓" : "Mark converted") + "</button>" +
            '<a class="jd-ghost-btn" href="/app/lead/' + encodeURIComponent(l.name) + '">' + icon("external") + "Open in ERPNext</a></div>";

          CRM.openDrawer({
            kicker: "Lead · " + (l.company_name || l.name),
            body: body,
            onMount: function (d, close) {
              d.addEventListener("change", function (e) {
                var f = e.target.getAttribute && e.target.getAttribute("data-f");
                if (f !== "status") return;
                setVal("Lead", l.name, { status: e.target.value }).then(function () {
                  l.status = e.target.value;
                  toast("ok", "Status → " + e.target.value);
                  if (afterChange) afterChange();
                }).catch(function (e2) { toast("err", "Save failed", (e2 && e2.message) || ""); });
              });
              d.querySelector("[data-convert]").addEventListener("click", function () {
                setVal("Lead", l.name, { status: "Converted" }).then(function () {
                  l.status = "Converted";
                  toast("ok", 'Lead "' + (l.lead_name || l.name) + '" converted');
                  if (afterChange) afterChange();
                  close();
                }).catch(function (e2) { toast("err", "Convert failed", (e2 && e2.message) || ""); });
              });
            }
          });
        }
        var afterChange = null;

        function paint() {
          var n = grState.n;
          var newCust = custs.filter(function (c) { return inRange(c.creation, n); }).length;
          var won = opps.filter(isWon);
          var avgWon = won.length ? Math.round(won.reduce(function (s, o) { return s + (Number(o.opportunity_amount) || 0); }, 0) / won.length) : 0;
          var cycles = won.map(function (o) {
            return (new Date(o.expected_closing) - new Date(o.creation)) / 864e5;
          }).filter(function (x) { return isFinite(x) && x > 0 && x < 720; });
          var avgCycle = cycles.length ? Math.round(cycles.reduce(function (s, x) { return s + x; }, 0) / cycles.length) : null;

          var labels = monthsBack(n), keys = monthKeys(n);
          var wonByM = bucketByMonth(won.map(function (o) { return { m: o.expected_closing || o.creation, amt: Number(o.opportunity_amount) || 0 }; }), "m", "amt", n);
          var custByM = bucketByMonth(custs.map(function (c) { return { creation: c.creation, one: 1 }; }), "creation", "one", n);
          var wonTot = wonByM.reduce(function (s, x) { return s + x; }, 0);

          var closedByM = keys.map(function () { return { w: 0, l: 0 }; });
          opps.forEach(function (o) {
            if (!isWon(o) && !isLost(o)) return;
            var k = mkey(o.expected_closing || o.creation);
            var idx = keys.indexOf(k);
            if (idx < 0) return;
            if (isWon(o)) closedByM[idx].w++; else closedByM[idx].l++;
          });
          var winByM = closedByM.map(function (c) {
            return (c.w + c.l) ? Math.round((c.w / (c.w + c.l)) * 100) : 0;
          });

          var srcMap = {};
          leads.forEach(function (l) {
            var k = l.utm_source || "Unknown";
            srcMap[k] = (srcMap[k] || 0) + 1;
          });
          var srcList = Object.keys(srcMap).map(function (k) { return { k: k, v: srcMap[k] }; })
            .sort(function (a, b) { return b.v - a.v; });
          var top = srcList.slice(0, 6);
          if (srcList.length > 6) top.push({ k: "Other", v: srcList.slice(6).reduce(function (s, x) { return s + x.v; }, 0) });
          top.forEach(function (s, i) { s.color = DONUT_C[i % DONUT_C.length]; });
          var srcTot = top.reduce(function (s, x) { return s + x.v; }, 0);

          var segAgg = {};
          won.forEach(function (o) {
            var g = (custByName[o.customer_name] && custByName[o.customer_name].customer_group) || "Other";
            segAgg[g] = (segAgg[g] || 0) + (Number(o.opportunity_amount) || 0);
          });
          var segList = Object.keys(segAgg).map(function (k) { return { k: k, v: segAgg[k] }; })
            .sort(function (a, b) { return b.v - a.v; }).slice(0, 3);

          main.innerHTML =
            pageHeader({
              title: ["Growth", "Reports"], desc: DESCS.growth,
              stats: [
                { icon: "users", value: String(newCust), raw: newCust, label: "New customers, last " + n + " months" },
                { icon: "trophy", value: avgWon ? money(avgWon) : "—", raw: avgWon || null, fmt: "money", label: "Average won deal" },
                { icon: "clock", value: avgCycle != null ? String(avgCycle) : "—", raw: avgCycle != null ? avgCycle : null, label: "Average sales cycle, days" }
              ],
              right: seg("grange", ["3M", "6M", "12M"], n === 3 ? "3M" : n === 12 ? "12M" : "6M") +
                '<button class="jd-ghost-btn" data-p="gr-export">' + icon("download") + "Export CSV</button>"
            }) +
            '<div class="jd-grid-2">' +
            panel(
              phead("Revenue by segment", seg("grunit", ["$", "%"], grState.unit)) +
              '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 4px">' +
              '<span style="font-size:30px;font-weight:750;letter-spacing:-1px">' + money(wonTot) + "</span>" +
              '<span style="font-size:12px;color:var(--muted)">won, last ' + n + " months</span></div>" +
              (segList.length ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px">' + segList.map(function (s, i) {
                var col = i === 0 ? "var(--pine)" : i === 1 ? "var(--tomato)" : "var(--butter)";
                return '<span style="display:inline-flex;align-items:center;gap:7px;background:var(--ink);color:var(--on-ink);' +
                  'border-radius:999px;padding:6px 13px;font-size:12px;font-weight:650"><i style="width:8px;height:8px;border-radius:50%;background:' +
                  col + '"></i>' + esc(s.k) + " " + moneyK(s.v) + "</span>";
              }).join("") + "</div>" : "") +
              '<div id="jd-gr-seg" style="margin-top:8px"></div>') +
            panel(
              phead("Lead sources", openBtn("growth")) +
              '<p style="font-size:12px;color:var(--muted);margin:0 0 4px">How ' + leads.length + " leads reached us. One lead can come through several channels.</p>" +
              (srcTot ? '<div style="display:grid;place-items:center;position:relative;margin:10px 0">' +
                donutSVG(top, srcTot) +
                '<div style="position:absolute;text-align:center"><div style="font-size:26px;font-weight:750;letter-spacing:-1px">' + srcTot +
                '</div><div style="font-size:11px;color:var(--muted);font-weight:600">leads</div></div></div>' +
                '<ul class="jd-list">' + top.map(function (s) {
                  return '<li class="jd-link-row" style="cursor:default"><span style="display:flex;align-items:center;gap:8px">' +
                    '<i style="width:9px;height:9px;border-radius:50%;background:' + s.color + '"></i><b>' + esc(s.k) + "</b></span>" +
                    '<span style="display:flex;gap:12px;font-size:12px;color:var(--muted)">' + s.v + " · " + Math.round((s.v / srcTot) * 100) + "%</span></li>";
                }).join("") + "</ul>"
                : emptyState("No leads yet", "Sources appear as soon as leads arrive."))) +
            "</div>" +
            '<div class="jd-grid-2" style="margin-top:16px">' +
            panel(
              phead("New customers per month", '<span class="jd-ph-sub">last ' + n + " months</span>") +
              '<div id="jd-gr-new"></div>') +
            panel(
              phead("Win rate trend", '<span class="jd-ph-sub">closed deals / month</span>') +
              '<div id="jd-gr-win"></div>') +
            "</div>" +
            panel(
              phead("Leads", searchField("gr", "Search leads…", grState.q) +
                '<button class="jd-primary-btn" data-new-lead>' + icon("plus") + "New lead</button>") +
              (visible().length ?
                '<div class="jd-table-wrap"><table class="jd-table"><thead><tr><th>Lead</th><th>Company</th><th>Source</th>' +
                "<th>Status</th><th>Captured</th></tr></thead><tbody>" +
                visible().map(function (l) {
                  return '<tr class="is-clickable" data-lead="' + esc(l.name) + '">' +
                    '<td class="cell-main">' + esc(l.lead_name || l.name) + "</td>" +
                    '<td class="cell-muted">' + esc(l.company_name || "—") + "</td>" +
                    '<td class="cell-muted">' + esc(l.utm_source || "—") + "</td>" +
                    "<td>" + statusChip(l.status) + "</td>" +
                    '<td class="cell-muted">' + esc(fmtDate(l.creation)) + "</td></tr>";
                }).join("") + "</tbody></table></div>" +
                '<p class="jd-table-foot">' + visible().length + " leads</p>"
                : emptyState("No matching leads", "Try another search.",
                  '<button class="jd-primary-btn" data-new-lead>' + icon("plus") + "New lead</button>")));

          var sg = main.querySelector("#jd-gr-seg");
          if (sg) barChart(sg, labels.map(function (lb, i) {
            return grState.unit === "$" ?
              { k: lb, v: wonByM[i], label: moneyK(wonByM[i]) } :
              { k: lb, v: wonTot ? Math.round((wonByM[i] / wonTot) * 100) : 0, label: (wonTot ? Math.round((wonByM[i] / wonTot) * 100) : 0) + "%" };
          }), { height: 150 });
          var sn = main.querySelector("#jd-gr-new");
          if (sn) lineChart(sn, {
            labels: labels, height: 180,
            series: [{ name: "Customers", color: "var(--pine)", values: custByM }],
            fmtAxis: function (v) { return String(Math.round(v)); },
            fmtTip: function (v) { return Math.round(v) + " new"; }
          });
          var sw = main.querySelector("#jd-gr-win");
          if (sw) lineChart(sw, {
            labels: labels, height: 180, max: 100,
            series: [{ name: "Win rate", color: "var(--tomato)", values: winByM }],
            fmtAxis: function (v) { return Math.round(v) + "%"; },
            fmtTip: function (v) { return Math.round(v) + "% won"; }
          });
          CRM.enhanceCounters(main);
        }

        afterChange = function () { paint(); CRM.refreshHeaderStats(); };
        paint();
        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) {
            var name = s.closest("[data-seg]").getAttribute("data-seg");
            if (name === "grange") grState.n = s.getAttribute("data-v") === "3M" ? 3 : s.getAttribute("data-v") === "12M" ? 12 : 6;
            if (name === "grunit") grState.unit = s.getAttribute("data-v");
            paint(); return;
          }
          if (e.target.closest("[data-new-lead]")) { CRM.startCreate("lead"); return; }
          if (e.target.closest('[data-p="gr-export"]')) {
            CRM.exportCSV("leads", visible().map(function (l) {
              return { lead: l.lead_name, company: l.company_name, source: l.utm_source, status: l.status, captured: l.creation };
            }));
            return;
          }
          var row = e.target.closest("[data-lead]");
          if (row) {
            var l = leads.filter(function (x) { return x.name === row.getAttribute("data-lead"); })[0];
            if (l) openLead(l);
          }
        });
        var sf = main.querySelector("[data-search]");
        if (sf) sf.addEventListener("input", function () {
          grState.q = sf.value;
          var pos = sf.selectionStart; paint();
          var ni = main.querySelector("[data-search]");
          if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        CRM.exportRows = function () {
          CRM.exportCSV("leads", visible().map(function (l) {
            return { lead: l.lead_name, company: l.company_name, source: l.utm_source, status: l.status };
          }));
        };

        var pend = CRM.takePending();
        if (pend && pend.doctype === "Lead") {
          var pl = leads.filter(function (x) { return x.name === pend.name; })[0];
          if (pl) openLead(pl);
        }
      });
    }
  };

  /* ============================================================
     PAGE: Projects
     ============================================================ */
  var prState = { q: "", seg: "All" };
  var PR_STATUSES = ["Open", "On Hold", "Completed", "Cancelled"];
  function ringSm(pct, color) {
    var C = 163.36;
    return '<span class="jd-ring-sm"><svg viewBox="0 0 64 64">' +
      '<circle class="trk" cx="32" cy="32" r="26" fill="none" stroke-width="6"/>' +
      '<circle class="val" cx="32" cy="32" r="26" fill="none" stroke-width="6" stroke-dasharray="' + C +
      '" stroke-dashoffset="' + (C * (1 - Math.max(0, Math.min(100, pct)) / 100)) + '"' +
      (color ? ' style="stroke:' + color + '"' : "") + "/></svg>" +
      '<span class="pct">' + Math.round(pct) + "%</span></span>";
  }
  CRM.pages.projects = {
    render: function (main) {
      var tStr = ymd(TODAY);
      Promise.all([
        list("Project", {
          fields: ["name", "project_name", "status", "percent_complete", "expected_end_date", "customer", "creation"],
          order_by: "creation desc", limit_page_length: 300
        }).catch(function () { return []; }),
        list("Customer", { fields: ["customer_name"], limit_page_length: 200 }).catch(function () { return []; })
      ]).then(function (r) {
        var projs = r[0], custNames = r[1].map(function (c) { return c.customer_name; });

        function visible() {
          var q = prState.q.toLowerCase();
          return projs.filter(function (p) {
            if (prState.seg !== "All" && p.status !== prState.seg) return false;
            if (q && ((p.project_name || p.name) + " " + (p.customer || "")).toLowerCase().indexOf(q) < 0) return false;
            return true;
          });
        }
        function pct(p) { return Number(p.percent_complete) || 0; }
        function isOpenP(p) { return p.status === "Open" || p.status === "On Hold"; }

        function openProj(p) {
          var body = el("<div></div>");
          body.innerHTML =
            '<div class="jd-hero jd-tone-' + (p.status === "Completed" ? "forest" : pct(p) > 60 ? "sun" : "ink") + '">' +
            '<div class="jd-hero-top"><span>Due ' + esc(fmtDate(p.expected_end_date)) + "</span>" +
            '<span class="jd-hero-stage">' + esc(p.status || "Open") + "</span></div>" +
            "<h2>" + esc(p.project_name || p.name) + "</h2>" +
            '<p class="sub">' + esc(p.customer || "Internal project") + "</p>" +
            '<div class="jd-hero-foot"><span class="jd-hero-amount">' + Math.round(pct(p)) + "% complete</span></div></div>" +
            '<div class="jd-fields" style="margin-top:14px">' +
            '<div class="jd-fields-2">' +
            '<div class="jd-field"><label>Progress (%)</label><input type="number" min="0" max="100" data-f="percent_complete" value="' + pct(p) + '"></div>' +
            '<div class="jd-field"><label>Status</label><select data-f="status">' + PR_STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (p.status === s ? " selected" : "") + ">" + s + "</option>";
            }).join("") + "</select></div></div>" +
            '<div class="jd-field"><label>Due date</label><input type="date" data-f="expected_end_date" value="' + esc((p.expected_end_date || "").slice(0, 10)) + '"></div></div>' +
            '<div class="jd-drawer-actions">' +
            '<button class="jd-primary-btn" data-advance ' + (pct(p) >= 100 ? "disabled style=opacity:.5" : "") + ">" +
            icon("check") + (pct(p) >= 100 ? "Completed" : "Complete next step") + "</button>" +
            '<a class="jd-ghost-btn" href="/app/project/' + encodeURIComponent(p.name) + '">' + icon("external") + "Open in ERPNext</a></div>";

          CRM.openDrawer({
            kicker: "Project · " + (p.customer || p.name),
            body: body,
            onMount: function (d, close) {
              function save(fields, label) {
                setVal("Project", p.name, fields).then(function () {
                  toast("ok", label + " saved");
                  Object.keys(fields).forEach(function (k) { p[k] = fields[k]; });
                  CRM.refresh();
                }).catch(function (e) { toast("err", "Save failed", (e && e.message) || ""); });
              }
              d.addEventListener("change", function (e) {
                var f = e.target.getAttribute && e.target.getAttribute("data-f");
                if (!f) return;
                var v = e.target.value;
                if (f === "percent_complete") {
                  v = Math.max(0, Math.min(100, Number(v) || 0));
                  if (v >= 100) save({ percent_complete: 100, status: "Completed" }, "Progress");
                  else save({ percent_complete: v }, "Progress");
                } else {
                  save(toObj(f, v), f === "status" ? "Status" : "Due date");
                }
              });
              function toObj(f, v) { var o = {}; o[f] = v; return o; }
              var adv = d.querySelector("[data-advance]");
              if (adv) adv.addEventListener("click", function () {
                var np = Math.min(100, pct(p) + 10);
                var fields = { percent_complete: np };
                if (np >= 100) fields.status = "Completed";
                setVal("Project", p.name, fields).then(function () {
                  p.percent_complete = np;
                  if (fields.status) p.status = fields.status;
                  toast("ok", "Progress → " + np + "%");
                  close(); CRM.refresh();
                }).catch(function (e) { toast("err", "Save failed", (e && e.message) || ""); });
              });
            }
          });
        }

        function newProject() {
          CRM.formModal({
            title: "New project", sub: "Kick off customer work", submit: "Create project",
            fields: [
              { name: "project_name", label: "Project name", req: true, ph: "Acme — Onboarding" },
              { name: "customer", label: "Customer", type: "select", options: custNames },
              { name: "expected_end_date", label: "Due date", type: "date" }
            ],
            onSave: function (v, close) {
              var doc = { doctype: "Project", project_name: v.project_name, percent_complete: 0, status: "Open" };
              if (v.customer) doc.customer = v.customer;
              if (v.expected_end_date) doc.expected_end_date = v.expected_end_date;
              insertDoc(doc).then(function () {
                close(); toast("ok", 'Project "' + v.project_name + '" created'); CRM.refresh();
              }).catch(function (e) { toast("err", "Could not save project", (e && e.message) || ""); });
            }
          });
        }

        function paint() {
          var active = projs.filter(isOpenP).length;
          var avgPct = projs.length ? Math.round(projs.reduce(function (s, p) { return s + pct(p); }, 0) / projs.length) : 0;
          var soon = ymd(new Date(Date.now() + 14 * 864e5));
          var dueSoon = projs.filter(function (p) {
            return isOpenP(p) && p.expected_end_date && p.expected_end_date <= soon && p.expected_end_date >= tStr;
          }).length;

          main.innerHTML =
            pageHeader({
              title: ["Customer", "Projects"], desc: DESCS.projects,
              stats: [
                { icon: "folder", value: String(active), raw: active, label: "Active projects" },
                { icon: "check", value: avgPct + "%", raw: avgPct, fmt: "pct", label: "Steps complete overall" },
                { icon: "clock", value: String(dueSoon), raw: dueSoon, label: "Due in the next 14 days" }
              ],
              right: '<button class="jd-primary-btn" data-new-proj>' + icon("plus") + "New project</button>"
            }) +
            '<div class="jd-toolbar">' + searchField("proj", "Search projects…", prState.q) +
            seg("prseg", ["All"].concat(PR_STATUSES), prState.seg) +
            '<div style="margin-left:auto">' + icoBtn("pr-export", "download", "Export CSV", "") + "</div></div>" +
            (visible().length ?
              '<div class="jd-grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(270px,1fr))">' +
              visible().map(function (p, i) {
                var pp = pct(p);
                var col = p.status === "Completed" ? "var(--pine)" : pp > 60 ? "var(--butter)" : "var(--ink)";
                return '<article class="jd-proj-card jd-enter" style="--i:' + i + '" data-proj="' + esc(p.name) + '">' +
                  '<div class="jd-proj-top"><div style="display:flex;gap:10px;min-width:0">' + avatar(p.customer || p.project_name, 34) +
                  '<div style="min-width:0"><div class="nm">' + esc(p.project_name || p.name) + "</div>" +
                  '<div class="cl">' + esc(p.customer || "Internal") + "</div></div></div>" +
                  statusChip(p.status || "Open") + "</div>" +
                  '<div class="jd-proj-body">' + ringSm(pp, col) +
                  '<div class="jd-proj-meta" style="flex:1;min-width:0">' +
                  "<div><b>" + pp + "%</b> of work done</div>" +
                  "<div>Due " + esc(fmtDate(p.expected_end_date)) + "</div>" +
                  '<div class="jd-prob-track" style="margin-top:4px"><div class="jd-prob-fill" style="width:' + pp + "%;background:" + col + '"></div></div>' +
                  "</div></div></article>";
              }).join("") + "</div>"
              : emptyState("No matching projects", "Adjust filters or start a new project.",
                '<button class="jd-primary-btn" data-new-proj>' + icon("plus") + "New project</button>"));
          CRM.enhanceCounters(main);
        }

        paint();
        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { prState.seg = s.getAttribute("data-v"); paint(); return; }
          if (e.target.closest("[data-new-proj]")) { newProject(); return; }
          if (e.target.closest('[data-p="pr-export"]')) {
            CRM.exportCSV("projects", visible().map(function (p) {
              return { project: p.project_name || p.name, customer: p.customer, status: p.status, progress: pct(p), due: p.expected_end_date };
            }));
            return;
          }
          var card = e.target.closest("[data-proj]");
          if (card) {
            var p = projs.filter(function (x) { return x.name === card.getAttribute("data-proj"); })[0];
            if (p) openProj(p);
          }
        });
        var sf = main.querySelector("[data-search]");
        if (sf) sf.addEventListener("input", function () {
          prState.q = sf.value;
          var pos = sf.selectionStart; paint();
          var ni = main.querySelector("[data-search]");
          if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        CRM.exportRows = function () {
          CRM.exportCSV("projects", visible().map(function (p) {
            return { project: p.project_name || p.name, customer: p.customer, status: p.status, progress: pct(p), due: p.expected_end_date };
          }));
        };

        var pend = CRM.takePending();
        if (pend && pend.doctype === "Project") {
          var pp = projs.filter(function (x) { return x.name === pend.name; })[0];
          if (pp) openProj(pp);
        }
      });
    }
  };
  /* ============================================================
     PAGE: Operations
     ============================================================ */
  var opState = { q: "", seg: "Items" };
  CRM.pages.operations = {
    render: function (main) {
      Promise.all([
        list("Item", { fields: ["name", "item_name", "item_group", "stock_uom", "valuation_rate"], limit_page_length: 100 }).catch(function () { return []; }),
        list("Delivery Note", { fields: ["name", "customer", "status", "grand_total", "posting_date"], order_by: "posting_date desc", limit_page_length: 100 }).catch(function () { return []; }),
        list("POS Invoice", { fields: ["name", "customer", "grand_total", "status", "posting_date"], order_by: "posting_date desc", limit_page_length: 100 }).catch(function () { return []; }),
        list("Warranty Claim", { fields: ["name", "customer", "status", "complaint_date"], limit_page_length: 50 }).catch(function () { return []; })
      ]).then(function (r) {
        var items = r[0], dns = r[1], pos = r[2], claims = r[3];

        function visible() {
          var q = opState.q.toLowerCase();
          if (opState.seg === "Items") return items.filter(function (i) { return (i.item_name + " " + i.name).toLowerCase().indexOf(q) >= 0; });
          if (opState.seg === "Delivery") return dns.filter(function (d) { return (d.customer + " " + d.name).toLowerCase().indexOf(q) >= 0; });
          if (opState.seg === "POS") return pos.filter(function (p) { return (p.customer + " " + p.name).toLowerCase().indexOf(q) >= 0; });
          return claims.filter(function (c) { return (c.customer + " " + c.name).toLowerCase().indexOf(q) >= 0; });
        }

        function paint() {
          var vis = visible();
          main.innerHTML =
            pageHeader({
              title: ["Business", "Operations"], desc: "Manage items, deliveries, and retail transactions.",
              stats: [
                { icon: "layers", value: String(items.length), label: "Items in catalog" },
                { icon: "send", value: String(dns.filter(function(d){return d.status!=="Completed";}).length), label: "Open deliveries" },
                { icon: "dollar", value: String(pos.length), label: "POS invoices" }
              ]
            }) +
            '<div class="jd-toolbar">' + searchField("op", "Search " + opState.seg.toLowerCase() + "…", opState.q) +
            seg("opseg", ["Items", "Delivery", "POS", "Maintenance"], opState.seg) +
            "</div>" +
            panel(
              phead(opState.seg) +
              '<div class="jd-table-wrap"><table class="jd-table"><thead><tr>' +
              (opState.seg === "Items" ? "<th>Item</th><th>Group</th><th>UOM</th><th class='cell-num'>Rate</th>" :
               opState.seg === "Delivery" ? "<th>ID</th><th>Customer</th><th>Date</th><th>Status</th>" :
               opState.seg === "POS" ? "<th>ID</th><th>Customer</th><th>Date</th><th class='cell-num'>Total</th>" :
               "<th>ID</th><th>Customer</th><th>Date</th><th>Status</th>") +
              "</tr></thead><tbody>" +
              vis.map(function (v) {
                if (opState.seg === "Items") return '<tr class="is-clickable" data-app-url="/app/item/' + esc(v.name) + '"><td class="cell-main">' + esc(v.item_name || v.name) + '</td><td class="cell-muted">' + esc(v.item_group) + '</td><td class="cell-muted">' + esc(v.stock_uom) + '</td><td class="cell-num">' + money(v.valuation_rate) + '</td></tr>';
                if (opState.seg === "Delivery") return '<tr class="is-clickable" data-app-url="/app/delivery-note/' + esc(v.name) + '"><td class="cell-main">' + esc(v.name) + '</td><td class="cell-muted">' + esc(v.customer) + '</td><td class="cell-muted">' + esc(fmtDate(v.posting_date)) + '</td><td>' + statusChip(v.status) + '</td></tr>';
                if (opState.seg === "POS") return '<tr class="is-clickable" data-app-url="/app/pos-invoice/' + esc(v.name) + '"><td class="cell-main">' + esc(v.name) + '</td><td class="cell-muted">' + esc(v.customer) + '</td><td class="cell-muted">' + esc(fmtDate(v.posting_date)) + '</td><td class="cell-num">' + money(v.grand_total) + '</td></tr>';
                return '<tr class="is-clickable" data-app-url="/app/warranty-claim/' + esc(v.name) + '"><td class="cell-main">' + esc(v.name) + '</td><td class="cell-muted">' + esc(v.customer) + '</td><td class="cell-muted">' + esc(fmtDate(v.complaint_date)) + '</td><td>' + statusChip(v.status) + '</td></tr>';
              }).join("") +
              "</tbody></table></div>" +
              (vis.length ? "" : emptyState("No matching records", "Adjust your search or filters."))
            );
          CRM.enhanceCounters(main);
        }

        paint();
        main.addEventListener("click", function (e) {
          var s = e.target.closest("[data-seg] [data-v]");
          if (s) { opState.seg = s.getAttribute("data-v"); paint(); return; }
          var row = e.target.closest("[data-app-url]");
          if (row) { window.frappe.set_route(row.getAttribute("data-app-url")); }
        });
        var sf = main.querySelector("[data-search]");
        if (sf) sf.addEventListener("input", function () {
          opState.q = sf.value;
          var pos = sf.selectionStart; paint();
          var ni = main.querySelector("[data-search]");
          if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); }
        });
      });
    }
  };

  /* ============================================================
     PAGE: Settings
     ============================================================ */
  CRM.pages.settings = {
    render: function (main) {
      var groups = [
        {
          title: "CRM Configuration",
          items: [
            { label: "CRM Settings", desc: "Global CRM behavior and defaults", url: "/app/crm-settings" },
            { label: "SMS Settings", desc: "Configure SMS gateways and templates", url: "/app/sms-settings" },
            { label: "Email Account", desc: "Set up incoming/outgoing email", url: "/app/email-account" }
          ]
        },
        {
          title: "Sales Masters",
          items: [
            { label: "Lead Source", desc: "Manage where leads come from", url: "/app/lead-source" },
            { label: "Sales Stage", desc: "Define pipeline stages", url: "/app/sales-stage" },
            { label: "Territory", desc: "Group customers by region", url: "/app/territory" },
            { label: "Sales Person", desc: "Manage your sales team", url: "/app/sales-person" }
          ]
        },
        {
          title: "System Setup",
          items: [
            { label: "User List", desc: "Manage system users and roles", url: "/app/user" },
            { label: "Role Permissions", desc: "Control data access", url: "/app/role-permission-manager" }
          ]
        }
      ];

      main.innerHTML =
        pageHeader({
          title: ["CRM", "Settings"], desc: "Configure your sales workspace and team defaults.",
          stats: [
            { icon: "help", value: "System", label: "Configuration" }
          ]
        }) +
        '<div class="jd-grid-3">' +
        groups.map(function (g) {
          return panel(
            phead(g.title) +
            '<div class="jd-gap-list">' +
            g.items.map(function (it) {
              return '<div class="jd-link-row" data-app-url="' + it.url + '"><span><b>' + esc(it.label) + '</b><div class="m">' + esc(it.desc) + '</div></span>' + icon("arrow_ur", "jd-mut") + '</div>';
            }).join("") +
            '</div>'
          );
        }).join("") +
        '</div>';

      main.addEventListener("click", function (e) {
        var row = e.target.closest("[data-app-url]");
        if (row) { window.frappe.set_route(row.getAttribute("data-app-url")); }
      });
    }
  };
})();
