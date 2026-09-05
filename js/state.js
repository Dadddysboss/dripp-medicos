// js/state.js
// Reactive state store with dual-sync (LocalStorage + GitHub commit).
// Subscribers re-render on every commit.

import {
  LS_KEYS, FILES, DEFAULT_PRODUCTS, DEFAULT_SALES, DEFAULT_DOCTORS,
  SYNC, uid, baseUnitsFor,
  EXPENSE_CATEGORIES, INVOICE_STATUS,
  fmtCurrency,
} from './config.js';

import * as GitHub from './github.js';
import { addToOfflineQueue } from './sync.js';

// ============================================================
// 1. State shape
// ============================================================

const state = {
  products: [],
  sales: [],
  doctors: [],
  invoices: [],
  expenses: [],
  supplierReturns: [],
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

function loadLocalInvoices() {
  try { const raw = localStorage.getItem(LS_KEYS.invoices); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function loadLocalExpenses() {
  try { const raw = localStorage.getItem(LS_KEYS.expenses); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function loadLocalSupplierReturns() {
  try { const raw = localStorage.getItem(LS_KEYS.supplierReturns); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function persistLocalProducts() {
  try { localStorage.setItem(LS_KEYS.products, JSON.stringify(state.products)); } catch (e) { console.error('persistLocalProducts failed:', e); }
}
function persistLocalSales() {
  try { localStorage.setItem(LS_KEYS.sales, JSON.stringify(state.sales)); } catch (e) { console.error('persistLocalSales failed:', e); }
}
function persistLocalDoctors() {
  try { localStorage.setItem(LS_KEYS.doctors, JSON.stringify(state.doctors)); } catch (e) { console.error('persistLocalDoctors failed:', e); }
}

function persistLocalInvoices() {
  try { localStorage.setItem(LS_KEYS.invoices, JSON.stringify(state.invoices)); } catch (e) { console.error('persistLocalInvoices failed:', e); }
}

function persistLocalExpenses() {
  try { localStorage.setItem(LS_KEYS.expenses, JSON.stringify(state.expenses)); } catch (e) { console.error('persistLocalExpenses failed:', e); }
}
function persistLocalSupplierReturns() {
  try { localStorage.setItem(LS_KEYS.supplierReturns, JSON.stringify(state.supplierReturns)); } catch (e) { console.error('persistLocalSupplierReturns failed:', e); }
}

// ============================================================
// 3. Sync status badge control (DOM-safe)
// ============================================================

function safeSetSyncStatus(status) {
  state.syncStatus = status;
  state.lastSync = localStorage.getItem(LS_KEYS.lastSync) || null;

  try {
    const dot  = document.getElementById('sync-dot');
    const lbl  = document.getElementById('sync-label');
    const wrap = document.getElementById('sync-badge');
    if (!dot || !lbl || !wrap) { notify(); return; }

    dot.classList.remove('bg-slate-400','bg-emerald-500','bg-amber-500','bg-rose-500','bg-sky-500');
    wrap.classList.remove(
      'bg-emerald-50','dark:bg-emerald-900/30','text-emerald-700','dark:text-emerald-300',
      'bg-rose-100','dark:bg-rose-900/30','text-rose-700','dark:text-rose-300',
      'bg-amber-50','dark:bg-amber-900/30','text-amber-700','dark:text-amber-300',
      'bg-sky-50','dark:bg-sky-900/30','text-sky-700','dark:text-sky-300'
    );

    switch (status) {
      case SYNC.SYNCED:
        dot.classList.add('bg-emerald-500');
        lbl.textContent = 'Synced';
        wrap.classList.add('bg-emerald-50','dark:bg-emerald-900/30','text-emerald-700','dark:text-emerald-300');
        break;
      case SYNC.SYNCING:
        dot.classList.add('bg-sky-500');
        lbl.textContent = 'Syncing…';
        wrap.classList.add('bg-sky-50','dark:bg-sky-900/30','text-sky-700','dark:text-sky-300');
        break;
      case SYNC.ERROR:
        dot.classList.add('bg-rose-500');
        lbl.textContent = 'Sync Error';
        wrap.classList.add('bg-rose-100','dark:bg-rose-900/30','text-rose-700','dark:text-rose-300');
        break;
      case SYNC.OFFLINE:
        dot.classList.add('bg-amber-500');
        lbl.textContent = 'Offline';
        wrap.classList.add('bg-amber-50','dark:bg-amber-900/30','text-amber-700','dark:text-amber-300');
        break;
      default:
        dot.classList.add('bg-slate-400');
        lbl.textContent = state.online ? 'Idle' : 'Offline';
    }
  } catch (e) {
    console.error('setSyncStatus DOM error:', e);
  } finally {
    notify();
  }
}

// Export for external use (e.g., views)
export const setSyncStatus = safeSetSyncStatus;

// ============================================================
// 4. Boot sequence
// ============================================================

export async function bootState() {
  if (state.ready) return state;

  // Load any local cache immediately for instant render.
  const lp = loadLocalProducts();
  const ls = loadLocalSales();
  const ld = loadLocalDoctors();
  const li = loadLocalInvoices();
  const le = loadLocalExpenses();

  if (Array.isArray(lp) && lp.length) state.products = lp;
  else state.products = migrateProductSchema([...DEFAULT_PRODUCTS]);

  if (Array.isArray(ls)) state.sales = ls;
  else state.sales = [];

  if (Array.isArray(ld) && ld.length) state.doctors = ld;
  else state.doctors = [...DEFAULT_DOCTORS];

  if (Array.isArray(li)) state.invoices = li;
  else state.invoices = [];

  if (Array.isArray(le)) state.expenses = le;
  else state.expenses = [];

  const lsr = loadLocalSupplierReturns();
  if (Array.isArray(lsr)) state.supplierReturns = lsr;
  else state.supplierReturns = [];

  // Cashier header (DOM-safe)
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEYS.cashier) || 'null');
    if (c?.name) {
      const el = document.getElementById('cashier-name');
      if (el) el.textContent = c.name;
      const init = document.getElementById('cashier-initial');
      if (init) init.textContent = (c.name[0] || 'C').toUpperCase();
    }
  } catch (e) {
    console.warn('Cashier init failed:', e);
  }

  safeSetSyncStatus(SYNC.IDLE);

  // Initialize default GitHub credentials if none exist (for out-of-the-box sync)
  // Note: Default PAT token removed from source due to GitHub push protection.
  // Configure credentials in System Settings > GitHub Sync for full sync functionality.
  if (!GitHub.hasCredentials()) {
    console.log('No GitHub credentials configured. Configure in System Settings for sync.');
  }

  // Attempt GitHub sync if credentials exist and online
  if (GitHub.hasCredentials() && navigator.onLine !== false) {
    try {
      safeSetSyncStatus(SYNC.SYNCING);
      const { products, sales, doctors, invoices, expenses, supplierReturns, errors } = await GitHub.fetchAllFromGitHub();
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
      if (Array.isArray(invoices)) {
        state.invoices = invoices;
        persistLocalInvoices();
      }
      if (Array.isArray(expenses)) {
        state.expenses = expenses;
        persistLocalExpenses();
      }
      if (Array.isArray(supplierReturns)) {
        state.supplierReturns = supplierReturns;
        persistLocalSupplierReturns();
      }
      if (errors && errors.length) console.warn('GitHub fetch warnings:', errors);
      safeSetSyncStatus(SYNC.SYNCED);
    } catch (e) {
      console.warn('GitHub fetch failed, trying local static files:', e);
      // Fallback to local static files (./data/*.json)
      try {
        const local = await GitHub.fetchAllFromLocal();
        if (Array.isArray(local.products)) {
          state.products = migrateProductSchema(local.products);
          persistLocalProducts();
        }
        if (Array.isArray(local.sales)) {
          state.sales = local.sales;
          persistLocalSales();
        }
        if (Array.isArray(local.doctors)) {
          state.doctors = local.doctors;
          persistLocalDoctors();
        }
        if (local.errors && local.errors.length) console.warn('Local fetch warnings:', local.errors);
        safeSetSyncStatus(SYNC.SYNCED);
      } catch (localErr) {
        console.warn('Local static fetch also failed, using defaults:', localErr);
        safeSetSyncStatus(navigator.onLine === false ? SYNC.OFFLINE : SYNC.ERROR);
      }
    }
  } else if (!navigator.onLine) {
    // Offline: try local static files as fallback
    try {
      const local = await GitHub.fetchAllFromLocal();
      if (Array.isArray(local.products)) {
        state.products = migrateProductSchema(local.products);
        persistLocalProducts();
      }
      if (Array.isArray(local.sales)) {
        state.sales = local.sales;
        persistLocalSales();
      }
      if (Array.isArray(local.doctors)) {
        state.doctors = local.doctors;
        persistLocalDoctors();
      }
      if (Array.isArray(local.supplierReturns)) {
        state.supplierReturns = local.supplierReturns;
        persistLocalSupplierReturns();
      }
      safeSetSyncStatus(SYNC.OFFLINE);
    } catch (e) {
      console.warn('Offline local fetch failed, using defaults:', e);
      safeSetSyncStatus(SYNC.OFFLINE);
    }
  } else {
    // No GitHub credentials: try local static files
    try {
      const local = await GitHub.fetchAllFromLocal();
      if (Array.isArray(local.products)) {
        state.products = migrateProductSchema(local.products);
        persistLocalProducts();
      }
      if (Array.isArray(local.sales)) {
        state.sales = local.sales;
        persistLocalSales();
      }
      if (Array.isArray(local.doctors)) {
        state.doctors = local.doctors;
        persistLocalDoctors();
      }
      if (Array.isArray(local.supplierReturns)) {
        state.supplierReturns = local.supplierReturns;
        persistLocalSupplierReturns();
      }
      safeSetSyncStatus(SYNC.IDLE);
    } catch (e) {
      console.warn('No credentials: local static fetch failed, using defaults:', e);
      safeSetSyncStatus(SYNC.IDLE);
    }
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
      minStockLevel: Math.max(0, parseInt(p.minStockLevel, 10) || 10),
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
  if (!online) safeSetSyncStatus(SYNC.OFFLINE);
  else if (state.syncStatus === SYNC.OFFLINE) safeSetSyncStatus(SYNC.IDLE);
});

// ============================================================
// 6. Mutations: Products
// ============================================================

function commitProducts(message) {
  persistLocalProducts();
  notify();
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('product', { action: 'upsert', data: state.products, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.products, state.products, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitProducts error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
}

export function getProducts() { return state.products; }
export function getProductById(id) { return state.products.find(p => p.id === id) || null; }

export function upsertProduct(product) {
  const now = new Date().toISOString();
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
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('sale', { action: 'upsert', data: state.sales, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.sales, state.sales, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitSales error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
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
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('invoice', { action: 'upsert', data: state.doctors, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.doctors, state.doctors, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitDoctors error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
}

function commitInvoices(message) {
  persistLocalInvoices();
  notify();
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('invoice', { action: 'upsert', data: state.invoices, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.invoices, state.invoices, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitInvoices error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
}

function commitExpenses(message) {
  persistLocalExpenses();
  notify();
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('expense', { action: 'upsert', data: state.expenses, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.expenses, state.expenses, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitExpenses error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
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

export function getInvoices() { return state.invoices; }
export function getInvoiceById(id) { return state.invoices.find(i => i.id === id) || null; }

export function addInvoice(invoiceData) {
  const now = new Date().toISOString();
  const invoice = {
    ...invoiceData,
    id: uid('inv'),
    createdAt: now,
    status: invoiceData.status || INVOICE_STATUS[0],
  };
  state.invoices.unshift(invoice);
  
  // Process invoice items to update inventory stock
  if (Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
    processInvoiceItems(invoiceData.items);
  }
  
  commitInvoices(`Add invoice ${invoice.invoiceNo}`);
  return invoice;
}

// Process invoice items: update existing products or create new ones
function processInvoiceItems(items) {
  console.log('[Invoice] Processing invoice items:', items);
  
  // Ensure state.products exists
  if (!Array.isArray(state.products)) {
    console.warn('[Invoice] state.products not initialized, creating empty array');
    state.products = [];
  }
  
  for (const item of items) {
    if (!item || !item.name) {
      console.warn('[Invoice] Skipping item with no name:', item);
      continue;
    }
    
    const itemName = (item.name || '').trim().toLowerCase();
    const itemQty = Number(item.quantity || item.qty || 0);
    const itemCost = Number(item.costPrice || item.cost || 0);
    const itemBatch = (item.batchNo || item.batch || '').trim();
    
    if (itemQty <= 0) {
      console.warn('[Invoice] Skipping item with zero quantity:', item);
      continue;
    }
    
    // Find existing product by name (case-insensitive), fuzzy substring match, or batch
    let existingProduct = state.products.find(p => {
      const productName = (p.name || '').trim().toLowerCase();
      // Exact match
      if (productName === itemName) return true;
      // Fuzzy substring match (product name contains item name or vice versa)
      if (productName.includes(itemName) || itemName.includes(productName)) return true;
      // Batch match
      if (itemBatch && p.batchNo === itemBatch) return true;
      return false;
    });
    
    console.log('[Invoice] Processing item:', { itemName, itemQty, itemCost, itemBatch, found: !!existingProduct });
    
    if (existingProduct) {
      // Product exists - increment stock
      const spb = Math.max(1, parseInt(existingProduct.stripsPerBox, 10) || 1);
      const tps = Math.max(1, parseInt(existingProduct.tabletsPerStrip, 10) || 1);
      const addedUnits = itemQty * spb * tps;
      const previousStock = parseInt(existingProduct.totalBaseUnits, 10) || 0;
      existingProduct.totalBaseUnits = Math.max(0, previousStock + addedUnits);
      
      // Update batch if provided
      if (itemBatch) existingProduct.batchNo = itemBatch;
      
      // Update cost price if provided
      if (itemCost > 0) existingProduct.costPrice = itemCost;
      
      existingProduct.updatedAt = new Date().toISOString();
      
      console.log('[Invoice] Updated existing product:', existingProduct.name, 'stock:', previousStock, '->', existingProduct.totalBaseUnits);
    } else {
      // Create new product
      const spb = 10; // default strips per box
      const tps = 10; // default tablets per strip
      const newProduct = {
        id: uid('prod'),
        name: item.name.trim(),
        genericName: '',
        category: 'General',
        batchNo: itemBatch || `BTH-${Date.now().toString(36).toUpperCase()}`,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7), // 1 year from now
        rackNo: 'Unassigned',
        packType: 'Box',
        stripsPerBox: spb,
        tabletsPerStrip: tps,
        totalBaseUnits: itemQty * spb * tps,
        boxUnitPrice: itemCost > 0 ? itemCost * 1.2 : 0, // 20% markup default
        stripUnitPrice: itemCost > 0 ? +(itemCost / spb * 1.2).toFixed(2) : 0,
        tabletUnitPrice: itemCost > 0 ? +(itemCost / (spb * tps) * 1.2).toFixed(2) : 0,
        costPrice: itemCost,
        minStockLevel: 10,
        isColdChain: false,
        isControlled: false,
        manufacturer: '',
        imageUrl: '',
        createdAt: new Date().toISOString(),
      };
      state.products.unshift(newProduct);
      
      console.log('[Invoice] Created new product:', newProduct.name, 'stock:', newProduct.totalBaseUnits);
    }
  }
  
  // Persist products and notify subscribers
  try {
    persistLocalProducts();
    notify();
    console.log('[Invoice] Inventory persisted and subscribers notified');
  } catch (e) {
    console.error('[Invoice] Failed to persist products:', e);
    throw e;
  }
}

export function updateInvoice(invoiceData) {
  if (!invoiceData?.id) throw new Error('updateInvoice requires an id');
  const i = state.invoices.findIndex(inv => inv.id === invoiceData.id);
  const updated = { ...state.invoices[i], ...invoiceData, updatedAt: new Date().toISOString() };
  if (i >= 0) state.invoices[i] = updated;
  else state.invoices.unshift(updated);
  commitInvoices(`Update invoice ${updated.invoiceNo}`);
  return updated;
}

export function deleteInvoice(id) {
  const inv = state.invoices.find(inv => inv.id === id);
  state.invoices = state.invoices.filter(inv => inv.id !== id);
  commitInvoices(`Delete invoice ${inv?.invoiceNo || id}`);
}

export function syncInvoices(message) { return commitInvoices(message || 'Sync invoices'); }

export function getExpenses() { return state.expenses; }
export function getExpenseById(id) { return state.expenses.find(e => e.id === id) || null; }

export function addExpense(expenseData) {
  const now = new Date().toISOString();
  const expense = {
    ...expenseData,
    id: uid('exp'),
    createdAt: now,
  };
  state.expenses.unshift(expense);
  commitExpenses(`Add expense ${expense.category}`);
  return expense;
}

export function updateExpense(expenseData) {
  if (!expenseData?.id) throw new Error('updateExpense requires an id');
  const i = state.expenses.findIndex(e => e.id === expenseData.id);
  const updated = { ...state.expenses[i], ...expenseData, updatedAt: new Date().toISOString() };
  if (i >= 0) state.expenses[i] = updated;
  else state.expenses.unshift(updated);
  commitExpenses(`Update expense ${updated.category}`);
  return updated;
}

export function deleteExpense(id) {
  const exp = state.expenses.find(e => e.id === id);
  state.expenses = state.expenses.filter(e => e.id !== id);
  commitExpenses(`Delete expense ${exp?.category || id}`);
}

export function syncExpenses(message) { return commitExpenses(message || 'Sync expenses'); }

export function syncExpenses(message) { return commitExpenses(message || 'Sync expenses'); }

// ============================================================
// 12. Mutations: Supplier Returns
// ============================================================

function commitSupplierReturns(message) {
  persistLocalSupplierReturns();
  notify();
  if (!GitHub.hasCredentials()) { safeSetSyncStatus(SYNC.IDLE); return Promise.resolve(); }
  if (!navigator.onLine) {
    safeSetSyncStatus(SYNC.OFFLINE);
    addToOfflineQueue('supplierReturn', { action: 'upsert', data: state.supplierReturns, message });
    return Promise.resolve();
  }
  safeSetSyncStatus(SYNC.SYNCING);
  return GitHub.commitFile(FILES.supplierReturns, state.supplierReturns, message)
    .then(() => safeSetSyncStatus(SYNC.SYNCED))
    .catch((e) => { console.error('commitSupplierReturns error', e); safeSetSyncStatus(SYNC.ERROR); throw e; });
}

export function getSupplierReturns() { return state.supplierReturns; }
export function getSupplierReturnById(id) { return state.supplierReturns.find(r => r.id === id) || null; }

export function addSupplierReturn(returnData) {
  const now = new Date().toISOString();
  const ret = {
    ...returnData,
    id: uid('ret'),
    createdAt: now,
    status: returnData.status || 'Pending',
  };
  state.supplierReturns.unshift(ret);
  commitSupplierReturns(`Add supplier return ${ret.supplierName || 'Unknown'}`);
  return ret;
}

export function updateSupplierReturn(returnData) {
  if (!returnData?.id) throw new Error('updateSupplierReturn requires an id');
  const i = state.supplierReturns.findIndex(r => r.id === returnData.id);
  const updated = { ...state.supplierReturns[i], ...returnData, updatedAt: new Date().toISOString() };
  if (i >= 0) state.supplierReturns[i] = updated;
  else state.supplierReturns.unshift(updated);
  commitSupplierReturns(`Update supplier return ${updated.supplierName || updated.id}`);
  return updated;
}

export function deleteSupplierReturn(id) {
  const ret = state.supplierReturns.find(r => r.id === id);
  state.supplierReturns = state.supplierReturns.filter(r => r.id !== id);
  commitSupplierReturns(`Delete supplier return ${ret?.supplierName || id}`);
}

export function syncSupplierReturns(message) { return commitSupplierReturns(message || 'Sync supplier returns'); }

// Financial summary helpers
export function getFinancialSummary() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const expenses = Array.isArray(state.expenses) ? state.expenses : [];
  const invoices = Array.isArray(state.invoices) ? state.invoices : [];

  // Gross Revenue: sum of all completed sales net totals
  const grossRevenue = sales.reduce((a, s) => a + (Number(s.netTotal ?? s.total) || 0), 0);

  // Total Expenses
  const totalExpenses = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);

  // Cost of Goods Sold (COGS): sum of purchase cost prices for items sold
  let cogs = 0;
  for (const sale of sales) {
    if (!Array.isArray(sale.items)) continue;
    for (const item of sale.items) {
      const product = state.products.find(p => p.id === item.id);
      if (product) {
        const costPerUnit = Number(product.costPrice) || 0;
        const baseUnits = Number(item.baseUnits) || Number(item.qty) || 0;
        cogs += costPerUnit * baseUnits;
      }
    }
  }

  // Net Profit / Loss
  const netProfit = grossRevenue - (cogs + totalExpenses);

  return {
    grossRevenue,
    totalExpenses,
    cogs,
    netProfit,
    grossRevenueFmt: fmtCurrency(grossRevenue),
    totalExpensesFmt: fmtCurrency(totalExpenses),
    cogsFmt: fmtCurrency(cogs),
    netProfitFmt: fmtCurrency(netProfit),
    isProfit: netProfit >= 0,
  };
}

// ============================================================
// 9. Force re-sync from GitHub (manual refresh)
// ============================================================

export async function refreshFromGitHub() {
  if (!GitHub.hasCredentials()) throw new Error('GitHub credentials not configured.');
  safeSetSyncStatus(SYNC.SYNCING);
  try {
    const { products, sales, doctors, invoices, expenses } = await GitHub.fetchAllFromGitHub();
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
    if (Array.isArray(invoices)) {
      state.invoices = invoices;
      persistLocalInvoices();
    }
    if (Array.isArray(expenses)) {
      state.expenses = expenses;
      persistLocalExpenses();
    }
    safeSetSyncStatus(SYNC.SYNCED);
    notify();
  } catch (e) {
    safeSetSyncStatus(SYNC.ERROR);
    throw e;
  }
}

// ============================================================
// 10. Cashier prefs
// ============================================================

export function setCashier(name) {
  const payload = { name: (name || '').trim() || 'Cashier' };
  try { localStorage.setItem(LS_KEYS.cashier, JSON.stringify(payload)); } catch (e) { console.error('setCashier LS error:', e); }
  const el = document.getElementById('cashier-name');
  if (el) el.textContent = payload.name;
  const init = document.getElementById('cashier-initial');
  if (init) init.textContent = payload.name[0]?.toUpperCase() || 'C';
}

export function getCashier() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.cashier) || 'null') || { name: 'Cashier' };
  } catch {
    return { name: 'Cashier' };
  }
}