function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function generateId() {
    return 'row_' + Date.now() + Math.random().toString(36).substring(2, 6);
}

function formatAmount(value) {
    return Number(value || 0).toFixed(2);
}

function formatDate(dateValue) {
    return new Date(dateValue).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function createEntry(data) {
    return {
        id: generateId(),
        date: data.date,
        name: data.name,
        category: data.category,
        qty: data.qty,
        unit: data.unit || "",
        amount: Number(data.amount || 0),
        status: data.status || STATUS.DELIVERED,
        comment: data.comment || ""
    };
}

function alphabetizeCatalogItems() {
    if (db.items) {
        Object.keys(db.items).forEach(cat => {
            if (Array.isArray(db.items[cat])) {
                db.items[cat].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            }
        });
    }
}

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
    const checkDateStr = getLocalDateString(new Date(targetDateISOString));
    return inventory.some(entry => {
        const entryDateStr = getLocalDateString(new Date(entry.date));
        return entry.name.toLowerCase() === itemName.toLowerCase() && entryDateStr === checkDateStr;
    });
}

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

    // Initialize Default Dates to Today's Local Date
    const today = getLocalDateString();
    if(document.getElementById('main-date')) document.getElementById('main-date').value = today;
    if(document.getElementById('quick-log-date')) document.getElementById('quick-log-date').value = today;

    pullDatabaseFromSheet();
    initDashboardDropdowns(); 
};