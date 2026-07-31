// Increment this version number whenever you push changes to GitHub!
const CACHE_NAME = 'ghar-khata-v2.3.0';

const ASSETS = [
    './',
    './index.html',
    './app.js',
    './js/utils.js',
    './js/backup.js',
    './js/settings.js',
    './js/dashboard.js',
    './js/reports.js',
    './manifest.json'
];

// Installs and caches assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// Cleans up old caches when the new version takes over
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
            if (!response || !response.ok) return response;
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            return response;
        }).catch(() => event.request.mode === 'navigate'
            ? caches.match('./index.html')
            : Response.error()))
    );
});

// Listens for the immediate command to take over control
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
