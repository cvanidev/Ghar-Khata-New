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

let db = JSON.parse(localStorage.getItem('gk_v7_config')) || DEFAULT_SYSTEM;
let inventory = JSON.parse(localStorage.getItem('gk_v7_inventory')) || [];

function alphabetizeCatalogItems() {
    if (db.items) {
        Object.keys(db.items).forEach(cat => {
            if (Array.isArray(db.items[cat])) {
                db.items[cat].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            }
        });
    }
}

function saveConfig() {
    alphabetizeCatalogItems();
    localStorage.setItem('gk_v7_config', JSON.stringify(db));
    if (typeof renderSettingsWorkspace === 'function') {
        renderSettingsWorkspace();
    }
    triggerCloudPush();
}

function saveInventory() {
    localStorage.setItem('gk_v7_inventory', JSON.stringify(inventory));
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
                db = data.config;
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
        ind.className = "text-xxs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 font-bold uppercase tracking-wider";
    } else if (status === 'Syncing...') {
        ind.className = "text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 font-bold uppercase tracking-wider animate-pulse";
    } else {
        ind.className = "text-xxs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 font-bold uppercase tracking-wider";
    }
}

// ==========================================
// 2. RATE RULES, DUPLICATION, RENDERING & UTILS
// ==========================================
function getEffectiveRate(rateTimeline, targetDateStr) {
    const targetTime = new Date(targetDateStr || new Date()).setHours(0,0,0,0);
    const sorted = [...rateTimeline].sort((a,b) => new Date(a.dateFrom) - new Date(b.dateFrom));
    
    let activeRate = sorted[0]?.val || 0;
    for (let rule of sorted) {
        if (targetTime >= new Date(rule.dateFrom).setHours(0,0,0,0)) {
            activeRate = rule.val;
        } else {
            break;
        }
    }
    return activeRate;
}

function isDuplicateEntry(itemName, targetDateISOString) {
    const checkDateStr = new Date(targetDateISOString).toISOString().split('T')[0];
    return inventory.some(entry => {
        const entryDateStr = new Date(entry.date).toISOString().split('T')[0];
        return entry.name.toLowerCase() === itemName.toLowerCase() && entryDateStr === checkDateStr;
    });
}

function renderDashboardLedger() {
    const container = document.getElementById('dashboard-recent-log');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
        container.innerHTML = `<p class="text-xxs text-slate-400 dark:text-slate-500 italic py-2">No transaction entries. Add your first record above!</p>`;
        return;
    }

    const sorted = [...inventory].filter(entry => {
        if (Array.isArray(entry)) {
            return entry[0] !== 'ID' && entry[0] !== 'id';
        }
        return true;
    }).sort((a, b) => {
        const getRawDate = (x) => {
            if (Array.isArray(x)) return x[1];
            return x.date || x.timestamp || x.Date || Date.now();
        };
        return new Date(getRawDate(b)) - new Date(getRawDate(a));
    }).slice(0, 5);
    
    let html = "";
    sorted.forEach(entry => {
        let nameVal = "Unknown Item";
        let dateDisplay = "No Date";
        let qtyVal = 0;
        let unitVal = "";
        let amtVal = 0;
        let isAbsent = false;
        let commentVal = "";

        if (Array.isArray(entry)) {
            const rawDate = entry[1];
            if (rawDate) {
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate)) {
                    dateDisplay = parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                } else {
                    dateDisplay = String(rawDate).split('T')[0];
                }
            }
            nameVal = entry[2] || "Unknown Item";
            qtyVal = entry[4] !== undefined ? entry[4] : 0;
            unitVal = entry[5] || "";
            amtVal = parseFloat(entry[6]) || 0;
            isAbsent = String(entry[7]).toLowerCase() === 'absent';
            commentVal = entry[8] || "";
        } 
        else if (typeof entry === 'object' && entry !== null) {
            nameVal = entry.name || entry.item || entry.itemName || entry.Item || "Unknown Item";
            const rawDate = entry.date || entry.timestamp || entry.Date;
            if (rawDate) {
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate)) {
                    dateDisplay = parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                }
            }
            qtyVal = entry.qty !== undefined ? entry.qty : (entry.quantity || entry.Qty || 0);
            unitVal = entry.unit || entry.Unit || "";
            const rawAmt = entry.amount !== undefined ? entry.amount : (entry.total || entry.Amount || 0);
            amtVal = parseFloat(rawAmt) || 0;
            isAbsent = String(entry.status || entry.Status || "").toLowerCase() === 'absent';
            commentVal = entry.comment || entry.Comment || "";
        }

        const amtDisplay = isNaN(amtVal) ? "0.00" : amtVal.toFixed(2);

        html += `
            <div class="flex justify-between items-center bg-slate-50 border border-slate-200/60 dark:bg-slate-800/50 dark:border-slate-700/60 p-2 rounded-xl text-xxs">
                <div>
                    <p class="font-bold text-slate-800 dark:text-slate-200">${nameVal} ${isAbsent ? '<span class="text-red-500 dark:text-red-400 font-semibold">[Absent]</span>' : ''}</p>
                    <p class="text-slate-400 dark:text-slate-400">${dateDisplay} | ${qtyVal} ${unitVal} ${commentVal ? `(${commentVal})` : ''}</p>
                </div>
                <div class="text-right font-bold text-slate-700 dark:text-slate-300">
                    <span>₹${amtDisplay}</span>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function showScreen(screenId) {
    document.getElementById('screen-dashboard').classList.add('hidden');
    document.getElementById('screen-settings').classList.add('hidden');
    document.getElementById('screen-reports').classList.add('hidden');
    
    const tabMain = document.getElementById('tab-main');
    const tabReports = document.getElementById('tab-reports');
    
    tabMain.className = "flex-1 text-center font-bold py-2 rounded-lg text-xs transition text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";
    tabReports.className = "flex-1 text-center font-bold py-2 rounded-lg text-xs transition text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";

    document.getElementById(`screen-${screenId}`).classList.remove('hidden');

    if (screenId === 'dashboard') {
        tabMain.className = "flex-1 text-center font-bold py-2 rounded-lg text-xs transition bg-white text-slate-800 shadow-3xs dark:bg-slate-800 dark:text-slate-100 dark:shadow-none";
        initDashboardDropdowns();
        renderDashboardLedger();
    } else if (screenId === 'reports') {
        tabReports.className = "flex-1 text-center font-bold py-2 rounded-lg text-xs transition bg-white text-slate-800 shadow-3xs dark:bg-slate-800 dark:text-slate-100 dark:shadow-none";
        initReportsWorkspace();
        renderAlerts();
    } else if (screenId === 'settings') {
        renderSettingsWorkspace();
    }
}

// ==========================================
// 3. INTERFACE DROPDOWN MANAGEMENT
// ==========================================
const mainCat = document.getElementById('main-cat');
const mainItem = document.getElementById('main-item');
const mainUnit = document.getElementById('main-unit');
const flyCatDiv = document.getElementById('fly-cat-div');
const flyItemDiv = document.getElementById('fly-item-div');
const flyUnitInput = document.getElementById('new-unit-fly');
const mainQty = document.getElementById('main-qty');
const lblQty = document.getElementById('lbl-qty');
const lblUnit = document.getElementById('lbl-unit');

function initDashboardDropdowns() {
    alphabetizeCatalogItems();
    
    mainCat.innerHTML = '';
    const sortedCategories = [...db.categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    sortedCategories.forEach(c => mainCat.innerHTML += `<option value="${c}">${c}</option>`);
    mainCat.innerHTML += `<option value="__NEW_CAT__">+ Add New Category...</option>`;
    
    mainUnit.innerHTML = '';
    db.units.forEach(u => mainUnit.innerHTML += `<option value="${u}">${u}</option>`);
    mainUnit.innerHTML += `<option value="__NEW_UNIT__">+ Add New...</option>`;
    flyUnitInput.classList.add('hidden');
    
    syncItemsDropdown();
}

function syncItemsDropdown() {
    const cat = mainCat.value;
    flyCatDiv.classList.toggle('hidden', cat !== '__NEW_CAT__');
    
    mainItem.innerHTML = '<option value="">-- Select Item --</option>';
    if(db.items[cat]) {
        const sortedItems = [...db.items[cat]].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        sortedItems.forEach(i => mainItem.innerHTML += `<option value="${i}">${i}</option>`);
    }
    mainItem.innerHTML += `<option value="__NEW_ITEM__">+ Add New Item...</option>`;
    flyItemDiv.classList.add('hidden');

    if(cat === "Utilities / Gas" || cat === "Society Maintenance") {
        mainQty.disabled = true;
        mainUnit.disabled = true;
        mainQty.value = 1;
        mainUnit.value = "Nos";
        lblQty.classList.add('opacity-40');
        lblUnit.classList.add('opacity-40');
    } else {
        mainQty.disabled = false;
        mainUnit.disabled = false;
        mainQty.value = "";
        lblQty.classList.remove('opacity-40');
        lblUnit.classList.remove('opacity-40');
    }
}

mainCat.addEventListener('change', syncItemsDropdown);
mainItem.addEventListener('change', () => {
    flyItemDiv.classList.toggle('hidden', mainItem.value !== '__NEW_ITEM__');
});
mainUnit.addEventListener('change', () => {
    flyUnitInput.classList.toggle('hidden', mainUnit.value !== '__NEW_UNIT__');
});

document.getElementById('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    let category = document.getElementById('main-cat').value;
    let name = document.getElementById('main-item').value;
    let unit = document.getElementById('main-unit').value;
    
    if (category === '__NEW_CAT__') {
        const flyCat = document.getElementById('new-cat-fly');
        category = flyCat ? flyCat.value.trim() : "";
    }
    if (name === '__NEW_ITEM__') {
        const flyItem = document.getElementById('new-item-fly');
        name = flyItem ? flyItem.value.trim() : "";
    }
    if (unit === '__NEW_UNIT__') {
        const flyUnitInput = document.getElementById('new-unit-fly');
        unit = flyUnitInput ? flyUnitInput.value.trim() : "";
    }
    
    const dateInput = document.getElementById('main-date').value;
    const amtInput = document.getElementById('main-amt').value.trim();
    const qtyInput = mainQty ? mainQty.value.trim() : "";
    const commentInput = document.getElementById('main-comment');
    const finalComment = commentInput ? commentInput.value.trim() : "";

    let validationErrors = [];
    if (!name || name === "") validationErrors.push("• Please select or enter an Item Name.");
    if (!dateInput || dateInput === "") validationErrors.push("• Date field cannot be left blank.");
    if (amtInput === "" || isNaN(parseFloat(amtInput)) || parseFloat(amtInput) < 0) {
        validationErrors.push("• Please enter a valid numerical Amount (₹0 or more).");
    }

    if (validationErrors.length > 0) {
        alert("⚠️ Incomplete Entry:\n\n" + validationErrors.join("\n"));
        return;
    }

    if (document.getElementById('main-cat').value === '__NEW_CAT__' && !db.categories.includes(category)) {
        db.categories.push(category);
        db.items[category] = [];
    }
    if (document.getElementById('main-item').value === '__NEW_ITEM__') {
        if (!db.items[category]) db.items[category] = [];
        if (!db.items[category].includes(name)) {
            db.items[category].push(name);
        }
    }
    if (document.getElementById('main-unit').value === '__NEW_UNIT__' && !db.units.includes(unit) && unit !== "") {
        db.units.push(unit);
    }

    const finalDate = new Date(dateInput);

    if (typeof isDuplicateEntry === 'function' && isDuplicateEntry(name, finalDate.toISOString())) {
        const proceed = confirm(`⚠️ Duplicate Alert:\n"${name}" has already been logged on this date. Log another anyway?`);
        if (!proceed) return;
    }

    saveConfig();
    
    const finalQty = qtyInput === "" ? "" : parseFloat(qtyInput);
    const finalAmt = parseFloat(amtInput);

    const entry = {
        id: 'row_' + Date.now() + Math.random().toString(36).substr(2, 4),
        date: finalDate.toISOString(),
        name, 
        category, 
        qty: finalQty, 
        unit: unit || "", 
        amount: finalAmt, 
        status: "Delivered", 
        comment: finalComment
    };

    inventory.push(entry);
    saveInventory();
    
    e.target.reset();
    initDashboardDropdowns();
});

// ==========================================
// 4. QUICK LOG ACTION DECK
// ==========================================
function quickLog(type, volumeMl = null) {
    const dateInput = document.getElementById('quick-log-date').value;
    const targetDateStr = dateInput ? new Date(dateInput).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const finalDate = new Date(targetDateStr);
    
    let name, category, qty, unit, cost;

    if (type === 'newspaper') {
        const day = finalDate.getDay();
        const timeline = (day === 0 || day === 6) ? db.rates.newspaperWeekend : db.rates.newspaperWeekday;
        cost = getEffectiveRate(timeline, targetDateStr);
        name = "Newspaper"; category = "Subscribed Bills"; qty = 1; unit = "Nos";
    } else if (type === 'milk') {
        qty = volumeMl / 1000;
        const rate = getEffectiveRate(db.rates.milkPerLitre, targetDateStr);
        cost = qty * rate;
        name = "Milk"; category = "Dairy"; unit = "Litre";
    }

    if (isDuplicateEntry(name, finalDate.toISOString())) {
        const proceed = confirm(`⚠️ Duplicate Alert:\n"${name}" is already saved for this date. Log another one?`);
        if (!proceed) return;
    }

    const entry = {
        id: 'row_' + Date.now() + Math.random().toString(36).substr(2, 4),
        date: finalDate.toISOString(),
        name, category, qty, unit, amount: cost, status: "Delivered", comment: ""
    };

    inventory.push(entry);
    saveInventory();
}

// ==========================================
// 5. RESTOCK ALERTS & GENERAL LOGS
// ==========================================
function logAbsence() {
    const type = document.getElementById('absent-item').value;
    const reason = document.getElementById('absent-reason').value.trim() || "Not Delivered";
    const dateInput = document.getElementById('quick-log-date').value;
    const targetDateStr = dateInput ? new Date(dateInput).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const finalDate = new Date(targetDateStr);

    let name = type === 'milk' ? "Milk" : "Newspaper";
    let category = type === 'milk' ? "Dairy" : "Subscribed Bills";
    let unit = type === 'milk' ? "Litre" : "Nos";

    if (isDuplicateEntry(name, finalDate.toISOString())) {
        const proceed = confirm(`⚠️ Duplicate Alert:\n"${name}" has a logged entry for this date. Save absence anyway?`);
        if (!proceed) return;
    }

    const entry = {
        id: 'row_' + Date.now() + Math.random().toString(36).substr(2, 4),
        date: finalDate.toISOString(),
        name, category, qty: 0, unit, amount: 0, status: "Absent", comment: reason
    };

    inventory.push(entry);
    saveInventory();
    document.getElementById('absent-reason').value = "";
}

function deleteLedgerRow(rowId) {
    if (confirm("Are you sure you want to permanently delete this logged item row?")) {
        inventory = inventory.filter(entry => entry.id !== rowId);
        saveInventory();
        if(document.getElementById('vendor-bill-scope').disabled) {
            document.getElementById('btn-generate-rep').click();
        } else {
            document.getElementById('btn-generate-bill').click();
        }
    }
}

// ==========================================
// 5. REPORTS ENGINE
// ==========================================
const repFilterType = document.getElementById('rep-filter-type');
const repTargetSelect = document.getElementById('rep-target-select');

function initReportsWorkspace() {
    repFilterType.value = "all";
    repTargetSelect.disabled = true;
    repTargetSelect.innerHTML = "";
    document.getElementById('report-output-box').classList.add('hidden');
}

repFilterType.addEventListener('change', () => {
    const val = repFilterType.value;
    if (val === 'all') {
        repTargetSelect.disabled = true;
        repTargetSelect.innerHTML = "";
    } else {
        repTargetSelect.disabled = false;
        repTargetSelect.innerHTML = "";
        
        if (val === 'category') {
            const sortedCategories = [...db.categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            sortedCategories.forEach(c => {
                repTargetSelect.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else if (val === 'item') {
            const allItems = [];
            Object.values(db.items).forEach(list => {
                list.forEach(i => { if(!allItems.includes(i)) allItems.push(i); });
            });
            allItems.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(item => {
                repTargetSelect.innerHTML += `<option value="${item}">${item}</option>`;
            });
        }
    }
});

document.getElementById('btn-generate-rep').addEventListener('click', () => {
    document.getElementById('vendor-bill-scope').disabled = true;
    const sDate = document.getElementById('rep-start').value;
    const eDate = document.getElementById('rep-end').value;
    if(!sDate || !eDate) return alert("Select Date Limits");

    const start = new Date(sDate).setHours(0,0,0,0);
    const end = new Date(eDate).setHours(23,59,59,999);
    const filter = repFilterType.value;
    const target = repTargetSelect.value;

    const matched = inventory.filter(i => {
        const d = new Date(i.date).getTime();
        const dateMatch = (d >= start && d <= end);
        if(!dateMatch) return false;

        if (filter === 'category') return (i.category || i.cat) === target;
        if (filter === 'item') return i.name === target;
        return true;
    });

    let sum = 0;
    let listHtml = "";
    matched.forEach(i => {
        sum += parseFloat(i.amount);
        listHtml += `
            <div class="flex justify-between items-center text-xxs py-2 border-b border-slate-100 dark:border-slate-700/60 group">
                <div>
                    <p class="font-bold text-slate-800 dark:text-slate-200">${i.name} ${i.status === 'Absent' ? '<span class="text-red-500 dark:text-red-400 font-semibold">[Absent]</span>' : ''}</p>
                    <p class="text-slate-400 dark:text-slate-400">${new Date(i.date).toLocaleDateString('en-IN')} | ${i.qty} ${i.unit} ${i.comment ? `(${i.comment})` : ''}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-700 dark:text-slate-300">₹${parseFloat(i.amount).toFixed(2)}</span>
                    <button onclick="deleteLedgerRow('${i.id}')" class="text-red-400 hover:text-red-600 font-bold p-1">🗑️</button>
                </div>
            </div>`;
    });

    const outBox = document.getElementById('report-output-box');
    outBox.classList.remove('hidden');
    outBox.innerHTML = `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-2xs">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Statement Entries</span>
                <span class="text-xs font-black text-emerald-600 dark:text-emerald-400">Total Spent: ₹${sum.toFixed(2)}</span>
            </div>
            <div class="max-h-60 overflow-y-auto pr-1 no-scrollbar space-y-1">${listHtml || '<p class="text-xxs italic text-slate-400 dark:text-slate-500">No transactions recorded.</p>'}</div>
        </div>`;
});

// ==========================================
// 6. ISOLATED VENDOR STATEMENT SYSTEM
// ==========================================
document.getElementById('btn-generate-bill').addEventListener('click', () => {
    document.getElementById('vendor-bill-scope').disabled = false;
    const sDate = document.getElementById('rep-start').value;
    const eDate = document.getElementById('rep-end').value;
    const scope = document.getElementById('vendor-bill-scope').value;

    if(!sDate || !eDate) return alert("Select Date Limits");

    const start = new Date(sDate).setHours(0,0,0,0);
    const end = new Date(eDate).setHours(23,59,59,999);

    const matched = inventory.filter(i => {
        const d = new Date(i.date).getTime();
        return d >= start && d <= end;
    }).sort((a,b) => new Date(a.date) - new Date(b.date));

    let milkRowsHtml = "";
    let paperRowsHtml = "";
    let totalMilkCost = 0;
    let totalPaperCost = 0;

    matched.forEach(i => {
        const d = new Date(i.date);
        const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
        const cleanDateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        
        if (i.name.toLowerCase() === 'milk' && (scope === 'both' || scope === 'milk')) {
            if (i.status === 'Absent') {
                milkRowsHtml += `
                    <tr class="text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                        <td class="p-1.5 border-b dark:border-slate-700">${cleanDateStr}</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-center">0 L</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right">-</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right text-xxs italic">
                            <div class="flex justify-between items-center">
                                <span>${i.comment || 'Absent'}</span>
                                <button onclick="deleteLedgerRow('${i.id}')" class="text-red-400 font-bold ml-1 no-print">🗑️</button>
                            </div>
                        </td>
                    </tr>`;
            } else {
                const itemQty = parseFloat(i.qty) || 0;
                const itemAmount = parseFloat(i.amount) || 0;
                const singleLitreRate = itemQty > 0 ? (itemAmount / itemQty) : 0;
                totalMilkCost += itemAmount;
                milkRowsHtml += `
                    <tr class="dark:text-slate-300">
                        <td class="p-1.5 border-b dark:border-slate-700">${cleanDateStr}</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-center">${itemQty} L</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right">₹${singleLitreRate.toFixed(1)}</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right font-bold">
                            <div class="flex justify-between items-center justify-end gap-1">
                                <span>₹${itemAmount.toFixed(0)}</span>
                                <button onclick="deleteLedgerRow('${i.id}')" class="text-slate-300 dark:text-slate-600 hover:text-red-500 font-bold ml-1 no-print">🗑️</button>
                            </div>
                        </td>
                    </tr>`;
            }
        }

        if (i.name.toLowerCase() === 'newspaper' && (scope === 'both' || scope === 'newspaper')) {
            const itemAmount = parseFloat(i.amount) || 0;
            if (i.status === 'Absent') {
                paperRowsHtml += `
                    <tr class="text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                        <td class="p-1.5 border-b dark:border-slate-700">${cleanDateStr} (${dayName})</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-center">-</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right text-xxs italic">
                            <div class="flex justify-between items-center justify-end">
                                <span>${i.comment || 'Absent'}</span>
                                <button onclick="deleteLedgerRow('${i.id}')" class="text-red-400 font-bold ml-1 no-print">🗑️</button>
                            </div>
                        </td>
                    </tr>`;
            } else {
                totalPaperCost += itemAmount;
                paperRowsHtml += `
                    <tr class="dark:text-slate-300">
                        <td class="p-1.5 border-b dark:border-slate-700">${cleanDateStr} (${dayName})</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-center">₹${itemAmount.toFixed(0)}</td>
                        <td class="p-1.5 border-b dark:border-slate-700 text-right font-bold">
                            <div class="flex justify-between items-center justify-end gap-1">
                                <span>₹${itemAmount.toFixed(0)}</span>
                                <button onclick="deleteLedgerRow('${i.id}')" class="text-slate-300 dark:text-slate-600 hover:text-red-500 font-bold ml-1 no-print">🗑️</button>
                            </div>
                        </td>
                    </tr>`;
            }
        }
    });

    let finalTablesBlock = "";
    if (scope === 'both' || scope === 'milk') {
        finalTablesBlock += `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-2xs">
                <h4 class="text-xs font-black text-slate-800 dark:text-slate-200 border-b dark:border-slate-700 pb-2 mb-2">🥛 Milk Delivery Invoice Details (Total: ₹${totalMilkCost.toFixed(0)})</h4>
                <table class="w-full text-xxs text-left border-collapse">
                    <thead>
                        <tr class="text-slate-400 dark:text-slate-500 border-b dark:border-slate-700 font-semibold bg-slate-50 dark:bg-slate-900/40">
                            <th class="p-1.5">Date</th>
                            <th class="p-1.5 text-center">Qty</th>
                            <th class="p-1.5 text-right">Rate/L</th>
                            <th class="p-1.5 text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody class="font-medium">${milkRowsHtml || '<tr><td colspan="4" class="p-2 text-center italic text-slate-400 dark:text-slate-500">No entries inside parameters.</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    if (scope === 'both' || scope === 'newspaper') {
        finalTablesBlock += `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-2xs">
                <h4 class="text-xs font-black text-slate-800 dark:text-slate-200 border-b dark:border-slate-700 pb-2 mb-2">📰 Newspaper Supply Invoice Details (Total: ₹${totalPaperCost.toFixed(0)})</h4>
                <table class="w-full text-xxs text-left border-collapse">
                    <thead>
                        <tr class="text-slate-400 dark:text-slate-500 border-b dark:border-slate-700 font-semibold bg-slate-50 dark:bg-slate-900/40">
                            <th class="p-1.5">Date (Day)</th>
                            <th class="p-1.5 text-center">Price Rate</th>
                            <th class="p-1.5 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody class="font-medium">${paperRowsHtml || '<tr><td colspan="3" class="p-2 text-center italic text-slate-400 dark:text-slate-500">No entries inside parameters.</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    const grandTotal = totalMilkCost + totalPaperCost;
    const cleanFrom = new Date(sDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const cleanTo = new Date(eDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const outBox = document.getElementById('report-output-box');
    outBox.classList.remove('hidden');
    outBox.innerHTML = `
        <div class="space-y-4">
            <div class="flex justify-end no-print">
                <button onclick="exportInvoicePDF()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer">
                    📥 Download & Share Invoice
                </button>
            </div>
            <div class="space-y-4 bg-white dark:bg-slate-800 p-1 rounded-xl">
                <div class="border-b-2 border-slate-900 dark:border-slate-100 pb-2 mb-2 flex justify-between items-end">
                    <div>
                        <h3 class="text-sm font-black tracking-tight uppercase text-slate-900 dark:text-slate-100">📄 Vendor Account Bill Summary</h3>
                        <p class="text-xxs text-slate-500 dark:text-slate-400 font-medium">Period Statement: <strong>${cleanFrom}</strong> to <strong>${cleanTo}</strong></p>
                    </div>
                    <div class="text-right">
                        <span class="text-xxs font-bold uppercase text-slate-400 dark:text-slate-500 block">Grand Settlement Due</span>
                        <span class="text-sm font-black text-slate-900 dark:text-slate-100">₹${grandTotal.toFixed(0)}</span>
                    </div>
                </div>
                ${finalTablesBlock}
            </div>
        </div>`;
});

function exportInvoicePDF() {
    window.print();
}

// ==========================================
// 7. PREDICTIVE CRITICAL ALERTS (QUANTITY AWARE)
// ==========================================
function renderAlerts() {
    const alertDiv = document.getElementById('stock-alerts');
    alertDiv.innerHTML = "";
    if (db.watchlist.length === 0) {
        alertDiv.innerHTML = `<p class="text-xxs text-slate-400 dark:text-slate-500 italic">No items selected for stock tracking inside Settings.</p>`;
        return;
    }

    const historyMap = {};
    inventory.filter(i => i.status !== 'Absent').sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(i => {
        if(!historyMap[i.name]) historyMap[i.name] = [];
        historyMap[i.name].push({
            date: new Date(i.date),
            qty: i.qty !== undefined && i.qty !== "" ? parseFloat(i.qty) : null
        });
    });
    
    let active = false;
    db.watchlist.forEach(name => {
        const entries = historyMap[name] || [];
        if (entries.length < 3) return;
        
        let totalDaysSpan = (entries[entries.length - 1].date - entries[0].date) / (1000 * 60 * 60 * 24);
        if (totalDaysSpan <= 0) return;

        const hasMissingQty = entries.some(e => e.qty === null || isNaN(e.qty) || e.qty === 0);
        let daysToLast = 0;
        
        if (!hasMissingQty) {
            let totalConsumedQty = 0;
            for (let i = 0; i < entries.length - 1; i++) {
                totalConsumedQty += entries[i].qty;
            }
            const dailyBurnRate = totalConsumedQty / totalDaysSpan;
            if (dailyBurnRate > 0) {
                const lastPurchasedQty = entries[entries.length - 1].qty;
                daysToLast = Math.ceil(lastPurchasedQty / dailyBurnRate);
            } else {
                daysToLast = 0;
            }
        } else {
            let diff = 0;
            for(let i = 1; i < entries.length; i++) {
                diff += (entries[i].date - entries[i-1].date) / (1000 * 60 * 60 * 24);
            }
            const averageCycle = diff / (entries.length - 1);
            daysToLast = Math.ceil(averageCycle);
        }
        
        const lastPurchaseDate = entries[entries.length - 1].date;
        const estimatedExhaustionDate = new Date(lastPurchaseDate.getTime() + (daysToLast * 24 * 60 * 60 * 1000));
        const rem = Math.ceil((estimatedExhaustionDate - new Date()) / (1000 * 60 * 60 * 24));
        
        if(rem <= 5) {
            active = true;
            let theme = rem <= 0 
                ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50' 
                : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';
            let label = rem <= 0 ? `Overdue / Empty by ${Math.abs(rem)} days!` : `due in ${rem} days`;
            let StrategyTag = !hasMissingQty ? '📊' : '⏱️';
            
            alertDiv.innerHTML += `
                <div class="flex justify-between p-2 rounded-lg border text-xxs font-medium ${theme}">
                    <span>${StrategyTag} <strong>${name}</strong></span>
                    <span>${label}</span>
                </div>`;
        }
    });

    if(!active) {
        alertDiv.innerHTML = `<p class="text-xxs text-slate-400 dark:text-slate-500 italic">All watched pantry items are stable.</p>`;
    }
}

// ==========================================
// 8. CONFIGURATION MANAGEMENT
// ==========================================
function renderSettingsWorkspace() {
    alphabetizeCatalogItems();
    
    const rateBox = document.getElementById('rates-container');
    rateBox.innerHTML = '';
    
    Object.keys(db.rates).forEach(rateKey => {
        let label = rateKey === 'milkPerLitre' ? 'Milk / Litre' : rateKey === 'newspaperWeekday' ? 'Paper Weekday' : 'Paper Weekend';
        let html = `<div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div class="flex justify-between items-center"><span class="text-xs font-bold text-slate-700 dark:text-slate-300">${label}</span>
            <button onclick="addRateRule('${rateKey}')" class="text-xxs font-bold text-blue-600 dark:text-blue-400 hover:underline">+ Add Rate</button></div>
            <div class="space-y-1">`;
            
        db.rates[rateKey].forEach((r, idx) => {
            html += `<div class="flex justify-between items-center text-xxs bg-slate-50 dark:bg-slate-900/40 p-1.5 rounded-lg">
                <span class="dark:text-slate-300">From: <strong>${r.dateFrom}</strong> ➔ <strong>₹${r.val}</strong></span>
                <button onclick="deleteRateRule('${rateKey}', ${idx})" class="text-red-500 font-bold px-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded">✕</button>
            </div>`;
        });
        html += `</div></div>`;
        rateBox.innerHTML += html;
    });

    const wlBox = document.getElementById('watchlist-container');
    wlBox.innerHTML = '';
    const allUniqueItems = [];
    Object.values(db.items).forEach(list => {
        list.forEach(i => {
            if(!allUniqueItems.includes(i) && i.toLowerCase() !== 'milk' && i.toLowerCase() !== 'newspaper') {
                allUniqueItems.push(i);
            }
        });
    });

    allUniqueItems.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(itemName => {
        const checked = db.watchlist.includes(itemName) ? 'checked' : '';
        wlBox.innerHTML += `
            <label class="flex items-center gap-1.5 text-xxs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" ${checked} onchange="toggleWatchlist('${itemName}')" class="rounded border-slate-300 dark:border-slate-600 text-blue-600">
                <span class="truncate">${itemName}</span>
            </label>`;
    });
    if(allUniqueItems.length === 0) {
        wlBox.innerHTML = `<p class="text-xxs italic text-slate-400 dark:text-slate-500">Add catalog items first</p>`;
    }

    const catalogBox = document.getElementById('catalog-container');
    catalogBox.innerHTML = '';
    
    const sortedCategories = [...db.categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    
    sortedCategories.forEach(cat => {
        let itemsHtml = (db.items[cat] || []).map((item, idx) => `
            <div class="flex justify-between items-center text-xxs bg-slate-50 dark:bg-slate-900/40 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                <span class="truncate pr-1 dark:text-slate-300">${item}</span>
                <button onclick="deleteCatalogItem('${cat}', ${idx})" class="text-slate-400 dark:text-slate-500 hover:text-red-500">✕</button>
            </div>
        `).join('');
        
        catalogBox.innerHTML += `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 flex flex-col justify-between shadow-3xs dark:shadow-none">
                <div>
                    <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-1 mb-1.5">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-1">${cat}</span>
                        <button onclick="deleteCategory('${cat}')" class="text-xxs text-red-500 font-medium shrink-0 hover:underline">Delete</button>
                    </div>
                    <div class="space-y-1.5 max-h-24 overflow-y-auto no-scrollbar">${itemsHtml || '<p class="text-xxs italic text-slate-300 dark:text-slate-600">Empty</p>'}</div>
                </div>
                <div class="flex gap-1 pt-2 mt-auto border-t border-slate-50 dark:border-slate-700">
                    <input type="text" id="add-item-to-${cat.replace(/\s+/g, '')}" placeholder="Add..." class="w-2/3 text-xxs border dark:border-slate-600 dark:bg-slate-900 p-1 rounded-lg text-slate-800 dark:text-slate-100">
                    <button onclick="addCatalogItem('${cat}')" class="w-1/3 bg-slate-900 text-white dark:bg-slate-700 dark:text-slate-100 text-xxs rounded-lg font-bold">+</button>
                </div>
            </div>
        `;
    });
}

function toggleWatchlist(itemName) {
    if (db.watchlist.includes(itemName)) {
        db.watchlist = db.watchlist.filter(i => i !== itemName);
    } else {
        db.watchlist.push(itemName);
    }
    saveConfig();
}

function addRateRule(key) {
    const d = prompt("Enter Effective Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
    const v = prompt("Enter Rate Value (₹):");
    if(d && v) {
        db.rates[key].push({ dateFrom: d, val: parseFloat(v) });
        saveConfig(); renderSettingsWorkspace();
    }
}
function deleteRateRule(key, idx) {
    if (db.rates[key].length === 1) {
        alert("Must retain at least one fallback rule!");
        return;
    }
    const rule = db.rates[key][idx];
    if (confirm(`Delete the rate rule (Effective: ${rule.dateFrom}, Value: ₹${rule.val})?`)) {
        db.rates[key].splice(idx, 1);
        saveConfig(); 
        renderSettingsWorkspace();
    }
}
function deleteCategory(cat) {
    if(confirm(`Delete category "${cat}"?`)) {
        db.categories = db.categories.filter(c => c !== cat);
        delete db.items[cat];
        saveConfig(); renderSettingsWorkspace();
    }
}
function addCatalogItem(cat) {
    const inputId = `add-item-to-${cat.replace(/\s+/g, '')}`;
    const val = document.getElementById(inputId).value.trim();
    if(!val) return;
    if(!db.items[cat]) db.items[cat] = [];
    db.items[cat].push(val);
    saveConfig(); renderSettingsWorkspace();
}
function deleteCatalogItem(cat, idx) {
    const name = db.items[cat][idx];
    if (confirm(`Are you sure you want to delete "${name}" from the ${cat} catalog?`)) {
        db.watchlist = db.watchlist.filter(i => i !== name);
        db.items[cat].splice(idx, 1);
        saveConfig(); 
        renderSettingsWorkspace();
    }
}

document.getElementById('form-add-cat-settings').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-cat-settings-name');
    const newCat = input.value.trim();
    if(newCat && !db.categories.includes(newCat)) {
        db.categories.push(newCat);
        db.items[newCat] = [];
        saveConfig(); renderSettingsWorkspace();
        input.value = '';
    }
});

// ==========================================
// 9. DARK MODE CONTROLLER
// ==========================================
function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('gk_theme', isDark ? 'dark' : 'light');
    updateThemeUIButton(isDark);
}

function updateThemeUIButton(isDark) {
    const btn = document.getElementById('btn-toggle-dark');
    if(btn) btn.innerText = isDark ? "☀️ Light" : "🌙 Dark";
}

window.onload = () => { 
    const savedTheme = localStorage.getItem('gk_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const activeDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
    
    if (activeDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeUIButton(activeDark);

    pullDatabaseFromSheet();
    initDashboardDropdowns(); 
};