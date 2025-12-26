const CACHE_VERSION = 'v3';
const CACHE_NAME = `overlay-cache-${CACHE_VERSION}`;

const getScopePath = () => {
  const scopeURL = self.registration?.scope ? new URL(self.registration.scope) : self.location;
  return scopeURL.pathname.replace(/\/$/, '');
};

const BASE_PATH = getScopePath();

const withBase = (path) => {
  if (path === '/') return `${BASE_PATH || ''}/`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
};

const SRC_PREFIX = withBase('/src/');
const OFFLINE_ASSETS = [
  withBase('/'),
  withBase('/index.html'),
  withBase('/src/app.js'),
  withBase('/src/styles/main.css'),
  withBase('/src/components/CanvasManager.js'),
  withBase('/src/components/MeasurementTool.js'),
  withBase('/src/components/OverlayControls.js'),
  withBase('/src/components/ExportTool.js'),
  withBase('/src/components/TouchTransform.js'),
  withBase('/src/components/LandmarkDetector.js'),
  withBase('/src/components/BrushTool.js'),
  withBase('/src/components/CritiqueTool.js'),
  withBase('/src/utils/cloudVisionClient.js'),
  withBase('/src/utils/edgeDetection.js'),
  withBase('/public/manifest.json'),
  withBase('/public/icons/app-icon.png'),
];

// Always prefer the network for code assets so updates are picked up without
// having to manually bump cache versions during development/deploys.
const NETWORK_FIRST_PATHS = new Set(
  [
    '/',
    '/index.html',
    '/src/app.js',
    '/src/styles/main.css',
    '/src/utils/cloudVisionClient.js',
    // Also keep core modules fresh.
    '/src/components/CanvasManager.js',
    '/src/components/MeasurementTool.js',
    '/src/components/OverlayControls.js',
    '/src/components/ExportTool.js',
  ].map(withBase)
);

const shouldCacheResponse = (response) => response && response.ok && response.type !== 'opaque';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestURL = new URL(request.url);

  // Don't try to cache third-party CDNs; let them go to the network normally.
  if (requestURL.origin !== self.location.origin) {
    return;
  }

  if (requestURL.pathname.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  const isNavigation = request.mode === 'navigate';
  const isNetworkFirstPath = NETWORK_FIRST_PATHS.has(requestURL.pathname);
  const isSourceAsset = requestURL.pathname.startsWith(SRC_PREFIX);
  const isCodeAsset = isSourceAsset || requestURL.pathname.endsWith('.js') || requestURL.pathname.endsWith('.css');

  const networkFirst = isNavigation || isNetworkFirstPath || isCodeAsset;

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (shouldCacheResponse(networkResponse)) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(withBase('/index.html')))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then((response) => {
          if (shouldCacheResponse(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(withBase('/index.html')));
    })
  );
});
