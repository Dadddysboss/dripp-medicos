// js/views/settings.js
// Dripp Medicos — System & GitHub Settings view.

import { fmtDateTime, LS_KEYS, DEFAULT_DOCTORS, DEFAULT_PRODUCTS } from '../config.js';
import * as GitHub from '../github.js';
import {
  getState, setCashier, getCashier,
  refreshFromGitHub,
  syncProducts, syncSales, syncDoctors,
  addDoctor, updateDoctor, deleteDoctor,
} from '../state.js';
import { showToast, showModal, hideModal, escapeHtml, escapeAttr } from '../ui.js';

export function renderSettingsView() {
  const creds = GitHub.getCredentials() || {};
  const state = getState();
  const doctorCount = Array.isArray(state.doctors) ? state.doctors.length : 0;

  return `
    <div class="space-y-6 max-w-5xl">

      <!-- GitHub Sync -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold">GitHub Sync</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">All data is committed to your GitHub repository via the REST API.</p>
          </div>
          <span class="text-[11px] uppercase tracking-wider px-2 py-1 rounded-full ${creds.token
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}">
            ${creds.token ? 'Connected' : 'Not configured'}
          </span>
        </div>

        <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">GitHub Username</label>
            <input id="gh-owner" value="${escapeAttr(creds.owner || '')}" placeholder="e.g. octocat"
                   class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Repository Name</label>
            <input id="gh-repo" value="${escapeAttr(creds.repo || '')}" placeholder="e.g. dripp-medicos"
                   class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Branch</label>
            <input id="gh-branch" value="${escapeAttr(creds.branch || 'main')}" placeholder="main"
                   class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Personal Access Token (PAT)</label>
            <div class="relative">
              <input id="gh-token" type="password" value="${escapeAttr(creds.token || '')}" placeholder="github_pat_xxx"
                     class="w-full px-3 py-2 pr-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"/>
              <button id="gh-toggle" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Show / hide">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Stored only in this browser's LocalStorage. Needs <code>Contents: Read &amp; Write</code> on the repo.</p>
          </div>
        </div>

        <div class="px-5 pb-5 flex flex-wrap gap-2">
          <button id="gh-test" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Test connection</button>
          <button id="gh-save" class="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-glow">Save credentials</button>
          <button id="gh-pull" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Pull from GitHub</button>
          <button id="gh-push-products" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Push products.json</button>
          <button id="gh-push-sales" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Push sales.json</button>
          <button id="gh-push-doctors" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Push doctors.json</button>
          <button id="gh-clear" class="px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/30">Disconnect</button>
        </div>

        <div class="px-5 pb-5 text-xs text-slate-500 dark:text-slate-400">
          Last successful commit: <span id="gh-last" class="font-mono">${state.lastSync ? fmtDateTime(state.lastSync) : '—'}</span>
        </div>
      </section>

      <!-- Local preferences -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 class="text-base font-bold">Local Preferences</h2>
        </div>
        <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="md:col-span-1">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Cashier name</label>
            <input id="set-cashier" value="${escapeAttr(getCashier().name)}" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div class="md:col-span-1">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Theme</label>
            <select id="set-theme" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div class="md:col-span-1 flex items-end">
            <button id="set-save" class="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">Save preferences</button>
          </div>
        </div>
      </section>

      <!-- Doctor Directory -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold">Doctor Directory</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">${doctorCount} doctor${doctorCount === 1 ? '' : 's'} synced</p>
          </div>
          <button id="doc-add" class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold">+ Add Doctor</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr><th class="px-4 py-3 text-left">Name</th><th class="px-4 py-3 text-left">Specialty</th><th class="px-4 py-3 text-left">PMC No.</th><th class="px-4 py-3 text-left">Phone</th><th class="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${(state.doctors || []).map(d => `
                <tr>
                  <td class="px-4 py-3 font-medium">${escapeHtml(d.name || '—')}</td>
                  <td class="px-4 py-3 text-xs">${escapeHtml(d.specialty || '—')}</td>
                  <td class="px-4 py-3 font-mono text-xs">${escapeHtml(d.pmc || '—')}</td>
                  <td class="px-4 py-3 text-xs">${escapeHtml(d.phone || '—')}</td>
                  <td class="px-4 py-3 text-right">
                    <div class="inline-flex gap-1">
                      <button data-doc-edit="${escapeAttr(d.id)}" class="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                      </button>
                      <button data-doc-del="${escapeAttr(d.id)}" class="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" title="Delete">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6 17.5 20A2 2 0 0 1 15.5 22h-7A2 2 0 0 1 6.5 20L5 6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('') || `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500 text-sm">No doctors added yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Data tools -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 class="text-base font-bold">Data Tools</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">Export or seed your local data.</p>
        </div>
        <div class="p-5 flex flex-wrap gap-2">
          <button id="tool-export-products" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Download products.json</button>
          <button id="tool-export-sales" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Download sales.json</button>
          <button id="tool-export-doctors" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Download doctors.json</button>
          <button id="tool-seed" class="px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/30">Seed sample products (if empty)</button>
          <button id="tool-wipe" class="px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 text-sm hover:bg-rose-50 dark:hover:bg-rose-900/30">Clear all local data</button>
        </div>
      </section>

      <!-- Emergency backup -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
          </div>
          <div>
            <h2 class="text-base font-bold">Emergency Backup &amp; Sync</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Force sync, full-state export, and offline restore.</p>
          </div>
        </div>
        <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button id="tool-force-pull" class="flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-300 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-left">
            <svg class="w-5 h-5 text-sky-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <div>
              <div class="text-sm font-semibold text-sky-700 dark:text-sky-300">Force Pull from GitHub</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Clears local cache and re-fetches products + sales + doctors</div>
            </div>
          </button>

          <button id="tool-force-push" class="flex items-center gap-3 px-4 py-3 rounded-lg border border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-left">
            <svg class="w-5 h-5 text-violet-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>
            <div>
              <div class="text-sm font-semibold text-violet-700 dark:text-violet-300">Force Push to GitHub</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Immediately overwrites remote with current local state</div>
            </div>
          </button>

          <button id="tool-export-state" class="flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-left">
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div>
              <div class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Export Local State (.json)</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Full offline backup (products + sales + doctors)</div>
            </div>
          </button>

          <label id="tool-import-state" class="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer text-left">
            <svg class="w-5 h-5 text-amber-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div>
              <div class="text-sm font-semibold text-amber-700 dark:text-amber-300">Import State from .json</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">Restore from a local backup file</div>
            </div>
            <input id="tool-import-input" type="file" accept="application/json,.json" class="hidden"/>
          </label>
        </div>
      </section>

      <!-- About -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 class="text-base font-bold">About</h2>
        </div>
        <div class="p-5 text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p><strong class="text-slate-900 dark:text-slate-100">Dripp Medicos</strong> — Gynecological, Obstetrics &amp; Women's Health Pharmacy POS.</p>
          <p>100% static, serverless. Data lives in <code>data/products.json</code>, <code>data/sales.json</code>, and <code>data/doctors.json</code> on your GitHub repo and is committed via the REST API. LocalStorage provides instant rendering and offline fallback.</p>
        </div>
      </section>
    </div>
  `;
}

export function mountSettings() {
  const themeSel = document.getElementById('set-theme');
  if (themeSel) themeSel.value = localStorage.getItem(LS_KEYS.theme) || 'dark';

  document.getElementById('gh-toggle')?.addEventListener('click', () => {
    const t = document.getElementById('gh-token'); if (!t) return;
    t.type = t.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('gh-save')?.addEventListener('click', () => {
    const creds = {
      owner:  document.getElementById('gh-owner').value.trim(),
      repo:   document.getElementById('gh-repo').value.trim(),
      branch: document.getElementById('gh-branch').value.trim() || 'main',
      token:  document.getElementById('gh-token').value.trim(),
    };
    if (!creds.owner || !creds.repo || !creds.token) { showToast('Owner, repo and token are required', 'warn'); return; }
    GitHub.setCredentials(creds);
    showToast('Credentials saved locally', 'success');
  });

  document.getElementById('gh-test')?.addEventListener('click', async () => {
    const creds = {
      owner:  document.getElementById('gh-owner').value.trim(),
      repo:   document.getElementById('gh-repo').value.trim(),
      branch: document.getElementById('gh-branch').value.trim() || 'main',
      token:  document.getElementById('gh-token').value.trim(),
    };
    if (!creds.owner || !creds.repo || !creds.token) { showToast('Fill all fields first', 'warn'); return; }
    try {
      const res = await GitHub.testConnection(creds);
      showToast(`Connected to ${res.full_name} (default branch: ${res.default_branch})`, 'success');
    } catch (e) { showToast(e.message, 'error', 6000); }
  });

  document.getElementById('gh-pull')?.addEventListener('click', async () => {
    try { await refreshFromGitHub(); showToast('Pulled latest from GitHub', 'success'); rerender(); }
    catch (e) { showToast(e.message, 'error', 6000); }
  });

  document.getElementById('gh-push-products')?.addEventListener('click', async () => {
    try { await syncProducts('Manual push products'); showToast('Products committed', 'success'); }
    catch (e) { showToast(e.message, 'error', 6000); }
  });
  document.getElementById('gh-push-sales')?.addEventListener('click', async () => {
    try { await syncSales('Manual push sales'); showToast('Sales committed', 'success'); }
    catch (e) { showToast(e.message, 'error', 6000); }
  });
  document.getElementById('gh-push-doctors')?.addEventListener('click', async () => {
    try { await syncDoctors('Manual push doctors'); showToast('Doctors committed', 'success'); }
    catch (e) { showToast(e.message, 'error', 6000); }
  });

  document.getElementById('gh-clear')?.addEventListener('click', () => {
    if (!confirm('Disconnect GitHub? Local cache will remain.')) return;
    GitHub.clearCredentials();
    showToast('Disconnected from GitHub', 'info');
    rerender();
  });

  document.getElementById('set-save')?.addEventListener('click', () => {
    setCashier(document.getElementById('set-cashier').value);
    const theme = document.getElementById('set-theme').value;
    localStorage.setItem(LS_KEYS.theme, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    showToast('Preferences saved', 'success');
  });

  // ---- Doctor directory CRUD
  document.getElementById('doc-add')?.addEventListener('click', () => openDoctorModal(null));
  document.querySelectorAll('[data-doc-edit]').forEach(b => b.addEventListener('click', () => {
    const d = getState().doctors?.find(x => x.id === b.dataset.docEdit);
    if (d) openDoctorModal(d);
  }));
  document.querySelectorAll('[data-doc-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Delete this doctor?')) return;
    deleteDoctor(b.dataset.docDel);
    showToast('Doctor deleted', 'success');
    rerender();
  }));

  // ---- Data tools
  document.getElementById('tool-export-products')?.addEventListener('click', () => downloadJSON('products.json', getState().products));
  document.getElementById('tool-export-sales')?.addEventListener('click',    () => downloadJSON('sales.json',    getState().sales));
  document.getElementById('tool-export-doctors')?.addEventListener('click',  () => downloadJSON('doctors.json',  getState().doctors));

  document.getElementById('tool-seed')?.addEventListener('click', async () => {
    const s = getState();
    if (s.products.length > 0 && !confirm('Products already exist. Append sample seeds anyway?')) return;
    const { addProduct } = await import('../state.js');
    for (const p of DEFAULT_PRODUCTS) {
      const exists = getState().products.some(x => x.sku === p.sku);
      if (!exists) addProduct({ ...p, id: undefined });
    }
    showToast('Sample products seeded', 'success');
    rerender();
  });

  document.getElementById('tool-wipe')?.addEventListener('click', () => {
    if (!confirm('Clear ALL local data? This cannot be undone.')) return;
    localStorage.removeItem(LS_KEYS.products);
    localStorage.removeItem(LS_KEYS.sales);
    localStorage.removeItem(LS_KEYS.doctors);
    showToast('Local data cleared — reloading…', 'info');
    setTimeout(() => location.reload(), 800);
  });

  // ---- Emergency
  document.getElementById('tool-force-pull')?.addEventListener('click', async () => {
    if (!GitHub.hasCredentials()) { showToast('Configure GitHub credentials first.', 'warn'); return; }
    try { showToast('Pulling from GitHub…', 'info', 2000); await refreshFromGitHub(); showToast('Force pull complete.', 'success'); rerender(); }
    catch (e) { showToast(e.message || 'Force pull failed.', 'error', 6000); }
  });
  document.getElementById('tool-force-push')?.addEventListener('click', async () => {
    if (!GitHub.hasCredentials()) { showToast('Configure GitHub credentials first.', 'warn'); return; }
    if (!confirm('Force push will OVERWRITE products.json, sales.json and doctors.json on GitHub. Continue?')) return;
    try {
      showToast('Pushing to GitHub…', 'info', 2000);
      await syncProducts('Force push — Dripp Medicos');
      await syncSales('Force push — Dripp Medicos');
      await syncDoctors('Force push — Dripp Medicos');
      showToast('Force push complete.', 'success');
    } catch (e) { showToast(e.message || 'Force push failed.', 'error', 6000); }
  });
  document.getElementById('tool-export-state')?.addEventListener('click', () => {
    const s = getState();
    const payload = {
      meta: { app: 'Dripp Medicos', exportedAt: new Date().toISOString(), version: '1.0.0' },
      products: Array.isArray(s.products) ? s.products : [],
      sales:    Array.isArray(s.sales)    ? s.sales    : [],
      doctors:  Array.isArray(s.doctors)  ? s.doctors  : [],
    };
    downloadJSON(`dripp-medicos-state-${new Date().toISOString().slice(0,10)}.json`, payload);
    showToast('Full state backup downloaded.', 'success');
  });
  document.getElementById('tool-import-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let products = null, sales = null, doctors = null;
      if (Array.isArray(data)) {
        const kind = prompt('Detected a raw array. Type "products", "sales", or "doctors":', 'products');
        if (kind === 'products') products = data;
        else if (kind === 'sales') sales = data;
        else if (kind === 'doctors') doctors = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.products)) products = data.products;
        if (Array.isArray(data.sales))    sales    = data.sales;
        if (Array.isArray(data.doctors))  doctors  = data.doctors;
      }
      if (!products && !sales && !doctors) { showToast('No valid arrays found in file.', 'error', 5000); e.target.value = ''; return; }
      if (!confirm('This will REPLACE your local data with the imported arrays. Continue?')) { e.target.value = ''; return; }
      if (products) { getState().products = products; localStorage.setItem(LS_KEYS.products, JSON.stringify(products)); }
      if (sales)    { getState().sales    = sales;    localStorage.setItem(LS_KEYS.sales,    JSON.stringify(sales)); }
      if (doctors)  { getState().doctors  = doctors;  localStorage.setItem(LS_KEYS.doctors,  JSON.stringify(doctors)); }
      showToast('Import complete — reloading…', 'success');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      console.error(err);
      showToast('Failed to import: ' + (err.message || 'invalid file'), 'error', 6000);
    } finally {
      e.target.value = '';
    }
  });
}

// ============================================================
// Doctor modal
// ============================================================

function openDoctorModal(doctor) {
  const isEdit = !!doctor;
  const d = doctor || { name: '', specialty: '', pmc: '', phone: '' };
  showModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">${isEdit ? 'Edit Doctor' : 'Add Doctor'}</h3>
        <button data-close class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form id="doc-form" class="space-y-3">
        <div>
          <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name <span class="text-rose-500">*</span></label>
          <input id="doc-name" type="text" required value="${escapeAttr(d.name)}" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
        </div>
        <div>
          <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Specialty</label>
          <input id="doc-spec" type="text" value="${escapeAttr(d.specialty)}" placeholder="Gynaecologist / Obstetrician / Fertility" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">PMC No.</label>
            <input id="doc-pmc" type="text" value="${escapeAttr(d.pmc)}" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</label>
            <input id="doc-phone" type="text" value="${escapeAttr(d.phone)}" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"/>
          </div>
        </div>
        <div class="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" data-close class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">${isEdit ? 'Save Changes' : 'Add Doctor'}</button>
        </div>
      </form>
    </div>
  `, {
    size: 'md',
    onMount: (root) => {
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', hideModal));
      root.querySelector('#doc-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (root.querySelector('#doc-name').value || '').trim();
        if (!name) { showToast('Doctor name is required', 'warn'); return; }
        const payload = {
          name,
          specialty: (root.querySelector('#doc-spec').value || '').trim(),
          pmc:       (root.querySelector('#doc-pmc').value || '').trim(),
          phone:     (root.querySelector('#doc-phone').value || '').trim(),
        };
        if (doctor?.id) {
          updateDoctor({ ...doctor, ...payload, id: doctor.id });
          showToast(`Doctor updated`, 'success');
        } else {
          addDoctor(payload);
          showToast(`Doctor added`, 'success');
        }
        hideModal();
        rerender();
      });
    }
  });
}

// ============================================================
// Helpers
// ============================================================

function downloadJSON(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${name}`, 'success');
}

function rerender() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}