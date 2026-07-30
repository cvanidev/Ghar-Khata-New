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
const mainContributor = document.getElementById('main-contributor');
const mainShare = document.getElementById('main-share');

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

function initDashboardDropdowns() {
    alphabetizeCatalogItems();
    
    mainCat.innerHTML = '<option value="" disabled selected>-- Select Category --</option>';
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
    if (cat && cat !== '__NEW_CAT__' && db.items[cat]) {
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

function syncContributionControls() {
    const isSelf = mainContributor.value === "self";

    mainShare.disabled = isSelf;

    if (isSelf) {
        mainShare.value = "0";
    }
}

function cancelEdit() {
    editingEntryId = null;

    document.getElementById('manual-form').reset();
    initDashboardDropdowns();

    document.getElementById('main-date').value = getLocalDateString();

    document.getElementById('save-btn').textContent = "💾 Save Entry";
    document.getElementById('cancel-edit-btn').classList.add('hidden');

    mainContributor.value = "self";
    mainShare.value = "0";
    syncContributionControls();
}

mainCat.addEventListener('change', syncItemsDropdown);
mainItem.addEventListener('change', () => {
    flyItemDiv.classList.toggle('hidden', mainItem.value !== '__NEW_ITEM__');
});
mainUnit.addEventListener('change', () => {
    flyUnitInput.classList.toggle('hidden', mainUnit.value !== '__NEW_UNIT__');
});
mainContributor.addEventListener('change', syncContributionControls);

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
    if (!category || category === "") validationErrors.push("• Please select or enter a Category.");
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

    const contributor = mainContributor.value;
    const share = parseInt(mainShare.value, 10);

    if (editingEntryId) {

        const index = inventory.findIndex(i => i.id === editingEntryId);

        inventory[index] = {
            ...inventory[index],
            date: finalDate.toISOString(),
            name,
            category,
            qty: finalQty,
            unit,
            amount: finalAmt,
            comment: finalComment,
            contributor,
            share
        };

        editingEntryId = null;
        document.getElementById('save-btn').textContent = "💾 Save Entry";
        document.getElementById('cancel-edit-btn').classList.add('hidden');

    } else {

        inventory.push(createEntry({
            date: finalDate.toISOString(),
            name,
            category,
            qty: finalQty,
            unit,
            amount: finalAmt,
            comment: finalComment,
            contributor,
            share
        }));

    }
    saveInventory();

    document.getElementById('save-btn').textContent = "💾 Save Entry";
    editingEntryId = null;

    e.target.reset();
    mainContributor.value = "self";
    mainShare.value = "0";
    syncContributionControls();
    initDashboardDropdowns();
    document.getElementById('main-date').value = getLocalDateString();
});

function quickLog(type, volumeMl = null) {
    const dateInput = document.getElementById('quick-log-date').value;
    const targetDateStr = dateInput ? dateInput : getLocalDateString();
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

    inventory.push(createEntry({
        date: finalDate.toISOString(),
        name,
        category,
        qty,
        unit,
        amount: cost
    }));
    saveInventory();
}

function logAbsence() {
    const type = document.getElementById('absent-item').value;
    const reason = document.getElementById('absent-reason').value.trim() || "Not Delivered";
    const dateInput = document.getElementById('quick-log-date').value;
    const targetDateStr = dateInput ? dateInput : getLocalDateString();
    const finalDate = new Date(targetDateStr);

    let name = type === 'milk' ? "Milk" : "Newspaper";
    let category = type === 'milk' ? "Dairy" : "Subscribed Bills";
    let unit = type === 'milk' ? "Litre" : "Nos";

    if (isDuplicateEntry(name, finalDate.toISOString())) {
        const proceed = confirm(`⚠️ Duplicate Alert:\n"${name}" has a logged entry for this date. Save absence anyway?`);
        if (!proceed) return;
    }

    inventory.push(createEntry({
        date: finalDate.toISOString(),
        name,
        category,
        qty: 0,
        unit,
        amount: 0,
        status: STATUS.ABSENT,
        comment: reason
    }));
    saveInventory();
    document.getElementById('absent-reason').value = "";
}

function renderDashboardLedger() {
    const container = document.getElementById('dashboard-recent-log');
    if (!container) return;

    if (!inventory || inventory.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic py-2">No transaction entries. Add your first record above!</p>`;
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

        const amtDisplay = isNaN(amtVal) ? "0.00" : formatAmount(amtVal);

        html += `
            <div class="flex justify-between items-center bg-slate-50 border border-slate-200/60 dark:bg-slate-800/50 dark:border-slate-700/60 p-2.5 rounded-xl text-xs">
                <div>
                    <p class="font-bold text-sm text-slate-800 dark:text-slate-200">${nameVal} ${isAbsent ? '<span class="text-red-500 dark:text-red-400 font-semibold">[Absent]</span>' : ''}</p>
                    <p class="text-slate-500 dark:text-slate-400 mt-0.5">${dateDisplay} | ${qtyVal} ${unitVal} ${commentVal ? `(${commentVal})` : ''}</p>
                </div>
                <div class="text-right font-bold text-sm text-slate-700 dark:text-slate-300">
                    <span>₹${amtDisplay}</span>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function loadEntryForEdit(id) {
    const entry = inventory.find(i => i.id === id);
    if (!entry) return;

    editingEntryId = id;

    showScreen('dashboard');

    document.getElementById('main-date').value =
        getLocalDateString(new Date(entry.date));

    mainCat.value = entry.category;
    syncItemsDropdown();

    mainItem.value = entry.name;
    mainQty.value = entry.qty;
    mainUnit.value = entry.unit;

    document.getElementById('main-amt').value = entry.amount;
    document.getElementById('main-comment').value = entry.comment || "";

    // Contribution
    mainContributor.value = entry.contributor || "self";
    syncContributionControls();
    mainShare.value = String(entry.share ?? 0);

    document.getElementById('save-btn').textContent = "💾 Update Entry";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}