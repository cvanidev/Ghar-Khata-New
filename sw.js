// Increment this version number whenever you push changes to GitHub!
const CACHE_NAME = 'ghar-khata-v7.0.4'; 

const ASSETS = [
    './',
    './index.html',
    './app.js',
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
        })
    );
});

// Listens for the immediate command to take over control
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});