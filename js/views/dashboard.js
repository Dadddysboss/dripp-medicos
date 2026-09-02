// js/views/dashboard.js
// Dripp Medicos — Real-time Analytics Dashboard.
//
// KPI cards, 7-day revenue trend, top 5 sellers, low-stock quick actions,
// cold-chain monitoring, and recent transactions.

import { state, updateProduct } from '../state.js';
import { fmtCurrency, formatDateTime, LS_KEYS, LOW_STOCK_BASE_THRESHOLD, baseUnitsFor, formatPackagingShort } from '../config.js';
import { showToast, escapeHtml, escapeAttr } from '../ui.js';
import { getProductStatus } from './inventory.js';

// ============================================================
// MAIN RENDER
// ============================================================

export function renderDashboardView() {
  const products = Array.isArray(state.products) ? state.products : [];
  const sales    = Array.isArray(state.sales)    ? state.sales    : [];

  // ---- KPIs
  const todayKey = new Date().toISOString().slice(0, 10);
  const todays   = sales.filter(s => (s.timestamp || s.createdAt || '').slice(0, 10) === todayKey);
  const todayRev = todays.reduce((a, s) => a + (Number(s.netTotal ?? s.total) || 0), 0);
  const todayTxn = todays.length;

  const lowStock  = products.filter(p => getProductStatus(p).isLowStock);
  const expiring  = products.filter(p => getProductStatus(p).isExpiringSoon);
  const coldChain = products.filter(p => p.isColdChain === true);
  const lowCold   = coldChain.filter(p => getProductStatus(p).isLowStock);

  // ---- 7-day revenue trend
  const days = buildLast7Days(sales);
  const maxRev = Math.max(1, ...days.map(d => d.revenue));

  // ---- Top 5
  const tally = new Map();
  for (const sale of sales) {
    if (!Array.isArray(sale.items)) continue;
    for (const it of sale.items) {
      const key = it.id || it.name;
      const cur = tally.get(key) || { id: it.id, name: it.name, qty: 0, revenue: 0 };
      cur.qty     += Number(it.qty) || 0;
      cur.revenue += (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      tally.set(key, cur);
    }
  }
  const top5 = [...tally.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // ---- Low-stock quick list
  const lowList = lowStock.slice(0, 8);
  const recent  = sales.slice(0, 5);

  return `
    <div class="space-y-6">

      <div>
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight">Pharmacy Dashboard</h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Real-time analytics &amp; quick actions for Dripp Medicos</p>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kpi("Today's Revenue", fmtCurrency(todayRev), todayRev > 0 ? 'from-teal-500 to-teal-700' : 'from-slate-400 to-slate-600', iconWallet(), todayRev > 0 ? 'Live updates' : 'No sales today')}
        ${kpi("Today's Transactions", String(todayTxn), 'from-sky-500 to-sky-700', iconReceipt(), todayTxn === 1 ? '1 sale today' : `${todayTxn} sales today`)}
        ${kpi('Low Stock Alerts', String(lowStock.length), lowStock.length > 0 ? 'from-rose-500 to-rose-700' : 'from-emerald-500 to-emerald-700', iconWarn(), lowStock.length > 0 ? 'Needs reorder' : 'All stocked')}
        ${kpi('Expiring Soon', String(expiring.length), expiring.length > 0 ? 'from-amber-500 to-amber-700' : 'from-emerald-500 to-emerald-700', iconClock(), expiring.length > 0 ? 'Within 60 days' : 'All clear')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-sm font-semibold">Revenue — Last 7 Days</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Daily net payable totals</div>
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Peak: <span class="font-semibold text-slate-700 dark:text-slate-200">${fmtCurrency(Math.max(...days.map(d => d.revenue)))}</span>
            </div>
          </div>
          <div class="h-56 flex items-end gap-2 sm:gap-3 px-1">
            ${days.map(d => `
              <div class="flex-1 flex flex-col items-center gap-2">
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-md relative" style="height:160px;">
                  <div class="absolute bottom-0 left-0 right-0 rounded-md bg-gradient-to-t from-teal-600 to-teal-400 transition-all"
                       style="height:${Math.round((d.revenue / maxRev) * 100)}%;"></div>
                  <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    ${d.revenue >= 1000 ? '₨' + (d.revenue/1000).toFixed(1) + 'k' : fmtCurrency(d.revenue)}
                  </div>
                </div>
                <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">${d.lbl}</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500">${d.dateLabel}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div class="text-sm font-semibold">Top 5 Selling</div>
            <span class="text-[11px] uppercase tracking-wider text-slate-500">By qty</span>
          </div>
          ${top5.length === 0 ? `
            <div class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No sales recorded yet. Start billing in the Cash Counter.</div>
          ` : `
            <div class="space-y-3">
              ${top5.map((t, i) => `
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-lg ${i === 0 ? 'bg-gradient-to-br from-teal-500 to-teal-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'} flex items-center justify-center text-xs font-bold flex-shrink-0">${i+1}</div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate">${escapeHtml(t.name || 'Unknown')}</div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400">${t.qty} sold · ${fmtCurrency(t.revenue)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Low-stock quick actions -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-sm font-semibold flex items-center gap-2">
                <svg class="w-4 h-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Low-Stock Quick Actions
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">≤ ${LOW_STOCK_BASE_THRESHOLD} base units — quick +1 box</div>
            </div>
            <a href="#inventory" class="text-xs text-teal-600 dark:text-teal-400 hover:underline">Inventory →</a>
          </div>
          <div class="space-y-2" id="db-lowstock">
            ${lowList.length === 0
              ? `<div class="py-8 text-center text-sm text-emerald-600 dark:text-emerald-400">All products are above the threshold.</div>`
              : lowList.map(p => lowStockRow(p)).join('')
            }
          </div>
        </div>

        <!-- Cold-chain monitoring -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-sm font-semibold flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/>
                </svg>
                Cold Chain Monitor
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">2°C – 8°C storage required</div>
            </div>
            <a href="#inventory" class="text-xs text-teal-600 dark:text-teal-400 hover:underline">View →</a>
          </div>
          <div class="space-y-2" id="db-coldchain">
            ${coldChain.length === 0
              ? `<div class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No cold-chain SKUs configured.</div>`
              : coldChain.slice(0, 8).map(p => coldChainRow(p, lowCold.some(x => x.id === p.id))).join('')
            }
          </div>
        </div>

        <!-- Recent transactions -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div class="text-sm font-semibold">Recent Transactions</div>
            <a href="#sales" class="text-xs text-teal-600 dark:text-teal-400 hover:underline">View all →</a>
          </div>
          <div class="space-y-2" id="db-recent">
            ${recent.length === 0
              ? `<div class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No sales recorded.</div>`
              : recent.map(recentRow).join('')
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MOUNT
// ============================================================

export function mountDashboard() {
  const lowStock = document.getElementById('db-lowstock');
  if (lowStock) {
    lowStock.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-quick-add]');
      if (!btn) return;
      quickRestockBox(btn.dataset.quickAdd, 1);
    });
  }
  const recent = document.getElementById('db-recent');
  if (recent) {
    recent.addEventListener('click', (e) => {
      const row = e.target.closest('[data-recent-invoice]');
      if (!row) return;
      location.hash = '#sales';
    });
  }
}

// ============================================================
// RENDER HELPERS
// ============================================================

function kpi(label, value, gradient, icon, sub) {
  return `
    <div class="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div class="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl"></div>
      <div class="flex items-start justify-between gap-3 relative">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">${label}</div>
          <div class="mt-1 text-2xl font-bold truncate">${value}</div>
          ${sub ? `<div class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(sub)}</div>` : ''}
        </div>
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center flex-shrink-0">${icon}</div>
      </div>
    </div>`;
}

function lowStockRow(p) {
  const total = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
  const stockChip = total <= 0
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    : total <= 10
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return `
    <div class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(p.name || 'Unnamed')}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(p.category || '—')}</div>
      </div>
      <span class="px-2 py-0.5 rounded-md text-[11px] font-bold ${stockChip}">${formatPackagingShort(total, p)}</span>
      <button data-quick-add="${escapeAttr(p.id)}" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white" title="Add 1 Box">
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        +1 Box
      </button>
    </div>`;
}

function coldChainRow(p, isLow) {
  const total = Math.max(0, parseInt(p.totalBaseUnits, 10) || 0);
  return `
    <div class="flex items-center gap-3 p-2.5 rounded-lg ${isLow ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800' : 'bg-sky-50/40 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40'}">
      <div class="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(p.name || 'Unnamed')}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(p.rackNo || '—')}</div>
      </div>
      <div class="text-right">
        <div class="text-[11px] font-bold ${isLow ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400'}">${formatPackagingShort(total, p)}</div>
        <div class="text-[9px] uppercase tracking-wider ${isLow ? 'text-rose-500' : 'text-sky-500'}">${isLow ? 'LOW' : 'OK'}</div>
      </div>
    </div>`;
}

function recentRow(sale) {
  const inv = sale.saleId || sale.id || '—';
  const patient = (sale.patient?.name || sale.customer?.name || 'Walk-in');
  const total = Number(sale.netTotal ?? sale.total) || 0;
  const time = formatRelative(sale.timestamp || sale.createdAt);
  const itemCount = Array.isArray(sale.items) ? sale.items.length : 0;
  return `
    <div class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition" data-recent-invoice="${escapeAttr(inv)}">
      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(patient)}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escapeHtml(inv)} · ${itemCount} item${itemCount === 1 ? '' : 's'} · ${escapeHtml(time)}</div>
      </div>
      <div class="text-right">
        <div class="text-sm font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">${fmtCurrency(total)}</div>
        <div class="text-[10px] uppercase text-slate-500 dark:text-slate-400">${escapeHtml(sale.payment || 'cash')}</div>
      </div>
    </div>`;
}

function buildLast7Days(sales) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const lbl = d.toLocaleDateString('en-PK', { weekday: 'short' });
    const dateLabel = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
    const revenue = sales
      .filter(s => (s.timestamp || s.createdAt || '').slice(0, 10) === key)
      .reduce((a, x) => a + (Number(x.netTotal ?? x.total) || 0), 0);
    out.push({ key, lbl, dateLabel, revenue });
  }
  return out;
}

function iconWallet()  { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`; }
function iconReceipt() { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`; }
function iconWarn()    { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }
function iconClock()   { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }

// ============================================================
// ACTIONS
// ============================================================

function quickRestockBox(productId, boxes) {
  const p = state.products.find(x => x.id === productId);
  if (!p) { showToast('Product not found.', 'error'); return; }
  const delta = baseUnitsFor('Box', boxes, p);
  const next = Math.max(0, (parseInt(p.totalBaseUnits, 10) || 0) + delta);
  try {
    updateProduct({ ...p, totalBaseUnits: next, updatedAt: new Date().toISOString() });
    showToast(`Restocked ${p.name} (+${boxes} box → ${next} base units)`, 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (e) { console.error(e); showToast('Failed to restock.', 'error'); }
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const min  = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr)  return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDateTime(iso);
}