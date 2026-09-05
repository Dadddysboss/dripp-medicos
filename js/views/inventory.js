// js/views/inventory.js
// Dripp Medicos — Gyno Pharmacy Inventory Management view.
//
// Full new schema support: packaging (Box/Strip/Tablet), cold-chain and
// controlled-substance flags, base-unit stock with human-readable breakdown,
// inline stock adjuster, and complete CRUD modal with validation.

import { state, addProduct, updateProduct, deleteProduct, adjustStockBase } from '../state.js';
import {
  CATEGORIES, PACK_TYPES,
  fmtCurrency, formatPackagingShort, splitBaseUnits, maxQtyForUnit, baseUnitsFor, priceForUnit,
  unitLabel, uid, getProductImageUrl, getFallbackImageSvg,
} from '../config.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';

// ============================================================
// Module-local filter state
// ============================================================

const filters = {
  query: '',
  category: '',
  tab: 'all',     // 'all' | 'cold' | 'controlled' | 'low' | 'expired' | 'expiring30' | 'expiring60' | 'expiring90'
};

// ============================================================
// 1. STATUS / BADGE ENGINE
// ============================================================

export function getProductStatus(product) {
  const result = {
    isLowStock: false,
    isExpiringSoon: false,
    isExpired: false,
    daysToExpiry: null,
    isColdChain: product?.isColdChain === true,
    isControlled: product?.isControlled === true,
  };

  // Low stock check using per-product minStockLevel (default 10)
  const base = Math.max(0, parseInt(product?.totalBaseUnits, 10) || 0);
  const minThreshold = Math.max(0, parseInt(product?.minStockLevel, 10) || 10);
  const { tabletsPerBox } = splitBaseUnits(base, product);
  if (base <= minThreshold) result.isLowStock = true;
  if (tabletsPerBox > 0 && tabletsPerBox <= 10) result.isLowStock = true;

  // Expiry check (YYYY-MM)
  const expiry = String(product?.expiryDate || '').trim();
  if (/^\d{4}-\d{2}$/.test(expiry)) {
    const [yStr, mStr] = expiry.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      const expiryEnd = new Date(y, m, 0, 23, 59, 59, 999).getTime();
      const days = Math.ceil((expiryEnd - Date.now()) / 86400000);
      result.daysToExpiry = days;
      if (days <= 0) result.isExpired = true;
      else if (days <= 60) result.isExpiringSoon = true;
    }
  }

  return result;
}

// ============================================================
// 2. MAIN RENDER
// ============================================================

export function renderInventoryView() {
  const products = Array.isArray(state.products) ? state.products : [];
  const filtered = applyFilters(products);
  const counts = countByStatus(products);

  // Count expiring items
  const expiring30 = products.filter(p => {
    const s = getProductStatus(p);
    return s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 30;
  }).length;
  const expiring60 = products.filter(p => {
    const s = getProductStatus(p);
    return s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 60;
  }).length;
  const expiring90 = products.filter(p => {
    const s = getProductStatus(p);
    return s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 90;
  }).length;

  return `
    <div class="space-y-5">

      <!-- ============ Header & Action Controls ============ -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center shadow-md">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold tracking-tight">Gyno Pharmacy Inventory</h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              ${products.length} medicine${products.length === 1 ? '' : 's'} ·
              ${counts.low} low · ${counts.expiring} expiring · ${counts.expired} expired ·
              ${counts.cold} cold-chain · ${counts.controlled} controlled
            </p>
          </div>
        </div>

        <button id="inv-btn-add"
                class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600
                       text-white font-semibold shadow-lg shadow-teal-500/30 transition active:scale-[0.98]">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add New Medicine
        </button>
      </div>

      <!-- ============ Quick Filter Tabs ============ -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-wrap gap-2">
        ${tabBtn('all',        'All Items',          `${products.length}`)}
        ${tabBtn('cold',       '❄️ Cold Chain',      `${counts.cold}`)}
        ${tabBtn('controlled', '🔒 Controlled Items', `${counts.controlled}`)}
        ${tabBtn('low',        '⚠️ Low Stock',        `${counts.low}`)}
        ${tabBtn('expired',    '❌ Expired',          `${counts.expired}`)}
        ${tabBtn('expiring30', '⏳ Expiring ≤30d',    `${expiring30}`)}
        ${tabBtn('expiring60', '⏳ Expiring ≤60d',    `${expiring60}`)}
        ${tabBtn('expiring90', '⏳ Expiring ≤90d',    `${expiring90}`)}
      </div>

      <!-- ============ Search & Category Filter ============ -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="sm:col-span-2">
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search</label>
            <div class="relative">
              <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input id="inv-search" type="text" value="${escapeAttr(filters.query)}"
                     placeholder="Search by name, generic, batch or rack…"
                     class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700
                            bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Category</label>
            <select id="inv-category"
                    class="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700
                           bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">All Categories</option>
              ${CATEGORIES.map(c => `<option value="${escapeAttr(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- ============ Data Table ============ -->
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div class="inventory-table-wrapper">
          <table class="w-full text-sm min-w-[800px]">
            <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th class="px-4 py-3 text-left w-16">Image</th>
                <th class="px-4 py-3 text-left">Medicine</th>
                <th class="px-4 py-3 text-left">Category / Packaging</th>
                <th class="px-4 py-3 text-left">Batch / Rack</th>
                <th class="px-4 py-3 text-left">Expiry</th>
                <th class="px-4 py-3 text-right">Pricing</th>
                <th class="px-4 py-3 text-center">Stock (Box · Strip · Tab)</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="inv-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
              ${filtered.length === 0 ? emptyState() : filtered.map(renderRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function tabBtn(key, label, count) {
  const active = filters.tab === key;
  return `
    <button data-tab="${escapeAttr(key)}"
            class="inv-tab inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition
                   ${active
                     ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                     : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}">
      ${escapeHtml(label)}
      <span class="${active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} px-1.5 py-0.5 rounded-md text-[10px] font-bold">${escapeHtml(count || '0')}</span>
    </button>
  `;
}

// ============================================================
// 3. FILTER / HELPERS
// ============================================================

function applyFilters(products) {
  const q = (filters.query || '').trim().toLowerCase();

  return products.filter(p => {
    if (filters.category && p.category !== filters.category) return false;

    if (q) {
      const hay = `${p.name || ''} ${p.genericName || ''} ${p.batchNo || ''} ${p.rackNo || ''} ${p.manufacturer || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    const s = getProductStatus(p);
    if (filters.tab === 'cold'       && !s.isColdChain)     return false;
    if (filters.tab === 'controlled' && !s.isControlled)    return false;
    if (filters.tab === 'low'        && !s.isLowStock)      return false;
    if (filters.tab === 'expired'    && !s.isExpired)       return false;
    if (filters.tab === 'expiring30' && !(s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 30)) return false;
    if (filters.tab === 'expiring60' && !(s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 60)) return false;
    if (filters.tab === 'expiring90' && !(s.isExpiringSoon && s.daysToExpiry != null && s.daysToExpiry <= 90)) return false;

    return true;
  });
}

function countByStatus(products) {
  const c = { low: 0, expiring: 0, expired: 0, cold: 0, controlled: 0 };
  for (const p of products) {
    const s = getProductStatus(p);
    if (s.isLowStock)     c.low++;
    if (s.isExpiringSoon) c.expiring++;
    if (s.isExpired)      c.expired++;
    if (s.isColdChain)    c.cold++;
    if (s.isControlled)   c.controlled++;
  }
  return c;
}

// ============================================================
// 4. ROW RENDERING
// ============================================================

function renderRow(p) {
  const status = getProductStatus(p);
  const rowTint = status.isExpired ? 'bg-red-50/40 dark:bg-red-950/20' : '';
  const total = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
  const split = splitBaseUnits(total, p);
  const imageUrl = getProductImageUrl(p);

  const badges = [];
  if (status.isColdChain) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/>
      </svg>
      2°C – 8°C REFRIGERATED
    </span>`);
  }
  if (status.isControlled) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      PRESCRIPTION REQUIRED
    </span>`);
  }
  if (status.isLowStock) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      LOW STOCK
    </span>`);
  }
  if (status.isExpiringSoon) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      EXPIRING SOON${status.daysToExpiry != null ? ` (${status.daysToExpiry}d)` : ''}
    </span>`);
  }
  if (status.isExpired) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200">
      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      EXPIRED — SALE BLOCKED
    </span>`);
  }

  // Pricing badges (box / strip / tablet)
  const spb = split.spb, tps = split.tps;
  const showBox = spb > 1 || tps > 1;
  const priceBadges = [];
  priceBadges.push(`<div class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">${escapeHtml(p.packType || 'Box')}</div>`);
  priceBadges.push(`<div class="flex flex-wrap gap-1 mt-0.5 justify-end">
    <span class="px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-[10px] font-semibold">Box: ${fmtCurrency(p.boxUnitPrice)}</span>
    ${spb > 1 ? `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">Strip: ${fmtCurrency(p.stripUnitPrice)}</span>` : ''}
    ${tps > 1 ? `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">Tab: ${fmtCurrency(p.tabletUnitPrice)}</span>` : ''}
  </div>`);

  // Expiry discount button
  let expiryActionBtn = '';
  if (status.isExpiringSoon && status.daysToExpiry != null && status.daysToExpiry <= 90) {
    const discountPct = status.daysToExpiry <= 30 ? 25 : status.daysToExpiry <= 60 ? 15 : 10;
    expiryActionBtn = `
      <button data-quick-discount="${escapeAttr(p.id)}" data-discount="${discountPct}" data-days="${status.daysToExpiry}"
              class="px-2 py-1 text-[10px] font-bold rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              title="Apply ${discountPct}% quick discount (expires in ${status.daysToExpiry}d)">
        ⚡ ${discountPct}% OFF
      </button>
    `;
  }

  // Inline stock adjuster — uses BOX deltas
  const boxes = split.boxes;
  const decEnabled = boxes > 0;

  return `
    <tr class="${rowTint} hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      <td class="px-4 py-3 align-top w-16">
        <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
          <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(p.name || 'Medicine')}" class="w-full h-full object-cover" onerror="this.src='${getFallbackImageSvg()}'"/>
        </div>
      </td>
      <td class="px-4 py-3 align-top">
        <div class="font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(p.name || 'Unnamed')}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 italic">${escapeHtml(p.genericName || '')}</div>
        <div class="mt-1 flex flex-wrap gap-1">${badges.join('')}</div>
      </td>
      <td class="px-4 py-3 align-top">
        <span class="inline-block text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">${escapeHtml(p.category || '—')}</span>
        <div class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">${escapeHtml(p.manufacturer || '')}</div>
      </td>
      <td class="px-4 py-3 align-top">
        <div class="font-mono text-xs">${escapeHtml(p.batchNo || '—')}</div>
        <div class="text-[11px] ${p.isColdChain ? 'text-sky-600 dark:text-sky-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}">${escapeHtml(p.rackNo || '—')}</div>
      </td>
      <td class="px-4 py-3 align-top text-xs">
        ${escapeHtml(p.expiryDate || '—')}
        ${expiryActionBtn}
      </td>
      <td class="px-4 py-3 align-top text-right">
        ${priceBadges.join('')}
        <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Cost: ${fmtCurrency(p.costPrice)}</div>
      </td>
      <td class="px-4 py-3 align-top">
        <div class="flex flex-col items-center gap-1">
          <div class="text-[11px] font-semibold ${status.isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}">
            ${split.boxes}B · ${split.strips}S · ${split.tablets}T
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400">${total} base units</div>
          <div class="flex items-center gap-1 mt-1">
            <button data-stock-dec="${escapeAttr(p.id)}"
                    ${decEnabled ? '' : 'disabled'}
                    class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    title="−1 Box">−</button>
            <span class="min-w-[1.5rem] text-center text-xs font-bold">${boxes}</span>
            <button data-stock-inc="${escapeAttr(p.id)}"
                    class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold"
                    title="+1 Box">+</button>
            <button data-stock-dec-5="${escapeAttr(p.id)}"
                    ${split.tabletsPerBox * 5 > total ? 'disabled' : ''}
                    class="px-2 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-bold disabled:opacity-40"
                    title="−5 Boxes">−5</button>
            <button data-stock-inc-5="${escapeAttr(p.id)}"
                    class="px-2 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-bold"
                    title="+5 Boxes">+5</button>
          </div>
        </div>
      </td>
      <td class="px-4 py-3 align-top text-right">
        <div class="inline-flex gap-1">
          <button data-edit="${escapeAttr(p.id)}"
                  class="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  title="Edit">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
            </svg>
          </button>
          <button data-delete="${escapeAttr(p.id)}"
                  class="p-2 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600"
                  title="Delete">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function emptyState() {
  return `
    <tr>
      <td colspan="8" class="px-4 py-16">
        <div class="flex flex-col items-center justify-center text-center">
          <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <svg class="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-700 dark:text-slate-200">No medicines found</h3>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">Try adjusting your filters or add a new medicine to get started.</p>
          <button id="inv-empty-add" class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add New Medicine
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ============================================================
// 5. MOUNT
// ============================================================

export function mountInventory() {
  document.getElementById('inv-search')?.addEventListener('input', (e) => { filters.query = e.target.value; rerenderTable(); });
  document.getElementById('inv-category')?.addEventListener('change', (e) => { filters.category = e.target.value; rerenderTable(); });
  document.getElementById('inv-btn-add')?.addEventListener('click', () => openMedicineModal(null));
  document.getElementById('inv-empty-add')?.addEventListener('click', () => openMedicineModal(null));

  // Quick tabs
  document.querySelectorAll('.inv-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      filters.tab = btn.dataset.tab;
      rerenderTable();
      // Update active state
      document.querySelectorAll('.inv-tab').forEach(b => {
        const active = b.dataset.tab === filters.tab;
        b.classList.toggle('bg-teal-600', active);
        b.classList.toggle('text-white', active);
        b.classList.toggle('border-teal-600', active);
        b.classList.toggle('shadow-md', active);
        b.classList.toggle('shadow-teal-500/20', active);
        b.classList.toggle('bg-white', !active);
        b.classList.toggle('dark:bg-slate-800', !active);
        b.classList.toggle('text-slate-600', !active);
        b.classList.toggle('dark:text-slate-300', !active);
        b.classList.toggle('border-slate-300', !active);
        b.classList.toggle('dark:border-slate-700', !active);
        // count chip
        const chip = b.querySelector('span:last-child');
        if (chip) {
          chip.classList.toggle('bg-white/20', active);
          chip.classList.toggle('text-white', active);
          chip.classList.toggle('bg-slate-100', !active);
          chip.classList.toggle('dark:bg-slate-700', !active);
          chip.classList.toggle('text-slate-600', !active);
          chip.classList.toggle('dark:text-slate-300', !active);
        }
      });
    });
  });

  // Table event delegation
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const inc  = e.target.closest('[data-stock-inc]');
    const dec  = e.target.closest('[data-stock-dec]');
    const inc5 = e.target.closest('[data-stock-inc-5]');
    const dec5 = e.target.closest('[data-stock-dec-5]');
    const edit = e.target.closest('[data-edit]');
    const del  = e.target.closest('[data-delete]');
    const qd   = e.target.closest('[data-quick-discount]');
    if (inc)  return stockAdjustByBox(inc.dataset.stockInc, +1);
    if (dec)  return stockAdjustByBox(dec.dataset.stockDec, -1);
    if (inc5) return stockAdjustByBox(inc5.dataset.stockInc5, +5);
    if (dec5) return stockAdjustByBox(dec5.dataset.stockDec5, -5);
    if (edit) return openMedicineModalById(edit.dataset.edit);
    if (del)  return handleDelete(del.dataset.delete);
    if (qd)   return applyQuickDiscount(qd.dataset.quickDiscount, parseInt(qd.dataset.discount, 10), parseInt(qd.dataset.days, 10));
  });
}

function stockAdjustByBox(id, deltaBoxes) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  const deltaBase = baseUnitsFor('Box', Math.abs(deltaBoxes), p) * (deltaBoxes < 0 ? -1 : 1);
  if (deltaBoxes < 0 && (p.totalBaseUnits || 0) + deltaBase < 0) {
    showToast(`Cannot reduce stock below 0.`, 'error');
    return;
  }
  try {
    adjustStockBase(id, deltaBase);
    const next = Math.max(0, (p.totalBaseUnits || 0));
    showToast(`Stock: ${p.name} (${deltaBoxes > 0 ? '+' : ''}${deltaBoxes} box${Math.abs(deltaBoxes)===1?'':'es'}) → ${next} base units — Saved & Synced with GitHub`, 'success');
    rerenderTable();
  } catch (e) { console.error(e); showToast('Failed to adjust stock.', 'error'); }
}

// ============================================================
// 6. ADD / EDIT MODAL (full validation + auto-calc pricing)
// ============================================================

function openMedicineModalById(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) { showToast('Medicine not found.', 'error'); return; }
  openMedicineModal(p);
}

function openMedicineModal(product) {
  const isEdit = !!product;
  const p = product || {
    name: '', genericName: '', category: CATEGORIES[0],
    batchNo: '', expiryDate: '', rackNo: '',
    packType: 'Box', stripsPerBox: 1, tabletsPerStrip: 1,
    totalBaseUnits: 0, boxUnitPrice: 0, stripUnitPrice: 0, tabletUnitPrice: 0,
    costPrice: 0, isColdChain: false, isControlled: false,
    manufacturer: '',
  };

  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold">${isEdit ? 'Edit Medicine' : 'Add New Medicine'}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">${isEdit ? 'Update existing inventory record' : 'Add a new medicine to inventory'}</p>
          </div>
        </div>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <form id="med-form" class="space-y-4">
        <!-- Name + Generic -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Medicine Name <span class="text-rose-500">*</span></label>
            <input id="med-name" name="name" type="text" required value="${escapeAttr(p.name)}"
                   placeholder="e.g., Folic Acid 5mg"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Generic Name</label>
            <input id="med-generic" name="genericName" type="text" value="${escapeAttr(p.genericName || '')}"
                   placeholder="e.g., Folic Acid"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
        </div>

        <!-- Category + Pack Type -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Category <span class="text-rose-500">*</span></label>
            <select id="med-category" name="category" required
                    class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              ${CATEGORIES.map(c => `<option value="${escapeAttr(c)}" ${p.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Pack Type <span class="text-rose-500">*</span></label>
            <select id="med-packtype" name="packType" required
                    class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              ${PACK_TYPES.map(t => `<option value="${escapeAttr(t.value)}" ${p.packType === t.value ? 'selected' : ''}>${escapeHtml(t.value)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Flags -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="flex items-center gap-2 p-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 cursor-pointer">
            <input id="med-cold" type="checkbox" ${p.isColdChain ? 'checked' : ''} class="rounded border-sky-300 text-sky-600 focus:ring-sky-500"/>
            <div>
              <div class="text-sm font-semibold text-sky-700 dark:text-sky-300">❄️ Cold Chain</div>
              <div class="text-[11px] text-sky-600 dark:text-sky-400">Store at 2°C – 8°C</div>
            </div>
          </label>
          <label class="flex items-center gap-2 p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 cursor-pointer">
            <input id="med-controlled" type="checkbox" ${p.isControlled ? 'checked' : ''} class="rounded border-purple-300 text-purple-600 focus:ring-purple-500"/>
            <div>
              <div class="text-sm font-semibold text-purple-700 dark:text-purple-300">🔒 Controlled Substance</div>
              <div class="text-[11px] text-purple-600 dark:text-purple-400">Requires prescription at POS</div>
            </div>
          </label>
        </div>

        <!-- Batch + Rack + Manufacturer -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Batch Number <span class="text-rose-500">*</span></label>
            <input id="med-batch" name="batchNo" type="text" required value="${escapeAttr(p.batchNo)}"
                   placeholder="e.g., BTH-9021"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Rack / Storage</label>
            <input id="med-rack" name="rackNo" type="text" value="${escapeAttr(p.rackNo)}"
                   placeholder="e.g., Rack G-04 or Fridge A"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Manufacturer</label>
            <input id="med-man" name="manufacturer" type="text" value="${escapeAttr(p.manufacturer || '')}"
                   placeholder="e.g., Acme Pharma"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
        </div>

        <!-- 3-Way AI Medicine Image Assistant -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Medicine Image</label>
          <div class="flex items-start gap-3">
            <div id="med-img-preview" class="w-20 h-20 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center flex-shrink-0 border border-slate-200 dark:border-slate-700">
              <img src="${escapeAttr(getProductImageUrl(p))}" alt="${escapeAttr(p.name || 'Medicine')}" class="w-full h-full object-cover" onerror="this.src='${getFallbackImageSvg()}'"/>
            </div>
            <div class="flex-1 space-y-2">
              <!-- 3-Way Action Bar -->
              <div class="flex flex-wrap gap-2" role="group" aria-label="Image source options">
                <button type="button" id="med-img-library" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Pick from local library">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>Library</span>
                </button>
                <button type="button" id="med-img-fetch" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm font-medium hover:bg-sky-100 dark:hover:bg-sky-800/50 transition-colors" title="Search real medicine photos">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <span>AI Fetch</span>
                </button>
                <button type="button" id="med-img-generate" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-800/50 transition-colors" title="Generate 3D pharmaceutical mockup">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  <span>AI Generate</span>
                </button>
                <button type="button" id="med-img-upload-btn" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Upload custom image">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>Upload</span>
                </button>
                <button type="button" id="med-img-clear" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" ${p.imageUrl ? '' : 'style="display:none"'} title="Clear image">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <span>Clear</span>
                </button>
              </div>
              <input id="med-img-upload" type="file" accept="image/*" class="hidden"/>
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Library: local uploads | AI Fetch: Pexels/Wikimedia search | AI Generate: Pollinations 3D mockup</p>
            </div>
          </div>
        </div>

        <!-- Expiry -->
        <div>
          <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Expiry Month <span class="text-rose-500">*</span></label>
          <input id="med-expiry" name="expiryDate" type="month" required value="${escapeAttr(p.expiryDate)}"
                 class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Format: YYYY-MM</p>
        </div>

        <!-- Packaging -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Strips per Box</label>
            <input id="med-spb" name="stripsPerBox" type="number" min="1" step="1" value="${escapeAttr(p.stripsPerBox)}"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Tablets per Strip</label>
            <input id="med-tps" name="tabletsPerStrip" type="number" min="1" step="1" value="${escapeAttr(p.tabletsPerStrip)}"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">${isEdit ? 'Current Stock (base units)' : 'Initial Stock (base units)'} <span class="text-rose-500">*</span></label>
            <input id="med-stock" name="totalBaseUnits" type="number" min="0" step="1" required value="${escapeAttr(p.totalBaseUnits)}"
                   placeholder="0"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
            <p id="med-stock-preview" class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">—</p>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Low Stock Alert Threshold (Base Units) <span class="text-rose-500">*</span></label>
            <input id="med-minstock" name="minStockLevel" type="number" min="0" step="1" required value="${escapeAttr(p.minStockLevel ?? 10)}"
                   placeholder="10"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Triggers low stock badge & warnings when current stock falls to or below this base unit value.</p>
          </div>
        </div>

        <!-- Pricing -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Box Price (₨) <span class="text-rose-500">*</span></label>
            <input id="med-pricebox" name="boxUnitPrice" type="number" min="0" step="0.01" required value="${escapeAttr(p.boxUnitPrice)}"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Strip Price (₨)</label>
            <input id="med-pricestrip" name="stripUnitPrice" type="number" min="0" step="0.01" value="${escapeAttr(p.stripUnitPrice)}"
                   placeholder="auto"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Tablet Price (₨)</label>
            <input id="med-pricetab" name="tabletUnitPrice" type="number" min="0" step="0.01" value="${escapeAttr(p.tabletUnitPrice)}"
                   placeholder="auto"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost / Base Unit (₨)</label>
            <input id="med-cost" name="costPrice" type="number" min="0" step="0.01" value="${escapeAttr(p.costPrice)}"
                   class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
        </div>

        <div class="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" data-close class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" id="med-save"
                  class="px-5 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm font-semibold shadow-md shadow-teal-500/30">
            ${isEdit ? 'Save Changes' : 'Add Medicine'}
          </button>
        </div>
      </form>
    </div>
  `, {
    size: 'full',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));

      // 3-Way AI Medicine Image Assistant
      const imgPreview = root.querySelector('#med-img-preview img');
      const libraryBtn = root.querySelector('#med-img-library');
      const fetchBtn = root.querySelector('#med-img-fetch');
      const generateBtn = root.querySelector('#med-img-generate');
      const uploadBtn = root.querySelector('#med-img-upload-btn');
      const uploadInput = root.querySelector('#med-img-upload');
      const clearBtn = root.querySelector('#med-img-clear');
      let selectedImageUrl = p.imageUrl || '';

      // Helper to update preview and state
      const setImage = (url) => {
        selectedImageUrl = url;
        imgPreview.src = url;
        clearBtn.style.display = 'inline-flex';
      };

      // 1. Pick from Library
      libraryBtn?.addEventListener('click', () => {
        const images = loadImageLibrary();
        if (images.length === 0) {
          showToast('No images in library. Upload some in Settings first.', 'warn');
          return;
        }
        showModal(`
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold">Select from Library</h3>
              <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
              ${images.map(img => `
                <div class="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 cursor-pointer hover:border-teal-400 dark:hover:border-teal-500" data-img-select="${img.id}">
                  <div class="w-full aspect-square rounded bg-slate-100 dark:bg-slate-900 overflow-hidden">
                    <img src="${img.dataUrl}" alt="${img.name}" class="w-full h-full object-cover"/>
                  </div>
                  <div class="text-[10px] text-center truncate mt-1">${escapeHtml(img.name)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `, {
          size: 'lg',
          onMount: (libRoot) => {
            libRoot.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
            libRoot.querySelectorAll('[data-img-select]').forEach(el => {
              el.addEventListener('click', () => {
                const img = getImageById(el.dataset.imgSelect);
                if (img) {
                  setImage(img.dataUrl);
                  hideModal();
                }
              });
            });
          }
        });
      });

      // 2. AI Fetch (Search Real Photo) - Pexels + Wikimedia fallback
      fetchBtn?.addEventListener('click', async () => {
        const nameInput = root.querySelector('#med-name');
        const medicineName = nameInput?.value?.trim();
        if (!medicineName) {
          showToast('Please enter Medicine Name first to fetch/generate an image', 'warn');
          nameInput?.focus();
          return;
        }

        const originalText = fetchBtn.innerHTML;
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = `<svg class="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Searching...`;

        try {
          // Try Pexels first
          let images = [];
          try {
            const { searchMedicineImages } = await import('../../services/aiFallbackService.js');
            images = await searchMedicineImages(medicineName, { perPage: 3 });
          } catch (pexelsErr) {
            console.warn('[Image Assistant] Pexels failed, trying Wikimedia:', pexelsErr);
          }

          // Fallback to Wikimedia Commons
          if (images.length === 0) {
            try {
              const { searchWikimediaImages } = await import('../../services/aiFallbackService.js');
              images = await searchWikimediaImages(medicineName, { limit: 3 });
            } catch (wikiErr) {
              console.warn('[Image Assistant] Wikimedia failed:', wikiErr);
            }
          }

          if (images.length === 0) {
            showToast('No images found for this medicine', 'warn');
            return;
          }

          // Show results modal
          showModal(`
            <div class="p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold">AI Fetch Results for "${escapeHtml(medicineName)}"</h3>
                <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                ${images.map((img, i) => `
                  <button type="button" class="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 cursor-pointer hover:border-sky-400 dark:hover:border-sky-500 transition" data-fetch-select="${i}">
                    <div class="w-full aspect-square rounded bg-slate-100 dark:bg-slate-900 overflow-hidden">
                      <img src="${img.url}" alt="${img.alt || img.title || medicineName}" class="w-full h-full object-cover" onerror="this.style.display='none'">
                    </div>
                    <div class="text-[10px] text-center truncate mt-1">${escapeHtml(img.photographer ? `by ${img.photographer}` : img.title || 'AI Fetch')}</div>
                  </button>
                `).join('')}
              </div>
              <p class="mt-2 text-xs text-slate-500 text-center">Click an image to select</p>
            </div>
          `, {
            size: 'lg',
            onMount: (fetchRoot) => {
              fetchRoot.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
              fetchRoot.querySelectorAll('[data-fetch-select]').forEach(btn => {
                btn.addEventListener('click', () => {
                  const img = images[parseInt(btn.dataset.fetchSelect)];
                  if (img) {
                    setImage(img.url);
                    hideModal();
                    showToast('Image fetched from AI search', 'success');
                  }
                });
              });
            }
          });
        } catch (err) {
          console.error('[Image Assistant] Fetch failed:', err);
          showToast('Failed to fetch image: ' + err.message, 'error');
        } finally {
          fetchBtn.disabled = false;
          fetchBtn.innerHTML = originalText;
        }
      });

      // 3. AI Generate (3D Mockup) - Pollinations
      generateBtn?.addEventListener('click', async () => {
        const nameInput = root.querySelector('#med-name');
        const medicineName = nameInput?.value?.trim();
        if (!medicineName) {
          showToast('Please enter Medicine Name first to fetch/generate an image', 'warn');
          nameInput?.focus();
          return;
        }

        const originalText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<svg class="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Generating...`;

        try {
          const { generatePollinationsImage } = await import('../../services/aiFallbackService.js');
          const prompt = `Photorealistic 3D commercial pharmaceutical box package for ${medicineName}, clean studio lighting, high resolution product shot, white background, professional product photography`;
          const imageUrl = generatePollinationsImage(prompt, { width: 800, height: 800, nologo: true });

          // Preload image to verify it works
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
          });

          setImage(imageUrl);
          showToast('3D mockup generated successfully', 'success');
        } catch (err) {
          console.error('[Image Assistant] Generate failed:', err);
          showToast('Failed to generate image: ' + err.message, 'error');
        } finally {
          generateBtn.disabled = false;
          generateBtn.innerHTML = originalText;
        }
      });

      // 4. Upload custom image
      uploadBtn?.addEventListener('click', () => {
        uploadInput?.click();
      });

      uploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'warn'); return; }
        if (file.size > 2 * 1024 * 1024) { showToast('Image must be smaller than 2 MB.', 'warn'); return; }
        try {
          const { addImageToLibrary } = await import('../../config.js');
          const img = await addImageToLibrary(file, file.name.replace(/\.[^/.]+$/, ''));
          setImage(img.dataUrl);
          showToast('Image uploaded to library', 'success');
        } catch (err) {
          console.error(err);
          showToast('Failed to upload image', 'error');
        }
        e.target.value = '';
      });

      clearBtn?.addEventListener('click', () => {
        selectedImageUrl = '';
        imgPreview.src = getFallbackImageSvg();
        clearBtn.style.display = 'none';
      });

      // Store selectedImageUrl for form submission
      root._selectedImageUrl = selectedImageUrl;
      const originalSetImage = setImage;
      root._setImage = (url) => {
        originalSetImage(url);
        root._selectedImageUrl = url;
      };

      // Live auto-pricing
      const spbI = root.querySelector('#med-spb');
      const tpsI = root.querySelector('#med-tps');
      const boxI = root.querySelector('#med-pricebox');
      const stripI = root.querySelector('#med-pricestrip');
      const tabI = root.querySelector('#med-pricetab');
      const stockI = root.querySelector('#med-stock');
      const previewI = root.querySelector('#med-stock-preview');

      function autoPrice() {
        const spb = Math.max(1, parseInt(spbI.value, 10) || 1);
        const tps = Math.max(1, parseInt(tpsI.value, 10) || 1);
        const box = parseFloat(boxI.value) || 0;
        // If user hasn't overridden, recompute
        if (!stripI.dataset.touched) stripI.value = (box / spb).toFixed(2);
        if (!tabI.dataset.touched)   tabI.value   = ((parseFloat(stripI.value) || (box / spb)) / tps).toFixed(2);
      }
      function updateStockPreview() {
        const total = Math.max(0, parseInt(stockI.value, 10) || 0);
        const spb = Math.max(1, parseInt(spbI.value, 10) || 1);
        const tps = Math.max(1, parseInt(tpsI.value, 10) || 1);
        previewI.textContent = `= ${formatPackagingShort(total, { stripsPerBox: spb, tabletsPerStrip: tps })}`;
      }
      [spbI, tpsI, boxI].forEach(el => el.addEventListener('input', () => { autoPrice(); updateStockPreview(); }));
      stripI.addEventListener('input', () => { stripI.dataset.touched = '1'; tabI.dataset.touched = ''; autoPrice(); });
      tabI.addEventListener('input',   () => { tabI.dataset.touched = '1'; });
      stockI.addEventListener('input', updateStockPreview);
      autoPrice(); updateStockPreview();

      root.querySelector('#med-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmit(product, root);
      });
    }
  });
}

function handleFormSubmit(existingProduct, root) {
  const get = id => root.querySelector(id)?.value;
  const checked = id => !!root.querySelector(id)?.checked;

  const name      = (get('#med-name') || '').trim();
  const generic   = (get('#med-generic') || '').trim();
  const category  = (get('#med-category') || '').trim();
  const packType  = (get('#med-packtype') || 'Box').trim();
  const batchNo   = (get('#med-batch') || '').trim();
  const rackNo    = (get('#med-rack') || '').trim();
  const manufacturer = (get('#med-man') || '').trim();
  const expiry    = (get('#med-expiry') || '').trim();
  // Image URL - get from the preview img src (if it's not the fallback)
  const imgPreview = root.querySelector('#med-img-preview img');
  let imageUrl = '';
  if (imgPreview && imgPreview.src && !imgPreview.src.includes('data:image/svg+xml')) {
    imageUrl = imgPreview.src;
  }

  const spb       = Math.max(1, parseInt(get('#med-spb'), 10) || 1);
  const tps       = Math.max(1, parseInt(get('#med-tps'), 10) || 1);
  const stockRaw  = (get('#med-stock') || '').trim();
  const minStockRaw = (get('#med-minstock') || '').trim();
  const boxPriceRaw  = (get('#med-pricebox') || '').trim();
  const stripPriceRaw= (get('#med-pricestrip') || '').trim();
  const tabPriceRaw  = (get('#med-pricetab') || '').trim();
  const costRaw   = (get('#med-cost') || '').trim();

  const isColdChain   = checked('#med-cold');
  const isControlled  = checked('#med-controlled');

  // ---- Validation
  if (!name)                 { showToast('Medicine name is required.', 'warn'); return; }
  if (!category)             { showToast('Category is required.', 'warn'); return; }
  if (!batchNo)              { showToast('Batch number is required.', 'warn'); return; }
  if (!expiry)               { showToast('Expiry date is required.', 'warn'); return; }
  if (!/^\d{4}-\d{2}$/.test(expiry)) { showToast('Expiry must be in YYYY-MM format.', 'warn'); return; }
  if (stockRaw === '' || isNaN(parseInt(stockRaw, 10))) { showToast('Stock must be a valid integer.', 'warn'); return; }
  if (parseInt(stockRaw, 10) < 0) { showToast('Stock cannot be negative.', 'warn'); return; }
  if (minStockRaw === '' || isNaN(parseInt(minStockRaw, 10))) { showToast('Low stock threshold must be a valid integer.', 'warn'); return; }
  if (parseInt(minStockRaw, 10) < 0) { showToast('Low stock threshold cannot be negative.', 'warn'); return; }
  if (boxPriceRaw === '' || isNaN(parseFloat(boxPriceRaw))) { showToast('Box price is required.', 'warn'); return; }
  if (parseFloat(boxPriceRaw) < 0) { showToast('Box price cannot be negative.', 'warn'); return; }
  if (costRaw !== '' && (isNaN(parseFloat(costRaw)) || parseFloat(costRaw) < 0)) {
    showToast('Cost price must be a valid number.', 'warn'); return;
  }

  const boxUnitPrice = parseFloat(boxPriceRaw);
  const stripUnitPrice = stripPriceRaw === '' ? +(boxUnitPrice / spb).toFixed(2) : parseFloat(stripPriceRaw);
  const tabletUnitPrice = tabPriceRaw === '' ? +(stripUnitPrice / tps).toFixed(2) : parseFloat(tabPriceRaw);
  const costPrice = costRaw === '' ? 0 : parseFloat(costRaw);
  const totalBaseUnits = Math.floor(parseInt(stockRaw, 10));
  const minStockLevel = Math.floor(parseInt(minStockRaw, 10));

  const payload = {
    name, genericName: generic, category, packType,
    batchNo, rackNo, manufacturer, expiryDate: expiry,
    stripsPerBox: spb, tabletsPerStrip: tps, totalBaseUnits,
    minStockLevel,
    boxUnitPrice, stripUnitPrice, tabletUnitPrice,
    costPrice, isColdChain, isControlled,
    imageUrl,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (existingProduct?.id) {
      updateProduct({ ...existingProduct, ...payload, id: existingProduct.id });
      showToast(`${name} updated — Saved & Synced with GitHub`, 'success');
    } else {
      addProduct(payload);
      showToast(`${name} added — Saved & Synced with GitHub`, 'success');
    }
    hideModal();
    rerenderTable();
  } catch (err) {
    console.error(err);
    showToast('Failed to save medicine.', 'error', 5000);
  }
}

// ============================================================
// 7. DELETE
// ============================================================

function handleDelete(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) { showToast('Medicine not found.', 'error'); return; }
  showModal(`
    <div class="p-6" id="delete-modal">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold">Delete Medicine</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
        </div>
      </div>
      <p class="text-sm text-slate-700 dark:text-slate-300">Are you sure you want to delete <strong>${escapeHtml(p.name)}</strong>?</p>
      <div class="mt-5 flex justify-end gap-2">
        <button data-action="cancel-delete" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
        <button data-action="confirm-delete" data-id="${escapeAttr(id)}" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-md shadow-rose-500/30">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: (root) => {
      // Event delegation for delete modal
      root.addEventListener('click', (e) => {
        // Cancel button
        if (e.target.closest('[data-action="cancel-delete"]')) {
          hideModal();
          return;
        }
        
        // Confirm delete button
        const confirmBtn = e.target.closest('[data-action="confirm-delete"]');
        if (confirmBtn) {
          const deleteId = confirmBtn.dataset.id;
          try {
            const product = state.products.find(x => x.id === deleteId);
            deleteProduct(deleteId);
            showToast(`${product?.name || 'Medicine'} deleted — Saved & Synced with GitHub`, 'success');
            hideModal();
            rerenderTable();
          } catch (err) {
            console.error(err);
            showToast('Failed to delete medicine.', 'error');
          }
          return;
        }
      });
    }
  });
}

// ============================================================
// 8. PARTIAL RE-RENDER
// ============================================================

function rerenderTable() {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  const products = Array.isArray(state.products) ? state.products : [];
  const filtered = applyFilters(products);
  tbody.innerHTML = filtered.length === 0 ? emptyState() : filtered.map(renderRow).join('');

  // Update header counts
  try {
    const counts = countByStatus(products);
    const headerSub = document.querySelector('main h1')?.parentElement?.querySelector('p');
    if (headerSub) {
      headerSub.textContent =
        `${products.length} medicine${products.length === 1 ? '' : 's'} · ${counts.low} low · ${counts.expiring} expiring · ${counts.expired} expired · ${counts.cold} cold-chain · ${counts.controlled} controlled`;
    }
    // Update tab counts
    document.querySelectorAll('.inv-tab').forEach(btn => {
      const key = btn.dataset.tab;
      const chip = btn.querySelector('span:last-child');
      if (!chip) return;
      const v = (key === 'all') ? products.length : counts[key] || 0;
      chip.textContent = String(v);
    });
  } catch {}
}