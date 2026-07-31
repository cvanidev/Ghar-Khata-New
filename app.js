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
const BACKEND_API_URL = `${BASE_URL}?token=${apiKey}`;

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
        if (Array.isArray(sourceRates[key]) && sourceRates[key].length > 0) rates[key] = sourceRates[key];
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
let inventory = readStoredJson(STORAGE.INVENTORY, []);
if (!Array.isArray(inventory)) inventory = [];
let editingEntryId = null;

function saveConfig() {
    alphabetizeCatalogItems();
    localStorage.setItem(STORAGE.CONFIG, JSON.stringify(db));
    if (typeof renderSettingsWorkspace === 'function') {
        renderSettingsWorkspace();
    }
    triggerCloudPush();
}

function saveInventory() {
    localStorage.setItem(STORAGE.INVENTORY, JSON.stringify(inventory));
    triggerCloudPush();
    renderDashboardLedger();
}

function triggerCloudPush() {
    if (!navigator.onLine || BACKEND_API_URL.includes("YOUR_DEPLOYED_APPS_SCRIPT")) {
        setSyncStatus('Local Only');
        return;
    }
    setSyncStatus('Syncing...');
    
    const payload = { config: db, inventory: inventory };
    
    fetch(BACKEND_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
    })
    .then(() => {
        setSyncStatus('Synced');
        console.log("State and Catalog configurations successfully synced to Google Sheets.");
    })
    .catch(err => {
        setSyncStatus('Failed');
        console.error("Cloud push transmission failed:", err);
    });
}

function pullDatabaseFromSheet() {
    if (!navigator.onLine || BACKEND_API_URL.includes("YOUR_DEPLOYED_APPS_SCRIPT")) {
        setSyncStatus('Local Only');
        renderDashboardLedger();
        return;
    }
    setSyncStatus('Syncing...');
    
    fetch(BACKEND_API_URL)
    .then(res => res.json())
    .then(data => {
        if (data && !data.error) {
            if (data.config && data.inventory) {
                db = normalizeDatabase(data.config);
                inventory = data.inventory.map(row => {
                    const sanitizedRow = {};
                    Object.keys(row).forEach(key => { sanitizedRow[key.trim()] = row[key]; });
                    return sanitizedRow;
                });
                
                alphabetizeCatalogItems();
                localStorage.setItem('gk_v7_config', JSON.stringify(db));
                localStorage.setItem('gk_v7_inventory', JSON.stringify(inventory));
            } else {
                const rawArr = Array.isArray(data) ? data : (data.inventory || []);
                inventory = rawArr.map(row => {
                    const sanitizedRow = {};
                    Object.keys(row).forEach(key => { sanitizedRow[key.trim()] = row[key]; });
                    return sanitizedRow;
                });
                localStorage.setItem('gk_v7_inventory', JSON.stringify(inventory));
            }

            setSyncStatus('Synced');
            initDashboardDropdowns();
            renderDashboardLedger();
            
            if(!document.getElementById('screen-reports').classList.contains('hidden')) {
                const isBillScreenActive = !document.getElementById('vendor-bill-scope').disabled;
                if(isBillScreenActive) {
                    document.getElementById('btn-generate-bill').click();
                } else {
                    document.getElementById('btn-generate-rep').click();
                }
            }
        }
    })
    .catch(err => {
        setSyncStatus('Failed');
        console.error("Cloud synchronization download failed:", err);
        renderDashboardLedger();
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
