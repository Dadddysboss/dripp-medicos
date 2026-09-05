// js/services/hotkeys.js
// Zero-Mouse Fast Checkout Keyboard Engine for Dripp Medicos POS
// Provides sub-50ms response keyboard shortcuts for high-speed pharmacy checkout.

import { state, getState } from '../state.js';
import { showToast } from '../ui.js';

// ============================================================
// Hotkey Configuration
// ============================================================

const HOTKEY_MAP = {
  // Global hotkeys (work anywhere in app)
  'F2': { action: 'globalSearch', label: 'Global Search', preventDefault: true },
  'F4': { action: 'quickDiscount', label: 'Quick Discount', preventDefault: true },
  'F8': { action: 'selectCustomer', label: 'Select Customer', preventDefault: true },
  'F10': { action: 'instantCheckout', label: 'Instant Checkout', preventDefault: true },
  'F11': { action: 'toggleFullscreen', label: 'Toggle Fullscreen', preventDefault: true },
  'F12': { action: 'openDevTools', label: 'DevTools', preventDefault: false },
  
  // POS-specific hotkeys (only active in POS view)
  'Enter': { action: 'posEnterAction', label: 'POS Enter Action', preventDefault: true, posOnly: true },
  'Escape': { action: 'posEscape', label: 'Clear/Cancel POS', preventDefault: true, posOnly: true },
  'Delete': { action: 'posRemoveLastItem', label: 'Remove Last Item', preventDefault: true, posOnly: true },
  'Backspace': { action: 'posBackspace', label: 'POS Backspace', preventDefault: true, posOnly: true },
  'ArrowUp': { action: 'posNavigateUp', label: 'Navigate Up', preventDefault: true, posOnly: true },
  'ArrowDown': { action: 'posNavigateDown', label: 'Navigate Down', preventDefault: true, posOnly: true },
  'ArrowLeft': { action: 'posNavigateLeft', label: 'Navigate Left', preventDefault: true, posOnly: true },
  'ArrowRight': { action: 'posNavigateRight', label: 'Navigate Right', preventDefault: true, posOnly: true },
  'Tab': { action: 'posTabNavigation', label: 'Tab Navigation', preventDefault: false, posOnly: true },
  
  // Numeric shortcuts for quick quantities
  '1': { action: 'posQuickQty1', label: 'Qty 1', posOnly: true },
  '2': { action: 'posQuickQty2', label: 'Qty 2', posOnly: true },
  '3': { action: 'posQuickQty3', label: 'Qty 3', posOnly: true },
  '4': { action: 'posQuickQty4', label: 'Qty 4', posOnly: true },
  '5': { action: 'posQuickQty5', label: 'Qty 5', posOnly: true },
  '6': { action: 'posQuickQty6', label: 'Qty 6', posOnly: true },
  '7': { action: 'posQuickQty7', label: 'Qty 7', posOnly: true },
  '8': { action: 'posQuickQty8', label: 'Qty 8', posOnly: true },
  '9': { action: 'posQuickQty9', label: 'Qty 9', posOnly: true },
  '0': { action: 'posQuickQty10', label: 'Qty 10', posOnly: true },
  
  // Barcode scanner support (handles rapid keystrokes)
  'barcode': { action: 'handleBarcode', label: 'Barcode Scan', preventDefault: false, posOnly: true }
};

// Action handlers - will be populated by pos.js
const actionHandlers = new Map();

// Track barcode buffer for scanner input
let barcodeBuffer = '';
let barcodeTimeout = null;
const BARCODE_TIMEOUT_MS = 50; // Sub-50ms barcode detection
const BARCODE_MIN_LENGTH = 8;

// ============================================================
// Public API
// ============================================================

/**
 * Initialize the hotkey system
 * @param {Object} handlers - Map of action names to handler functions
 */
export function initHotkeys(handlers = {}) {
  // Register handlers
  Object.entries(handlers).forEach(([action, fn]) => {
    if (typeof fn === 'function') {
      actionHandlers.set(action, fn);
    }
  });
  
  // Attach global listener
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  
  // Initialize barcode listener
  initBarcodeListener();
  
  console.log('[Hotkeys] Zero-mouse keyboard engine initialized');
  return true;
}

/**
 * Register a single handler
 */
export function registerHotkeyHandler(action, fn) {
  if (typeof fn === 'function') {
    actionHandlers.set(action, fn);
    return true;
  }
  return false;
}

/**
 * Unregister a handler
 */
export function unregisterHotkeyHandler(action) {
  return actionHandlers.delete(action);
}

/**
 * Check if we're in POS view
 */
function isInPOSView() {
  return window.location.hash === '#pos';
}

/**
 * Main keydown handler
 */
function handleKeyDown(event) {
  const key = event.key;
  const isPOS = isInPOSView();
  
  // Handle barcode buffer accumulation
  if (isPOS && key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    accumulateBarcode(key, event);
  }
  
  // Find matching hotkey
  const hotkey = HOTKEY_MAP[key];
  if (!hotkey) return;
  
  // Check if POS-only hotkey and we're not in POS
  if (hotkey.posOnly && !isPOS) return;
  
  // Prevent default if specified
  if (hotkey.preventDefault) {
    event.preventDefault();
  }
  
  // Execute handler
  executeAction(hotkey.action, event);
}

/**
 * Keyup handler for special keys
 */
function handleKeyUp(event) {
  // Handle any keyup-specific logic
}

/**
 * Execute a hotkey action
 */
function executeAction(action, event) {
  const handler = actionHandlers.get(action);
  if (handler) {
    try {
      const startTime = performance.now();
      const result = handler(event);
      const elapsed = performance.now() - startTime;
      
      // Warn if handler takes too long
      if (elapsed > 50) {
        console.warn(`[Hotkeys] Action '${action}' took ${elapsed.toFixed(1)}ms`);
      }
      
      return result;
    } catch (error) {
      console.error(`[Hotkeys] Action '${action}' failed:`, error);
      showToast(`Action failed: ${error.message}`, 'error');
    }
  } else {
    console.warn(`[Hotkeys] No handler for action: ${action}`);
  }
}

/**
 * Barcode accumulation for scanner input
 */
function accumulateBarcode(char, event) {
  barcodeBuffer += char;
  
  // Reset timeout
  if (barcodeTimeout) clearTimeout(barcodeTimeout);
  barcodeTimeout = setTimeout(() => {
    processBarcode();
  }, BARCODE_TIMEOUT_MS);
  
  // Process immediately if buffer is long enough
  if (barcodeBuffer.length >= BARCODE_MIN_LENGTH) {
    processBarcode();
  }
}

/**
 * Process accumulated barcode
 */
function processBarcode() {
  const code = barcodeBuffer.trim();
  barcodeBuffer = '';
  
  if (code.length >= BARCODE_MIN_LENGTH) {
    const handler = actionHandlers.get('handleBarcode');
    if (handler) {
      handler({ code, timestamp: Date.now() });
    }
  }
}

/**
 * Initialize barcode listener for dedicated scanner devices
 */
function initBarcodeListener() {
  // Listen for raw input events (some scanners act as keyboards)
  document.addEventListener('keydown', (event) => {
    // Some scanners send Enter after barcode
    if (event.key === 'Enter' && barcodeBuffer.length > 0) {
      event.preventDefault();
      processBarcode();
    }
  }, true);
}

/**
 * Get current hotkey map for help display
 */
export function getHotkeyHelp() {
  return Object.entries(HOTKEY_MAP)
    .filter(([_, config]) => !config.posOnly || isInPOSView())
    .map(([key, config]) => ({ key, ...config }));
}

/**
 * Show hotkey help overlay
 */
export function showHotkeyHelp() {
  const help = getHotkeyHelp();
  const html = `
    <div class="p-6 max-w-md">
      <h3 class="text-lg font-bold mb-4">Keyboard Shortcuts</h3>
      <div class="space-y-2 max-h-80 overflow-y-auto">
        ${help.map(h => `
          <div class="flex justify-between text-sm">
            <kbd class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-mono">${h.key}</kbd>
            <span class="text-slate-600 dark:text-slate-400">${h.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  // This would integrate with the existing modal system
  return html;
}

/**
 * Enable/disable POS-only hotkeys
 */
export function setPOSMode(enabled) {
  // Could be used to dynamically enable/disable POS hotkeys
  // For now, we check isInPOSView() on each keypress
}

/**
 * Cleanup on unload
 */
export function destroyHotkeys() {
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  actionHandlers.clear();
  if (barcodeTimeout) clearTimeout(barcodeTimeout);
}

export { HOTKEY_MAP };