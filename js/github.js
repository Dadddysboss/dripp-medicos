// js/github.js
// GitHub REST API sync engine.
// Implements: GET (fetch file + sha) and PUT (commit with sha) for
// products.json and sales.json, plus SHA tracking and offline fallback.

import { LS_KEYS, FILES, APP, SYNC } from './config.js';

const GITHUB_API = 'https://api.github.com';

// ============================================================
// 1. Credentials
// ============================================================

export function getCredentials() {
  try {
    const raw = localStorage.getItem(LS_KEYS.github);
    if (!raw) return null;
    const creds = JSON.parse(raw);
    if (!creds || !creds.token || !creds.owner || !creds.repo) return null;
    return creds;
  } catch {
    return null;
  }
}

export function setCredentials({ owner, repo, branch, token }) {
  const creds = {
    owner: (owner || '').trim(),
    repo: (repo || '').trim(),
    branch: (branch || 'main').trim(),
    token: (token || '').trim(),
  };
  localStorage.setItem(LS_KEYS.github, JSON.stringify(creds));
  return creds;
}

export function clearCredentials() {
  localStorage.removeItem(LS_KEYS.github);
  localStorage.removeItem(LS_KEYS.productsSha);
  localStorage.removeItem(LS_KEYS.salesSha);
  localStorage.removeItem(LS_KEYS.lastSync);
}

export function hasCredentials() {
  return !!getCredentials();
}

// ============================================================
// 2. SHA helpers
// ============================================================

const SHA_KEYS = {
  [FILES.products]: LS_KEYS.productsSha,
  [FILES.sales]:    LS_KEYS.salesSha,
  [FILES.doctors]:  LS_KEYS.doctorsSha,
  [FILES.invoices]: LS_KEYS.invoicesSha,
  [FILES.expenses]: LS_KEYS.expensesSha,
};

function getSha(fileKey) {
  const key = SHA_KEYS[fileKey];
  return key ? localStorage.getItem(key) || null : null;
}

function setSha(fileKey, sha) {
  const key = SHA_KEYS[fileKey];
  if (!key) return;
  if (sha) localStorage.setItem(key, sha);
  else localStorage.removeItem(key);
}

export function getProductsSha() { return getSha(FILES.products); }
export function getSalesSha()    { return getSha(FILES.sales); }
export function getDoctorsSha()  { return getSha(FILES.doctors); }
export function getInvoicesSha() { return getSha(FILES.invoices); }
export function getExpensesSha() { return getSha(FILES.expenses); }

// ============================================================
// 3. Network status
// ============================================================

export function isOnline() {
  return navigator.onLine !== false;
}

window.addEventListener('online',  () => _notifyNetwork(true));
window.addEventListener('offline', () => _notifyNetwork(false));

const networkListeners = new Set();
function _notifyNetwork(online) {
  for (const cb of networkListeners) {
    try { cb(online); } catch (e) { console.error(e); }
  }
}
export function onNetworkChange(cb) {
  networkListeners.add(cb);
  return () => networkListeners.delete(cb);
}

// ============================================================
// 4. Core REST helpers
// ============================================================

function buildHeaders(creds, extra = {}) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${creds.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

async function githubRequest(path, opts = {}) {
  const creds = getCredentials();
  if (!creds) throw new Error('GitHub credentials not configured.');
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  const url = `${GITHUB_API}${cleanPath}`;
  
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const res = await fetch(url, {
      ...opts,
      headers: buildHeaders(creds, opts.headers || {}),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 5. Fetch a JSON file from GitHub
// ============================================================

/**
 * Fetch a JSON file from the configured GitHub repo.
 * Returns { data, sha, raw } | null (when 404).
 */
export async function fetchFile(fileKey) {
  if (!isOnline()) throw new Error('You appear to be offline.');
  const creds = getCredentials();
  if (!creds) throw new Error('GitHub credentials not configured.');

  const filePath = fileKey.replace('data/', '');
  const path = `/repos/${creds.owner}/${creds.repo}/contents/data/${filePath}?ref=${creds.branch}`;
  const res = await githubRequest(path, { method: 'GET' });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub GET ${fileKey} failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  const sha = json.sha || null;
  const contentB64 = (json.content || '').replace(/\n/g, '');
  let decoded = '';
  try {
    decoded = atob(contentB64);
  } catch (e) {
    decoded = '';
  }
  // decodeURIComponent + escape to handle UTF-8
  let data = null;
  try {
    const utf8 = decodeURIComponent(escape(decoded));
    data = JSON.parse(utf8);
  } catch (e) {
    throw new Error(`Failed to parse ${fileKey}: ${e.message}`);
  }

  // Update SHA cache for this file
  setSha(fileKey, sha);
  return { data, sha, raw: json };
}

// ============================================================
// 5b. Local fallback fetch (relative paths for Vercel SPA safety)
// ============================================================

/**
 * Fetch a JSON file from local static assets using relative paths.
 * Uses `./data/...` to avoid Vercel SPA fallback serving index.html (200 OK HTML).
 * Returns parsed JSON or null on failure.
 */
export async function fetchLocalFile(fileKey) {
  // Map GitHub file keys to local relative paths
  const localPaths = {
    [FILES.products]: './data/products.json',
    [FILES.sales]:    './data/sales.json',
    [FILES.doctors]:  './data/doctors.json',
    [FILES.invoices]: './data/invoices.json',
    [FILES.expenses]: './data/expenses.json',
  };
  const url = localPaths[fileKey];
  if (!url) return null;

  try {
    // Use relative path with no leading slash to avoid SPA rewrite
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    // Verify content-type is JSON to avoid HTML fallback
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      console.warn(`Local fetch ${url} returned non-JSON (${ct}), skipping`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.debug(`Local fetch failed for ${fileKey}:`, e);
    return null;
  }
}

/**
 * Fetch all data files from local static assets as fallback.
 * Used when GitHub credentials are not configured or network is unavailable.
 */
export async function fetchAllFromLocal() {
  const out = { products: null, sales: null, doctors: null, invoices: null, expenses: null, errors: [] };
  try {
    out.products = await fetchLocalFile(FILES.products);
  } catch (e) { out.errors.push(`products: ${e.message}`); }
  try {
    out.sales = await fetchLocalFile(FILES.sales);
  } catch (e) { out.errors.push(`sales: ${e.message}`); }
  try {
    out.doctors = await fetchLocalFile(FILES.doctors);
  } catch (e) { out.errors.push(`doctors: ${e.message}`); }
  try {
    out.invoices = await fetchLocalFile(FILES.invoices);
  } catch (e) { out.errors.push(`invoices: ${e.message}`); }
  try {
    out.expenses = await fetchLocalFile(FILES.expenses);
  } catch (e) { out.errors.push(`expenses: ${e.message}`); }
  return out;
}

// ============================================================
// 6. Commit (PUT) a JSON file to GitHub
// ============================================================

/**
 * Commit updated JSON data to GitHub for the given fileKey.
 * Auto-refreshes SHA on 409 conflicts, then retries.
 */
export async function commitFile(fileKey, dataObj, message) {
  if (!isOnline()) throw new Error('You appear to be offline.');
  const creds = getCredentials();
  if (!creds) throw new Error('GitHub credentials not configured.');

  const json = JSON.stringify(dataObj, null, 2);
  // Encode UTF-8 safely to Base64
  const utf8Bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const contentB64 = btoa(binary);

  const commitMessage = message || `Update ${fileKey} via Dripp Medicos POS`;

  // 1st attempt with cached SHA
  let sha = getSha(fileKey);

  async function putOnce(s) {
    const body = {
      message: commitMessage,
      content: contentB64,
      branch: creds.branch,
    };
    if (s) body.sha = s;

    const path = `/repos/${creds.owner}/${creds.repo}/contents/${encodeURIComponent(fileKey)}?ref=${creds.branch}`;
    const res = await githubRequest(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res;
  }

  let res = await putOnce(sha);

  // 409 conflict -> refetch sha & retry once
  if (res.status === 409 || (res.status === 422 && !sha)) {
    // Refetch latest SHA then retry
    try {
      const fresh = await fetchFile(fileKey);
      sha = fresh?.sha || null;
      res = await putOnce(sha);
    } catch (e) {
      throw new Error(`Conflict retry failed for ${fileKey}: ${e.message}`);
    }
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PUT ${fileKey} failed: ${res.status} ${txt}`);
  }

  const json2 = await res.json();
  const newSha = json2?.content?.sha || json2?.commit?.sha || null;
  setSha(fileKey, newSha);
  localStorage.setItem(LS_KEYS.lastSync, new Date().toISOString());
  return { sha: newSha, response: json2 };
}

// ============================================================
// 7. High-level: fetch both data files with fallback
// ============================================================

import { LS_KEYS as _LK, DEFAULT_PRODUCTS, DEFAULT_SALES, DEFAULT_DOCTORS, EXPENSE_CATEGORIES, INVOICE_STATUS } from './config.js';

export async function fetchAllFromGitHub() {
  const out = { products: null, sales: null, doctors: null, invoices: null, expenses: null, errors: [] };
  try {
    const productsRes = await fetchFile(FILES.products);
    if (productsRes) out.products = productsRes.data;
  } catch (e) {
    out.errors.push(`products: ${e.message}`);
  }
  try {
    const salesRes = await fetchFile(FILES.sales);
    if (salesRes) out.sales = salesRes.data;
  } catch (e) {
    out.errors.push(`sales: ${e.message}`);
  }
  try {
    const doctorsRes = await fetchFile(FILES.doctors);
    if (doctorsRes) out.doctors = doctorsRes.data;
  } catch (e) {
    out.errors.push(`doctors: ${e.message}`);
  }
  try {
    const invoicesRes = await fetchFile(FILES.invoices);
    if (invoicesRes) out.invoices = invoicesRes.data;
  } catch (e) {
    out.errors.push(`invoices: ${e.message}`);
  }
  try {
    const expensesRes = await fetchFile(FILES.expenses);
    if (expensesRes) out.expenses = expensesRes.data;
  } catch (e) {
    out.errors.push(`expenses: ${e.message}`);
  }
  return out;
}

// ============================================================
// 8. Connection test (validates credentials)
// ============================================================

export async function testConnection(creds) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${creds.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 200) {
    const j = await res.json();
    return { ok: true, default_branch: j.default_branch, full_name: j.full_name };
  }
  if (res.status === 401) throw new Error('Invalid Personal Access Token.');
  if (res.status === 404) throw new Error('Repository not found, or token lacks access.');
  const t = await res.text();
  throw new Error(`GitHub error ${res.status}: ${t}`);
}

// Re-export SYNC for state.js convenience
export { SYNC };