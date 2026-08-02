// ==========================================
// 1. CONFIGURATION, DATABASE BRIDGE & PWAs
// ==========================================
let apiKey = localStorage.getItem('gk_api_key');
if (!apiKey) {
    apiKey = prompt("🔑 Enter your Ghar-Khata Secret Token to synchronize:");
    if (apiKey) {
        localStorage.setItem('gk_api_key', apiKey);
    }
}

const BASE_URL = "https://script.google.com/macros/s/AKfycbzONERqJZJknMPc1E7qfNKeTTj0ZNii69yC88ydGxalbI0yFyRNVNg4EM1fwBIT7o0/exec";
const BACKEND_API_URL = `${BASE_URL}?token=${encodeURIComponent(apiKey || '')}`;

// ==========================================
// APP CONSTANTS
// ==========================================
const STORAGE = {
    CONFIG: 'gk_v7_config',
    INVENTORY: 'gk_v7_inventory',
    API_KEY: 'gk_api_key'
};

const STATUS = {
    DELIVERED: 'Delivered',
    ABSENT: 'Absent'
};

const SYNC = {
    PENDING: 'pending',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    CONFLICT: 'conflict'
};

const ITEM = {
    MILK: 'Milk',
    NEWSPAPER: 'Newspaper'
};

const CATEGORY = {
    DAIRY: 'Dairy',
    SUBSCRIBED_BILLS: 'Subscribed Bills'
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker Registered Successfully');
                reg.update();
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('SKIP_WAITING');
                        }
                    });
                });
            })
            .catch(err => console.error('Service Worker Registration Failed', err));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

const DEFAULT_SYSTEM = {
    categories: ["Groceries", "Fruits & Veggies", "Dairy", "Utilities / Gas", "Scooter Upkeep", "Society Maintenance", "Subscribed Bills"],
    items: {
        "Groceries": ["Aashirvaad Atta 10kg", "Mustard Oil", "Sugar", "Salt"],
        "Fruits & Veggies": ["Potatoes", "Onions", "Tomatoes"],
        "Dairy": ["Milk", "Paneer", "Curd"],
        "Utilities / Gas": ["Electricity Bill", "Gas Cylinder"],
        "Scooter Upkeep": ["Scooter Maintenance", "Petrol"],
        "Society Maintenance": ["Society Maintenance Charges"],
        "Subscribed Bills": ["Newspaper"]
    },
    units: ["Kg", "Litre", "Packet", "Nos"],
    watchlist: [],
    rates: {
        milkPerLitre: [{ dateFrom: "2000-01-01", val: 60 }],
        newspaperWeekday: [{ dateFrom: "2000-01-01", val: 4 }],
        newspaperWeekend: [{ dateFrom: "2000-01-01", val: 5 }]
    }
};

function readStoredJson(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
        console.warn(`Ignoring invalid saved data for ${key}.`, error);
        return fallback;
    }
}

function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidRateRule(rule) {
    return rule && typeof rule === 'object' &&
        isValidDateString(rule.dateFrom) &&
        Number.isFinite(Number(rule.val)) && Number(rule.val) >= 0;
}

function normalizeInventory(candidate) {
    if (!Array.isArray(candidate)) return [];

    return candidate
        .filter(row => row && typeof row === 'object' && !Array.isArray(row))
        .map(row => Object.fromEntries(
            Object.entries(row).map(([key, value]) => [String(key).trim(), value])
        ));
}

function normalizeDatabase(candidate) {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_SYSTEM));
    const source = candidate && typeof candidate === 'object' ? candidate : {};
    const sourceItems = source.items && typeof source.items === 'object' ? source.items : {};
    const categories = Array.isArray(source.categories) ? source.categories.filter(c => typeof c === 'string' && c.trim()) : defaults.categories;
    const items = { ...defaults.items };
    Object.entries(sourceItems).forEach(([category, values]) => {
        if (Array.isArray(values)) items[category] = values.filter(item => typeof item === 'string' && item.trim());
    });
    const sourceRates = source.rates && typeof source.rates === 'object' ? source.rates : {};
    const rates = { ...defaults.rates };
    Object.keys(defaults.rates).forEach(key => {
        const validRules = Array.isArray(sourceRates[key])
            ? sourceRates[key]
                .filter(isValidRateRule)
                .map(rule => ({ dateFrom: rule.dateFrom, val: Number(rule.val) }))
            : [];
        if (validRules.length > 0) rates[key] = validRules;
    });

    return {
        ...defaults,
        ...source,
        categories: [...new Set(categories)],
        items,
        units: Array.isArray(source.units) ? source.units.filter(u => typeof u === 'string' && u.trim()) : defaults.units,
        watchlist: Array.isArray(source.watchlist) ? source.watchlist.filter(item => typeof item === 'string') : [],
        rates
    };
}

let db = normalizeDatabase(readStoredJson(STORAGE.CONFIG, DEFAULT_SYSTEM));
let inventory = normalizeInventory(readStoredJson(STORAGE.INVENTORY, []));
let editingEntryId = null;
let localRevision = 0;
let latestPullRequest = 0;
let cloudPushQueue = Promise.resolve();

// New sync state
let hasPendingChanges = false;
let syncTimer = null;

function markLocalChange() {
    localRevision += 1;
    hasPendingChanges = true;
}

function saveConfig() {
    alphabetizeCatalogItems();
    markLocalChange();
    setSyncStatus('Pending Changes');
    localStorage.setItem(STORAGE.CONFIG, JSON.stringify(db));
    if (typeof renderSettingsWorkspace === 'function') {
        renderSettingsWorkspace();
    }
    triggerCloudPush();
}

function saveInventory() {
    markLocalChange();
    setSyncStatus('Pending Changes');
    localStorage.setItem(STORAGE.INVENTORY, JSON.stringify(inventory));
    triggerCloudPush();
    renderDashboardLedger();
}

/*
function scheduleCloudPush(delay = 2000) {

    if (syncTimer) {
        clearTimeout(syncTimer);
    }

    syncTimer = setTimeout(() => {
        syncTimer = null;
        triggerCloudPush();
    }, delay);

}
*/    

function triggerCloudPush() {
    if (!navigator.onLine || BACKEND_API_URL.includes("YOUR_DEPLOYED_APPS_SCRIPT")) {
        setSyncStatus('Local Only');
        return;
    }
    setSyncStatus('Syncing...');
    const payload = JSON.stringify({ config: db, inventory });
    const revision = localRevision;

    // Serialize writes so an older snapshot cannot arrive after a newer one.
    cloudPushQueue = cloudPushQueue
        .catch(() => undefined)
        .then(() => fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: payload
        }))
        .then(response => {
            if (!response.ok) throw new Error(`Cloud push failed (${response.status}).`);
            if (revision === localRevision) setSyncStatus('Synced');
            console.log("State and Catalog configurations successfully synced to Google Sheets.");
        })
        .catch(err => {
            console.error("PUSH FAILED:", err);
            console.trace("Push failure stack:");
            if (revision === localRevision) setSyncStatus('Failed');
        });
}

function pullDatabaseFromSheet(attempt = 1) {

    const syncStart = performance.now();
    const MAX_ATTEMPTS = 2;
    const TIMEOUT_MS = 15000;

    if (!navigator.onLine || BACKEND_API_URL.includes("YOUR_DEPLOYED_APPS_SCRIPT")) {
        setSyncStatus('Local Only');
        renderDashboardLedger();
        return;
    }

    setSyncStatus(
        attempt === 1
            ? 'Syncing...'
            : 'Retrying...'
    );

    const requestId = ++latestPullRequest;
    const revisionAtRequest = localRevision;

    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, TIMEOUT_MS);

    console.time(`GharKhata Cloud Pull Attempt ${attempt}`);

    fetch(BACKEND_API_URL, {
        signal: controller.signal
    })

        .then(res => {

            if (!res.ok) {
                throw new Error(`Cloud pull failed (${res.status}).`);
            }

            return res.json();

        })

        .then(data => {

            if (!data || data.error) {
                throw new Error(
                    data?.error ||
                    'Cloud returned an invalid response.'
                );
            }

            if (
                requestId !== latestPullRequest ||
                revisionAtRequest !== localRevision
            ) {
                setSyncStatus('Local changes pending');
                return;
            }

            if (data.config && data.inventory) {

                if (!Array.isArray(data.inventory)) {
                    throw new Error(
                        'Cloud returned an invalid inventory format.'
                    );
                }

                db = normalizeDatabase(data.config);
                inventory = normalizeInventory(data.inventory);

                alphabetizeCatalogItems();

                localStorage.setItem(
                    STORAGE.CONFIG,
                    JSON.stringify(db)
                );

                localStorage.setItem(
                    STORAGE.INVENTORY,
                    JSON.stringify(inventory)
                );

            } else {

                const rawArr =
                    Array.isArray(data)
                        ? data
                        : data.inventory;

                if (!Array.isArray(rawArr)) {
                    throw new Error(
                        'Cloud returned an invalid inventory format.'
                    );
                }

                inventory = normalizeInventory(rawArr);

                localStorage.setItem(
                    STORAGE.INVENTORY,
                    JSON.stringify(inventory)
                );

            }

            setSyncStatus('Synced');

            initDashboardDropdowns();
            renderDashboardLedger();

            if (
                !document
                    .getElementById('screen-reports')
                    .classList
                    .contains('hidden')
            ) {

                const isBillScreenActive =
                    !document
                        .getElementById('vendor-bill-scope')
                        .disabled;

                if (isBillScreenActive) {

                    document
                        .getElementById('btn-generate-bill')
                        .click();

                } else {

                    document
                        .getElementById('btn-generate-rep')
                        .click();

                }

            }

            console.log(
                `GharKhata Cloud Pull Attempt ${attempt} succeeded in`,
                Math.round(performance.now() - syncStart),
                'ms'
            );

        })

        .catch(err => {

            const elapsed = Math.round(
                performance.now() - syncStart
            );

            const isTimeout =
                err.name === 'AbortError';

            console.error(
                `Cloud Pull Attempt ${attempt} failed after ${elapsed} ms:`,
                err
            );

            if (attempt < MAX_ATTEMPTS) {

                console.log(
                    'Retrying cloud pull in 1 second...'
                );

                setSyncStatus('Retrying...');

                setTimeout(() => {
                    pullDatabaseFromSheet(attempt + 1);
                }, 1000);

                return;
            }

            setSyncStatus(
                isTimeout
                    ? 'Sync Timeout'
                    : 'Failed'
            );

            console.error("PULL FAILED:", err);
            console.trace("Pull failure stack:");

            // Keep using locally stored data.
            renderDashboardLedger();

        })

        .finally(() => {

            clearTimeout(timeoutId);

            console.timeEnd(
                `GharKhata Cloud Pull Attempt ${attempt}`
            );

        });

}

function syncForce() {
    pullDatabaseFromSheet();
    alert("Pull Sync requested from Cloud!");
}

function setSyncStatus(status) {
    const ind = document.getElementById('sync-indicator');
    ind.innerText = status;
    if (status === 'Synced') {
        ind.className = "text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 font-bold uppercase tracking-wider";
    } else if (status === 'Syncing...') {
        ind.className = "text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 font-bold uppercase tracking-wider animate-pulse";
    } else {
        ind.className = "text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 font-bold uppercase tracking-wider";
    }
}
