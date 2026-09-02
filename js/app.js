// js/app.js
// Main orchestrator: boot sequence, router, view mounting.

import {
  applyTheme, getStoredTheme, bindThemeToggle,
  bindSidebar, startClock, bindQuickSettings,
  createRouter, highlightNav,
} from './ui.js';

import { bootState } from './state.js';

import { renderDashboardView, mountDashboard } from './views/dashboard.js';
import { renderPOSView, mountPOS }       from './views/pos.js';
import { renderInventoryView, mountInventory } from './views/inventory.js';
import { renderSalesView, mountSales }   from './views/sales.js';
import { SettingsView,    mountSettings }  from './views/settings.js';

// ============================================================
// Boot
// ============================================================

(async function main() {
  // Theme first to avoid FOUC
  applyTheme(getStoredTheme());
  bindThemeToggle();
  bindSidebar();
  startClock();
  bindQuickSettings();

  // Hash router — render functions return HTML strings
  const router = createRouter({
    dashboard: async () => renderDashboardView(),
    pos:       async () => renderPOSView(),
    inventory: async () => renderInventoryView(),
    sales:     async () => renderSalesView(),
    settings:  async () => SettingsView(),
  });

  // View mount hooks (one per view)
  const mounters = {
    dashboard: mountDashboard,
    pos:       mountPOS,
    inventory: mountInventory,
    sales:     mountSales,
    settings:  mountSettings,
  };

  window.addEventListener('view:mounted', (e) => {
    const v = e.detail.view;
    if (mounters[v]) {
      try { mounters[v](); } catch (err) { console.error(`Mount ${v} failed:`, err); }
    }
  });

  // Click delegation for nav links (also handle direct hash)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav]');
    if (!a) return;
    // Browser handles hash change; just close mobile menu
    if (window.innerWidth < 1024) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar?.classList.add('-translate-x-full');
      overlay?.classList.add('hidden');
    }
  });

  // Boot state (GitHub fetch with LocalStorage fallback)
  try {
    await bootState();
  } catch (e) {
    console.error('Boot failed:', e);
  }

  // Initial render
  if (!location.hash) location.hash = '#dashboard';
  await router.render();

  // Re-render on state changes
  // (state.js dispatches via subscribe; we listen for storage-like events)
  // Using a custom event for simplicity:
  window.addEventListener('hashchange', () => router.render());
})();