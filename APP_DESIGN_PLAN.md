# JassDBX App Design Plan — one app, one identity

> **Short version (Hinglish):** JassDBX ek ERPNext ke upar bana hua app suite hai. Har module (Sales CRM, HRM, Accounts, Inventory, Purchase, Projects, Manufacturing) ko alag software jaisa dikhna chahiye. Isliye ek hi codebase me har app ka apna route, apna shell, apna colour/token set aur apna page language hoga. Ye file hi single source of truth hai — koi bhi AI ya developer kaam shuru karne se pehle ye padhe, phir `launcher.js` ka `APPS` registry dekhe.

---

## 1. Goal

Each JassDBX app must feel like a separate product:

| Requirement | Meaning in practice |
| --- | --- |
| Separate entry point | One tile in the home launcher + one item in the in-desk app switcher per app. |
| Separate look | Own accent colour, surfaces, density, radius and one signature layout element. |
| Separate navigation language | Sidebar / workspace hero / empty states written for that app, not generic ERPNext copy. |
| Shared engine | Same Frappe/ERPNext/HRMS data, permissions, DocTypes and business logic underneath. |

Non-goal: forking ERPNext, copying Frappe core files into this repo, or duplicating business logic per app.

---

## 2. Hard rules (do not break these)

1. **Never edit** `apps/frappe`, `apps/erpnext`, `apps/hrms` (inside the container) for design. Updates overwrite them.
2. **Never hardcode app routes** outside the `APPS` registry in `launcher.js`. Add a route there instead.
3. **Scope every CSS rule** with either `body.jd-app-<key>` (per-app) or `#jd-crm` / `body.jd-crm-mode` (existing CRM system). No bare element selectors (`h1`, `table`, `.btn`).
4. **No cross-app imports.** `app-themes/hrm.css` must never style accounts, and vice versa.
5. **Presentation only.** Do not change DocType fields, permissions, workflows, naming series or reports to achive a visual change.
6. **Tokens first.** Colours, radius, density and surfaces come from CSS variables, never from one-off hex values sprinkled through selectors.
7. Every per-app theme file must ship **light and dark** values and must respect `prefers-reduced-motion`.
8. Data comes from Frappe APIs/DocTypes. Never ship prototype sample data (`design/src/lib/crm-data.ts`) into a live screen.

---

## 3. Verified current state (as of 2026-10-20)

Live site: `frontend` in `frappe_docker-backend-1` (host port `8081`). Stack: Frappe `16.52.0`, ERPNext `16.51.1`, HRMS `17.0.0-dev`.

| Thing | Status |
| --- | --- |
| Desk app registry | `launcher.js` → `APPS` array (7 apps). |
| Home launcher | `launcher.js` renders tiles at `/desk` and `/app`. |
| In-desk app switcher | `launcher.js` → `.jd-apps-panel` injected into the sidebar's `.standard-items-band` (Frappe v16 has no navbar), styled by `app-shell.css`. A `.jd-apps-nav-item` navbar variant is kept as a fallback for older layouts. **This is the guaranteed link to HRM from every desk page.** |
| HRM workspace | Workspace `HRM App` exists, `public = 1`, `is_hidden = 0`, module `HR Setup`, app `hrms`, icon `people`, 39 links, 4 shortcuts. Route `/desk/hrm-app` returns HTTP 200. The site-level `Dock` record for app `hrms` pins `HRM App` as its first rail entry, so the desk's HR app icon opens `/desk/hrm-app` (not `/desk/hr-setup`). |
| Accounts workspace | Workspace `Accounts App` exists (26 links). Route `/desk/accounts-app`. |
| Per-app mode class | `launcher.js` sets `html.jd-app-<key>` + `body.jd-app-<key>` + `data-jd-app`. |
| Shared desk design | `launcher.css` (design tokens, list/form/sidebar, nav, launcher, full CRM design). |
| CRM design | `crm.css` + `crm-core.js` + `crm-pages.js` are an older custom shell. **Not loaded** by `site_config.json`; the live CRM screens are styled by `launcher.css` under `body.jd-crm-mode`. |
| React prototype | `design/` is a standalone Lovable/TanStack prototype. **Not wired** to live desk routes or data. |
| Deployment boundary | Browser loads `/files/jd/*` from `sites/frontend/public/files/jd/`, not from this repo. Repo files must be copied there and the `rev` in `site_config.json` bumped. |

---

## 4. Architecture

```
Frappe core renderer (never edit)
        │
        ▼
launcher.js  ── app registry (APPS) ──► app switcher + home tiles + mode class
        │
        ▼
body.jd-app-<key>  ──►  app-themes/<key>.css   (colour, density, signature shell)
        │
        ├──► launcher.css   (shared desk shell + full Sales CRM design)
        └──► app-shell.css  (app switcher only)
        │
        ▼
Per-app pages (custom Frappe Pages / DocType overrides) — only when the shell is not enough
```

Layer responsibility:

| Layer | Owns | Files |
| --- | --- | --- |
| 0. Framework | Lists, forms, workspaces, reports, permissions | `/home/frappe/frappe-bench/apps/*` (read only) |
| 1. App registry & shell | Which app owns the page, entry points, theme switch | `launcher.js`, `app-shell.css` |
| 2. Per-app theme | Colour, surfaces, density, radius, one signature element | `app-themes/<key>.css` |
| 3. Per-app pages | Fully custom screens (pipeline board, ledger view, people hub) | Frappe custom app pages / `doctype_js` overrides |

---

## 5. App registry contract

`launcher.js` top of file. One object per app:

```js
{
  key: "hrm",                                  // stable id; also the CSS class suffix
  label: "JassDBX HRM",                        // launcher tile + menu label
  short: "HRM",                                // compact switcher label
  sub: "People, payroll & attendance",         // one-line description
  color: "#1E6E5C",                            // brand dot / tile colour
  href: "/desk/hrm-app",                       // canonical entry route
  routes: ["/desk/hrm-app"],                   // URL prefixes owned by this app
  workspaces: ["HRM App", "Leaves", "Payroll" /* ... */],
  modules: ["HR", "Leaves", "Payroll" /* ... */]  // DocType.module values
}
```

**Route resolution order** (`current_app_key()`):

1. URL prefix match against `routes` (first match wins, so keep specific routes first).
2. Current workspace name against `workspaces` (also handles `/desk/workspaces/<slug>`).
3. Current DocType's `module` against `modules`.
4. No match → generic desk shell (no `jd-app-*` class). This is the safe fallback.

Live examples (verified by running the resolver with a DOM stub):

| URL / route | Result |
| --- | --- |
| `/desk/hrm-app` | `jd-app-hrm` |
| Form `Employee` | `jd-app-hrm` (module `HR`) |
| `/desk/accounts-app` | `jd-app-accounts` |
| List `Sales Invoice` | `jd-app-accounts` (module `Accounts`) |
| `/desk/crm/lead` | `jd-app-sales` + `jd-crm-mode` |
| List `User` | no app class (generic shell) |

> Deliberate choice: business module decides the theme. A Sales Invoice opened outside the CRM routes looks like Accounts, because that is the app that owns the ledger. If a screen must stay in the Sales identity, link to it through `/desk/crm/...` or add an explicit route in the registry.

---

## 6. App identity table

| Key | Entry route | Workspace | Accent (light / dark) | Sidebar tint | Signature element (phase P1+) |
| --- | --- | --- | --- | --- | --- |
| `sales` | `/desk/crm/sales` | `Sales`, `Selling`, `CRM` | `#2F5C50` / existing | `#F8F7F1` | Sales flow strip + module cards (already built) |
| `hrm` | `/desk/hrm-app` | `HRM App` | `#1E6E5C` / `#5EC9A8` | `#F2F9F6` | People-first workspace: headcount hero + team rail |
| `accounts` | `/desk/accounts-app` | `Accounts App` | `#B7791F` / `#F0C05A` | `#FBF7EF` | Ledger look: tabular numerals, sticky totals, compact rows |
| `inventory` | `/desk/stock` | `Stock` | `#6D46A8` / `#B79BEA` | `#F7F3FC` | Stock cards with big numbers, warehouse context |
| `purchase` | `/desk/buying` | `Buying` | `#B23A56` / `#F08FA6` | `#FCF4F6` | Document-first two-column (supplier ↔ order) |
| `projects` | `/desk/projects` | `Projects` | `#0E7C86` / `#5FD0D8` | `#F0F8F9` | Timeline/kanban first, lists secondary |
| `manufacturing` | `/desk/manufacturing` | `Manufacturing` | `#7A5A3A` / `#D2A97D` | `#FAF6F1` | Work-order board with machine/plant context |

Shared tokens every theme file must set:

```css
--jd-app-color      /* app brand colour, used for the page-head rail */
--jd-app-surface    /* tinted sidebar / hero background */
--jd-accent         /* primary buttons, links, active states */
--jd-accent-hover
--jd-accent-soft
```

`launcher.css` still owns the base values on `html.jd-desk-mode`; the app files override them on `body.jd-app-<key>.jd-desk-mode`, so the override only affects that app's pages.

---

## 7. File layout

Repo (source of truth):

```
launcher.js                 app registry, app switcher, mode class, launcher, CRM context
launcher.css                shared desk tokens + shell + full Sales CRM design
app-shell.css               app switcher styles only
app-themes/
  hrm.css                   body.jd-app-hrm ...
  accounts.css              body.jd-app-accounts ...
  inventory.css
  purchase.css
  projects.css
  manufacturing.css
crm.css / crm-core.js / crm-pages.js    legacy custom CRM (not loaded)
design/                     standalone React prototype (not loaded)
```

Deployed copy (what the browser actually gets):

```
sites/frontend/public/files/jd/
  launcher.js
  launcher.css
  app-shell.css
  app-themes/<key>.css
```

`site_config.json` → `app_include_js` / `app_include_css` lists every file with a shared `rev` value. **Any asset change requires a new `rev`.**

---

## 8. Phase plan

### P0 — Registry and links (done 2026-10-20)

- Single `APPS` registry; launcher tiles, sidebar app switcher and user-menu group all read from it.
- `body.jd-app-<key>` mode class with route/workspace/module resolution.
- Per-app theme files with light + dark tokens, a tinted sidebar and a page-head accent rail.
- All assets deployed and served (`/files/jd/...`, HTTP 200), cache rev `jdapps20261020`.

Acceptance: HRM reachable from the launcher and from any desk page via the switcher; each app's page-head rail, sidebar tint and accent differ; generic pages stay untouched.

### P1 — Per-app shell identity

For each app, add to `app-themes/<key>.css`:

1. Page-head treatment (title size/weight, breadcrumb, action button shape).
2. Workspace hero block: title, one-line description, 3–4 key numbers.
3. Sidebar section headers and selected state in the app's language.
4. Sidebar tint + border radius + shadow (use `--jd-app-surface`).

Acceptance: with the same data, a screenshot of HRM vs Accounts vs Inventory is distinguishable with colour removed (density, spacing, header shape differ).

### P2 — List and form density per app

- HRM: taller rows, avatar/initial column, grouped by department.
- Accounts: compact rows, right-aligned tabular amounts, sticky totals footer.
- Inventory: card grid toggle, quantity/UOM emphasis.
- Purchase/Projects/Manufacturing: document/board first, list second.

Implement through CSS scoped to the app plus optional `doctype_list_js` overrides. No DocType schema changes.

### P3 — App-specific pages (only where the shell is not enough)

- Sales CRM: pipeline board and customer 360 (port the `design/` prototype ideas into real Frappe pages).
- HRM: people hub (headcount, attendance today, leave queue).
- Accounts: ledger explorer with running balance.
- Each page lives in a custom Frappe app/page and calls Frappe APIs. Never reuse prototype mock data.

### P4 — Validation and rollout

Run the checklist in section 10 for every app before the phase is called done.

---

## 9. How to add a new app (checklist)

1. Add one entry to `APPS` in `launcher.js` (`key`, `label`, `short`, `sub`, `color`, `href`, `routes`, `workspaces`, `modules`).
2. Create `app-themes/<key>.css` from an existing theme file (hrm.css is the smallest complete example).
3. Add the file to `app_include_css` in `site_config.json` with the current `rev`.
4. Make sure the workspace exists and is `public` (otherwise the tile leads nowhere).
5. Copy `launcher.js`, `site_config.json`, and all CSS to the site (`/files/jd/...`), bump `rev` everywhere, run `bench --site frontend clear-cache`.
6. Verify the resolver: the app's route, its workspace, and one of its DocTypes must all produce `document.body.classList.contains("jd-app-<key>")`.
7. Add the app to the identity table in this file.

---

## 10. Definition of done (per app)

- [ ] Home launcher tile present, correct label/colour/description, opens the right route.
- [ ] Navbar switcher lists the app, highlights it when active, works from any desk page.
- [ ] `body.jd-app-<key>` present on: the workspace, a list, a form, and a report of that app.
- [ ] No `jd-app-<other>` class leaks onto the page.
- [ ] Light and dark mode both pass contrast (4.5:1 for text, 3:1 for UI borders).
- [ ] Keyboard: switcher opens with Enter/Space, closes on Escape/outside click, focus ring visible.
- [ ] Empty, loading and error states use the app's language, not generic copy.
- [ ] Responsive at 360px, 768px, 1280px; no horizontal scroll.
- [ ] Reduced motion honoured.
- [ ] No change to DocTypes, permissions, reports or data.
- [ ] Assets return HTTP 200 from `/files/jd/...` with the current `rev`.

---

## 11. Deploy and cache (exact steps)

```bash
# 1. copy assets into the running site (named volume, docker cp is fine)
docker cp launcher.js        frappe_docker-backend-1:/home/frappe/frappe-bench/sites/frontend/public/files/jd/
docker cp launcher.css       frappe_docker-backend-1:/home/frappe/frappe-bench/sites/frontend/public/files/jd/
docker cp app-shell.css      frappe_docker-backend-1:/home/frappe/frappe-bench/sites/frontend/public/files/jd/
for f in hrm accounts inventory purchase projects manufacturing; do
  docker cp "app-themes/$f.css" \
    "frappe_docker-backend-1:/home/frappe/frappe-bench/sites/frontend/public/files/jd/app-themes/$f.css"
done

# 2. bump rev in sites/frontend/site_config.json (keep the repo copy identical)
#    app_include_js / app_include_css must all use the same rev value

# 3. clear server cache
docker exec frappe_docker-backend-1 bash -lc \
  "cd /home/frappe/frappe-bench && bench --site frontend clear-cache"

# 4. verify
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/files/jd/launcher.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/files/jd/app-themes/hrm.css
```

Do not assume a repo edit is live — the browser reads `/files/jd`, not this repository.

**Bench prerequisite:** `sites/apps.txt` must list every app that is installed on the site (`frappe`, `erpnext`, `hrms`). If `hrms` is missing there, Admin still works (Admin skips permission checks) but every other user gets `500 SessionBootFailed: Module HR not found` while the desk sidebar resolves HR DocTypes. Check with `bench --site frontend list-apps`.

**HRM entry route:** `hrm_dock_link.py` restores the desk HR app link after a rebuild. It sets Workspace `HRM App` to module `HR Setup` and pins `Workspace / HRM App` first on the `hrms` dock, so the HR app icon opens `/desk/hrm-app`. It is idempotent; run it once per fresh site.

---

## 12. Notes and open decisions

- `HRM App` is verified working (`/desk/hrm-app`, 39 links). The sidebar app switcher exists so HRM is reachable even from Accounts or CRM pages without going home first.
- Frappe v16 renders no top navbar; the switcher must be injected after the sidebar exists. `launcher.js` retries on boot, on route change and on its 10s interval so a sidebar re-render cannot remove it permanently.
- `crm.css`, `crm-core.js`, `crm-pages.js` are currently dead assets. Either wire them into the custom app deliberately or delete them in P3; do not edit them expecting a live change.
- The `design/` React prototype stays a reference until P3. It has its own build/deploy and must not be imported by desk CSS.
- Decision needed in P2: should cross-module documents (e.g. Sales Invoice reached from Selling) keep the Sales identity or follow the owning module? Current default = owning module.
- HRM app entry is configured in data, not code: the site `Dock` for app `hrms` starts with `Workspace / HRM App`, and `HRM App` lives in module `HR Setup` because a dock `Workspace` row is dropped when its module has no sidebar. A saved site dock freezes the rail — modules added by a future hrms update must be added through **Manage Dock**, not automatically.
- `UI_REDESIGN_FILE_MAP.md` is the older inventory of *where each screen's code lives*. This file is the *design direction and contract*. Read both, but `APP_DESIGN_PLAN.md` wins on app identity, routes and theming rules.
