# Dripp Medicos

> **Hospital-based Gynecological, Obstetrics & Maternal Health Pharmacy POS.**
> 100% static SPA · Zero-backend · Serverless data layer via GitHub REST API · Vercel-ready.

[![Status](https://img.shields.io/badge/status-production--ready-10b981?style=flat-square)](#)
[![Stack](https://img.shields.io/badge/stack-vanilla%20js%20%7C%20tailwind%20%7C%20github%20api-0ea5e9?style=flat-square)](#)
[![Hosting](https://img.shields.io/badge/hosting-vercel-000?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-proprietary-6366f1?style=flat-square)](#)

---

## 1 · Executive Summary

**Dripp Medicos** is a high-density, low-latency Point-of-Sale terminal purpose-built for **Gynecological, Obstetrics, and Women's Health pharmacies** attached to hospitals, fertility clinics, and maternal-care centres.

The entire application ships as a single static page that reads from and writes to JSON files (`data/products.json`, `data/sales.json`, `data/doctors.json`) stored directly in a GitHub repository. There is **no API server, no database cluster, no Docker image, no build pipeline**. The browser is the runtime, GitHub is the database, and the URL is the deployment.

### Gyno POS Domain Features

- **Multi-Tier Packaging Engine** — every product stores `stripsPerBox`, `tabletsPerStrip`, and `totalBaseUnits` (the lowest common unit: a single loose tablet, an ampoule, or a millilitre). Cashiers sell in **Box / Strip (Patta) / Loose Tablet / Ampoule** with per-unit pricing auto-derived from box price. Stock deduction always happens in base units, so a sale of "1 Box" of 10×10 strips removes exactly 100 base units.
- **Cold-Chain Refrigeration Tracking** ($2°C–8°C$) — products flagged `isColdChain: true` display a snowflake badge in inventory, the POS card, and the dashboard Cold-Chain Monitor. When a cold-chain item is sold, the 80 mm thermal receipt auto-prints a `❄️ COLD CHAIN ITEMS — Must be refrigerated immediately (2°C – 8°C)` warning.
- **Controlled Substances & Narcotics Guard** — products flagged `isControlled: true` (e.g. oral contraceptives, clomiphene, misoprostol) automatically convert the Doctor and Patient CNIC/Phone fields into **REQUIRED** purple-highlighted inputs the moment they enter the cart. The `Complete Sale & Print Receipt` button refuses to fire until both fields are filled.
- **80 mm Thermal Receipt Engine** — print-only CSS scoped to a hidden `#thermal-receipt` container; the modal shows the rendered receipt and `window.print()` auto-fires. Every sale can be **reprinted** from the Sales view without re-deducting stock.
- **Dual-Sync Architecture** — every mutation runs the same three-step pattern:
  1. **In-memory state** updated instantly.
  2. **LocalStorage** write with 0 ms UI latency.
  3. **Async background `PUT` to GitHub REST API** with cached SHA. On HTTP 409 (SHA conflict) the engine automatically re-fetches the latest SHA and retries once.

### Other highlights

- **7 Gyno categories** — *Prenatal & Maternal · Hormones & Regulators · Fertility & Ovulation · Uterine Relaxants & Hemostatics · Antibiotics & Antifungals · Cold Chain Injections & Gels · Controlled Substances*.
- **Status Badge Engine** — automatic *Low Stock* (≤ 50 base units OR ≤ 10 boxes), *Expiring Soon* (≤ 60 days), *Expired* (sale-blocked) badges; expired SKUs are greyed out at the POS layer.
- **Doctor Directory** with PMC/PMDC registration numbers, synced via `data/doctors.json`.
- **Hash-based SPA router** — zero dependencies, no React/Vue; native `<a href="#route">` with a 7-line custom router.
- **Dark / Light mode** with persistent preference, cashier popover, header status badge (`Synced · Syncing… · Sync Error · Offline`).
- **Emergency Backup & Sync** — Force Pull, Force Push, full-state export, JSON restore.

---

## 2 · Directory Structure

The repository contains exactly **18 production files** — no generated artefacts, no `node_modules`, no build output.

```
dripp-medicos/
├── index.html                          # SPA shell, Tailwind CDN, sidebar & header
├── vercel.json                         # SPA routing + security/caching headers
├── .env.example                        # GH_TOKEN / GH_REPO / GH_BRANCH template
├── README.md
│
├── data/                               # Serverless "database" (synced via GitHub API)
│   ├── products.json                   # 12 Gyno medicines, full new schema
│   ├── sales.json                      # Transaction log (empty by default)
│   └── doctors.json                    # Doctor directory
│
├── scripts/
│   └── init-repo.js                    # Zero-dep Node init/verification script
│
└── js/                                 # Pure ES6 modules — no bundler
    ├── app.js                          # Boot sequence + hash router
    ├── config.js                       # LS keys, 7 categories, packaging helpers
    ├── github.js                       # REST API engine: fetch + commit + SHA + test
    ├── state.js                        # Reactive store, dual-sync, schema migration
    ├── ui.js                           # Theme, sidebar, clock, toast, modal, router
    │
    └── views/
        ├── dashboard.js                # KPIs · 7-day revenue · top sellers · cold-chain monitor
        ├── pos.js                      # Multi-unit billing · unit selector · controlled guard · 80mm receipt
        ├── inventory.js                # CRUD + inline stock adjust + 7 status badges
        ├── sales.js                    # Filterable log · CSV export · 80mm reprint
        └── settings.js                 # GitHub creds · Doctor directory · Emergency backup
```

**File count by directory**

| Directory          | Files | Purpose                                |
| ------------------ | ----- | -------------------------------------- |
| root               | 4     | shell, config, docs, env template      |
| `data/`            | 3     | serverless JSON database               |
| `scripts/`         | 1     | local init & verification              |
| `js/`              | 5     | core runtime + state                   |
| `js/views/`        | 5     | one file per page                      |
| **Total**          | **18**| zero-dependency, zero-build            |

---

## 3 · Quick Start

### Local development

```bash
# 1. Clone
git clone https://github.com/<your-username>/dripp-medicos.git
cd dripp-medicos

# 2. Initialise / verify the repo (creates data/ and seeds if empty)
node scripts/init-repo.js

# 3. Serve the static folder with any HTTP server
npx serve .
# or
python3 -m http.server 8080

# 4. Open http://localhost:8080
```

### Cloud data sync

1. Open the app → click **System Settings** in the sidebar.
2. Fill in the four GitHub fields:
   - **Username** — your GitHub handle.
   - **Repository** — e.g. `dripp-medicos` (must already contain `data/products.json`, `data/sales.json`, and `data/doctors.json`).
   - **Branch** — `main` (default).
   - **Personal Access Token** — Fine-grained PAT with **Contents: Read & Write** on the target repo.
3. Click **Test connection** to verify, then **Save credentials**.
4. Click **Pull from GitHub** to seed the app from your repo.

> Generate a token at **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.

---

## 4 · Automated Deployment to Vercel

### One-click import

1. Push the repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — Dripp Medicos"
   git branch -M main
   git remote add origin https://github.com/<you>/dripp-medicos.git
   git push -u origin main
   ```
2. Visit **https://vercel.com/new** and import the repository.
3. Vercel auto-detects the static nature. No build command, no output directory override needed — the included `vercel.json` is enough.
4. Click **Deploy**. The terminal is live at `https://dripp-medicos-<hash>.vercel.app`.

### Vercel CLI

```bash
npm i -g vercel
vercel login
vercel                # preview deployment
vercel --prod         # production deployment
```

### Environment variables (optional)

The in-app **System Settings** panel is the primary configuration surface, so environment variables are only required for headless scripts. In the **Vercel dashboard → Project → Settings → Environment Variables**:

| Variable             | Example value                  | Required scope |
| -------------------- | ------------------------------ | -------------- |
| `VITE_GITHUB_TOKEN`  | `github_pat_11ABC...xyz`       | Production     |
| `VITE_GITHUB_REPO`   | `your-username/dripp-medicos`  | Production     |
| `VITE_GITHUB_BRANCH` | `main`                         | Production     |
| `GH_TOKEN`           | *(alias of VITE_GITHUB_TOKEN)* | Production     |
| `GH_REPO`            | *(alias of VITE_GITHUB_REPO)*  | Production     |
| `GH_BRANCH`          | *(alias of VITE_GITHUB_BRANCH)*| Production     |
| `VITE_DEFAULT_CASHIER` | `Front Desk` *(optional)*    | Production     |

### Caching strategy (from `vercel.json`)

| Path                                | Cache-Control                                  | Why                                |
| ----------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `/*.js`, `/*.css`, fonts, images    | `public, max-age=31536000, immutable`          | Hashed assets, never re-fetched    |
| `/index.html`                       | `no-store, no-cache, must-revalidate`          | Always ship the latest SPA shell   |
| `/data/products.json`               | `no-store, no-cache, must-revalidate`          | Prevent stale inventory            |
| `/data/sales.json`                  | `no-store, no-cache, must-revalidate`          | Prevent stale sales log            |
| `/data/doctors.json`                | `no-store, no-cache, must-revalidate`          | Prevent stale doctor directory     |
| All other paths                     | security headers + SPA rewrite to `/index.html`| Deep-link safe for hard refresh    |

All unknown paths rewrite to `/index.html` so the hash router works on hard refreshes.

---

## 5 · Data Schema

### `data/products.json` — array of medicine records

```jsonc
{
  "id": "p-seed-1",                 // internal UUID (prefix p-)
  "name": "Folic Acid 5mg",
  "genericName": "Folic Acid",
  "category": "Prenatal & Maternal", // one of 7 Gyno categories
  "batchNo": "BTH-9021",
  "expiryDate": "2027-06",           // YYYY-MM
  "rackNo": "Rack G-04",             // or "Fridge A" for cold-chain
  "isColdChain": false,
  "isControlled": false,
  "packType": "Box",                 // Box | Bottle/Syrup | Injection | Tube/Gel
  "stripsPerBox": 10,
  "tabletsPerStrip": 10,
  "totalBaseUnits": 2000,            // stock in lowest unit (single tablet, ampoule, ml)
  "boxUnitPrice": 350,
  "stripUnitPrice": 35,              // auto-derived if blank
  "tabletUnitPrice": 3.5,            // auto-derived if blank
  "costPrice": 2.5,                  // cost per base unit
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-02-01T08:14:22.000Z"
}
```

### `data/sales.json` — array of completed transactions

```jsonc
{
  "saleId": "INV-20260215-7391",     // INV-YYYYMMDD-XXXX
  "timestamp": "2026-02-15T14:33:18.000Z",
  "cashier": "Aisha Khan",
  "doctor": "Dr. Rehan Ahmed",
  "patient": {
    "name":  "Sana Tariq",
    "phone": "+92-300-1234567",
    "cnic":  "42101-1234567-8"
  },
  "items": [
    {
      "id": "p-seed-1",
      "name": "Folic Acid 5mg",
      "batchNo": "BTH-9021",
      "unit": "Strip",            // Box | Strip | Tablet
      "qty": 2,                   // quantity in sale units
      "baseUnits": 20,            // = qty × tabletsPerStrip — what gets deducted from stock
      "unitPrice": 35,
      "subtotal": 70,
      "isColdChain": false,
      "isControlled": false
    }
  ],
  "grossTotal":  70,
  "discount":    0,
  "discountMode": "flat",          // "flat" | "percent"
  "netTotal":    70,
  "cashReceived": 100,
  "changeDue":   30,
  "payment": "cash"
}
```

### `data/doctors.json` — array of doctor records

```jsonc
{
  "id": "doc-1",
  "name": "Dr. Rehan Ahmed",
  "specialty": "Gynaecologist",
  "pmc": "PMC-12345",               // PMC/PMDC registration number
  "hospitalName": "Dripp Medicos — Main Branch",
  "phone": "+92-300-1234567"
}
```

---

## 6 · End-to-End Live QA Scenarios

Run these five scenarios against a freshly deployed instance to validate the full system.

### Scenario 1 — Multi-Unit Sale (Box + Strip + Loose Tablet in one bill)

1. Open **Cash Counter**.
2. Click the **Folic Acid 5mg** card → modal asks for sale unit.
3. Choose **Box**, qty `2` → tap *Add to Bill*.
4. Click **Folic Acid 5mg** again → choose **Strip**, qty `5` → *Add to Bill*.
5. Click **Folic Acid 5mg** once more → choose **Tablet**, qty `12` → *Add to Bill*.
6. **Expected**: cart shows three rows (`2 Box`, `5 Strip`, `12 Tablet`), each with the correct unit price. Gross = `2×350 + 5×35 + 12×3.5 = 917`.
7. Type `1000` into *Cash Received* → **Change Due** turns green and shows `83.00`.
8. Click **Complete Sale & Print Receipt** → thermal receipt prints with three unit-aware line items.

**Pass criteria**: receipt Net Payable = `₨917.00`, Change = `₨83.00`.

### Scenario 2 — Controlled-Substance Guard Blocks Checkout

1. Open **Cash Counter**.
2. Click **Combined Oral Contraceptive** (purple 🔒 `PRESCRIPTION REQUIRED` badge on the card).
3. **Expected**: the Doctor and Patient CNIC inputs in the right panel are now highlighted purple and marked `* REQUIRED`.
4. Leave both fields blank, type `200` into *Cash Received*, click **Complete Sale**.
5. **Expected**: warning toast `Doctor name is required for controlled substances.`
6. Fill the Doctor name only, leave CNIC blank, retry → warning toast `Patient CNIC is required for controlled substances.`
7. Fill both, retry → sale completes and prints. The thermal receipt shows a `[Rx PRESCRIPTION]` tag under the controlled item.

**Pass criteria**: checkout is impossible until BOTH Doctor and Patient CNIC are populated; receipt clearly flags the controlled item.

### Scenario 3 — Cold-Chain Receipt Print Warning

1. Open **Cash Counter**, search `Oxytocin`.
2. Click the **Oxytocin 10IU Injection** card (snowflake ❄️ badge on the card) → add 1 unit.
3. Checkout immediately.
4. **Expected**: thermal receipt contains a centred bold line:
   ```
   ❄️ COLD CHAIN ITEMS
   Must be refrigerated immediately (2°C – 8°C)
   ```
   …inserted between the totals block and the footer. The line item itself shows a small `❄️` next to the item name.
5. Switch to **Dashboard** → **Cold Chain Monitor** shows Oxytocin with a green OK chip. Decrement stock by hand to ≤ 50 base units and refresh → the chip turns rose with `LOW` and a red border on the row.

**Pass criteria**: cold-chain storage warning is present on every receipt that includes a cold-chain SKU; Cold Chain Monitor reflects low-stock state.

### Scenario 4 — Stock Auto-Deduction Across Multiple Units

1. Open **Inventory**, find **Folic Acid 5mg** → note its current stock display, e.g. `20 Boxes, 0 Strips, 0 Tablets` (i.e. 2000 base units).
2. Open **Cash Counter**, add 1 Box, 5 Strips, 12 Tablets of the same product.
3. Complete the sale.
4. Re-open **Inventory** → expected stock is now `19 Boxes, 5 Strips, 12 Tablets` (1900 + 50 + 12 = 1962 base units deducted? actually 100 + 50 + 12 = 162 deducted → 2000 − 162 = 1838 = 18 Boxes, 3 Strips, 8 Tablets).
5. Open **Sales & Reports** → top row of the table is the new transaction with three line items.

**Pass criteria**: stock dropped by exactly 162 base units; sale appears in the sales log with three line items, each with `unit` populated.

### Scenario 5 — Emergency Export & JSON Restore

1. Open **System Settings** → **Export Local State (.json)** → a file named `dripp-medicos-state-YYYY-MM-DD.json` downloads containing all products, sales, and doctors.
2. Open **System Settings** → **Clear all local data** → confirm.
3. App reloads with an empty inventory. The Cash Counter and Dashboard are blank.
4. Open **System Settings** → **Import State from .json** → pick the file you downloaded.
5. App reloads. **Inventory**, **Sales**, and **Doctor Directory** are restored to their pre-wipe state.
6. Bonus: while creds are configured, click **Force Push to GitHub** → both `products.json` and `sales.json` are re-committed. Open the GitHub web UI and confirm the file timestamps have updated.

**Pass criteria**: full round-trip restore works without data loss; GitHub `products.json` reflects the latest local state after Force Push.

---

## 7 · Available Scripts

| Command                          | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `node scripts/init-repo.js`      | Create `data/` directory, seed & validate files  |
| `npx serve .`                    | Local static dev server                          |
| `python3 -m http.server 8080`    | Alternative local server                         |
| `vercel`                         | Vercel preview deployment                        |
| `vercel --prod`                  | Vercel production deployment                     |

---

## 8 · Security Notes

- The Personal Access Token is **never** sent anywhere except `api.github.com`.
- Token is stored only in the browser's LocalStorage; clear it via the **Disconnect** button in System Settings or by clearing site data.
- Use a **Fine-grained PAT** scoped to a **single repository** with only **Contents: Read & Write** — never a classic broad-scope token.
- The static hosting surface exposes only the SPA shell, the JSON data files, and the bundled Tailwind CDN. There is no server-side code, so no server-side secrets are required.
- All unknown routes rewrite to `index.html` (SPA support) but the JSON files and the SPA shell are served with `no-store` headers to prevent stale-state issues.

---

## 9 · License

Proprietary — © Dripp Medicos. All rights reserved.

For licensing inquiries, contact the project maintainers via the repository issues page.
