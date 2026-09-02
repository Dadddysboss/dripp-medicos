// js/views/sales.js
// Dripp Medicos — Sales History & Reporting view.

import { state } from '../state.js';
import { fmtCurrency, formatDateTime, LS_KEYS, unitLabel } from '../config.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';

const filters = {
  query: '',
  range: 'all',
  payment: 'all',
};

export function renderSalesView() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const totalRevenue = sales.reduce((a, s) => a + (Number(s.netTotal) || Number(s.total) || 0), 0);
  const totalOrders  = sales.length;
  const aov          = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const itemsSold    = sales.reduce((a, s) => {
    if (!Array.isArray(s.items)) return a;
    return a + s.items.reduce((b, it) => {
      // Prefer base units for accurate item count
      if (it.baseUnits) return b + Number(it.baseUnits);
      return b + (Number(it.qty) || 0);
    }, 0);
  }, 0);
  const filtered = applyFilters(sales);

  return `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight">Sales History &amp; Reports</h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">${sales.length} total transaction${sales.length === 1 ? '' : 's'} · ${filtered.length} shown</p>
        </div>
        <button id="sa-export-csv" class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kpi('Total Revenue',     fmtCurrency(totalRevenue), 'from-teal-500 to-teal-700',       iconWallet())}
        ${kpi('Total Orders',      String(totalOrders),       'from-sky-500 to-sky-700',         iconReceipt())}
        ${kpi('Avg. Order Value',  fmtCurrency(aov),          'from-violet-500 to-violet-700',   iconChart())}
        ${kpi('Items Sold (base)', String(itemsSold),         'from-emerald-500 to-emerald-700', iconBox())}
      </div>

      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search</label>
            <div class="relative">
              <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input id="sa-search" type="text" value="${escapeAttr(filters.query)}"
                     placeholder="Invoice ID, patient or doctor…"
                     class="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Date Range</label>
            <select id="sa-range" class="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="today"     ${filters.range === 'today'     ? 'selected' : ''}>Today</option>
              <option value="yesterday" ${filters.range === 'yesterday' ? 'selected' : ''}>Yesterday</option>
              <option value="7d"        ${filters.range === '7d'        ? 'selected' : ''}>Last 7 Days</option>
              <option value="month"     ${filters.range === 'month'     ? 'selected' : ''}>This Month</option>
              <option value="all"       ${filters.range === 'all'       ? 'selected' : ''}>All Time</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Payment Method</label>
            <select id="sa-payment" class="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="all"    ${filters.payment === 'all'    ? 'selected' : ''}>All Methods</option>
              <option value="cash"   ${filters.payment === 'cash'   ? 'selected' : ''}>Cash</option>
              <option value="card"   ${filters.payment === 'card'   ? 'selected' : ''}>Card</option>
              <option value="online" ${filters.payment === 'online' ? 'selected' : ''}>Online</option>
              <option value="upi"    ${filters.payment === 'upi'    ? 'selected' : ''}>UPI</option>
            </select>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th class="px-4 py-3 text-left">Invoice</th>
                <th class="px-4 py-3 text-left">Date / Time</th>
                <th class="px-4 py-3 text-left">Items</th>
                <th class="px-4 py-3 text-right">Gross</th>
                <th class="px-4 py-3 text-right">Discount</th>
                <th class="px-4 py-3 text-right">Net Payable</th>
                <th class="px-4 py-3 text-left">Cashier</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="sa-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
              ${filtered.length === 0 ? renderEmptyState() : filtered.map(renderRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function mountSales() {
  document.getElementById('sa-search')?.addEventListener('input',   e => { filters.query   = e.target.value; rerenderTable(); });
  document.getElementById('sa-range')?.addEventListener('change',   e => { filters.range    = e.target.value; rerenderTable(); });
  document.getElementById('sa-payment')?.addEventListener('change', e => { filters.payment  = e.target.value; rerenderTable(); });
  document.getElementById('sa-export-csv')?.addEventListener('click', exportCSV);

  const tbody = document.getElementById('sa-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const view    = e.target.closest('[data-view]');
    const reprint = e.target.closest('[data-reprint]');
    const del     = e.target.closest('[data-delete-sale]');
    if (view)    return openSaleDetails(view.dataset.view);
    if (reprint) return reprintSale(reprint.dataset.reprint);
    if (del)     return confirmDeleteSale(del.dataset.deleteSale);
  });
  tbody.querySelectorAll('[data-view-row]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openSaleDetails(row.dataset.viewRow);
    });
  });
}

function applyFilters(sales) {
  const q = (filters.query || '').trim().toLowerCase();
  return sales.filter(sale => {
    if (q) {
      const inv  = (sale.saleId || sale.id || '').toString();
      const pat  = (sale.patient?.name  || sale.customer?.name  || '').toString();
      const doc  = (sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '').toString();
      const cnic = (sale.patient?.cnic || '').toString();
      const hay  = `${inv} ${pat} ${doc} ${cnic}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.range !== 'all') {
      const ts = sale.timestamp || sale.createdAt;
      const d  = ts ? new Date(ts) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (!matchesRange(d, filters.range)) return false;
    }
    if (filters.payment !== 'all') {
      const method = normalizePayment(sale.payment);
      if (method !== filters.payment) return false;
    }
    return true;
  });
}

function matchesRange(date, range) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today')     return date >= startOfDay;
  if (range === 'yesterday') { const s = new Date(startOfDay); s.setDate(s.getDate() - 1); const e = new Date(startOfDay); e.setMilliseconds(-1); return date >= s && date <= e; }
  if (range === '7d')        { const s = new Date(startOfDay); s.setDate(s.getDate() - 6); return date >= s; }
  if (range === 'month')     return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return true;
}

function normalizePayment(p) {
  const v = String(p || '').toLowerCase().trim();
  if (v === 'cash') return 'cash';
  if (v === 'card') return 'card';
  if (['upi', 'online', 'netbanking', 'wallet'].includes(v)) return 'online';
  return v || 'cash';
}

function kpi(label, value, gradient, icon) {
  return `
    <div class="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div class="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl"></div>
      <div class="flex items-start justify-between gap-3 relative">
        <div>
          <div class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">${label}</div>
          <div class="mt-1 text-xl font-bold">${value}</div>
        </div>
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center">${icon}</div>
      </div>
    </div>`;
}

function renderRow(sale) {
  const inv   = sale.saleId || sale.id || '—';
  const ts    = formatSaleDate(sale.timestamp || sale.createdAt);
  const items = itemsSummary(sale);
  const gross = Number(sale.grossTotal ?? sale.subtotal) || 0;
  const disc  = Number(sale.discount) || 0;
  const net   = Number(sale.netTotal ?? sale.total) || 0;
  const cashier = sale.cashier || sale.customer?.name || '—';

  return `
    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer" data-view-row="${escapeAttr(inv)}">
      <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(inv)}</td>
      <td class="px-4 py-3 text-xs whitespace-nowrap">${escapeHtml(ts)}</td>
      <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-md truncate">${escapeHtml(items)}</td>
      <td class="px-4 py-3 text-right">${fmtCurrency(gross)}</td>
      <td class="px-4 py-3 text-right text-slate-500 dark:text-slate-400">${disc > 0 ? '− ' + fmtCurrency(disc) : '—'}</td>
      <td class="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">${fmtCurrency(net)}</td>
      <td class="px-4 py-3 text-xs">${escapeHtml(cashier)}</td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-1">
          <button data-view="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="View">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button data-reprint="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-teal-50 dark:hover:bg-teal-900/30 text-teal-600" title="Reprint">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </button>
          <button data-delete-sale="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

function renderEmptyState() {
  return `
    <tr><td colspan="8" class="px-4 py-16">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <svg class="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></svg>
        </div>
        <h3 class="text-base font-semibold text-slate-700 dark:text-slate-200">No transactions found</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">Try adjusting your search or filters.</p>
      </div>
    </td></tr>`;
}

function itemsSummary(sale) {
  if (!Array.isArray(sale.items) || sale.items.length === 0) return '—';
  const parts = sale.items.slice(0, 3).map(it => `${it.name} × ${it.qty} ${unitLabel(it.unit || 'Unit')}`);
  let s = parts.join(', ');
  if (sale.items.length > 3) s += `, +${sale.items.length - 3} more`;
  return s;
}

function formatSaleDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${dd}/${mm}/${yyyy} ${String(h).padStart(2,'0')}:${m} ${ampm}`;
}

function iconWallet()  { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`; }
function iconReceipt() { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`; }
function iconChart()   { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`; }
function iconBox()     { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`; }

function openSaleDetails(invoiceId) {
  const sale = state.sales.find(s => (s.saleId || s.id) === invoiceId);
  if (!sale) { showToast('Sale not found.', 'error'); return; }
  const itemsHtml = (Array.isArray(sale.items) ? sale.items : []).map(it => `
    <tr class="border-b border-slate-100 dark:border-slate-800">
      <td class="py-2 pr-2">
        <div class="font-medium text-sm flex items-center gap-1">
          ${escapeHtml(it.name || '—')}
          ${it.isColdChain ? '<span class="text-sky-500" title="Cold chain">❄️</span>' : ''}
          ${it.isControlled ? '<span class="text-purple-500" title="Controlled">🔒</span>' : ''}
        </div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400">
          <span class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 mr-1">${escapeHtml(unitLabel(it.unit || 'Unit'))}</span>
          Batch: ${escapeHtml(it.batchNo || '—')}
        </div>
      </td>
      <td class="py-2 text-center text-sm">${Number(it.qty) || 0}</td>
      <td class="py-2 text-right text-sm">${fmtCurrency(it.unitPrice)}</td>
      <td class="py-2 text-right text-sm font-semibold">${fmtCurrency(it.subtotal)}</td>
    </tr>
  `).join('');

  const patient = (sale.patient?.name  || sale.customer?.name  || 'Walk-in patient');
  const doctor  = (sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '');
  const phone   = (sale.patient?.phone || sale.customer?.phone || '');
  const cnic    = (sale.patient?.cnic  || '');
  const cashier = sale.cashier || '—';
  const gross   = Number(sale.grossTotal ?? sale.subtotal) || 0;
  const disc    = Number(sale.discount)  || 0;
  const net     = Number(sale.netTotal   ?? sale.total) || 0;
  const cash    = Number(sale.cashReceived) || 0;
  const change  = Number(sale.changeDue) || 0;
  const inv     = sale.saleId || sale.id || '—';
  const ts      = formatSaleDate(sale.timestamp || sale.createdAt);

  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-bold">Invoice ${escapeHtml(inv)}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(ts)}</p>
        </div>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Patient</div><div class="font-medium">${escapeHtml(patient)}</div></div>
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Doctor</div><div class="font-medium">${escapeHtml(doctor || '—')}</div></div>
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Cashier</div><div class="font-medium">${escapeHtml(cashier)}</div></div>
        ${phone ? `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">Phone</div><div class="font-medium">${escapeHtml(phone)}</div></div>` : ''}
        ${cnic  ? `<div><div class="text-[10px] uppercase tracking-wider text-slate-500">CNIC</div><div class="font-medium">${escapeHtml(cnic)}</div></div>` : ''}
        <div><div class="text-[10px] uppercase tracking-wider text-slate-500">Payment</div><div class="font-medium uppercase">${escapeHtml(sale.payment || 'cash')}</div></div>
      </div>

      <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase text-slate-500">
            <tr><th class="px-3 py-2 text-left">Item</th><th class="px-3 py-2 text-center">Qty</th><th class="px-3 py-2 text-right">Price</th><th class="px-3 py-2 text-right">Total</th></tr>
          </thead>
          <tbody>${itemsHtml || `<tr><td colspan="4" class="text-center text-slate-500 py-4">No items.</td></tr>`}</tbody>
        </table>
      </div>

      <div class="mt-4 space-y-1 text-sm">
        <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Gross Total</span><span>${fmtCurrency(gross)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500 dark:text-slate-400">Discount</span><span>${disc > 0 ? '− ' + fmtCurrency(disc) : '—'}</span></div>
        <div class="flex justify-between font-bold text-base pt-2 border-t border-slate-200 dark:border-slate-800">
          <span>Net Payable</span><span class="text-teal-600 dark:text-teal-400">${fmtCurrency(net)}</span>
        </div>
        ${cash > 0 ? `
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>Cash Received</span><span>${fmtCurrency(cash)}</span></div>
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>Change Returned</span><span>${fmtCurrency(change)}</span></div>
        ` : ''}
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button data-reprint="${escapeAttr(inv)}" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Reprint Receipt
        </button>
        <button data-close class="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">Close</button>
      </div>
    </div>
  `, {
    size: 'lg',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelector('[data-reprint]')?.addEventListener('click', () => { hideModal(); reprintSale(inv); });
    }
  });
}

function reprintSale(invoiceId) {
  const sale = state.sales.find(s => (s.saleId || s.id) === invoiceId);
  if (!sale) { showToast('Sale not found.', 'error'); return; }
  const cashier = sale.cashier || 'Cashier';
  const patient = (sale.patient?.name || sale.customer?.name || 'Walk-in patient');
  const phone   = sale.patient?.phone || sale.customer?.phone || '';
  const cnic    = sale.patient?.cnic  || '';
  const doctor  = sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '';
  const dateStr = formatSaleDate(sale.timestamp || sale.createdAt);
  const inv     = sale.saleId || sale.id || '—';
  const gross   = Number(sale.grossTotal ?? sale.subtotal) || 0;
  const disc    = Number(sale.discount) || 0;
  const net     = Number(sale.netTotal ?? sale.total) || 0;
  const cash    = Number(sale.cashReceived) || 0;
  const change  = Number(sale.changeDue) || 0;
  const dmode   = sale.discountMode || 'flat';
  const dval    = Number(sale.discountValue) || 0;
  const hasCold = Array.isArray(sale.items) && sale.items.some(i => i.isColdChain);

  const itemsRows = (Array.isArray(sale.items) ? sale.items : []).map(it => `
    <tr>
      <td style="width:20%;text-align:center;">${it.qty} ${escapeHtml(unitLabel(it.unit || 'Unit'))}</td>
      <td style="padding-left:4px;">
        ${escapeHtml(it.name || '—')}
        ${it.isControlled ? '<div style="font-size:10px;font-weight:700;">[Rx PRESCRIPTION]</div>' : ''}
        ${it.batchNo ? `<div style="font-size:10px;opacity:0.7;">Batch ${escapeHtml(it.batchNo)}</div>` : ''}
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
      <div class="row"><span>Invoice</span><span class="bold">${escapeHtml(inv)}</span></div>
      <div class="row"><span>Date</span><span>${escapeHtml(dateStr)}</span></div>
      <div class="row"><span>Cashier</span><span>${escapeHtml(cashier)}</span></div>
      <div class="row"><span>Patient</span><span>${escapeHtml(patient)}</span></div>
      ${phone ? `<div class="row"><span>Phone</span><span>${escapeHtml(phone)}</span></div>` : ''}
      ${cnic  ? `<div class="row"><span>CNIC</span><span>${escapeHtml(cnic)}</span></div>` : ''}
      ${doctor ? `<div class="row"><span>Doctor</span><span>${escapeHtml(doctor)}</span></div>` : ''}
      <div class="divider"></div>
      <table>
        <thead><tr style="font-size:10px;"><th style="width:20%;text-align:center;">Qty/Unit</th><th style="text-align:left;padding-left:4px;">Description</th><th style="width:20%;text-align:right;">Price</th><th style="width:22%;text-align:right;">Total</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div class="divider"></div>
      <div class="row"><span>Gross Total</span><span>${fmtCurrency(gross)}</span></div>
      <div class="row"><span>Discount${dmode === 'percent' ? ` (${dval}%)` : ''}</span><span>− ${fmtCurrency(disc)}</span></div>
      <div class="row bold" style="font-size:13px;"><span>NET PAYABLE</span><span>${fmtCurrency(net)}</span></div>
      <div class="divider"></div>
      ${cash > 0 ? `
        <div class="row"><span>Cash Received</span><span>${fmtCurrency(cash)}</span></div>
        <div class="row bold"><span>Change Returned</span><span>${fmtCurrency(change)}</span></div>
        <div class="divider"></div>
      ` : ''}
      ${hasCold ? `
        <div style="font-size:10px;text-align:center;font-weight:700;">❄️ COLD CHAIN ITEMS</div>
        <div style="font-size:10px;text-align:center;">Must be refrigerated immediately (2°C – 8°C)</div>
        <div class="divider"></div>
      ` : ''}
      <div class="center" style="font-size:10px;">Specialized Gyno Pharmacy</div>
      <div class="center" style="font-size:10px;">— Wish You Fast Recovery! —</div>
      <div class="center" style="font-size:9px;opacity:0.6;margin-top:2mm;">*** REPRINT ***</div>
    </div>
  `;

  const printContainer = document.getElementById('thermal-receipt');
  if (printContainer) printContainer.innerHTML = receiptHtml;

  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 flex items-center justify-center">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </div>
          <div>
            <h3 class="text-lg font-bold">Reprint Receipt</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(inv)}</p>
          </div>
        </div>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 max-h-72 overflow-y-auto font-mono text-xs">${receiptHtml}</div>
      <div class="mt-4 flex justify-end gap-2">
        <button data-print class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
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

function confirmDeleteSale(invoiceId) {
  const sale = state.sales.find(s => (s.saleId || s.id) === invoiceId);
  if (!sale) { showToast('Sale not found.', 'error'); return; }
  showModal(`
    <div class="p-6">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg>
        </div>
        <div>
          <h3 class="text-lg font-bold">Delete Sale?</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
        </div>
      </div>
      <p class="text-sm text-slate-700 dark:text-slate-300">Delete invoice <strong>${escapeHtml(invoiceId)}</strong> from the log?</p>
      <div class="mt-5 flex justify-end gap-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-md shadow-rose-500/30">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: (root) => {
      root.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      root.querySelector('[data-confirm]')?.addEventListener('click', () => {
        try {
          state.sales = state.sales.filter(s => (s.saleId || s.id) !== invoiceId);
          localStorage.setItem(LS_KEYS.sales, JSON.stringify(state.sales));
          showToast(`Sale ${invoiceId} deleted`, 'success');
          hideModal();
          rerenderTable();
        } catch (e) { console.error(e); showToast('Failed to delete sale.', 'error'); }
      });
    }
  });
}

function exportCSV() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const filtered = applyFilters(sales);
  if (filtered.length === 0) { showToast('No sales in current filter to export.', 'warn'); return; }
  const rows = [['Invoice ID','Date','Time','Patient','Phone','CNIC','Doctor','Cashier','Payment','Item Count','Base Units','Gross Total','Discount','Net Payable','Cash Received','Change Due']];
  for (const sale of filtered) {
    const ts = new Date(sale.timestamp || sale.createdAt || '');
    const date = isNaN(ts.getTime()) ? '' : ts.toISOString().slice(0, 10);
    const time = isNaN(ts.getTime()) ? '' : ts.toTimeString().slice(0, 8);
    const items = Array.isArray(sale.items) ? sale.items : [];
    const base = items.reduce((a, it) => a + (Number(it.baseUnits) || 0), 0);
    rows.push([
      sale.saleId || sale.id || '',
      date, time,
      sale.patient?.name || sale.customer?.name || '',
      sale.patient?.phone || sale.customer?.phone || '',
      sale.patient?.cnic  || '',
      sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '',
      sale.cashier || '',
      sale.payment || '',
      items.length,
      base,
      Number(sale.grossTotal ?? sale.subtotal) || 0,
      Number(sale.discount) || 0,
      Number(sale.netTotal ?? sale.total) || 0,
      Number(sale.cashReceived) || 0,
      Number(sale.changeDue) || 0,
    ]);
  }
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dripp-medicos-sales-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${filtered.length} sale${filtered.length === 1 ? '' : 's'} to CSV`, 'success');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rerenderTable() {
  const tbody = document.getElementById('sa-tbody');
  if (!tbody) return;
  const filtered = applyFilters(Array.isArray(state.sales) ? state.sales : []);
  tbody.innerHTML = filtered.length === 0 ? renderEmptyState() : filtered.map(renderRow).join('');
  tbody.querySelectorAll('[data-view-row]').forEach(row => {
    row.addEventListener('click', (e) => { if (!e.target.closest('button')) openSaleDetails(row.dataset.viewRow); });
  });
}