// js/services/autoHealer.js
// Live AI Auto-Healer Admin Terminal with Error Interceptor & Self-Healing
// Captures errors, analyzes with AI, and applies fixes automatically.

import { state, subscribe } from '../state.js';
import { sendAIRequest, parseJsonSafe } from './aiFallbackService.js';
import { getCodebaseSnapshotString } from './codebaseContext.js';
import { getCredentials, commitFile, fetchFile, testConnection } from '../github.js';
import { showToast } from '../ui.js';
import { hasValidApiKey } from '../config/apiKeys.js';

// Error buffer for terminal display
const errorBuffer = [];
const MAX_BUFFER_SIZE = 100;
let autoHealerEnabled = true;
let terminalListeners = new Set();
let isHealing = false;

// Initialize auto-healer
export function initAutoHealer() {
  if (typeof window === 'undefined') return;

  // 1. Global error interceptor
  window.addEventListener('error', handleError);
  
  // 2. Unhandled promise rejection interceptor
  window.addEventListener('unhandledrejection', handleRejection);
  
  // 3. Monkey-patch console.error
  patchConsoleError();
  
  // 4. Subscribe to state changes for context
  subscribe(() => {
    // State changes already tracked
  });

  console.log('[AutoHealer] Initialized - Error interception active');
  
  // Add to state for terminal access
  state.errorBuffer = errorBuffer;
  state.autoHealer = { enabled: autoHealerEnabled, isHealing };
}

function handleError(event) {
  const errorInfo = {
    type: 'error',
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.stack || event.error?.message,
    timestamp: Date.now()
  };
  
  captureError(errorInfo);
}

function handleRejection(event) {
  const errorInfo = {
    type: 'unhandledrejection',
    message: event.reason?.message || String(event.reason),
    source: 'promise',
    lineno: 0,
    colno: 0,
    error: event.reason?.stack || String(event.reason),
    timestamp: Date.now()
  };
  
  captureError(errorInfo);
}

function patchConsoleError() {
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    
    const errorInfo = {
      type: 'console.error',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
      source: 'console',
      lineno: 0,
      colno: 0,
      error: args[0]?.stack || args.join(' '),
      timestamp: Date.now()
    };
    
    captureError(errorInfo);
  };
}

function captureError(errorInfo) {
  // Add snapshot of codebase context (async, so handle properly)
  const snapshotPromise = getCodebaseSnapshotString();
  snapshotPromise.then(snapshot => {
    errorInfo.snapshot = snapshot.substring(0, 5000); // Limit size
  }).catch(() => {
    errorInfo.snapshot = 'Snapshot unavailable';
  });
  
  errorBuffer.unshift(errorInfo);
  if (errorBuffer.length > MAX_BUFFER_SIZE) errorBuffer.pop();
  
  // Notify terminal listeners
  notifyTerminalListeners({ type: 'error_captured', error: errorInfo });
  
  // Auto-heal if enabled and not already healing
  if (autoHealerEnabled && !isHealing) {
    // Debounce auto-heal
    clearTimeout(window._autoHealTimer);
    window._autoHealTimer = setTimeout(() => {
      triggerAutoHeal(errorInfo);
    }, 2000);
  }
}

// Trigger AI-powered auto-healing
async function triggerAutoHeal(errorInfo) {
  if (isHealing) return;
  isHealing = true;
  
  notifyTerminalListeners({ type: 'healing_started', error: errorInfo });
  
  try {
    // Get full codebase context
    const codebaseContext = await getCodebaseSnapshotString(true);
    
    // Build AI prompt
    const prompt = buildHealingPrompt(errorInfo, codebaseContext);
    const systemInstruction = buildHealingSystemPrompt();
    
    notifyTerminalListeners({ type: 'analyzing', message: 'Sending error + codebase context to AI...' });
    
    // Send to AI with fallback
    const result = await sendAIRequest(prompt, systemInstruction, {
      timeout: 15000,
      expectJson: true,
      temperature: 0.1
    });
    
    notifyTerminalListeners({ type: 'ai_response', service: result.service, model: result.model });
    
    // Parse AI response
    const healingAction = parseJsonSafe(result.content);
    if (!healingAction) {
      throw new Error('AI returned invalid JSON');
    }
    
    notifyTerminalListeners({ type: 'action_parsed', action: healingAction });
    
    // Execute healing action
    await executeHealingAction(healingAction, errorInfo);
    
    notifyTerminalListeners({ type: 'healing_completed', action: healingAction });
    
  } catch (healError) {
    console.error('[AutoHealer] Healing failed:', healError);
    notifyTerminalListeners({ type: 'healing_failed', error: healError.message });
  } finally {
    isHealing = false;
  }
}

function buildHealingPrompt(errorInfo, codebaseContext) {
  return `ERROR DETECTED:
${JSON.stringify(errorInfo, null, 2)}

CODEBASE CONTEXT:
${codebaseContext}

Analyze this error and provide a healing action in JSON format:
{
  "action": "GITHUB_COMMIT" | "STATE_MUTATION" | "FILE_CREATE" | "CACHE_CLEAR" | "RETRY_OPERATION",
  "targetFile": "path/to/file.json",
  "patchPayload": {},
  "explanation": "Human-readable explanation of the fix"
}

Common fixes:
- If 404 on data/*.json: Create missing file on GitHub with empty array []
- If GitHub commit fails: Retry with fresh SHA or create file
- If state mutation fails: Ensure state arrays exist
- If network error: Queue for offline sync
- If parse error: Validate and fix JSON structure`;
}

function buildHealingSystemPrompt() {
  return `You are the Dripp Medicos Auto-Healing AI. Your job is to analyze JavaScript errors in a pharmacy POS system and provide precise, executable healing actions.

The system uses:
- GitHub as serverless database (data/products.json, data/sales.json, etc.)
- localStorage for offline-first state
- Service Worker for caching
- ES6 modules in js/ folder

Return ONLY valid JSON with the healing action. No markdown, no extra text.

Action types:
1. GITHUB_COMMIT - Create or update a file on GitHub
2. STATE_MUTATION - Fix local state directly
3. FILE_CREATE - Create missing local file
4. CACHE_CLEAR - Clear service worker cache
5. RETRY_OPERATION - Re-queue failed operation`;
}

async function executeHealingAction(action, errorInfo) {
  notifyTerminalListeners({ type: 'executing', action: action.action, target: action.targetFile });
  
  switch (action.action) {
    case 'GITHUB_COMMIT':
      await healGitHubCommit(action);
      break;
    case 'STATE_MUTATION':
      await healStateMutation(action);
      break;
    case 'FILE_CREATE':
      await healFileCreate(action);
      break;
    case 'CACHE_CLEAR':
      await healCacheClear(action);
      break;
    case 'RETRY_OPERATION':
      await healRetryOperation(action);
      break;
    default:
      throw new Error(`Unknown healing action: ${action.action}`);
  }
}

async function healGitHubCommit(action) {
  const { targetFile, patchPayload, explanation } = action;
  
  // Ensure it's a data file
  if (!targetFile.startsWith('data/')) {
    throw new Error('GITHUB_COMMIT only allowed for data/ files');
  }
  
  // Get credentials
  const creds = getCredentials();
  if (!creds) throw new Error('No GitHub credentials');
  
  // Prepare commit
  const json = JSON.stringify(patchPayload, null, 2);
  const utf8Bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const contentB64 = btoa(binary);
  
  const body = {
    message: `Auto-heal: ${explanation}`,
    content: contentB64,
    branch: creds.branch
  };
  
  // Try without SHA first (creates file if 404)
  const url = `https://api.github.com/repos/${creds.owner}/${creds.repo}/contents/${encodeURIComponent(targetFile)}?ref=${creds.branch}`;
  
  let response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${creds.token}`
    },
    body: JSON.stringify(body)
  });
  
  if (response.status === 409 || (response.status === 422 && !body.sha)) {
    // Conflict - get fresh SHA and retry
    const fresh = await fetchFile(targetFile);
    if (fresh?.sha) {
      body.sha = fresh.sha;
      response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${creds.token}`
        },
        body: JSON.stringify(body)
      });
    }
  }
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub commit failed: ${response.status} ${err}`);
  }
  
  notifyTerminalListeners({ type: 'github_commit_success', file: targetFile });
}

async function healStateMutation(action) {
  // Direct state fix
  const { targetFile, patchPayload } = action;
  
  if (targetFile === 'state.products') {
    if (Array.isArray(patchPayload)) {
      state.products = patchPayload;
    } else if (patchPayload && typeof patchPayload === 'object') {
      // Merge/update specific product
      const idx = state.products.findIndex(p => p.id === patchPayload.id);
      if (idx >= 0) state.products[idx] = { ...state.products[idx], ...patchPayload };
      else state.products.unshift(patchPayload);
    }
  } else if (targetFile === 'state.invoices') {
    if (Array.isArray(patchPayload)) state.invoices = patchPayload;
  } else if (targetFile === 'state.sales') {
    if (Array.isArray(patchPayload)) state.sales = patchPayload;
  }
  
  // Persist
  const { persistLocalProducts, persistLocalInvoices, persistLocalSales } = await import('../state.js');
  if (targetFile === 'state.products') persistLocalProducts();
  if (targetFile === 'state.invoices') persistLocalInvoices();
  if (targetFile === 'state.sales') persistLocalSales();
  
  notifyTerminalListeners({ type: 'state_mutation_success', target: targetFile });
}

async function healFileCreate(action) {
  // For local files, we'd typically use GitHub commit instead
  // This is a placeholder for local file creation logic
  await healGitHubCommit(action);
}

async function healCacheClear(action) {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
  
  // Also clear localStorage offline queue
  localStorage.removeItem('dm_offline_queue_v2');
  
  notifyTerminalListeners({ type: 'cache_cleared' });
}

async function healRetryOperation(action) {
  const { queueOfflineOperation } = await import('./syncQueue.js');
  
  if (action.patchPayload?.operation) {
    queueOfflineOperation(action.patchPayload.operation);
  }
  
  notifyTerminalListeners({ type: 'operation_requeued' });
}

// Terminal listener management
export function onTerminalLog(listener) {
  terminalListeners.add(listener);
  // Send current buffer
  listener({ type: 'buffer', errors: errorBuffer });
  return () => terminalListeners.delete(listener);
}

function notifyTerminalListeners(log) {
  terminalListeners.forEach(fn => {
    try { fn(log); } catch (e) { console.error('[AutoHealer] Terminal listener error:', e); }
  });
}

// Manual health check
export async function runHealthCheck() {
  notifyTerminalListeners({ type: 'health_check_started' });
  
  const checks = [];
  
  // Check GitHub connectivity
  try {
    const creds = getCredentials();
    if (creds) {
      const test = await testConnection(creds);
      checks.push({ name: 'GitHub Connection', status: test.ok ? 'ok' : 'fail', detail: test.default_branch });
    } else {
      checks.push({ name: 'GitHub Connection', status: 'skip', detail: 'Not configured' });
    }
  } catch (e) {
    checks.push({ name: 'GitHub Connection', status: 'fail', detail: e.message });
  }
  
  // Check AI services
  for (const svc of ['opencode', 'openrouter', 'gemini']) {
    checks.push({ name: `${svc} API`, status: hasValidApiKey(svc) ? 'configured' : 'missing' });
  }
  
  // Check Service Worker
  checks.push({ name: 'Service Worker', status: 'serviceWorker' in navigator ? 'supported' : 'unsupported' });
  
  // Check localStorage
  try {
    localStorage.setItem('test', '1');
    localStorage.removeItem('test');
    checks.push({ name: 'LocalStorage', status: 'ok' });
  } catch {
    checks.push({ name: 'LocalStorage', status: 'fail' });
  }
  
  // Check IndexedDB
  checks.push({ name: 'IndexedDB', status: 'indexedDB' in window ? 'supported' : 'unsupported' });
  
  // Check online status
  checks.push({ name: 'Network', status: navigator.onLine ? 'online' : 'offline' });
  
  // Check state integrity
  const stateChecks = {
    products: Array.isArray(state.products),
    sales: Array.isArray(state.sales),
    invoices: Array.isArray(state.invoices),
    doctors: Array.isArray(state.doctors),
    expenses: Array.isArray(state.expenses)
  };
  checks.push({ name: 'State Integrity', status: Object.values(stateChecks).every(v => v) ? 'ok' : 'corrupted', detail: stateChecks });
  
  notifyTerminalListeners({ type: 'health_check_completed', checks });
  
  return checks;
}

// Toggle auto-healer
export function setAutoHealerEnabled(enabled) {
  autoHealerEnabled = enabled;
  state.autoHealer = { enabled: autoHealerEnabled, isHealing };
  notifyTerminalListeners({ type: 'config_changed', enabled: autoHealerEnabled });
}

export { errorBuffer, autoHealerEnabled };