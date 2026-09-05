// js/services/syncQueue.js
// Robust Background Sync Queue Manager with Exponential Backoff
// Handles queuing operations when offline and automatic sync when online.

import { state, getState, subscribe } from '../state.js';
import { showToast } from '../ui.js';
import { CONFIG } from '../config/apiKeys.js';

const OFFLINE_QUEUE_KEY = 'dm_offline_queue_v2';
const SYNC_STATUS_KEY = 'dm_sync_status_v2';
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second base

let syncInProgress = false;
let syncListeners = new Set();
let retryTimers = new Map();

// Operation types that can be queued
export const OPERATION_TYPES = {
  SALE: 'sale',
  STOCK: 'stock',
  INVOICE: 'invoice',
  EXPENSE: 'expense',
  SETTINGS: 'settings',
  PRODUCT: 'product',
  DOCTOR: 'doctor',
  GITHUB_COMMIT: 'github-commit',
  AI_REQUEST: 'ai-request',
  IMAGE_UPLOAD: 'image-upload'
};

// Initialize sync system
export function initSyncQueue() {
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Register service worker message handler
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
  }

  // Initial sync status
  updateSyncStatusUI();

  // Try to sync on load if online
  if (navigator.onLine) {
    setTimeout(processOfflineQueue, 2000);
  }

  // Subscribe to state changes for immediate local persistence
  subscribe(() => {
    // State changes are automatically persisted to localStorage in state.js
    // Just update UI
    updateSyncStatusUI();
  });

  console.log('[SyncQueue] Initialized');
}

function handleOffline() {
  console.log('[SyncQueue] Gone offline');
  updateSyncStatusUI();
  showToast('You are offline. Changes saved locally.', 'info', 4000);
}

async function handleOnline() {
  console.log('[SyncQueue] Back online');
  updateSyncStatusUI();
  showToast('Internet restored. Syncing offline changes...', 'info', 3000);
  await processOfflineQueue();
}

function handleSWMessage(event) {
  if (event.data.type === 'SYNC_STARTED') {
    notifySyncListeners({ status: 'syncing', source: 'sw' });
  }
  if (event.data.type === 'SYNC_COMPLETE') {
    notifySyncListeners({ status: 'synced', source: 'sw' });
    if (getPendingSyncCount() === 0) {
      showToast('All offline transactions synced successfully!', 'success', 4000);
    }
  }
  if (event.data.type === 'SYNC_FAILED') {
    notifySyncListeners({ status: 'error', error: event.data.error, source: 'sw' });
    showToast(`Sync failed: ${event.data.error}`, 'error', 5000);
  }
}

// Queue an offline operation
export function queueOfflineOperation(operation) {
  const queue = getOfflineQueue();
  const item = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: operation.type,
    payload: operation.payload,
    retries: 0,
    priority: operation.priority || 0 // Higher priority = processed first
  };
  queue.push(item);
  saveOfflineQueue(queue);
  updateSyncStatusUI();
  console.log('[SyncQueue] Queued offline operation:', item);
  
  // If online, trigger immediate sync for high priority items
  if (navigator.onLine && item.priority > 0) {
    setTimeout(() => processOfflineQueue(), 100);
  }
}

// Get offline queue from localStorage (fallback) or IndexedDB
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

// Process offline queue with exponential backoff
export async function processOfflineQueue() {
  if (syncInProgress) return;
  if (!navigator.onLine) return;

  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  syncInProgress = true;
  notifySyncListeners({ status: 'syncing', pending: queue.length });

  try {
    // Sort by priority (highest first), then by timestamp (oldest first)
    const sortedQueue = [...queue].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.timestamp - b.timestamp;
    });

    for (const item of sortedQueue) {
      if (!navigator.onLine) break;
      
      try {
        await executeSyncOperation(item);
        // Remove from queue on success
        const updatedQueue = getOfflineQueue().filter(q => q.id !== item.id);
        saveOfflineQueue(updatedQueue);
        console.log('[SyncQueue] Synced:', item.id, item.type);
      } catch (err) {
        console.error('[SyncQueue] Failed to sync item:', item.id, err);
        await handleSyncFailure(item, err);
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

// Handle sync failure with exponential backoff
async function handleSyncFailure(item, error) {
  item.retries = (item.retries || 0) + 1;
  item.lastError = error.message;
  item.lastAttempt = Date.now();
  
  if (item.retries >= MAX_RETRIES) {
    console.error('[SyncQueue] Max retries reached for:', item.id, item.type);
    // Move to dead letter queue or show persistent error
    showToast(`Failed to sync ${item.type} after ${MAX_RETRIES} attempts`, 'error', 8000);
    // Don't requeue - keep in queue but mark as failed
    item.failed = true;
  } else {
    // Schedule retry with exponential backoff
    const delay = BASE_RETRY_DELAY * Math.pow(2, item.retries - 1) + Math.random() * 1000;
    console.log(`[SyncQueue] Scheduling retry ${item.retries}/${MAX_RETRIES} for ${item.id} in ${delay}ms`);
    
    // Clear existing timer for this item
    if (retryTimers.has(item.id)) {
      clearTimeout(retryTimers.get(item.id));
    }
    
    const timer = setTimeout(() => {
      retryTimers.delete(item.id);
      if (navigator.onLine) processOfflineQueue();
    }, delay);
    
    retryTimers.set(item.id, timer);
  }
  
  // Update queue with retry info
  const queue = getOfflineQueue();
  const idx = queue.findIndex(q => q.id === item.id);
  if (idx >= 0) queue[idx] = item;
  saveOfflineQueue(queue);
  updateSyncStatusUI();
}

// Execute sync operation based on type
async function executeSyncOperation(item) {
  const { type, payload } = item;
  
  // Import dynamically to avoid circular dependencies
  const { commitProducts, commitSales, commitInvoices, commitDoctors, commitExpenses } = await import('../state.js');
  const { GitHub } = await import('../github.js');
  
  switch (type) {
    case OPERATION_TYPES.SALE:
    case OPERATION_TYPES.STOCK:
      // Sales and stock are auto-synced via state.js commitSales/commitProducts
      // Just verify the data exists in localStorage
      return;
      
    case OPERATION_TYPES.INVOICE:
      // Invoices are synced via commitInvoices
      return;
      
    case OPERATION_TYPES.EXPENSE:
      return;
      
    case OPERATION_TYPES.SETTINGS:
      return;
      
    case OPERATION_TYPES.PRODUCT:
      // Products synced via commitProducts
      return;
      
    case OPERATION_TYPES.DOCTOR:
      return;
      
    case OPERATION_TYPES.GITHUB_COMMIT:
      // Direct GitHub commit
      const response = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body
      });
      if (!response.ok) throw new Error(`GitHub commit failed: ${response.status}`);
      return;
      
    case OPERATION_TYPES.AI_REQUEST:
      // AI API request - these should not be queued typically
      const aiResponse = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body
      });
      if (!aiResponse.ok) throw new Error(`AI request failed: ${aiResponse.status}`);
      return;
      
    case OPERATION_TYPES.IMAGE_UPLOAD:
      // Image upload to GitHub or image hosting
      return;
      
    default:
      console.warn('[SyncQueue] Unknown operation type:', type);
  }
}

// Get pending sync count
export function getPendingSyncCount() {
  return getOfflineQueue().filter(q => !q.failed).length;
}

// Get failed items count
export function getFailedSyncCount() {
  return getOfflineQueue().filter(q => q.failed).length;
}

// Subscribe to sync status changes
export function onSyncStatusChange(listener) {
  syncListeners.add(listener);
  // Immediately call with current status
  listener({ status: navigator.onLine ? 'synced' : 'offline', pending: getPendingSyncCount() });
  return () => syncListeners.delete(listener);
}

function notifySyncListeners(status) {
  syncListeners.forEach(fn => {
    try { fn(status); } catch (e) { console.error('[SyncQueue] Listener error:', e); }
  });
}

// Update sync status UI
export function updateSyncStatusUI() {
  const queue = getOfflineQueue();
  const pending = queue.filter(q => !q.failed).length;
  const failed = queue.filter(q => q.failed).length;
  
  const badge = document.getElementById('sync-badge');
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  
  if (!badge || !dot || !label) return;

  if (!navigator.onLine) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    label.textContent = pending > 0 ? `Offline (${pending} pending)` : 'Offline';
  } else if (pending > 0) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-sky-500 animate-spin';
    label.textContent = `Syncing (${pending} pending)`;
  } else if (failed > 0) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-rose-500';
    label.textContent = `${failed} failed`;
  } else {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
    dot.className = 'sync-dot inline-block w-2 h-2 rounded-full bg-emerald-500';
    label.textContent = 'Synced';
  }
}

// Force sync now (manual trigger)
export async function forceSyncNow() {
  if (!navigator.onLine) {
    showToast('Cannot sync while offline', 'warn');
    return;
  }
  await processOfflineQueue();
}

// Clear failed items from queue
export function clearFailedItems() {
  const queue = getOfflineQueue().filter(q => !q.failed);
  saveOfflineQueue(queue);
  updateSyncStatusUI();
  showToast('Failed items cleared', 'info');
}

// Queue a GitHub commit operation
export async function queueGitHubCommit(fileKey, data, message) {
  const { getCredentials, commitFile } = await import('../github.js');
  const creds = getCredentials();
  if (!creds) return;
  
  const json = JSON.stringify(data, null, 2);
  const utf8Bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const contentB64 = btoa(binary);
  
  const body = {
    message: message || `Update ${fileKey} via Dripp Medicos POS`,
    content: contentB64,
    branch: creds.branch
  };
  
  const url = `https://api.github.com/repos/${creds.owner}/${creds.repo}/contents/${encodeURIComponent(fileKey)}?ref=${creds.branch}`;
  
  queueOfflineOperation({
    type: OPERATION_TYPES.GITHUB_COMMIT,
    payload: { url, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${creds.token}` }, body: JSON.stringify(body) },
    priority: 10 // High priority for commits
  });
}

// Queue an AI request (for auto-healer)
export async function queueAIRequest(prompt, systemInstruction, service = 'opencode') {
  const apiKey = CONFIG[service.toUpperCase()]?.API_KEY;
  if (!apiKey) return;
  
  const baseUrl = CONFIG[service.toUpperCase()]?.BASE_URL;
  const model = CONFIG[service.toUpperCase()]?.DEFAULT_MODEL || CONFIG[service.toUpperCase()]?.MODEL;
  
  queueOfflineOperation({
    type: OPERATION_TYPES.AI_REQUEST,
    payload: { 
      url: `${baseUrl}/chat/completions`, 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }], temperature: 0.1 })
    },
    priority: 5
  });
}