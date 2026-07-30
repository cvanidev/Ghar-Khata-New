function renderSettingsWorkspace() {
    alphabetizeCatalogItems();
    
    const rateBox = document.getElementById('rates-container');
    rateBox.innerHTML = '';
    
    Object.keys(db.rates).forEach(rateKey => {
        let label = rateKey === 'milkPerLitre' ? 'Milk / Litre' : rateKey === 'newspaperWeekday' ? 'Paper Weekday' : 'Paper Weekend';
        let html = `<div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div class="flex justify-between items-center"><span class="text-xs font-bold text-slate-700 dark:text-slate-300">${label}</span>
            <button onclick="addRateRule('${rateKey}')" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">+ Add Rate</button></div>
            <div class="space-y-1">`;
            
        db.rates[rateKey].forEach((r, idx) => {
            html += `<div class="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg">
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
            <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" ${checked} onchange="toggleWatchlist('${itemName}')" class="rounded border-slate-300 dark:border-slate-600 text-blue-600">
                <span class="truncate">${itemName}</span>
            </label>`;
    });
    if(allUniqueItems.length === 0) {
        wlBox.innerHTML = `<p class="text-xs italic text-slate-400 dark:text-slate-500">Add catalog items first</p>`;
    }

    const catalogBox = document.getElementById('catalog-container');
    catalogBox.innerHTML = '';
    
    const sortedCategories = [...db.categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    
    sortedCategories.forEach(cat => {
        const safeCatKey = cat.replace(/[^a-zA-Z0-9]/g, '');
        let itemsHtml = (db.items[cat] || []).map((item, idx) => `
            <div class="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                <span class="truncate pr-1 dark:text-slate-300">${item}</span>
                <button onclick="deleteCatalogItem('${cat}', ${idx})" class="text-slate-400 dark:text-slate-500 hover:text-red-500">✕</button>
            </div>
        `).join('');
        
        catalogBox.innerHTML += `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 flex flex-col justify-between shadow-3xs dark:shadow-none">
                <div>
                    <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-1 mb-1.5">
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-1">${cat}</span>
                        <button onclick="deleteCategory('${cat}')" class="text-xs text-red-500 font-medium shrink-0 hover:underline">Delete</button>
                    </div>
                    <div class="space-y-1.5 max-h-28 overflow-y-auto no-scrollbar">${itemsHtml || '<p class="text-xs italic text-slate-300 dark:text-slate-600">Empty</p>'}</div>
                </div>
                <div class="flex gap-1 pt-2 mt-auto border-t border-slate-50 dark:border-slate-700">
                    <input type="text" id="add-item-to-${safeCatKey}" placeholder="Add..." class="w-2/3 text-xs border dark:border-slate-600 dark:bg-slate-900 p-1.5 rounded-lg text-slate-800 dark:text-slate-100">
                    <button onclick="addCatalogItem('${cat}')" class="w-1/3 bg-slate-900 text-white dark:bg-slate-700 dark:text-slate-100 text-xs rounded-lg font-bold">+</button>
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
    const d = prompt("Enter Effective Date (YYYY-MM-DD):", getLocalDateString());
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
    const usageCount = inventory.filter(entry => entry.category === cat).length;

    if (usageCount > 0) {
        alert(`Cannot delete "${cat}" because it is used in ${usageCount} transaction${usageCount === 1 ? "" : "s"}.`);
        return;
    }

    if (confirm(`Delete category "${cat}"?`)) {
        db.categories = db.categories.filter(c => c !== cat);
        delete db.items[cat];
        saveConfig();
        renderSettingsWorkspace();
    }
}
function addCatalogItem(cat) {
    const safeCatKey = cat.replace(/[^a-zA-Z0-9]/g, '');
    const inputId = `add-item-to-${safeCatKey}`;
    const val = document.getElementById(inputId).value.trim();
    if(!val) return;
    if(!db.items[cat]) db.items[cat] = [];
    db.items[cat].push(val);
    saveConfig(); renderSettingsWorkspace();
}
function deleteCatalogItem(cat, idx) {
    const name = db.items[cat][idx];

    const usageCount = inventory.filter(entry =>
        entry.category === cat && entry.name === name
    ).length;

    if (usageCount > 0) {
        alert(`Cannot delete "${name}" because it is used in ${usageCount} transaction${usageCount === 1 ? "" : "s"}.`);
        return;
    }

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