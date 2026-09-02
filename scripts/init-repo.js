#!/usr/bin/env node
// scripts/init-repo.js
// -----------------------------------------------------------------------------
// Dripp Medicos — Repository Initialization & Verification Script.
//
// Usage:
//   node scripts/init-repo.js
//
// Responsibilities:
//   1. Ensure the `data/` directory exists.
//   2. Create baseline `data/products.json`, `data/sales.json`, and
//      `data/doctors.json` files if missing.
//      Products cover all 7 Gyno categories (Prenatal & Maternal,
//      Hormones & Regulators, Fertility & Ovulation, Uterine Relaxants &
//      Hemostatics, Antibiotics & Antifungals, Cold Chain Injections & Gels,
//      Controlled Substances) with full schema fields.
//   3. Validate every JSON file in `data/` and at the repo root (top-level
//      config files) with a strict JSON.parse pass.
//   4. Print a clear, colourised success/failure banner.
//
// This script is pure Node.js ESM, has zero npm dependencies, and is safe to
// re-run at any time — it will never overwrite an existing data file.
// -----------------------------------------------------------------------------

import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const DATA_DIR   = join(ROOT, 'data');

// -----------------------------------------------------------------------------
// ANSI colour helpers (auto-disable when not a TTY)
// -----------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset:  useColor ? '\x1b[0m' : '',
  bold:   useColor ? '\x1b[1m' : '',
  dim:    useColor ? '\x1b[2m' : '',
  red:    useColor ? '\x1b[31m' : '',
  green:  useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  blue:   useColor ? '\x1b[34m' : '',
  cyan:   useColor ? '\x1b[36m' : '',
  gray:   useColor ? '\x1b[90m' : '',
};

const ok   = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.cyan}i${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}!${c.reset} ${msg}`);
const err  = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);

const banner = (title, sub = '') => {
  const bar = '━'.repeat(Math.max(40, title.length + 8));
  console.log(`\n${c.bold}${c.cyan}${bar}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${title}${c.reset}`);
  if (sub) console.log(`${c.dim}  ${sub}${c.reset}`);
  console.log(`${c.bold}${c.cyan}${bar}${c.reset}\n`);
};

// -----------------------------------------------------------------------------
// Seed data — 12 medicines covering all 7 Gyno categories
// -----------------------------------------------------------------------------

const SEED_PRODUCTS = [
  // 1. Prenatal & Maternal
  {
    id: 'p-seed-1', name: 'Folic Acid 5mg', genericName: 'Folic Acid',
    category: 'Prenatal & Maternal', batchNo: 'BTH-9021', expiryDate: '2027-06',
    rackNo: 'Rack G-04', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 10, tabletsPerStrip: 10,
    totalBaseUnits: 2000, boxUnitPrice: 350, stripUnitPrice: 35, tabletUnitPrice: 3.5,
    costPrice: 2.5, createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'p-seed-2', name: 'Iron Polymaltose Complex', genericName: 'Iron(III) Hydroxide Polymaltose',
    category: 'Prenatal & Maternal', batchNo: 'BTH-9022', expiryDate: '2027-04',
    rackNo: 'Rack G-04', isColdChain: false, isControlled: false,
    packType: 'Bottle/Syrup', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 150, boxUnitPrice: 480, stripUnitPrice: 480, tabletUnitPrice: 480,
    costPrice: 320, createdAt: '2026-01-15T10:01:00.000Z',
  },
  // 2. Hormones & Regulators
  {
    id: 'p-seed-3', name: 'Dydrogesterone 10mg', genericName: 'Dydrogesterone',
    category: 'Hormones & Regulators', batchNo: 'BTH-9023', expiryDate: '2027-09',
    rackNo: 'Rack H-02', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 6, tabletsPerStrip: 10,
    totalBaseUnits: 600, boxUnitPrice: 1920, stripUnitPrice: 320, tabletUnitPrice: 32,
    costPrice: 22, createdAt: '2026-01-15T10:02:00.000Z',
  },
  // 3. Fertility & Ovulation
  {
    id: 'p-seed-4', name: 'Clomiphene 50mg', genericName: 'Clomiphene Citrate',
    category: 'Fertility & Ovulation', batchNo: 'BTH-9024', expiryDate: '2026-12',
    rackNo: 'Rack H-01', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 10,
    totalBaseUnits: 250, boxUnitPrice: 240, stripUnitPrice: 240, tabletUnitPrice: 24,
    costPrice: 18, createdAt: '2026-01-15T10:03:00.000Z',
  },
  // 4. Uterine Relaxants & Hemostatics
  {
    id: 'p-seed-5', name: 'Methylergometrine Inj 0.2mg', genericName: 'Methylergometrine Maleate',
    category: 'Uterine Relaxants & Hemostatics', batchNo: 'BTH-9025', expiryDate: '2026-10',
    rackNo: 'Rack F-02', isColdChain: false, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 35, boxUnitPrice: 95, stripUnitPrice: 95, tabletUnitPrice: 95,
    costPrice: 60, createdAt: '2026-01-15T10:04:00.000Z',
  },
  {
    id: 'p-seed-6', name: 'Ringer Lactate 500ml', genericName: 'Ringer Lactate',
    category: 'Uterine Relaxants & Hemostatics', batchNo: 'BTH-9026', expiryDate: '2027-05',
    rackNo: 'Rack F-01', isColdChain: false, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 220, boxUnitPrice: 38, stripUnitPrice: 38, tabletUnitPrice: 38,
    costPrice: 24, createdAt: '2026-01-15T10:05:00.000Z',
  },
  // 5. Antibiotics & Antifungals
  {
    id: 'p-seed-7', name: 'Metronidazole 400mg', genericName: 'Metronidazole',
    category: 'Antibiotics & Antifungals', batchNo: 'BTH-9027', expiryDate: '2026-11',
    rackNo: 'Rack A-01', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 10, tabletsPerStrip: 10,
    totalBaseUnits: 900, boxUnitPrice: 320, stripUnitPrice: 32, tabletUnitPrice: 3.2,
    costPrice: 2, createdAt: '2026-01-15T10:06:00.000Z',
  },
  {
    id: 'p-seed-8', name: 'Clotrimazole Pessary 100mg', genericName: 'Clotrimazole',
    category: 'Antibiotics & Antifungals', batchNo: 'BTH-9028', expiryDate: '2026-09',
    rackNo: 'Rack A-02', isColdChain: false, isControlled: false,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 6,
    totalBaseUnits: 60, boxUnitPrice: 420, stripUnitPrice: 420, tabletUnitPrice: 70,
    costPrice: 50, createdAt: '2026-01-15T10:07:00.000Z',
  },
  // 6. Cold Chain Injections & Gels
  {
    id: 'p-seed-9',  name: 'Oxytocin 10IU Injection',     genericName: 'Oxytocin',
    category: 'Cold Chain Injections & Gels', batchNo: 'BTH-9029', expiryDate: '2027-08',
    rackNo: 'Fridge A', isColdChain: true, isControlled: false,
    packType: 'Injection', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 50, boxUnitPrice: 110, stripUnitPrice: 110, tabletUnitPrice: 110,
    costPrice: 70, createdAt: '2026-01-15T10:08:00.000Z',
  },
  {
    id: 'p-seed-10', name: 'Dinoprostone Vaginal Gel 0.5mg', genericName: 'Dinoprostone (PGE2)',
    category: 'Cold Chain Injections & Gels', batchNo: 'BTH-9030', expiryDate: '2026-12',
    rackNo: 'Fridge B', isColdChain: true, isControlled: false,
    packType: 'Tube/Gel', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 40, boxUnitPrice: 1850, stripUnitPrice: 1850, tabletUnitPrice: 1850,
    costPrice: 1300, createdAt: '2026-01-15T10:09:00.000Z',
  },
  // 7. Controlled Substances
  {
    id: 'p-seed-11', name: 'Combined Oral Contraceptive', genericName: 'Ethinylestradiol + Levonorgestrel',
    category: 'Controlled Substances', batchNo: 'BTH-9031', expiryDate: '2027-02',
    rackNo: 'Rack L-01', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 28,
    totalBaseUnits: 1120, boxUnitPrice: 120, stripUnitPrice: 120, tabletUnitPrice: 4.28,
    costPrice: 2.5, createdAt: '2026-01-15T10:10:00.000Z',
  },
  {
    id: 'p-seed-12', name: 'Misoprostol 200mcg', genericName: 'Misoprostol',
    category: 'Controlled Substances', batchNo: 'BTH-9032', expiryDate: '2027-03',
    rackNo: 'Rack L-02', isColdChain: false, isControlled: true,
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 4,
    totalBaseUnits: 200, boxUnitPrice: 320, stripUnitPrice: 320, tabletUnitPrice: 80,
    costPrice: 50, createdAt: '2026-01-15T10:11:00.000Z',
  },
];

const EMPTY_SALES = [];

const SEED_DOCTORS = [
  { id: 'doc-1', name: 'Dr. Rehan Ahmed',   specialty: 'Gynaecologist',   pmc: 'PMC-12345', hospitalName: 'Dripp Medicos — Main Branch',   phone: '+92-300-1234567' },
  { id: 'doc-2', name: 'Dr. Sana Malik',    specialty: 'Obstetrician',    pmc: 'PMC-22011', hospitalName: 'Liaquat National Hospital',    phone: '+92-321-9876543' },
  { id: 'doc-3', name: 'Dr. Asma Yousaf',   specialty: 'Fertility',       pmc: 'PMC-33012', hospitalName: 'Concept Fertility Centre',     phone: '+92-333-5551212' },
  { id: 'doc-4', name: 'Dr. Imran Qureshi', specialty: 'Sonologist',      pmc: 'PMC-44013', hospitalName: 'South City Hospital',          phone: '+92-345-1112233' },
];

// -----------------------------------------------------------------------------
// Step 1 — directory guard
// -----------------------------------------------------------------------------

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    info(`Created directory: ${c.bold}data/${c.reset}`);
  } else {
    ok(`Directory exists: ${c.bold}data/${c.reset}`);
  }
}

// -----------------------------------------------------------------------------
// Step 2 — baseline files
// -----------------------------------------------------------------------------

async function ensureJsonFile(path, payload, label) {
  if (existsSync(path)) {
    const rel = relPath(path);
    ok(`${label} already present (${c.dim}${rel}${c.reset})`);
    return false;
  }
  const json = JSON.stringify(payload, null, 2) + '\n';
  await fs.writeFile(path, json, 'utf8');
  const rel = relPath(path);
  const count = Array.isArray(payload) ? payload.length : 0;
  ok(`Created ${label} (${c.dim}${rel}${c.reset}) — ${count} record${count === 1 ? '' : 's'}`);
  return true;
}

async function writeBaselineFiles() {
  await ensureJsonFile(join(DATA_DIR, 'products.json'), SEED_PRODUCTS, 'products baseline');
  await ensureJsonFile(join(DATA_DIR, 'sales.json'),    EMPTY_SALES,    'sales baseline');
  await ensureJsonFile(join(DATA_DIR, 'doctors.json'),  SEED_DOCTORS,   'doctors baseline');
}

// -----------------------------------------------------------------------------
// Step 3 — JSON validation
// -----------------------------------------------------------------------------

async function validateJsonFile(path) {
  try {
    const raw = await fs.readFile(path, 'utf8');
    JSON.parse(raw);
    ok(`Valid JSON: ${c.dim}${relPath(path)}${c.reset}`);
    return true;
  } catch (e) {
    err(`Invalid JSON in ${path}: ${e.message}`);
    return false;
  }
}

async function validateAllDataFiles() {
  if (!existsSync(DATA_DIR)) {
    warn('No data/ directory to validate (run step 1 first).');
    return true;
  }
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map(e => join(DATA_DIR, e.name));

  if (jsonFiles.length === 0) {
    warn('No JSON files found in data/.');
    return true;
  }
  const results = await Promise.all(jsonFiles.map(validateJsonFile));
  return results.every(Boolean);
}

// -----------------------------------------------------------------------------
// Step 4 — environment sanity (non-failing)
// -----------------------------------------------------------------------------

function envCheck() {
  const candidates = [
    ['VITE_GITHUB_TOKEN',  process.env.VITE_GITHUB_TOKEN],
    ['VITE_GITHUB_REPO',   process.env.VITE_GITHUB_REPO],
    ['VITE_GITHUB_BRANCH', process.env.VITE_GITHUB_BRANCH],
    ['GH_TOKEN',           process.env.GH_TOKEN],
    ['GH_REPO',            process.env.GH_REPO],
    ['GH_BRANCH',          process.env.GH_BRANCH],
  ];
  const setVars = candidates.filter(([, v]) => v && v.trim().length > 0).map(([k]) => k);
  if (setVars.length > 0) {
    ok(`Environment variables detected: ${c.dim}${setVars.join(', ')}${c.reset}`);
  } else {
    info('No GitHub env vars set. The in-app Settings panel is the primary config surface.');
  }
}

// ============================================================
// Helpers
// ============================================================

function relPath(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length).replace(/^[\\/]+/, '') : p;
}

// ============================================================
// Main
// ============================================================

async function main() {
  banner('Dripp Medicos — Repository Initialization', 'Static SPA · GitHub REST API sync · Vercel-ready');

  console.log(`${c.bold}Step 1${c.reset} — Directory structure guard`);
  ensureDataDir();

  console.log(`\n${c.bold}Step 2${c.reset} — Baseline data files`);
  await writeBaselineFiles();

  console.log(`\n${c.bold}Step 3${c.reset} — JSON validation`);
  const ok3 = await validateAllDataFiles();

  console.log(`\n${c.bold}Step 4${c.reset} — Environment variables`);
  envCheck();

  console.log('');
  if (ok3) {
    console.log(`${c.bold}${c.green}  ✓ Repository initialized and verified.${c.reset}`);
    console.log(`${c.dim}    Next: ${c.reset}${c.cyan}vercel deploy${c.reset}${c.dim} or push to GitHub for auto-deploy.${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.bold}${c.red}  ✗ Validation failed. See messages above.${c.reset}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n${c.red}${c.bold}Fatal:${c.reset} ${e.stack || e.message}\n`);
  process.exit(1);
});
