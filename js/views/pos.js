// js/views/pos.js
// Dripp Medicos — Cash Counter / Multi-Unit POS Terminal.
//
// Adds multi-unit billing (Box/Strip/Tablet) with a unit-selection modal,
// controlled-substance guard (Doctor + CNIC required at checkout), cold-chain
// storage note in the thermal receipt, and dual-sync of products + sales on
// completion.

import { state, updateProduct, addSale, getCashier } from '../state.js';
import { CATEGORIES, generateSaleId, fmtCurrency, baseUnitsFor, priceForUnit, maxQtyForUnit, unitLabel, formatPackagingShort, splitBaseUnits } from '../config.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';
import { getProductStatus } from './inventory.js';

// ============================================================
// Module-local session state
// ============================================================

/**
 * posCart items:
 *   { id, name, genericName, batchNo, unit, qty, baseUnits, unitPrice, subtotal, isColdChain, isControlled }
 */
const posCart = [];

const session = {
  query: '',
  category: 'all',
  patientName: '',
  patientPhone: '',
  patientCnic: '',
  doctorName: '',
  discountMode: 'flat',
  discountValue: 0,
  cashReceived: 0,
};

// ============================================================
// 1. MAIN RENDER
// ============================================================

export function renderPOSView() {
  const products = Array.isArray(state.products) ? state.products : [];
  const filtered = applyCatalogFilters(products);
  const summary  = computeSummary();
  const controlledRequired = posCart.some(it => it.isControlled);

  return `
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">

      <!-- ============ LEFT: Catalog (60%) ============ -->
      <section class="lg:col-span-3 space-y-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div class="relative">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="pos-search" type="text" value="${escapeAttr(session.query)}"
                   placeholder="Search by name, generic, batch, or rack…"
                   class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3">
          <div id="pos-pills" class="flex gap-2 overflow-x-auto pb-1">
            ${renderPill('all', 'All')}
            ${CATEGORIES.map(c => renderPill(c, c)).join('')}
          </div>
        </div>

        <div id="pos-grid" class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          ${filtered.length === 0
            ? `<div class="col-span-full py-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">No medicines match your filters.</div>`
            : filtered.map(renderProductCard).join('')
          }
        </div>
      </section>

      <!-- ============ RIGHT: Cart + Billing (40%) ============ -->
      <aside class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col h-[calc(100vh-7rem)] sticky top-24">

        <!-- Patient / Doctor / CNIC -->
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Patient Name</label>
            <input id="pos-patient" type="text" value="${escapeAttr(session.patientName)}" placeholder="Optional"
                   class="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"/>
          </div>
          <div>
            <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Phone</label>
            <input id="pos-phone" type="text" value="${escapeAttr(session.patientPhone)}" placeholder="Optional"
                   class="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"/>
          </div>
          <div class="col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider ${controlledRequired ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500'} mb-1">
                Doctor ${controlledRequired ? '<span class="text-rose-500">*</span>' : ''}
              </label>
              <input id="pos-doctor" type="text" value="${escapeAttr(session.doctorName)}" placeholder="${controlledRequired ? 'REQUIRED' : 'Optional'}"
                     class="w-full px-2.5 py-1.5 rounded-md border ${controlledRequired ? 'border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'} text-xs"/>
            </div>
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider ${controlledRequired ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500'} mb-1">
                Patient CNIC ${controlledRequired ? '<span class="text-rose-500">*</span>' : ''}
              </label>
              <input id="pos-cnic" type="text" value="${escapeAttr(session.patientCnic)}" placeholder="${controlledRequired ? 'REQUIRED' : 'Optional'}"
                     class="w-full px-2.5 py-1.5 rounded-md border ${controlledRequired ? 'border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'} text-xs"/>
            </div>
          </div>
          ${controlledRequired ? `
            <div class="col-span-2 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md px-2 py-1.5 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Controlled substance in cart — Doctor &amp; CNIC required to complete sale.
            </div>
          ` : ''}
        </div>

        <!-- Cart header -->
        <div class="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="text-sm font-bold flex items-center gap-2">
            <svg class="w-4 h-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>
            </svg>
            Current Bill
          </div>
          <div class="flex items-center gap-2">
            <span id="pos-item-count" class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${posCart.length} item${posCart.length === 1 ? '' : 's'}</span>
            <button id="pos-clear" class="text-[11px] px-2.5 py-1 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60">Clear</button>
          </div>
        </div>

        <div id="pos-cart" class="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          ${posCart.length === 0 ? renderEmptyCart() : posCart.map(renderCartRow).join('')}
        </div>

        <!-- Billing summary -->
        <div class="border-t border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">Gross Total</span>
            <span id="pos-gross" class="font-semibold">${fmtCurrency(summary.grossTotal)}</span>
          </div>
          <div class="flex justify-between items-center gap-2">
            <span class="text-slate-500 dark:text-slate-400">Discount</span>
            <div class="flex items-center gap-1">
              <div class="inline-flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-700">
                <button data-dmode="flat"    class="pos-dmode-btn px-2 py-1 text-[11px] font-semibold ${session.discountMode === 'flat'    ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800'}">₨</button>
                <button data-dmode="percent" class="pos-dmode-btn px-2 py-1 text-[11px] font-semibold ${session.discountMode === 'percent' ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800'}">%</button>
              </div>
              <input id="pos-discount" type="number" min="0" step="0.01" value="${escapeAttr(session.discountValue)}"
                     class="w-20 px-2 py-1 text-right text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"/>
            </div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Discount applied</span>
            <span id="pos-discount-amt">− ${fmtCurrency(summary.discountAmount)}</span>
          </div>
          <div class="flex justify-between text-base font-bold pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Net Payable</span>
            <span id="pos-net" class="text-teal-600 dark:text-teal-400">${fmtCurrency(summary.netTotal)}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Cash Received</label>
              <input id="pos-cash" type="number" min="0" step="0.01" value="${escapeAttr(session.cashReceived)}"
                     class="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"/>
            </div>
            <div>
              <label class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Change Due</label>
              <div id="pos-change" class="w-full px-2.5 py-1.5 rounded-md border text-sm font-mono font-bold ${summary.changeDueClass}">${fmtCurrency(summary.changeDue)}</div>
            </div>
          </div>

          <button id="pos-checkout" ${posCart.length === 0 ? 'disabled' : ''}
                  class="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-bold shadow-lg shadow-teal-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.99] flex items-center justify-center gap-2">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Complete Sale &amp; Print Receipt
          </button>
        </div>
      </aside>
    </div>

    <div id="thermal-receipt" class="hidden print-only-root"></div>

    <style>
      @media print {
        body * { visibility: hidden !important; }
        #thermal-receipt, #thermal-receipt * { visibility: visible !important; }
        #thermal-receipt {
          position: absolute !important;
          left: 0; top: 0;
          width: 80mm;
          padding: 4mm;
          background: #fff;
          color: #000;
        }
      }
      .thermal-receipt { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.35; color: #000; }
      .thermal-receipt .center { text-align: center; }
      .thermal-receipt .bold   { font-weight: 700; }
      .thermal-receipt .row    { display: flex; justify-content: space-between; gap: 4mm; }
      .thermal-receipt .divider{ border-top: 1px dashed #000; margin: 2mm 0; }
      .thermal-receipt table   { width: 100%; border-collapse: collapse; }
      .thermal-receipt td      { vertical-align: top; padding: 1px 0; }
    </style>
  `;
}

// ============================================================
// 2. MOUNT
// ============================================================

export function mountPOS() {
  document.getElementById('pos-search')?.addEventListener('input', (e) => { session.query = e.target.value; rerenderGrid(); });
  document.getElementById('pos-pills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-pill]'); if (!pill) return;
    session.category = pill.dataset.pill; rerenderGrid();
  });
  document.getElementById('pos-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-add]');
    if (!card) return;
    openUnitSelector(card.dataset.add);
  });

  document.getElementById('pos-patient')?.addEventListener('input', e => session.patientName  = e.target.value);
  document.getElementById('pos-phone')?.addEventListener('input',   e => session.patientPhone = e.target.value);
  document.getElementById('pos-doctor')?.addEventListener('input',  e => session.doctorName   = e.target.value);
  document.getElementById('pos-cnic')?.addEventListener('input',    e => session.patientCnic  = e.target.value);

  document.getElementById('pos-cart')?.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-cart-inc]');
    const dec = e.target.closest('[data-cart-dec]');
    const rm  = e.target.closest('[data-cart-rm]');
    if (inc) return incCart(inc.dataset.cartInc, +1);
    if (dec) return incCart(dec.dataset.cartDec, -1);
    if (rm)  return rmCart(rm.dataset.cartRm);
  });
  document.getElementById('pos-cart')?.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-cart-qty]');
    if (!inp) return;
    setCartQty(inp.dataset.cartQty, inp.value);
  });

  document.getElementById('pos-clear')?.addEventListener('click', confirmClearCart);

  document.querySelectorAll('.pos-dmode-btn').forEach(b => {
    b.addEventListener('click', () => { session.discountMode = b.dataset.dmode; rerenderSummary(); });
  });
  document.getElementById('pos-discount')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value); session.discountValue = Number.isFinite(v) && v >= 0 ? v : 0;
    rerenderSummary();
  });
  document.getElementById('pos-cash')?.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value); session.cashReceived = Number.isFinite(v) && v >= 0 ? v : 0;
    rerenderSummary();
  });

  document.getElementById('pos-checkout')?.addEventListener('click', handleCheckout);
}

// ============================================================
// 3. CATALOG RENDERING
// ============================================================

function renderPill(key, label) {
  const active = session.category === key;
  return `
    <button data-pill="${escapeAttr(key)}"
            class="pos-pill whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition
                   ${active
                     ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                     : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}">
      ${escapeHtml(label)}
    </button>`;
}

function applyCatalogFilters(products) {
  const q = (session.query || '').trim().toLowerCase();
  return products.filter(p => {
    if (session.category !== 'all' && p.category !== session.category) return false;
    if (!q) return true;
    const hay = `${p.name || ''} ${p.genericName || ''} ${p.batchNo || ''} ${p.rackNo || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderProductCard(p) {
  const stock = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
  const status = getProductStatus(p);
  const outOfStock = stock <= 0;
  const isExpired  = status.isExpired === true;
  const disabled   = outOfStock || isExpired;
  const disabledClasses = disabled ? 'opacity-50 pointer-events-none' : 'hover:shadow-md hover:border-teal-400 dark:hover:border-teal-500 cursor-pointer';

  const stockChip = outOfStock
    ? `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">OUT</span>`
    : stock <= 50
      ? `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">${formatPackagingShort(stock, p)}</span>`
      : `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">${formatPackagingShort(stock, p)}</span>`;

  const flagBadges = [];
  if (p.isColdChain) {
    flagBadges.push(`<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">❄️ 2-8°C</span>`);
  }
  if (p.isControlled) {
    flagBadges.push(`<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">🔒 Rx</span>`);
  }

  const overlay = isExpired
    ? `<div class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl"><span class="px-2 py-1 rounded-md text-[10px] font-bold bg-red-700 text-white shadow">EXPIRED — SALE BLOCKED</span></div>`
    : outOfStock
      ? `<div class="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl"><span class="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-700 text-white shadow">OUT OF STOCK</span></div>`
      : '';

  return `
    <div class="relative">
      <button data-add="${escapeAttr(p.id)}" ${disabled ? 'aria-disabled="true" tabindex="-1"' : ''}
              class="relative text-left w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 transition ${disabledClasses}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-semibold truncate">${escapeHtml(p.name || 'Unnamed')}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 italic truncate">${escapeHtml(p.genericName || '')}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(p.category || '—')}</div>
          </div>
          ${stockChip}
        </div>
        <div class="mt-2 flex items-end justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">Batch: <span class="font-mono">${escapeHtml(p.batchNo || '—')}</span></div>
            <div class="text-[11px] ${p.isColdChain ? 'text-sky-600 dark:text-sky-400 font-semibold' : 'text-slate-500 dark:text-slate-400'} truncate">Rack: ${escapeHtml(p.rackNo || '—')}</div>
            <div class="mt-1 flex flex-wrap gap-1">${flagBadges.join('')}</div>
          </div>
          <div class="text-right whitespace-nowrap">
            <div class="text-sm font-bold text-teal-600 dark:text-teal-400">${fmtCurrency(p.boxUnitPrice)}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400">per Box</div>
          </div>
        </div>
      </button>
      ${overlay}
    </div>
  `;
}

// ============================================================
// 4. UNIT SELECTOR (Box / Strip / Tablet) — when adding to cart
// ============================================================

function openUnitSelector(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) { showToast('Product not found.', 'error'); return; }
  const status = getProductStatus(product);
  if ((Math.max(0, parseInt(product.totalBaseUnits, 10) || 0)) <= 0) { showToast(`${product.name} is out of stock.`, 'error'); return; }
  if (status.isExpired) { showToast(`${product.name} is expired — sale blocked.`, 'error'); return; }

  const maxBox   = maxQtyForUnit('Box',    product);
  const maxStrip = maxQtyForUnit('Strip',  product);
  const maxTab   = maxQtyForUnit('Tablet', product);

  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-bold">Select Sale Unit</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(product.name)} · Batch ${escapeHtml(product.batchNo || '—')}</p>
        </div>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
        In stock: <span class="font-semibold text-slate-700 dark:text-slate-200">${formatPackagingShort(product.totalBaseUnits, product)}</span>
        ${product.isColdChain ? '<span class="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-[10px] font-bold">❄️ Cold chain</span>' : ''}
        ${product.isControlled ? '<span class="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] font-bold">🔒 Rx required</span>' : ''}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        ${unitButton('Box',    maxBox,   product)}
        ${unitButton('Strip',  maxStrip, product)}
        ${unitButton('Tablet', maxTab,   product)}
      </div>

      <div class="mt-4 text-[11px] text-slate-500 dark:text-slate-400 text-center">Tap a unit to add 1 × to the cart, or use the +/− buttons to set a quantity.</div>
    </div>
  `, {
    size: 'md',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelectorAll('[data-unit-add]').forEach(b => {
        b.addEventListener('click', () => {
          const unit = b.dataset.unitAdd;
          const qtyInput = root.querySelector(`[data-unit-qty="${unit}"]`);
          const q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          addToCart(product.id, unit, q);
          hideModal();
        });
      });
    }
  });
}

function unitButton(unit, maxQty, product) {
  const price = priceForUnit(unit, product);
  const disabled = maxQty <= 0;
  return `
    <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-4 ${disabled ? 'opacity-50' : ''}">
      <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">${unit}</div>
      <div class="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400">${fmtCurrency(price)}</div>
      <div class="text-[11px] text-slate-500 dark:text-slate-400">per ${unit.toLowerCase()}</div>
      <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Available: <span class="font-semibold">${maxQty}</span></div>
      <div class="mt-3 flex items-center gap-1">
        <button data-unit-dec="${escapeAttr(unit)}" class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">−</button>
        <input data-unit-qty="${escapeAttr(unit)}" type="number" min="1" value="1" max="${maxQty}"
               class="w-14 text-center px-1 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"/>
        <button data-unit-inc="${escapeAttr(unit)}" class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">+</button>
      </div>
      <button data-unit-add="${escapeAttr(unit)}" ${disabled ? 'disabled' : ''}
              class="mt-3 w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
        Add to Bill
      </button>
    </div>
  `;
}

// ============================================================
// 5. CART
// ============================================================

function addToCart(productId, unit, qty) {
  const product = state.products.find(p => p.id === productId);
  if (!product) { showToast('Product not found.', 'error'); return; }

  const stock = Math.max(0, parseInt(product.totalBaseUnits, 10) || 0);
  if (stock <= 0) { showToast(`${product.name} is out of stock.`, 'error'); return; }
  if (getProductStatus(product).isExpired) { showToast(`${product.name} is expired — sale blocked.`, 'error'); return; }

  const wantedBase = baseUnitsFor(unit, qty, product);
  if (wantedBase > stock) {
    showToast(`Cannot exceed available stock (${formatPackagingShort(stock, product)}).`, 'warn');
    return;
  }

  // Merge with existing line of same product + same unit
  const key = `${product.id}::${unit}`;
  const existing = posCart.find(c => c.id === product.id && c.unit === unit);
  if (existing) {
    const newQty = existing.qty + qty;
    const newBase = baseUnitsFor(unit, newQty, product);
    if (newBase > stock) {
      showToast(`Cannot exceed available stock (${formatPackagingShort(stock, product)}).`, 'warn');
      return;
    }
    existing.qty = newQty;
    existing.baseUnits = newBase;
    existing.unitPrice = priceForUnit(unit, product);
    existing.subtotal = +(existing.unitPrice * newQty).toFixed(2);
  } else {
    posCart.push({
      id: product.id,
      name: product.name,
      genericName: product.genericName || '',
      batchNo: product.batchNo || '—',
      unit,
      qty,
      baseUnits: wantedBase,
      unitPrice: priceForUnit(unit, product),
      subtotal: +(priceForUnit(unit, product) * qty).toFixed(2),
      isColdChain: product.isColdChain === true,
      isControlled: product.isControlled === true,
    });
  }
  showToast(`Added: ${product.name} × ${qty} ${unitLabel(unit)}`, 'success', 1500);
  rerenderCartAndSummary();
}

function incCart(id, delta) {
  // cart row keys encode product + unit via the data attribute (id::unit)
  const [pid, unit] = id.split('::');
  const item = posCart.find(c => c.id === pid && c.unit === unit);
  if (!item) return;
  const product = state.products.find(p => p.id === pid);
  if (!product) return;
  const next = item.qty + delta;
  if (delta > 0 && baseUnitsFor(unit, next, product) > (parseInt(product.totalBaseUnits, 10) || 0)) {
    showToast(`Cannot exceed available stock (${formatPackagingShort(product.totalBaseUnits, product)}).`, 'warn');
    return;
  }
  if (next <= 0) return rmCart(id);
  item.qty = next;
  item.baseUnits = baseUnitsFor(unit, next, product);
  item.subtotal = +(item.unitPrice * next).toFixed(2);
  rerenderCartAndSummary();
}

function setCartQty(id, raw) {
  const [pid, unit] = id.split('::');
  const item = posCart.find(c => c.id === pid && c.unit === unit);
  if (!item) return;
  const product = state.products.find(p => p.id === pid);
  if (!product) return;
  let v = parseInt(raw, 10);
  if (!Number.isFinite(v) || v < 1) v = 1;
  const max = maxQtyForUnit(unit, product);
  if (v > max) { v = max; showToast(`Capped at available stock (${max}).`, 'warn'); }
  item.qty = v;
  item.baseUnits = baseUnitsFor(unit, v, product);
  item.subtotal = +(item.unitPrice * v).toFixed(2);
  rerenderCartAndSummary();
}

function rmCart(id) {
  const [pid, unit] = id.split('::');
  const i = posCart.findIndex(c => c.id === pid && c.unit === unit);
  if (i >= 0) posCart.splice(i, 1);
  rerenderCartAndSummary();
}

function confirmClearCart() {
  if (posCart.length === 0) return;
  showModal(`
    <div class="p-6">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold">Clear Cart?</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">This will discard all items in the current bill.</p>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-md shadow-rose-500/30">Clear All</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: (root) => {
      root.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      root.querySelector('[data-confirm]')?.addEventListener('click', () => {
        posCart.length = 0;
        hideModal();
        showToast('Cart cleared.', 'info');
        rerenderCartAndSummary();
      });
    }
  });
}

function renderEmptyCart() {
  return `
    <div class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-8">
      <svg class="w-12 h-12 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>
      </svg>
      <div class="text-sm font-medium">Cart is empty</div>
      <div class="text-xs">Tap a product card to begin billing</div>
    </div>
  `;
}

function renderCartRow(it) {
  const rowKey = `${it.id}::${it.unit}`;
  return `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(it.name)}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          <span class="inline-block px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold mr-1">${escapeHtml(unitLabel(it.unit))}</span>
          ${fmtCurrency(it.unitPrice)} · Batch ${escapeHtml(it.batchNo)}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button data-cart-dec="${escapeAttr(rowKey)}" class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-bold">−</button>
        <input data-cart-qty="${escapeAttr(rowKey)}" type="number" min="1" value="${it.qty}" class="w-12 text-center px-1 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"/>
        <button data-cart-inc="${escapeAttr(rowKey)}" class="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-bold">+</button>
      </div>
      <div class="w-20 text-right text-sm font-semibold whitespace-nowrap">${fmtCurrency(it.subtotal)}</div>
      <button data-cart-rm="${escapeAttr(rowKey)}" class="text-rose-500 hover:text-rose-700 p-1" title="Remove">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;
}

// ============================================================
// 6. SUMMARY
// ============================================================

function computeSummary() {
  const grossTotal = posCart.reduce((a, l) => a + (Number(l.subtotal) || 0), 0);
  const dv = Number(session.discountValue) || 0;
  let discountAmount = 0;
  if (session.discountMode === 'percent') {
    discountAmount = +(grossTotal * (dv / 100)).toFixed(2);
  } else {
    discountAmount = +Math.min(dv, grossTotal).toFixed(2);
  }
  const netTotal  = Math.max(0, +(grossTotal - discountAmount).toFixed(2));
  const cashRecv  = Number(session.cashReceived) || 0;
  const changeDue = +(cashRecv - netTotal).toFixed(2);

  let changeDueClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  if (cashRecv > 0 && changeDue < 0) changeDueClass = 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  else if (changeDue >= 0 && cashRecv > 0) changeDueClass = 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';

  return { grossTotal, discountAmount, netTotal, changeDue, changeDueClass };
}

// ============================================================
// 7. CHECKOUT
// ============================================================

function handleCheckout() {
  if (posCart.length === 0) { showToast('Cart is empty.', 'warn'); return; }
  const summary = computeSummary();
  if ((Number(session.cashReceived) || 0) < summary.netTotal) {
    showToast('Cash received is less than the net payable.', 'warn'); return;
  }

  // Controlled-substance guard
  const controlledRequired = posCart.some(it => it.isControlled);
  if (controlledRequired) {
    if (!session.doctorName.trim()) { showToast('Doctor name is required for controlled substances.', 'warn'); return; }
    if (!session.patientCnic.trim()) { showToast('Patient CNIC is required for controlled substances.', 'warn'); return; }
  }

  // Build sale record
  const saleId = generateSaleId();
  const now = new Date().toISOString();
  const items = posCart.map(c => ({
    id: c.id,
    name: c.name,
    genericName: c.genericName,
    batchNo: c.batchNo,
    unit: c.unit,
    qty: c.qty,
    baseUnits: c.baseUnits,
    unitPrice: c.unitPrice,
    subtotal: c.subtotal,
    isColdChain: c.isColdChain === true,
    isControlled: c.isControlled === true,
  }));

  const cashier = getCashier()?.name || 'Cashier';
  const patient = session.patientName || (controlledRequired ? 'Walk-in' : 'Walk-in patient');
  const doctor  = session.doctorName || '';

  const saleRecord = {
    saleId, timestamp: now, cashier, patient: { name: patient, phone: session.patientPhone, cnic: session.patientCnic }, doctor,
    items,
    grossTotal: summary.grossTotal,
    discount: summary.discountAmount,
    discountMode: session.discountMode,
    discountValue: Number(session.discountValue) || 0,
    netTotal: summary.netTotal,
    cashReceived: Number(session.cashReceived) || 0,
    changeDue: summary.changeDue,
    payment: 'cash',
  };

  // Deduct stock in base units + push sale
  for (const c of posCart) {
    const p = state.products.find(x => x.id === c.id);
    if (!p) continue;
    const next = Math.max(0, (parseInt(p.totalBaseUnits, 10) || 0) - c.baseUnits);
    try { updateProduct({ ...p, totalBaseUnits: next, updatedAt: now }); }
    catch (e) { console.error('updateProduct failed', e); }
  }
  try {
    addSale({
      ...saleRecord,
      id: saleId,
      createdAt: now,
      total: summary.netTotal,
      subtotal: summary.grossTotal,
      tax: 0,
      customer: { name: patient, doctor, mrn: '', phone: session.patientPhone, cnic: session.patientCnic },
    });
  } catch (e) { console.error('addSale failed', e); showToast('Sale commit failed.', 'error'); return; }

  buildAndShowReceipt(saleRecord, summary);

  // Reset
  posCart.length = 0;
  session.patientName = '';
  session.patientPhone = '';
  session.patientCnic = '';
  session.doctorName = '';
  session.discountValue = 0;
  session.cashReceived = 0;

  rerenderCartAndSummary();
  showToast(`Sale ${saleId} completed — ${fmtCurrency(summary.netTotal)}`, 'success', 2500);
}

// ============================================================
// 8. THERMAL RECEIPT
// ============================================================

function buildAndShowReceipt(sale, summary) {
  const cashier = sale.cashier || 'Cashier';
  const patient = (sale.patient?.name || 'Walk-in patient');
  const doctor  = sale.doctor || '';
  const phone   = sale.patient?.phone || '';
  const cnic    = sale.patient?.cnic || '';
  const dateStr = new Date(sale.timestamp).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const hasColdChain = sale.items.some(i => i.isColdChain);

  const itemsRows = sale.items.map(it => `
    <tr>
      <td style="width:18%;text-align:center;">${it.qty} ${escapeHtml(unitLabel(it.unit))}</td>
      <td style="padding-left:4px;">
        ${escapeHtml(it.name)}
        ${it.genericName ? `<div style="font-size:9px;opacity:0.7;font-style:italic;">${escapeHtml(it.genericName)}</div>` : ''}
        ${it.batchNo ? `<div style="font-size:10px;opacity:0.7;">Batch ${escapeHtml(it.batchNo)}</div>` : ''}
        ${it.isControlled ? `<div style="font-size:10px;color:#000;font-weight:700;">[Rx PRESCRIPTION]</div>` : ''}
      </td>
      <td style="width:20%;text-align:right;">${fmtCurrency(it.unitPrice)}</td>
      <td style="width:22%;text-align:right;">${fmtCurrency(it.subtotal)}</td>
    </tr>
  `).join('');

  const receiptHtml = `
    <div class="thermal-receipt">
      <div class="center bold" style="font-size:14px;">DRIPP MEDICOS</div>
      <div class="center" style="font-size:11px;">Specialized Gyno &amp; Obstetrics Pharmacy</div>
      <div class="center" style="font-size:10px;opacity:0.7;">Hospital Branch · Gyno · Obs · Women's Health</div>
      <div class="divider"></div>

      <div class="row"><span>Invoice</span><span class="bold">${escapeHtml(sale.saleId)}</span></div>
      <div class="row"><span>Date</span><span>${escapeHtml(dateStr)}</span></div>
      <div class="row"><span>Cashier</span><span>${escapeHtml(cashier)}</span></div>
      <div class="row"><span>Patient</span><span>${escapeHtml(patient)}</span></div>
      ${phone ? `<div class="row"><span>Phone</span><span>${escapeHtml(phone)}</span></div>` : ''}
      ${cnic  ? `<div class="row"><span>CNIC</span><span>${escapeHtml(cnic)}</span></div>` : ''}
      ${doctor ? `<div class="row"><span>Doctor</span><span>${escapeHtml(doctor)}</span></div>` : ''}

      <div class="divider"></div>
      <table>
        <thead>
          <tr style="font-size:10px;">
            <th style="width:18%;text-align:center;">Qty/Unit</th>
            <th style="text-align:left;padding-left:4px;">Description</th>
            <th style="width:20%;text-align:right;">Price</th>
            <th style="width:22%;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="divider"></div>
      <div class="row"><span>Gross Total</span><span>${fmtCurrency(sale.grossTotal)}</span></div>
      <div class="row"><span>Discount${sale.discountMode === 'percent' ? ` (${sale.discountValue}%)` : ''}</span><span>− ${fmtCurrency(sale.discount)}</span></div>
      <div class="row bold" style="font-size:13px;"><span>NET PAYABLE</span><span>${fmtCurrency(sale.netTotal)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Cash Received</span><span>${fmtCurrency(sale.cashReceived)}</span></div>
      <div class="row bold"><span>Change Returned</span><span>${fmtCurrency(sale.changeDue)}</span></div>

      ${hasColdChain ? `
        <div class="divider"></div>
        <div style="font-size:10px;text-align:center;font-weight:700;">❄️ COLD CHAIN ITEMS</div>
        <div style="font-size:10px;text-align:center;">Must be refrigerated immediately (2°C – 8°C)</div>
      ` : ''}

      <div class="divider"></div>
      <div class="center" style="font-size:10px;">Specialized Gyno Pharmacy</div>
      <div class="center" style="font-size:10px;">— Wish You Fast Recovery! —</div>
      <div class="center" style="font-size:9px;opacity:0.6;margin-top:2mm;">Thank you for choosing Dripp Medicos</div>
    </div>
  `;

  const printContainer = document.getElementById('thermal-receipt');
  if (printContainer) printContainer.innerHTML = receiptHtml;

  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold">Sale Completed</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Receipt ${escapeHtml(sale.saleId)} ready</p>
          </div>
        </div>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 max-h-72 overflow-y-auto font-mono text-xs">
        ${receiptHtml}
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button data-print class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print
        </button>
        <button data-close class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">Done</button>
      </div>
    </div>
  `, {
    size: 'md',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
    }
  });

  setTimeout(() => { try { window.print(); } catch (e) { /* user can print manually */ } }, 250);
}

// ============================================================
// 9. PARTIAL RE-RENDER HELPERS
// ============================================================

function rerenderGrid() {
  const grid = document.getElementById('pos-grid');
  if (!grid) return;
  const products = Array.isArray(state.products) ? state.products : [];
  const filtered = applyCatalogFilters(products);
  grid.innerHTML = filtered.length === 0
    ? `<div class="col-span-full py-12 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">No medicines match your filters.</div>`
    : filtered.map(renderProductCard).join('');

  document.querySelectorAll('#pos-pills [data-pill]').forEach(el => {
    const isActive = el.dataset.pill === session.category;
    el.classList.toggle('bg-teal-600', isActive);
    el.classList.toggle('text-white', isActive);
    el.classList.toggle('border-teal-600', isActive);
    el.classList.toggle('shadow-md', isActive);
    el.classList.toggle('shadow-teal-500/20', isActive);
    el.classList.toggle('bg-white', !isActive);
    el.classList.toggle('dark:bg-slate-800', !isActive);
    el.classList.toggle('text-slate-600', !isActive);
    el.classList.toggle('dark:text-slate-300', !isActive);
    el.classList.toggle('border-slate-300', !isActive);
    el.classList.toggle('dark:border-slate-700', !isActive);
  });
}

function rerenderSummary() {
  document.querySelectorAll('.pos-dmode-btn').forEach(b => {
    const active = b.dataset.dmode === session.discountMode;
    b.classList.toggle('bg-teal-600', active);
    b.classList.toggle('text-white', active);
    b.classList.toggle('bg-white', !active);
    b.classList.toggle('dark:bg-slate-800', !active);
  });
  const summary = computeSummary();
  const gross = document.getElementById('pos-gross');
  const disc  = document.getElementById('pos-discount-amt');
  const net   = document.getElementById('pos-net');
  const chg   = document.getElementById('pos-change');
  if (gross) gross.textContent = fmtCurrency(summary.grossTotal);
  if (disc)  disc.textContent  = `− ${fmtCurrency(summary.discountAmount)}`;
  if (net)   net.textContent   = fmtCurrency(summary.netTotal);
  if (chg) {
    chg.textContent = fmtCurrency(summary.changeDue);
    chg.className = `w-full px-2.5 py-1.5 rounded-md border text-sm font-mono font-bold ${summary.changeDueClass}`;
  }
  const checkoutBtn = document.getElementById('pos-checkout');
  if (checkoutBtn) {
    if (posCart.length === 0) checkoutBtn.setAttribute('disabled', '');
    else checkoutBtn.removeAttribute('disabled');
  }
}

function rerenderCartAndSummary() {
  // The cart-and-summary layout includes the controlled-substance banner and
  // conditional purple Doctor/CNIC fields, so a full panel re-render is
  // required. We re-trigger the hashchange to re-run renderPOSView().
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}