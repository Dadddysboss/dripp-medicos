// js/state.js
// Reactive state store with dual-sync (LocalStorage + GitHub commit).
// Subscribers re-render on every commit.

import {
  LS_KEYS, FILES, DEFAULT_PRODUCTS, DEFAULT_SALES, DEFAULT_DOCTORS,
  SYNC, uid, baseUnitsFor,
} from './config.js';

import * as GitHub from './github.js';

// ============================================================
// 1. State shape
// ============================================================

const state = {
  products: [],
  sales: [],
  doctors: [],
  syncStatus: SYNC.IDLE,
  lastSync: null,
  online: navigator.onLine !== false,
  ready: false,
};

const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn(state); } catch (e) { console.error('Subscriber error:', e); }
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

// Read-only shared state reference
export { state };

export function getState() {
  return state;
}

// ============================================================
// 2. Local cache (LocalStorage) read / write
// ============================================================

function loadLocalProducts() {
  try { const raw = localStorage.getItem(LS_KEYS.products); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function loadLocalSales() {
  try { const raw = localStorage.getItem(LS_KEYS.sales); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function loadLocalDoctors() {
  try { const raw = localStorage.getItem(LS_KEYS.doctors); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function persistLocalProducts() { localStorage.setItem(LS_KEYS.products, JSON.stringify(state.products)); }
function persistLocalSales()    { localStorage.setItem(LS_KEYS.sales,    JSON.stringify(state.sales)); }
function persistLocalDoctors()  { localStorage.setItem(LS_KEYS.doctors,  JSON.stringify(state.doctors)); }

// ============================================================
// 3. Sync status badge control
// ============================================================

function setSyncStatus(status) {
  state.syncStatus = status;
  state.lastSync = localStorage.getItem(LS_KEYS.lastSync) || null;

  const dot  = document.getElementById('sync-dot');
  const lbl  = document.getElementById('sync-label');
  const wrap = document.getElementById('sync-badge');
  if (!dot || !lbl || !wrap) { notify(); return; }

  dot.classList.remove('bg-slate-400','bg-emerald-500','bg-amber-500','bg-rose-500','bg-sky-500');
  switch (status) {
    case SYNC.SYNCED:
      dot.classList.add('bg-emerald-500');
      lbl.textContent = 'Synced';
      wrap.classList.remove('bg-amber-100','dark:bg-amber-900/30','bg-rose-100','dark:bg-rose-900/30','bg-sky-50','dark:bg-sky-900/30');
      wrap.classList.add('bg-emerald-50','dark:bg-emerald-900/30','text-emerald-700','dark:text-emerald-300');
      break;
    case SYNC.SYNCING:
      dot.classList.add('bg-sky-500');
      lbl.textContent = 'Syncing…';
      wrap.classList.remove('bg-emerald-50','dark:bg-emerald-900/30','bg-rose-100','dark:bg-rose-900/30','bg-amber-50','dark:bg-amber-900/30');
      wrap.classList.add('bg-sky-50','dark:bg-sky-900/30','text-sky-700','dark:text-sky-300');
      break;
    case SYNC.ERROR:
      dot.classList.add('bg-rose-500');
      lbl.textContent = 'Sync Error';
      wrap.classList.remove('bg-emerald-50','dark:bg-emerald-900/30','bg-sky-50','dark:bg-sky-900/30','bg-amber-50','dark:bg-amber-900/30');
      wrap.classList.add('bg-rose-100','dark:bg-rose-900/30','text-rose-700','dark:text-rose-300');
      break;
    case SYNC.OFFLINE:
      dot.classList.add('bg-amber-500');
      lbl.textContent = 'Offline';
      wrap.classList.remove('bg-emerald-50','dark:bg-emerald-900/30','bg-rose-100','dark:bg-rose-900/30','bg-sky-50','dark:bg-sky-900/30');
      wrap.classList.add('bg-amber-50','dark:bg-amber-900/30','text-amber-700','dark:text-amber-300');
      break;
    default:
      dot.classList.add('bg-slate-400');
      lbl.textContent = state.online ? 'Idle' : 'Offline';
      wrap.classList.remove('bg-emerald-50','dark:bg-emerald-900/30','bg-rose-100','dark:bg-rose-900/30','bg-amber-50','dark:bg-amber-900/30','bg-sky-50','dark:bg-sky-900/30','text-emerald-700','dark:text-emerald-300','text-rose-700','dark:text-rose-300','text-amber-700','dark:text-amber-300','text-sky-700','dark:text-sky-300');
  }

  notify();
}

// ============================================================
// 4. Boot sequence
// ============================================================

export async function bootState() {
  if (state.ready) return state;

  // Load any local cache immediately for instant render.
  const lp = loadLocalProducts();
  const ls = loadLocalSales();
  const ld = loadLocalDoctors();

  if (Array.isArray(lp) && lp.length) state.products = lp;
  else state.products = migrateProductSchema([...DEFAULT_PRODUCTS]);

  if (Array.isArray(ls)) state.sales = ls;
  else state.sales = [];

  if (Array.isArray(ld) && ld.length) state.doctors = ld;
  else state.doctors = [...DEFAULT_DOCTORS];

  // Cashier header
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEYS.cashier) || 'null');
    if (c?.name) {
      const el = document.getElementById('cashier-name');
      if (el) el.textContent = c.name;
      const init = document.getElementById('cashier-initial');
      if (init) init.textContent = (c.name[0] || 'C').toUpperCase();
    }
  } catch {}

  setSyncStatus(SYNC.IDLE);

  if (GitHub.hasCredentials() && navigator.onLine !== false) {
    try {
      setSyncStatus(SYNC.SYNCING);
      const { products, sales, doctors, errors } = await GitHub.fetchAllFromGitHub();
      if (Array.isArray(products)) {
        state.products = migrateProductSchema(products);
        persistLocalProducts();
      }
      if (Array.isArray(sales)) {
        state.sales = sales;
        persistLocalSales();
      }
      if (Array.isArray(doctors)) {
        state.doctors = doctors;
        persistLocalDoctors();
      }
      if (errors && errors.length) console.warn('GitHub fetch warnings:', errors);
      setSyncStatus(SYNC.SYNCED);
    } catch (e) {
      console.warn('GitHub fetch failed, using local cache:', e);
      setSyncStatus(navigator.onLine === false ? SYNC.OFFLINE : SYNC.ERROR);
    }
  } else if (!navigator.onLine) {
    setSyncStatus(SYNC.OFFLINE);
  } else {
    setSyncStatus(SYNC.IDLE);
  }

  state.ready = true;
  notify();
  return state;
}

// Migration helper: ensures every product has the new schema fields
function migrateProductSchema(list) {
  return (Array.isArray(list) ? list : []).map(p => {
    const stripsPerBox   = Math.max(1, parseInt(p.stripsPerBox, 10) || 1);
    const tabletsPerStrip= Math.max(1, parseInt(p.tabletsPerStrip, 10) || 1);
    const boxUnitPrice   = Number(p.boxUnitPrice != null ? p.boxUnitPrice : (p.unitPrice != null ? p.unitPrice : 0)) || 0;
    const stripUnitPrice = (p.stripUnitPrice != null && p.stripUnitPrice !== '')
      ? Number(p.stripUnitPrice)
      : +(boxUnitPrice / stripsPerBox).toFixed(2);
    const tabletUnitPrice= (p.tabletUnitPrice != null && p.tabletUnitPrice !== '')
      ? Number(p.tabletUnitPrice)
      : +(stripUnitPrice / tabletsPerStrip).toFixed(2);
    return {
      ...p,
      genericName: p.genericName || p.name || '',
      packType: p.packType || 'Box',
      stripsPerBox,
      tabletsPerStrip,
      totalBaseUnits: Math.max(0, parseInt(p.totalBaseUnits != null ? p.totalBaseUnits : (p.stock || 0), 10) || 0),
      boxUnitPrice,
      stripUnitPrice,
      tabletUnitPrice,
      costPrice: Number(p.costPrice != null ? p.costPrice : (p.cost || 0)) || 0,
      isColdChain: p.isColdChain === true,
      isControlled: p.isControlled === true,
    };
  });
}

// ============================================================
// 5. Network status sync
// ============================================================

GitHub.onNetworkChange((online) => {
  state.online = online;
  if (!online) setSyncStatus(SYNC.OFFLINE);
  else if (state.syncStatus === SYNC.OFFLINE) setSyncStatus(SYNC.IDLE);
});

// ============================================================
// 6. Mutations: Products
// ============================================================

function commitProducts(message) {
  persistLocalProducts();
  notify();
  if (!GitHub.hasCredentials()) { setSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine)        { setSyncStatus(SYNC.OFFLINE); return Promise.resolve(); }
  setSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.products, state.products, message)
    .then(() => setSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitProducts error', e); setSyncStatus(SYNC.ERROR); throw e; });
}

export function getProducts() { return state.products; }
export function getProductById(id) { return state.products.find(p => p.id === id) || null; }

export function upsertProduct(product) {
  const now = new Date().toISOString();
  // Compute prices if missing
  const spb = Math.max(1, parseInt(product.stripsPerBox, 10) || 1);
  const tps = Math.max(1, parseInt(product.tabletsPerStrip, 10) || 1);
  const box = Number(product.boxUnitPrice) || 0;
  const strip = (product.stripUnitPrice != null && product.stripUnitPrice !== '')
    ? Number(product.stripUnitPrice)
    : +(box / spb).toFixed(2);
  const tab = (product.tabletUnitPrice != null && product.tabletUnitPrice !== '')
    ? Number(product.tabletUnitPrice)
    : +(strip / tps).toFixed(2);

  const normalized = {
    ...product,
    stripsPerBox: spb,
    tabletsPerStrip: tps,
    boxUnitPrice: box,
    stripUnitPrice: strip,
    tabletUnitPrice: tab,
    costPrice: Number(product.costPrice) || 0,
    isColdChain: product.isColdChain === true,
    isControlled: product.isControlled === true,
    totalBaseUnits: Math.max(0, parseInt(product.totalBaseUnits, 10) || 0),
  };

  if (!normalized.id) {
    const p = { ...normalized, id: uid('p'), createdAt: now };
    state.products.unshift(p);
    commitProducts(`Add product ${p.name}`);
    return p;
  } else {
    const i = state.products.findIndex(p => p.id === normalized.id);
    const updated = { ...state.products[i], ...normalized, updatedAt: now };
    if (i >= 0) state.products[i] = updated;
    else state.products.unshift(updated);
    commitProducts(`Update product ${updated.name}`);
    return updated;
  }
}

export function addProduct(productData) {
  const { id, ...rest } = productData || {};
  return upsertProduct(rest);
}

export function updateProduct(productData) {
  if (!productData?.id) throw new Error('updateProduct requires an id');
  return upsertProduct(productData);
}

export function deleteProduct(id) {
  const p = state.products.find(p => p.id === id);
  state.products = state.products.filter(p => p.id !== id);
  commitProducts(`Delete product ${p ? p.name : id}`);
}

// Adjust stock by a delta in BASE units (positive = add, negative = remove)
export function adjustStockBase(id, deltaBase) {
  const p = state.products.find(p => p.id === id);
  if (!p) return;
  const cur = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
  const next = Math.max(0, cur + deltaBase);
  p.totalBaseUnits = next;
  p.updatedAt = new Date().toISOString();
  commitProducts(`Stock adjust ${p.name} (${deltaBase > 0 ? '+' : ''}${deltaBase} base)`);
}

export function syncProducts(message) { return commitProducts(message || 'Sync products'); }

// ============================================================
// 7. Mutations: Sales
// ============================================================

function commitSales(message) {
  persistLocalSales();
  notify();
  if (!GitHub.hasCredentials()) { setSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine)        { setSyncStatus(SYNC.OFFLINE); return Promise.resolve(); }
  setSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.sales, state.sales, message)
    .then(() => setSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitSales error', e); setSyncStatus(SYNC.ERROR); throw e; });
}

export function getSales() { return state.sales; }

/**
 * Add a sale. Each item in `sale.items` MUST include { id, name, unit, qty, baseUnits, unitPrice, subtotal }.
 * Stock is deducted in base units per item.
 */
export function addSale(sale) {
  const record = {
    id: uid('s'),
    createdAt: new Date().toISOString(),
    ...sale,
  };
  state.sales.unshift(record);

  // Decrement stock in base units
  for (const item of record.items) {
    const p = state.products.find(p => p.id === item.id);
    if (p) {
      const cur = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
      const used = Math.max(0, parseInt(item.baseUnits, 10) || 0);
      p.totalBaseUnits = Math.max(0, cur - used);
    }
  }
  persistLocalProducts();
  commitSales(`Sale ${record.id}`).catch(e => console.error(e));
  return record;
}

export function deleteSale(id) {
  state.sales = state.sales.filter(s => s.id !== id);
  commitSales(`Delete sale ${id}`);
}

export function syncSales(message) { return commitSales(message || 'Sync sales'); }

// ============================================================
// 8. Mutations: Doctors
// ============================================================

function commitDoctors(message) {
  persistLocalDoctors();
  notify();
  if (!GitHub.hasCredentials()) { setSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine)        { setSyncStatus(SYNC.OFFLINE); return Promise.resolve(); }
  setSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.doctors, state.doctors, message)
    .then(() => setSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitDoctors error', e); setSyncStatus(SYNC.ERROR); throw e; });
}

export function getDoctors() { return state.doctors; }

export function upsertDoctor(doctor) {
  const now = new Date().toISOString();
  if (!doctor.id) {
    const d = { ...doctor, id: uid('doc'), createdAt: now };
    state.doctors.unshift(d);
    commitDoctors(`Add doctor ${d.name}`);
    return d;
  } else {
    const i = state.doctors.findIndex(d => d.id === doctor.id);
    const updated = { ...state.doctors[i], ...doctor, updatedAt: now };
    if (i >= 0) state.doctors[i] = updated;
    else state.doctors.unshift(updated);
    commitDoctors(`Update doctor ${updated.name}`);
    return updated;
  }
}

export function addDoctor(doctorData) { const { id, ...r } = doctorData || {}; return upsertDoctor(r); }
export function updateDoctor(doctorData) { if (!doctorData?.id) throw new Error('id required'); return upsertDoctor(doctorData); }

export function deleteDoctor(id) {
  const d = state.doctors.find(d => d.id === id);
  state.doctors = state.doctors.filter(d => d.id !== id);
  commitDoctors(`Delete doctor ${d ? d.name : id}`);
}

export function syncDoctors(message) { return commitDoctors(message || 'Sync doctors'); }

// ============================================================
// 9. Force re-sync from GitHub (manual refresh)
// ============================================================

export async function refreshFromGitHub() {
  if (!GitHub.hasCredentials()) throw new Error('GitHub credentials not configured.');
  setSyncStatus(SYNC.SYNCING);
  try {
    const { products, sales, doctors } = await GitHub.fetchAllFromGitHub();
    if (Array.isArray(products)) {
      state.products = migrateProductSchema(products);
      persistLocalProducts();
    }
    if (Array.isArray(sales)) {
      state.sales = sales;
      persistLocalSales();
    }
    if (Array.isArray(doctors)) {
      state.doctors = doctors;
      persistLocalDoctors();
    }
    setSyncStatus(SYNC.SYNCED);
    notify();
  } catch (e) {
    setSyncStatus(SYNC.ERROR);
    throw e;
  }
}

// ============================================================
// 10. Cashier prefs
// ============================================================

export function setCashier(name) {
  const payload = { name: (name || '').trim() || 'Cashier' };
  localStorage.setItem(LS_KEYS.cashier, JSON.stringify(payload));
  const el = document.getElementById('cashier-name');
  if (el) el.textContent = payload.name;
  const init = document.getElementById('cashier-initial');
  if (init) init.textContent = payload.name[0].toUpperCase();
}

export function getCashier() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.cashier) || 'null') || { name: 'Cashier' };
  } catch {
    return { name: 'Cashier' };
  }
}