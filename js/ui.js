// js/ui.js
// UI shell helpers: sidebar, theme, live clock, toasts, modal.

import { LS_KEYS } from './config.js';
import { setCashier, getCashier } from './state.js';

// ============================================================
// 1. Live clock
// ============================================================

let clockTimer = null;

export function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const el = document.getElementById('live-time');
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

// ============================================================
// 2. Theme
// ============================================================

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  const sun  = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (sun && moon) {
    if (theme === 'dark') { sun.classList.remove('hidden'); moon.classList.add('hidden'); }
    else                  { sun.classList.add('hidden');    moon.classList.remove('hidden'); }
  }
}

export function getStoredTheme() {
  return localStorage.getItem(LS_KEYS.theme) || 'dark';
}

export function setStoredTheme(theme) {
  localStorage.setItem(LS_KEYS.theme, theme);
  applyTheme(theme);
}

export function bindThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cur = getStoredTheme();
    setStoredTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

// ============================================================
// 3. Sidebar / mobile
// ============================================================

export function bindSidebar() {
  const openBtn = document.getElementById('sidebar-open');
  const closeBtn = document.getElementById('sidebar-toggle-mobile');
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('sidebar');

  function open() {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  }
  function close() {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  // Auto-close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) close();
  });
}

// ============================================================
// 4. Nav active highlighting
// ============================================================

const PAGE_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview & analytics' },
  pos:       { title: 'Cash Counter', subtitle: 'POS Terminal' },
  inventory: { title: 'Inventory', subtitle: 'Gyno medicines & stock' },
  sales:     { title: 'Sales & Reports', subtitle: 'Transaction history' },
  settings:  { title: 'System Settings', subtitle: 'GitHub sync, theme, cashier' },
};

export function highlightNav(view) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === view) {
      a.classList.add('bg-brand-50','dark:bg-brand-900/20','text-brand-700','dark:text-brand-300');
      a.classList.remove('text-slate-600','dark:text-slate-300','hover:bg-slate-100','dark:hover:bg-slate-800');
    } else {
      a.classList.remove('bg-brand-50','dark:bg-brand-900/20','text-brand-700','dark:text-brand-300');
      a.classList.add('text-slate-600','dark:text-slate-300','hover:bg-slate-100','dark:hover:bg-slate-800');
    }
  });
  const meta = PAGE_META[view] || { title: 'Dripp Medicos', subtitle: '' };
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-subtitle');
  if (t) t.textContent = meta.title;
  if (s) s.textContent = meta.subtitle;
}

// ============================================================
// 5. Toast notifications
// ============================================================

const ICONS = {
  info:    '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  success: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  warn:    '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error:   '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};

const COLOR = {
  info:    'border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30',
  success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30',
  warn:    'border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30',
  error:   'border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30',
};

export function toast(message, type = 'info', timeout = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur ${COLOR[type] || COLOR.info} animate-fadeUp`;
  el.innerHTML = `
    <div class="flex-shrink-0 mt-0.5">${ICONS[type] || ICONS.info}</div>
    <div class="text-sm font-medium leading-snug">${escapeHtml(message)}</div>
    <button class="ml-2 text-current opacity-60 hover:opacity-100" aria-label="Dismiss">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  el.querySelector('button').addEventListener('click', () => el.remove());
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.25s';
    setTimeout(() => el.remove(), 280);
  }, timeout);
}

// Aliases used by views (semantic names matching spec)
export const showToast  = toast;
export const showModal  = openModal;
export const hideModal  = closeModal;

// ============================================================
// 6. Modal helpers
// ============================================================

export function openModal(html, { onMount, size = 'md' } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const sizeCls = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size] || 'max-w-lg';

  root.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" data-modal-backdrop>
      <div class="w-full ${sizeCls} bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fadeUp">
        ${html}
      </div>
    </div>
  `;
  root.querySelector('[data-modal-backdrop]').addEventListener('click', (e) => {
    if (e.target.dataset.modalBackdrop !== undefined) closeModal();
  });
  if (typeof onMount === 'function') {
    setTimeout(onMount, 0);
  }
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

// ============================================================
// 7. Quick settings popover
// ============================================================

export function bindQuickSettings() {
  const btn = document.getElementById('quick-settings-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold">Quick Settings</h3>
          <button data-close class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Cashier name</label>
        <input id="qs-cashier" type="text" value="${escapeAttr(getCashier().name || 'Cashier')}"
               class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />

        <div class="mt-5 flex items-center justify-between">
          <div class="text-xs text-slate-500 dark:text-slate-400">Toggle theme</div>
          <button id="qs-theme" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800">Switch theme</button>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button data-close class="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
          <button id="qs-save" class="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Save</button>
        </div>
      </div>
    `, {
      onMount: () => {
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
        document.getElementById('qs-theme').addEventListener('click', () => {
          const cur = localStorage.getItem('dm_theme_v1') || 'dark';
          localStorage.setItem('dm_theme_v1', cur === 'dark' ? 'light' : 'dark');
          applyTheme(cur === 'dark' ? 'light' : 'dark');
          toast('Theme switched', 'success');
        });
        document.getElementById('qs-save').addEventListener('click', () => {
          const v = document.getElementById('qs-cashier').value;
          setCashier(v);
          toast('Cashier updated', 'success');
          closeModal();
        });
      }
    });
  });
}

// ============================================================
// 8. Hash router
// ============================================================

export function createRouter(routes) {
  async function render() {
    const hash = (location.hash || '#dashboard').replace('#', '').split('/')[0];
    const view = routes[hash] ? hash : 'dashboard';
    highlightNav(view);
    const container = document.getElementById('view-container');
    if (!container) return;
    container.innerHTML = `<div class="flex items-center justify-center py-20 text-slate-400">Loading…</div>`;
    try {
      const html = await routes[view]();
      container.innerHTML = `<div class="view">${html}</div>`;
      // After inject, allow views to mount behavior via custom event
      window.dispatchEvent(new CustomEvent('view:mounted', { detail: { view } }));
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="p-6 text-rose-600">Error rendering view: ${escapeHtml(e.message)}</div>`;
    }
  }

  window.addEventListener('hashchange', render);
  return { render };
}

// ============================================================
// 9. HTML helpers
// ============================================================

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function escapeAttr(s) {
  return escapeHtml(s);
}