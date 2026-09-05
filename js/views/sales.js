// js/views/sales.js
// Dripp Medicos — Sales History, Invoices, Expenses & Financial Summary view.

import { state } from '../state.js';
import { fmtCurrency, formatDateTime, LS_KEYS, unitLabel, EXPENSE_CATEGORIES, INVOICE_STATUS } from '../config.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';
import { getFinancialSummary, addInvoice, updateInvoice, deleteInvoice, addExpense, deleteExpense, addSupplierReturn, getSupplierReturns, updateSupplierReturn, deleteSupplierReturn } from '../state.js';
import { executeGeminiRequest, INVOICE_OCR_SYSTEM_PROMPT, fileToBase64, parseJsonSafe } from '../ai.js';

let activeTab = 'sales'; // 'sales' | 'invoices' | 'expenses' | 'summary' | 'supplierReturns'

const salesFilters = {
  query: '',
  range: 'all',
  payment: 'all',
};

const invoiceFilters = {
  query: '',
  status: 'all',
};

const expenseFilters = {
  query: '',
  category: 'all',
  range: 'all',
};

export function renderSalesView() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const invoices = Array.isArray(state.invoices) ? state.invoices : [];
  const expenses = Array.isArray(state.expenses) ? state.expenses : [];
  const summary = getFinancialSummary();

  const filteredSales = applySalesFilters(sales);
  const filteredInvoices = applyInvoiceFilters(invoices);
  const filteredExpenses = applyExpenseFilters(expenses);

  return `
    <div class="space-y-6 max-w-7xl mx-auto">
      <!-- Header & Tab Bar -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight">Financial &amp; Operations Center</h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Manage sales records, wholesale purchase invoices, shop expenses &amp; P&amp;L reports.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button data-sales-tab="sales" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'sales' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            Sales History (${sales.length})
          </button>
          <button data-sales-tab="invoices" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'invoices' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            Wholesale Invoices (${invoices.length})
          </button>
          <button data-sales-tab="expenses" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'expenses' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            Shop Expenses (${expenses.length})
          </button>
<button data-sales-tab="summary" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'summary' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            P&L Summary
          </button>
          <button data-sales-tab="supplierReturns" class="px-4 py-2 rounded-xl text-sm font-semibold transition ${activeTab === 'supplierReturns' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}">
            Supplier Returns (${getSupplierReturns().length})
          </button>
        </div>
      </div>

      <!-- Financial KPI Banner -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kpi('Gross Revenue', summary.grossRevenueFmt, 'from-teal-500 to-teal-700', iconWallet())}
        ${kpi('COGS (Cost of Sales)', summary.cogsFmt, 'from-sky-500 to-sky-700', iconBox())}
        ${kpi('Shop Expenses', summary.totalExpensesFmt, 'from-amber-500 to-amber-700', iconReceipt())}
        ${kpi('Net Profit / (Loss)', summary.netProfitFmt, summary.isProfit ? 'from-emerald-500 to-emerald-700' : 'from-rose-500 to-rose-700', iconChart())}
      </div>

      <!-- TAB 1: SALES HISTORY -->
      <div class="tab-pane ${activeTab === 'sales' ? '' : 'hidden'} space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search Sales</label>
              <div class="relative">
                <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="sa-search" type="text" value="${escapeAttr(salesFilters.query)}" placeholder="Invoice ID, patient or doctor…" class="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Date Range</label>
              <select id="sa-range" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="today" ${salesFilters.range === 'today' ? 'selected' : ''}>Today</option>
                <option value="yesterday" ${salesFilters.range === 'yesterday' ? 'selected' : ''}>Yesterday</option>
                <option value="7d" ${salesFilters.range === '7d' ? 'selected' : ''}>Last 7 Days</option>
                <option value="month" ${salesFilters.range === 'month' ? 'selected' : ''}>This Month</option>
                <option value="all" ${salesFilters.range === 'all' ? 'selected' : ''}>All Time</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Payment Method</label>
              <select id="sa-payment" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="all" ${salesFilters.payment === 'all' ? 'selected' : ''}>All Methods</option>
                <option value="cash" ${salesFilters.payment === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="card" ${salesFilters.payment === 'card' ? 'selected' : ''}>Card</option>
                <option value="online" ${salesFilters.payment === 'online' ? 'selected' : ''}>Online</option>
                <option value="upi" ${salesFilters.payment === 'upi' ? 'selected' : ''}>UPI</option>
              </select>
            </div>
          </div>
          <button id="sa-export-csv" class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
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
                ${filteredSales.length === 0 ? renderEmptySalesState() : filteredSales.map(renderSaleRow).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: WHOLESALE INVOICES -->
      <div class="tab-pane ${activeTab === 'invoices' ? '' : 'hidden'} space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search Invoices</label>
              <div class="relative">
                <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="inv-search" type="text" value="${escapeAttr(invoiceFilters.query)}" placeholder="Wholesaler or Invoice No…" class="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Status</label>
              <select id="inv-status" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="all" ${invoiceFilters.status === 'all' ? 'selected' : ''}>All Statuses</option>
                ${INVOICE_STATUS.map(s => `<option value="${escapeAttr(s)}" ${invoiceFilters.status === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
              </select>
            </div>
          </div>
          <button id="inv-add-btn" class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-lg shadow-teal-500/20">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add / Scan Invoice
          </button>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="px-4 py-3 text-left">Wholesaler</th>
                  <th class="px-4 py-3 text-left">Invoice No.</th>
                  <th class="px-4 py-3 text-left">Date</th>
                  <th class="px-4 py-3 text-left">Items</th>
                  <th class="px-4 py-3 text-right">Total Amount</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="inv-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
                ${filteredInvoices.length === 0 ? renderEmptyInvoicesState() : filteredInvoices.map(renderInvoiceRow).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: SHOP EXPENSES -->
      <div class="tab-pane ${activeTab === 'expenses' ? '' : 'hidden'} space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search Expenses</label>
              <div class="relative">
                <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="exp-search" type="text" value="${escapeAttr(expenseFilters.query)}" placeholder="Notes or payee…" class="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Category</label>
              <select id="exp-cat" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="all" ${expenseFilters.category === 'all' ? 'selected' : ''}>All Categories</option>
                ${EXPENSE_CATEGORIES.map(c => `<option value="${escapeAttr(c)}" ${expenseFilters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Date Range</label>
              <select id="exp-range" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="today" ${expenseFilters.range === 'today' ? 'selected' : ''}>Today</option>
                <option value="7d" ${expenseFilters.range === '7d' ? 'selected' : ''}>Last 7 Days</option>
                <option value="month" ${expenseFilters.range === 'month' ? 'selected' : ''}>This Month</option>
                <option value="all" ${expenseFilters.range === 'all' ? 'selected' : ''}>All Time</option>
              </select>
            </div>
          </div>
          <button id="exp-add-btn" class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-lg shadow-teal-500/20">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Log Expense
          </button>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-left">Date</th>
                  <th class="px-4 py-3 text-left">Notes / Payee</th>
                  <th class="px-4 py-3 text-right">Amount</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="exp-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
                ${filteredExpenses.length === 0 ? renderEmptyExpensesState() : filteredExpenses.map(renderExpenseRow).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 4: FINANCIAL SUMMARY & P&L -->
      <div class="tab-pane ${activeTab === 'summary' ? '' : 'hidden'} space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 class="text-lg font-bold flex items-center gap-2">
              <svg class="w-5 h-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Profit &amp; Loss Breakdown
            </h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Gross Sales Revenue</span>
                <span class="font-bold text-teal-600">${summary.grossRevenueFmt}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Cost of Goods Sold (COGS)</span>
                <span class="font-bold text-rose-600">− ${summary.cogsFmt}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Total Shop Expenses</span>
                <span class="font-bold text-amber-600">− ${summary.totalExpensesFmt}</span>
              </div>
              <div class="flex justify-between py-3 text-base font-bold bg-slate-50 dark:bg-slate-800/50 px-4 rounded-xl">
                <span>Net Operating Profit</span>
                <span class="${summary.isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${summary.netProfitFmt}</span>
              </div>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 class="text-lg font-bold flex items-center gap-2">
              <svg class="w-5 h-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              Inventory &amp; Operational Metrics
            </h3>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Total Sales Transactions</span>
                <span class="font-bold">${sales.length}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Wholesale Purchase Invoices</span>
                <span class="font-bold">${invoices.length}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Logged Expense Entries</span>
                <span class="font-bold">${expenses.length}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Active Products in Catalog</span>
                <span class="font-bold">${Array.isArray(state.products) ? state.products.length : 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 5: SUPPLIER RETURNS -->
      <div class="tab-pane ${activeTab === 'supplierReturns' ? '' : 'hidden'} space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Search Returns</label>
              <div class="relative">
                <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="sr-search" type="text" placeholder="Supplier name, invoice no, batch…" class="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Status</label>
              <select id="sr-status" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <button id="sr-add-btn" class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-lg shadow-teal-500/20">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Create Return Voucher
          </button>
        </div>

        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="px-4 py-3 text-left">Supplier</th>
                  <th class="px-4 py-3 text-left">Return No.</th>
                  <th class="px-4 py-3 text-left">Date</th>
                  <th class="px-4 py-3 text-left">Items</th>
                  <th class="px-4 py-3 text-right">Credit Amount</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="sr-tbody" class="divide-y divide-slate-100 dark:divide-slate-800">
                ${renderSupplierReturnsTable()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

export function mountSales() {
  // Tab switching
  document.querySelectorAll('[data-sales-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.salesTab;
      const routerRender = window._routerRender;
      if (routerRender) routerRender();
      else {
        // Fallback re-mount
        const container = document.getElementById('view-container');
        if (container) container.innerHTML = renderSalesView();
        mountSales();
      }
    });
  });

  // Sales filters & export
  document.getElementById('sa-search')?.addEventListener('input', e => { salesFilters.query = e.target.value; rerenderSalesTable(); });
  document.getElementById('sa-range')?.addEventListener('change', e => { salesFilters.range = e.target.value; rerenderSalesTable(); });
  document.getElementById('sa-payment')?.addEventListener('change', e => { salesFilters.payment = e.target.value; rerenderSalesTable(); });
  document.getElementById('sa-export-csv')?.addEventListener('click', exportSalesCSV);

  // Sales table actions
  const saTbody = document.getElementById('sa-tbody');
  saTbody?.addEventListener('click', e => {
    const view = e.target.closest('[data-view]');
    const reprint = e.target.closest('[data-reprint]');
    const del = e.target.closest('[data-delete-sale]');
    if (view) openSaleDetails(view.dataset.view);
    if (reprint) reprintSale(reprint.dataset.reprint);
    if (del) confirmDeleteSale(del.dataset.deleteSale);
  });

  // Invoice filters & actions
  document.getElementById('inv-search')?.addEventListener('input', e => { invoiceFilters.query = e.target.value; rerenderInvoiceTable(); });
  document.getElementById('inv-status')?.addEventListener('change', e => { invoiceFilters.status = e.target.value; rerenderInvoiceTable(); });
  document.getElementById('inv-add-btn')?.addEventListener('click', openAddInvoiceModal);

  const invTbody = document.getElementById('inv-tbody');
  invTbody?.addEventListener('click', e => {
    const view = e.target.closest('[data-view-invoice]');
    const del = e.target.closest('[data-delete-invoice]');
    if (view) openInvoiceDetails(view.dataset.viewInvoice);
    if (del) confirmDeleteInvoice(del.dataset.deleteInvoice);
  });

  // Expense filters & actions
  document.getElementById('exp-search')?.addEventListener('input', e => { expenseFilters.query = e.target.value; rerenderExpenseTable(); });
  document.getElementById('exp-cat')?.addEventListener('change', e => { expenseFilters.category = e.target.value; rerenderExpenseTable(); });
  document.getElementById('exp-range')?.addEventListener('change', e => { expenseFilters.range = e.target.value; rerenderExpenseTable(); });
  document.getElementById('exp-add-btn')?.addEventListener('click', openAddExpenseModal);

  const expTbody = document.getElementById('exp-tbody');
  expTbody?.addEventListener('click', e => {
    const del = e.target.closest('[data-delete-expense]');
    if (del) confirmDeleteExpense(del.dataset.deleteExpense);
  });

  // Supplier Returns filters & actions
  document.getElementById('sr-search')?.addEventListener('input', e => { srFilters.query = e.target.value; rerenderSupplierReturnsTable(); });
  document.getElementById('sr-status')?.addEventListener('change', e => { srFilters.status = e.target.value; rerenderSupplierReturnsTable(); });
  document.getElementById('sr-add-btn')?.addEventListener('click', openAddSupplierReturnModal);

  const srTbody = document.getElementById('sr-tbody');
  srTbody?.addEventListener('click', e => {
    const view = e.target.closest('[data-view-sr]');
    const del = e.target.closest('[data-delete-sr]');
    if (view) openSupplierReturnDetails(view.dataset.viewSr);
    if (del) confirmDeleteSupplierReturn(del.dataset.deleteSr);
  });
}

// ============================================================
// FILTERS & HELPERS
// ============================================================

function applySalesFilters(sales) {
  const q = (salesFilters.query || '').trim().toLowerCase();
  return sales.filter(sale => {
    if (q) {
      const inv = (sale.saleId || sale.id || '').toString();
      const pat = (sale.patient?.name || sale.customer?.name || '').toString();
      const doc = (sale.doctor || sale.patient?.doctor || sale.customer?.doctor || '').toString();
      const hay = `${inv} ${pat} ${doc}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (salesFilters.range !== 'all') {
      const ts = sale.timestamp || sale.createdAt;
      const d = ts ? new Date(ts) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (!matchesRange(d, salesFilters.range)) return false;
    }
    if (salesFilters.payment !== 'all') {
      const method = String(sale.payment || '').toLowerCase().trim();
      const norm = method === 'cash' ? 'cash' : method === 'card' ? 'card' : ['upi', 'online', 'wallet'].includes(method) ? 'online' : method;
      if (norm !== salesFilters.payment) return false;
    }
    return true;
  });
}

function applyInvoiceFilters(invoices) {
  const q = (invoiceFilters.query || '').trim().toLowerCase();
  return invoices.filter(inv => {
    if (q) {
      const w = (inv.wholesalerName || '').toLowerCase();
      const num = (inv.invoiceNo || '').toLowerCase();
      if (!w.includes(q) && !num.includes(q)) return false;
    }
    if (invoiceFilters.status !== 'all' && inv.status !== invoiceFilters.status) {
      return false;
    }
    return true;
  });
}

function applyExpenseFilters(expenses) {
  const q = (expenseFilters.query || '').trim().toLowerCase();
  return expenses.filter(exp => {
    if (q) {
      const notes = (exp.notes || '').toLowerCase();
      const payee = (exp.payee || '').toLowerCase();
      if (!notes.includes(q) && !payee.includes(q)) return false;
    }
    if (expenseFilters.category !== 'all' && exp.category !== expenseFilters.category) {
      return false;
    }
    if (expenseFilters.range !== 'all') {
      const ts = exp.createdAt || exp.date;
      const d = ts ? new Date(ts) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (!matchesRange(d, expenseFilters.range)) return false;
    }
    return true;
  });
}

function matchesRange(date, range) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return date >= startOfDay;
  if (range === 'yesterday') {
    const s = new Date(startOfDay); s.setDate(s.getDate() - 1);
    const e = new Date(startOfDay); e.setMilliseconds(-1);
    return date >= s && date <= e;
  }
  if (range === '7d') {
    const s = new Date(startOfDay); s.setDate(s.getDate() - 6);
    return date >= s;
  }
  if (range === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return true;
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

function iconWallet()  { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`; }
function iconReceipt() { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>`; }
function iconChart()   { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`; }
function iconBox()     { return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`; }

// ============================================================
// RENDER ROWS & STATES
// ============================================================

function renderSaleRow(sale) {
  const inv = sale.saleId || sale.id || '—';
  const ts = formatSaleDate(sale.timestamp || sale.createdAt);
  const items = itemsSummary(sale);
  const gross = Number(sale.grossTotal ?? sale.subtotal) || 0;
  const disc = Number(sale.discount) || 0;
  const net = Number(sale.netTotal ?? sale.total) || 0;
  const cashier = sale.cashier || sale.customer?.name || '—';

  return `
    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer" data-view-row="${escapeAttr(inv)}">
      <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(inv)}</td>
      <td class="px-4 py-3 text-xs whitespace-nowrap">${escapeHtml(ts)}</td>
      <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-md truncate">${escapeHtml(items)}</td>
      <td class="px-4 py-3 text-right">${fmtCurrency(gross)}</td>
      <td class="px-4 py-3 text-right text-slate-500">${disc > 0 ? '− ' + fmtCurrency(disc) : '—'}</td>
      <td class="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">${fmtCurrency(net)}</td>
      <td class="px-4 py-3 text-xs">${escapeHtml(cashier)}</td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-1">
          <button data-view="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="View"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button data-reprint="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-teal-50 dark:hover:bg-teal-900/30 text-teal-600" title="Reprint"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><rect x="6" y="14" width="12" height="8"/></svg></button>
          <button data-delete-sale="${escapeAttr(inv)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg></button>
        </div>
      </td>
    </tr>`;
}

function renderInvoiceRow(inv) {
  const id = inv.id || '';
  const wholesaler = inv.wholesalerName || '—';
  const invoiceNo = inv.invoiceNo || '—';
  const date = inv.date || '—';
  const total = Number(inv.totalAmount) || 0;
  const itemCount = Array.isArray(inv.items) ? inv.items.length : 0;
  const status = inv.status || 'Pending';

  const statusBadge = status === 'Completed'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : status === 'Cancelled'
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';

  return `
    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
      <td class="px-4 py-3 font-medium">${escapeHtml(wholesaler)}</td>
      <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(invoiceNo)}</td>
      <td class="px-4 py-3 text-xs">${escapeHtml(date)}</td>
      <td class="px-4 py-3 text-xs">${itemCount} item${itemCount === 1 ? '' : 's'}</td>
      <td class="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-400">${fmtCurrency(total)}</td>
      <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge}">${escapeHtml(status)}</span></td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-1">
          <button data-view-invoice="${escapeAttr(id)}" class="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="View"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button data-delete-invoice="${escapeAttr(id)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg></button>
        </div>
      </td>
    </tr>`;
}

function renderExpenseRow(exp) {
  const id = exp.id || '';
  const category = exp.category || '—';
  const date = formatSaleDate(exp.createdAt || exp.date);
  const notes = exp.notes || exp.payee || '—';
  const amount = Number(exp.amount) || 0;

  return `
    <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
      <td class="px-4 py-3 font-medium">${escapeHtml(category)}</td>
      <td class="px-4 py-3 text-xs">${escapeHtml(date)}</td>
      <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${escapeHtml(notes)}</td>
      <td class="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">${fmtCurrency(amount)}</td>
      <td class="px-4 py-3 text-right">
        <button data-delete-expense="${escapeAttr(id)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg></button>
      </td>
    </tr>`;
}

function renderEmptySalesState() {
  return `<tr><td colspan="8" class="px-4 py-16 text-center text-slate-500">No sales transactions found.</td></tr>`;
}
function renderEmptyInvoicesState() {
  return `<tr><td colspan="7" class="px-4 py-16 text-center text-slate-500">No wholesale invoices logged yet. Click "Add / Scan Invoice" to add one.</td></tr>`;
}
function renderEmptyExpensesState() {
  return `<tr><td colspan="5" class="px-4 py-16 text-center text-slate-500">No shop expenses logged yet. Click "Log Expense" to record one.</td></tr>`;
}

function renderEmptySupplierReturnsState() {
  return `<tr><td colspan="7" class="px-4 py-16 text-center text-slate-500">No supplier returns logged yet. Click "Create Return Voucher" to add one.</td></tr>`;
}

function renderSupplierReturnsTable() {
  const returns = getSupplierReturns();
  if (returns.length === 0) return renderEmptySupplierReturnsState();
  
  return returns.map(r => {
    const id = r.id || '';
    const supplier = r.supplierName || '—';
    const returnNo = r.returnNo || '—';
    const date = r.date || '—';
    const items = Array.isArray(r.items) ? r.items : [];
    const total = Number(r.creditAmount || r.totalAmount || 0);
    const status = r.status || 'Pending';
    
    const statusBadge = status === 'Approved'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : status === 'Rejected'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
      : status === 'Completed'
      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    
    return `
      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
        <td class="px-4 py-3 font-medium">${escapeHtml(supplier)}</td>
        <td class="px-4 py-3 font-mono text-xs font-semibold">${escapeHtml(returnNo)}</td>
        <td class="px-4 py-3 text-xs">${escapeHtml(date)}</td>
        <td class="px-4 py-3 text-xs">${items.length} item${items.length === 1 ? '' : 's'}</td>
        <td class="px-4 py-3 text-right font-bold text-teal-600 dark:text-teal-400">${fmtCurrency(total)}</td>
        <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge}">${escapeHtml(status)}</span></td>
        <td class="px-4 py-3 text-right">
          <div class="inline-flex gap-1">
            <button data-view-sr="${escapeAttr(id)}" class="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="View"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button data-delete-sr="${escapeAttr(id)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderEmptySupplierReturnsState() {
  return `<tr><td colspan="7" class="px-4 py-16 text-center text-slate-500">No supplier returns logged yet. Click "Create Return Voucher" to add one.</td></tr>`;
}

function itemsSummary(sale) {
  if (!Array.isArray(sale.items) || sale.items.length === 0) return '—';
  const parts = sale.items.slice(0, 3).map(it => `${it.name} × ${it.qty}`);
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

// ============================================================
// MODALS & ACTIONS
// ============================================================

function openAddInvoiceModal() {
  showModal(`
    <div class="p-6 space-y-4 max-w-2xl mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Add Wholesale Invoice &amp; OCR Scanner</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      <!-- AI OCR Upload Box -->
      <div class="border-2 border-dashed border-teal-300 dark:border-teal-700 rounded-2xl p-6 text-center bg-teal-50/50 dark:bg-teal-950/20">
        <svg class="w-10 h-10 mx-auto text-teal-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <h4 class="font-bold text-sm">Upload Invoice Image for AI OCR Parsing</h4>
        <p class="text-xs text-slate-500 mb-3">Gemini Vision will auto-extract wholesaler, invoice #, date, items &amp; costs.</p>
        <input id="ocr-file" type="file" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-700"/>
        <button id="ocr-btn" type="button" class="mt-3 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold shadow-md">Run AI OCR Extraction</button>
        <div id="ocr-status" class="mt-2 text-xs text-slate-600 dark:text-slate-400"></div>
      </div>

      <form id="inv-form" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Wholesaler Name</label>
            <input id="inv-wholesaler" required placeholder="e.g. Abbott Pharma distributor" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Invoice Number</label>
            <input id="inv-no" required placeholder="INV-2026-99" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"/>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Invoice Date</label>
            <input id="inv-date" type="date" value="${new Date().toISOString().slice(0,10)}" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Status</label>
            <select id="inv-st" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              ${INVOICE_STATUS.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-semibold uppercase text-slate-500">Purchased Items (JSON / Parsed)</label>
          </div>
          <textarea id="inv-items-json" rows="4" placeholder='[{"name":"Panadol 500mg","quantity":100,"costPrice":15,"batchNo":"B123"}]' class="w-full p-3 font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"></textarea>
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Total Amount (PKR)</label>
          <input id="inv-total" type="number" step="0.01" required placeholder="0.00" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"/>
        </div>

        <div class="pt-3 flex justify-end gap-2">
          <button type="button" data-close class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-md">Save Invoice</button>
        </div>
      </form>
    </div>
  `, {
    size: 'lg',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));

      const ocrBtn = root.querySelector('#ocr-btn');
      ocrBtn?.addEventListener('click', async () => {
        const fileInput = root.querySelector('#ocr-file');
        const statusDiv = root.querySelector('#ocr-status');
        if (!fileInput.files || fileInput.files.length === 0) {
          showToast('Please select an invoice image first.', 'warn');
          return;
        }
        try {
          statusDiv.textContent = 'Analyzing image with Gemini Vision OCR...';
          const file = fileInput.files[0];
          const base64 = await fileToBase64(file);
          const responseText = await executeGeminiRequest(INVOICE_OCR_SYSTEM_PROMPT, base64);
          const parsed = parseJsonSafe(responseText, null);
          if (parsed) {
            root.querySelector('#inv-wholesaler').value = parsed.wholesalerName || '';
            root.querySelector('#inv-no').value = parsed.invoiceNo || '';
            if (parsed.date) root.querySelector('#inv-date').value = parsed.date;
            root.querySelector('#inv-total').value = parsed.totalAmount || '';
            root.querySelector('#inv-items-json').value = JSON.stringify(parsed.items || [], null, 2);
            statusDiv.textContent = '✅ OCR extraction successful!';
            showToast('Invoice parsed successfully via Gemini OCR', 'success');
          } else {
            statusDiv.textContent = '❌ Failed to parse OCR response as JSON.';
            showToast('OCR returned invalid format', 'error');
          }
        } catch (e) {
          console.error(e);
          statusDiv.textContent = `❌ Error: ${e.message}`;
          showToast('OCR extraction failed: ' + e.message, 'error');
        }
      });

const form = root.querySelector('#inv-form');
          form?.addEventListener('submit', e => {
            e.preventDefault();
            try {
              const wholesalerName = root.querySelector('#inv-wholesaler').value.trim();
              const invoiceNo = root.querySelector('#inv-no').value.trim();
              const date = root.querySelector('#inv-date').value;
              const status = root.querySelector('#inv-st').value;
              const totalAmount = Number(root.querySelector('#inv-total').value) || 0;
              let items = [];
              try {
                const itemsJson = root.querySelector('#inv-items-json').value || '[]';
                items = JSON.parse(itemsJson);
                console.log('[Sales] Parsed invoice items:', items);
              } catch (err) {
                console.error('[Sales] Failed to parse items JSON:', err);
                items = [];
              }

              if (!Array.isArray(items) || items.length === 0) {
                showToast('No invoice items to save', 'warn');
                return;
              }

              addInvoice({ wholesalerName, invoiceNo, date, status, totalAmount, items });
              showToast('Wholesale invoice logged successfully', 'success');
              hideModal();
              rerenderInvoiceTable();
            } catch (err) {
              console.error('[Sales] Failed to save invoice:', err);
              showToast('Failed to save invoice: ' + err.message, 'error');
}
      });
    }
  });
}

const srFilters = {
  query: '',
  status: 'all',
};

function openSupplierReturnDetails(id) {
  const ret = (state.supplierReturns || []).find(r => r.id === id);
  if (!ret) { showToast('Supplier return not found.', 'error'); return; }
  const items = Array.isArray(ret.items) ? ret.items : [];
  
  showModal(`
    <div class="p-6 space-y-4 max-w-lg mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Return Voucher #${escapeHtml(ret.returnNo)}</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><div class="text-[10px] uppercase text-slate-500">Supplier</div><div class="font-medium">${escapeHtml(ret.supplierName)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Return No.</div><div class="font-medium">${escapeHtml(ret.returnNo)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Date</div><div class="font-medium">${escapeHtml(ret.date)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Status</div><div class="font-medium">${escapeHtml(ret.status)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Invoice Ref.</div><div class="font-medium">${escapeHtml(ret.invoiceNo || '—')}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Total Credit</div><div class="font-medium text-teal-600">${fmtCurrency(ret.creditAmount || 0)}</div></div>
      </div>
      <div>
        <h4 class="text-xs font-semibold uppercase text-slate-500 mb-2">Items</h4>
        <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/50">
              <tr><th class="p-2 text-left">Item</th><th class="p-2 text-center">Qty</th><th class="p-2 text-right">Credit</th><th class="p-2 text-right">Batch</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${items.map(it => `<tr><td class="p-2">${escapeHtml(it.name)}</td><td class="p-2 text-center">${it.qty}</td><td class="p-2 text-right">${fmtCurrency(it.credit)}</td><td class="p-2 text-right font-mono">${escapeHtml(it.batch || '—')}</td></tr>`).join('') || `<tr><td colspan="4" class="p-4 text-center text-slate-500">No items listed.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      ${ret.notes ? `<div><h4 class="text-xs font-semibold uppercase text-slate-500 mb-2">Notes</h4><div class="text-sm text-slate-600 dark:text-slate-300">${escapeHtml(ret.notes)}</div>` : ''}
    </div>
  `, { size: 'md', onMount: r => r.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal)) });
}

function confirmDeleteSupplierReturn(id) {
  showModal(`
    <div class="p-6 space-y-4 max-w-sm mx-auto text-center">
      <h3 class="text-lg font-bold">Delete Supplier Return?</h3>
      <p class="text-sm text-slate-500">Remove this return voucher from the record?</p>
      <div class="flex justify-center gap-2 pt-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: r => {
      r.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      r.querySelector('[data-confirm]')?.addEventListener('click', () => {
        deleteSupplierReturn(id);
        showToast('Supplier return deleted', 'success');
        hideModal();
        rerenderSupplierReturnsTable();
      });
    }
  });
}
}

function openAddExpenseModal() {
  showModal(`
    <div class="p-6 space-y-4 max-w-md mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Log Shop Expense</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <form id="exp-form" class="space-y-3 text-sm">
        <div>
          <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Category</label>
          <select id="exp-category" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Amount (PKR)</label>
          <input id="exp-amount" type="number" step="0.01" required placeholder="0.00" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase text-slate-500 mb-1">Payee / Notes</label>
          <input id="exp-notes" placeholder="e.g. Electric bill for current month" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
        </div>
        <div class="pt-3 flex justify-end gap-2">
          <button type="button" data-close class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-md">Save Expense</button>
        </div>
      </form>
    </div>
  `, {
    size: 'sm',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelector('#exp-form')?.addEventListener('submit', e => {
        e.preventDefault();
        try {
          const category = root.querySelector('#exp-category').value;
          const amount = Number(root.querySelector('#exp-amount').value) || 0;
          const notes = root.querySelector('#exp-notes').value.trim();
          addExpense({ category, amount, notes, date: new Date().toISOString() });
          showToast('Expense logged successfully', 'success');
          hideModal();
          rerenderExpenseTable();
        } catch (err) {
          console.error(err);
          showToast('Failed to log expense', 'error');
        }
      });
    }
  });
}

function openInvoiceDetails(id) {
  const inv = (state.invoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found.', 'error'); return; }
  const items = Array.isArray(inv.items) ? inv.items : [];
  showModal(`
    <div class="p-6 space-y-4 max-w-lg mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Invoice #${escapeHtml(inv.invoiceNo)}</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><div class="text-[10px] uppercase text-slate-500">Wholesaler</div><div class="font-medium">${escapeHtml(inv.wholesalerName)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Date</div><div class="font-medium">${escapeHtml(inv.date)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Status</div><div class="font-medium">${escapeHtml(inv.status)}</div></div>
        <div><div class="text-[10px] uppercase text-slate-500">Total Amount</div><div class="font-medium text-teal-600">${fmtCurrency(inv.totalAmount)}</div></div>
      </div>
      <div>
        <h4 class="text-xs font-semibold uppercase text-slate-500 mb-2">Items</h4>
        <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/50">
              <tr><th class="p-2 text-left">Item</th><th class="p-2 text-center">Qty</th><th class="p-2 text-right">Cost</th><th class="p-2 text-right">Batch</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${items.map(it => `<tr><td class="p-2">${escapeHtml(it.name)}</td><td class="p-2 text-center">${it.quantity}</td><td class="p-2 text-right">${fmtCurrency(it.costPrice)}</td><td class="p-2 text-right font-mono">${escapeHtml(it.batchNo || '—')}</td></tr>`).join('') || `<tr><td colspan="4" class="p-4 text-center text-slate-500">No items listed.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `, { size: 'md', onMount: r => r.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal)) });
}

function confirmDeleteInvoice(id) {
  showModal(`
    <div class="p-6 space-y-4 max-w-sm mx-auto text-center">
      <h3 class="text-lg font-bold">Delete Invoice?</h3>
      <p class="text-sm text-slate-500">Remove this wholesale invoice from the record?</p>
      <div class="flex justify-center gap-2 pt-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: r => {
      r.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      r.querySelector('[data-confirm]')?.addEventListener('click', () => {
        deleteInvoice(id);
        showToast('Invoice deleted', 'success');
        hideModal();
        rerenderInvoiceTable();
      });
    }
  });
}

function confirmDeleteExpense(id) {
  showModal(`
    <div class="p-6 space-y-4 max-w-sm mx-auto text-center">
      <h3 class="text-lg font-bold">Delete Expense?</h3>
      <p class="text-sm text-slate-500">Remove this expense record?</p>
      <div class="flex justify-center gap-2 pt-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: r => {
      r.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      r.querySelector('[data-confirm]')?.addEventListener('click', () => {
        deleteExpense(id);
        showToast('Expense deleted', 'success');
        hideModal();
        rerenderExpenseTable();
      });
    }
  });
}

function openSaleDetails(invoiceId) {
  const sale = state.sales.find(s => (s.saleId || s.id) === invoiceId);
  if (!sale) { showToast('Sale not found.', 'error'); return; }
  const itemsHtml = (Array.isArray(sale.items) ? sale.items : []).map(it => `
    <tr class="border-b border-slate-100 dark:border-slate-800">
      <td class="py-2 pr-2">
        <div class="font-medium text-sm flex items-center gap-1">${escapeHtml(it.name || '—')}</div>
        <div class="text-[11px] text-slate-500"><span class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 mr-1">${escapeHtml(unitLabel(it.unit || 'Unit'))}</span>Batch: ${escapeHtml(it.batchNo || '—')}</div>
      </td>
      <td class="py-2 text-center text-sm">${Number(it.qty) || 0}</td>
      <td class="py-2 text-right text-sm">${fmtCurrency(it.unitPrice)}</td>
      <td class="py-2 text-right text-sm font-semibold">${fmtCurrency(it.subtotal)}</td>
    </tr>
  `).join('');

  showModal(`
    <div class="p-6 space-y-4 max-w-lg mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Invoice ${escapeHtml(sale.saleId || sale.id)}</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase text-slate-500">
            <tr><th class="px-3 py-2 text-left">Item</th><th class="px-3 py-2 text-center">Qty</th><th class="px-3 py-2 text-right">Price</th><th class="px-3 py-2 text-right">Total</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button data-close class="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold">Close</button>
      </div>
    </div>
  `, { size: 'md', onMount: r => r.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal)) });
}

function reprintSale(invoiceId) {
  openSaleDetails(invoiceId);
}

function confirmDeleteSale(invoiceId) {
  showModal(`
    <div class="p-6 space-y-4 max-w-sm mx-auto text-center">
      <h3 class="text-lg font-bold">Delete Sale?</h3>
      <p class="text-sm text-slate-500">Remove sale ${invoiceId}?</p>
      <div class="flex justify-center gap-2 pt-2">
        <button data-cancel class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">Cancel</button>
        <button data-confirm class="px-5 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold">Delete</button>
      </div>
    </div>
  `, {
    size: 'sm',
    onMount: r => {
      r.querySelector('[data-cancel]')?.addEventListener('click', hideModal);
      r.querySelector('[data-confirm]')?.addEventListener('click', () => {
        state.sales = state.sales.filter(s => (s.saleId || s.id) !== invoiceId);
        localStorage.setItem(LS_KEYS.sales, JSON.stringify(state.sales));
        showToast('Sale deleted', 'success');
        hideModal();
        rerenderSalesTable();
      });
    }
  });
}

function exportSalesCSV() {
  const sales = Array.isArray(state.sales) ? state.sales : [];
  const filtered = applySalesFilters(sales);
  if (filtered.length === 0) { showToast('No sales to export.', 'warn'); return; }
  const rows = [['Invoice ID','Date','Time','Patient','Doctor','Cashier','Payment','Net Total']];
  for (const s of filtered) {
    const d = new Date(s.timestamp || s.createdAt || '');
    rows.push([s.saleId || s.id, d.toISOString().slice(0,10), d.toTimeString().slice(0,8), s.patient?.name || '', s.doctor || '', s.cashier || '', s.payment || '', Number(s.netTotal ?? s.total) || 0]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `dripp-sales-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported CSV successfully', 'success');
}

function rerenderSalesTable() {
  const tbody = document.getElementById('sa-tbody');
  if (!tbody) return;
  const filtered = applySalesFilters(Array.isArray(state.sales) ? state.sales : []);
  tbody.innerHTML = filtered.length === 0 ? renderEmptySalesState() : filtered.map(renderSaleRow).join('');
}

function rerenderInvoiceTable() {
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  const filtered = applyInvoiceFilters(Array.isArray(state.invoices) ? state.invoices : []);
  tbody.innerHTML = filtered.length === 0 ? renderEmptyInvoicesState() : filtered.map(renderInvoiceRow).join('');
}

function rerenderExpenseTable() {
  const tbody = document.getElementById('exp-tbody');
  if (!tbody) return;
  const filtered = applyExpenseFilters(Array.isArray(state.expenses) ? state.expenses : []);
  tbody.innerHTML = filtered.length === 0 ? renderEmptyExpensesState() : filtered.map(renderExpenseRow).join('');
}

function rerenderSupplierReturnsTable() {
  const tbody = document.getElementById('sr-tbody');
  if (!tbody) return;
  const filtered = applySupplierReturnsFilters(Array.isArray(state.supplierReturns) ? state.supplierReturns : []);
  tbody.innerHTML = filtered.length === 0 ? renderEmptySupplierReturnsState() : filtered.map(renderSupplierReturnsRow).join('');
}

function applySupplierReturnsFilters(returns) {
  const q = (srFilters.query || '').trim().toLowerCase();
  return returns.filter(r => {
    if (srFilters.status !== 'all' && r.status !== srFilters.status) return false;
    if (q) {
      const hay = `${r.supplierName || ''} ${r.returnNo || ''} ${r.batchNo || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function openAddSupplierReturnModal() {
  showModal(`
    <div class="p-6 space-y-4 max-w-2xl mx-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Create Supplier Return Voucher</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <form id="sr-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Supplier Name <span class="text-rose-500">*</span></label>
            <input id="sr-supplier" required placeholder="e.g. ABC Pharma" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Return Number <span class="text-rose-500">*</span></label>
            <input id="sr-no" required placeholder="RET-2024-001" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Date <span class="text-rose-500">*</span></label>
            <input id="sr-date" type="date" required value="${new Date().toISOString().slice(0,10)}" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Status</label>
            <select id="sr-status" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Related Invoice No.</label>
          <input id="sr-invoice" placeholder="INV-2024-001" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"/>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Return Items</label>
          </div>
          <div id="sr-items-container" class="space-y-2">
            <div class="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <div class="sm:col-span-2">
                <label class="text-xs font-semibold uppercase text-slate-500">Medicine Name <span class="text-rose-500">*</span></label>
                <input type="text" required placeholder="e.g. Paracetamol 500mg" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-name"/>
              </div>
              <div>
                <label class="text-xs font-semibold uppercase text-slate-500">Qty <span class="text-rose-500">*</span></label>
                <input type="number" min="1" step="1" required value="1" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-qty"/>
              </div>
              <div>
                <label class="text-xs font-semibold uppercase text-slate-500">Credit Price <span class="text-rose-500">*</span></label>
                <input type="number" min="0" step="0.01" required value="0" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-credit"/>
              </div>
              <div>
                <label class="text-xs font-semibold uppercase text-slate-500">Batch No.</label>
                <input type="text" placeholder="BTH-123" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-batch"/>
              </div>
              <div>
                <button type="button" class="px-2 py-1.5 text-[10px] font-semibold text-rose-600 hover:text-rose-700" onclick="this.closest('.grid').remove()">Remove</button>
              </div>
            </div>
          </div>
          <button type="button" id="sr-add-item" class="w-full px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-50 dark:hover:bg-teal-900/30">
            <svg class="w-4 h-4 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Another Item
          </button>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Total Credit Amount <span class="text-rose-500">*</span></label>
          <input id="sr-total" type="number" step="0.01" required placeholder="0.00" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Notes</label>
          <textarea id="sr-notes" rows="2" placeholder="Reason for return, notes..." class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"></textarea>
        </div>
        <div class="pt-3 flex justify-end gap-2">
          <button type="button" data-close class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-md">Create Return Voucher</button>
        </div>
      </form>
    </div>
  `, {
    size: 'lg',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelector('#sr-add-item')?.addEventListener('click', () => {
        const container = root.querySelector('#sr-items-container');
        const newItem = document.createElement('div');
        newItem.className = 'grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700';
        newItem.innerHTML = `
          <div class="sm:col-span-2">
            <label class="text-xs font-semibold uppercase text-slate-500">Medicine Name <span class="text-rose-500">*</span></label>
            <input type="text" required placeholder="e.g. Paracetamol 500mg" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-name"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase text-slate-500">Qty <span class="text-rose-500">*</span></label>
            <input type="number" min="1" step="1" required value="1" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-qty"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase text-slate-500">Credit Price <span class="text-rose-500">*</span></label>
            <input type="number" min="0" step="0.01" required value="0" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-credit"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase text-slate-500">Batch No.</label>
            <input type="text" placeholder="BTH-123" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" name="item-batch"/>
          </div>
          <div>
            <button type="button" class="px-2 py-1.5 text-[10px] font-semibold text-rose-600 hover:text-rose-700" onclick="this.closest('.grid').remove()">Remove</button>
          </div>
        `;
        container.appendChild(newItem);
      });
      root.querySelector('#sr-form')?.addEventListener('submit', e => {
        e.preventDefault();
        try {
          const supplierName = root.querySelector('#sr-supplier').value.trim();
          const returnNo = root.querySelector('#sr-no').value.trim();
          const date = root.querySelector('#sr-date').value;
          const status = root.querySelector('#sr-status').value;
          const invoiceNo = root.querySelector('#sr-invoice').value.trim();
          const total = Number(root.querySelector('#sr-total').value) || 0;
          const notes = root.querySelector('#sr-notes').value.trim();
          const status = root.querySelector('#sr-status').value;
          
          const items = [];
          root.querySelectorAll('#sr-items-container .grid').forEach(row => {
            const name = row.querySelector('[name="item-name"]').value.trim();
            const qty = Number(row.querySelector('[name="item-qty"]').value) || 1;
            const credit = Number(row.querySelector('[name="item-credit"]').value) || 0;
            const batch = row.querySelector('[name="item-batch"]').value.trim();
            if (name) items.push({ name, qty, credit, batch });
          });
          
          if (!supplierName || !returnNo || !date || items.length === 0) {
            showToast('Supplier name, return number, date, and at least one item are required', 'warn');
            return;
          }
          
          addSupplierReturn({
            supplierName,
            returnNo,
            date,
            status,
            invoiceNo,
            items,
            creditAmount: total,
            notes: notes,
          });
          
          showToast('Supplier return voucher created', 'success');
          hideModal();
          rerenderSupplierReturnsTable();
        } catch (err) {
          console.error(err);
          showToast('Failed to create return voucher: ' + err.message, 'error');
        }
      });
    }
  });
}
