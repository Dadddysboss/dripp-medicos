// js/app.js
// Main orchestrator: boot sequence, router, view mounting.

import {
  applyTheme, getStoredTheme, bindThemeToggle,
  bindSidebar, startClock, bindQuickSettings,
  createRouter, highlightNav,
  showToast,
} from './ui.js';

import { bootState, subscribe } from './state.js';
import { initializeAI } from './ai.js';
import { initOfflineSync } from './sync.js';

import { renderDashboardView, mountDashboard } from './views/dashboard.js';
import { renderPOSView, mountPOS }       from './views/pos.js';
import { renderInventoryView, mountInventory } from './views/inventory.js';
import { renderSalesView, mountSales }   from './views/sales.js';
import { renderSettingsView, mountSettings } from './views/settings.js';
import { renderChatbotWidget, mountChatbot, initializeChatbot } from './views/chatbot.js';

// ============================================================
// Boot
// ============================================================

(async function main() {
  // Helper to force-hide loading screen
  function dismissLoader() {
    const loader = document.getElementById('loading-screen');
    if (loader) { loader.classList.add('hidden'); loader.style.display = 'none'; }
    const spinner = document.querySelector('#view-container .animate-spin');
    if (spinner) { const p = spinner.closest('.flex'); if (p) p.remove(); }
  }

  // IMMEDIATELY dismiss loading screen - synchronous, before ANY await
  dismissLoader();

  // Nuclear option: dismiss again after 0ms (next event loop tick)
  setTimeout(dismissLoader, 0);

  // Safety timer: force dismiss after 500ms no matter what
  setTimeout(dismissLoader, 500);

  // Final backup: force dismiss after 2 seconds
  setTimeout(dismissLoader, 2000);

  try {
    // Apply theme immediately (synchronous)
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
      settings:  async () => renderSettingsView(),
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
      const v = e.detail?.view;
      if (v && mounters[v]) {
        try { mounters[v](); } catch (err) { console.error(`Mount ${v} failed:`, err); }
      }
    });

    // Click delegation for nav links (also handle direct hash)
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]');
      if (!a) return;
      if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar?.classList.add('-translate-x-full');
        overlay?.classList.add('hidden');
      }
    });

    // Initialize AI Engine (non-blocking)
    initializeAI();
    // Initialize Chatbot (renders widget & mounts listeners)
    document.body.insertAdjacentHTML('beforeend', renderChatbotWidget());
    initializeChatbot();
    mountChatbot();

    // Initialize Offline Sync (Service Worker + Queue)
    initOfflineSync();

    // Initial render - don't wait for bootState
    if (!location.hash) location.hash = '#dashboard';
    await router.render();

    // Re-render on hash change
    window.addEventListener('hashchange', () => router.render());

    // Boot state in BACKGROUND (non-blocking) with timeout
    setTimeout(async () => {
      let bootOk = false;
      try {
        // Add 10 second timeout to bootState
        const bootPromise = bootState();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Boot timeout after 10s')), 10000)
        );
        await Promise.race([bootPromise, timeoutPromise]);
        bootOk = true;
      } catch (e) {
        console.error('Boot failed (continuing with local data):', e);
        showToast('Using local data (GitHub sync timeout)', 'warn', 5000);
      }

      // Subscribe to state changes for live UI updates
      subscribe(() => {
        if (location.hash) {
          router.render().catch(err => console.error('Router render error:', err));
        }
      });

      // Show a subtle notice if we're running offline/without GitHub
      if (!bootOk) {
        setTimeout(() => {
          showToast('Running in offline mode — changes saved locally', 'info', 4000);
        }, 500);
      }
    }, 0);

  } catch (fatalErr) {
    console.error('Fatal app error:', fatalErr);
    const container = document.getElementById('view-container');
    if (container) {
      container.innerHTML = `
        <div class="p-6 text-center text-rose-600 dark:text-rose-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h2 class="text-lg font-semibold">Application Error</h2>
          <p class="text-sm mt-1">The app failed to start. Please check the console for details.</p>
          <pre class="mt-3 text-[11px] text-left bg-slate-100 dark:bg-slate-800 p-3 rounded overflow-auto">${String(fatalErr).slice(0, 500)}</pre>
          <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">Reload</button>
        </div>
      `;
    }
  }
})();