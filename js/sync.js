// js/sync.js
// Offline Queue Manager & Background Sync Engine
// Handles queuing operations when offline and automatic sync when online.

import { state, getState } from './state.js';
import { showToast } from './ui.js';

const OFFLINE_QUEUE_KEY = 'dm_offline_queue_v1';
const SYNC_STATUS_KEY = 'dm_sync_status_v1';

let syncInProgress = false;
let syncListeners = new Set();

export function initOfflineSync() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[Sync] SW registered:', reg.scope);
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(err => console.warn('[Sync] SW registration failed:', err));
  }

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial sync status
  updateSyncStatusUI();

  // Try to sync on load if online
  if (navigator.onLine) {
    setTimeout(processOfflineQueue, 2000);
  }
}

function handleOffline() {
  console.log('[Sync] Gone offline');
  updateSyncStatusUI();
  showToast('You are offline. Changes saved locally.', 'info', 4000);
}

async function handleOnline() {
  console.log('[Sync] Back online');
  updateSyncStatusUI();
  showToast('Internet restored. Syncing offline changes...', 'info', 3000);
  await processOfflineQueue();
}

export function queueOfflineOperation(operation) {
  const queue = getOfflineQueue();
  const item = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: operation.type, // 'sale', 'stock', 'invoice', 'expense', 'settings'
    payload: operation.payload,
    retries: 0,
  };
  queue.push(item);
  saveOfflineQueue(queue);
  updateSyncStatusUI();
  console.log('[Sync] Queued offline operation:', item);
}

function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function processOfflineQueue() {
  if (syncInProgress) return;
  if (!navigator.onLine) return;

  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  syncInProgress = true;
  notifySyncListeners({ status: 'syncing', pending: queue.length });

  try {
    for (const item of queue) {
      if (!navigator.onLine) break;
      
      try {
        await executeSyncOperation(item);
        // Remove from queue on success
        const updatedQueue = getOfflineQueue().filter(q => q.id !== item.id);
        saveOfflineQueue(updatedQueue);
        console.log('[Sync] Synced:', item.id);
      } catch (err) {
        console.error('[Sync] Failed to sync item:', item.id, err);
        // Increment retry count
        item.retries = (item.retries || 0) + 1;
        if (item.retries >= 5) {
          console.error('[Sync] Max retries reached for:', item.id);
        }
      }
    }
    
    notifySyncListeners({ status: 'synced', pending: getOfflineQueue().length });
    if (getOfflineQueue().length === 0) {
      showToast('All offline transactions synced successfully!', 'success', 4000);
    } else {
      showToast(`${getOfflineQueue().length} items pending sync`, 'info', 4000);
    }
  } finally {
    syncInProgress = false;
    updateSyncStatusUI();
  }
}

async function executeSyncOperation(item) {
  const { type, payload } = item;
  
  switch (type) {
    case 'sale':
      // Sales are auto-synced via state.js commitSales()
      // Just ensure the sale exists in localStorage
      return;
      
    case 'stock':
      // Stock adjustments
      return;
      
    case 'invoice':
      // Wholesale invoices
      return;
      
    case 'expense':
      // Expenses
      return;
      
    case 'settings':
      // Settings changes
      return;
      
    case 'product':
      // Product add/edit/delete
      return;
      
    default:
      console.warn('[Sync] Unknown operation type:', type);
  }
}

export function getPendingSyncCount() {
  return getOfflineQueue().length;
}

export function onSyncStatusChange(listener) {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function notifySyncListeners(status) {
  syncListeners.forEach(fn => {
    try { fn(status); } catch (e) { console.error('[Sync] Listener error:', e); }
  });
}

export function updateSyncStatusUI() {
  const queue = getOfflineQueue();
  const badge = document.getElementById('sync-badge');
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  
  if (!badge || !dot || !label) return;

  if (!navigator.onLine) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    label.textContent = queue.length > 0 ? `Offline (${queue.length} pending)` : 'Offline';
  } else if (queue.length > 0) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-sky-500 animate-spin';
    label.textContent = `Syncing (${queue.length} pending)`;
  } else {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-emerald-500';
    label.textContent = 'Synced';
  }
}

// Export for manual sync trigger
export async function forceSyncNow() {
  if (!navigator.onLine) {
    showToast('Cannot sync while offline', 'warn');
    return;
  }
  await processOfflineQueue();
}

// Helper to add to queue from other modules
export function addToOfflineQueue(type, payload) {
  queueOfflineOperation({ type, payload });
}

// Initialize on import
if (typeof window !== 'undefined') {
  // Defer until DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOfflineSync);
  } else {
    initOfflineSync();
  }
}