// sw.js — Dripp Medicos Service Worker
// Offline-first caching with cache-first strategy for app shell,
// stale-while-revalidate for data assets, and background sync for API.

const CACHE_NAME = 'dripp-medicos-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/js/app.js',
  '/js/config.js',
  '/js/state.js',
  '/js/ui.js',
  '/js/ai.js',
  '/js/github.js',
  '/js/views/dashboard.js',
  '/js/views/pos.js',
  '/js/views/inventory.js',
  '/js/views/sales.js',
  '/js/views/settings.js',
  '/js/views/chatbot.js',
];

const DATA_ASSETS = [
  '/data/products.json',
  '/data/sales.json',
  '/data/doctors.json',
  '/data/invoices.json',
  '/data/expenses.json',
  '/data/images.json',
];

const ALL_ASSETS = [...STATIC_ASSETS, ...DATA_ASSETS];

// Install: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, stale-while-revalidate for data
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle GitHub API requests (network-first with offline fallback)
  if (url.hostname === 'api.github.com' || url.hostname === 'generativelanguage.googleapis.com') {
    event.respondWith(networkFirstThenCache(request));
    return;
  }

  // Handle static assets (cache-first)
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle data assets (stale-while-revalidate)
  if (DATA_ASSETS.some(asset => url.pathname === asset)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirstThenCache(request));
});

// Cache-first strategy
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Network-first with cache fallback
async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background Sync for offline queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-sync') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_STARTED' }));
  
  try {
    const queue = await getOfflineQueue();
    for (const item of queue) {
      try {
        await processQueueItem(item);
        await removeFromOfflineQueue(item.id);
      } catch (err) {
        console.error('[SW] Sync failed for item:', item, err);
      }
    }
    clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }));
  } catch (err) {
    console.error('[SW] Sync failed:', err);
    clients.forEach(client => client.postMessage({ type: 'SYNC_FAILED', error: err.message }));
  }
}

async function getOfflineQueue() {
  // This would typically use IndexedDB, but for SW context we'll use a simple approach
  return [];
}

async function removeFromOfflineQueue(id) {
  // Remove from IndexedDB
}

async function processQueueItem(item) {
  // Process based on item.type: 'sale', 'inventory', 'settings', etc.
  return fetch(item.url, {
    method: item.method,
    headers: item.headers,
    body: item.body
  });
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[SW] Service Worker loaded');