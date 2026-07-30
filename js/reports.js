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
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); 

    let sum = 0;
    let listHtml = "";
    matched.forEach(i => {
        sum += parseFloat(i.amount);
        listHtml += `
            <div class="flex justify-between items-center text-xs py-2.5 border-b border-slate-100 dark:border-slate-700/60 group">
                <div>
                    <p class="font-bold text-sm text-slate-800 dark:text-slate-200">${i.name} ${i.status === 'Absent' ? '<span class="text-red-500 dark:text-red-400 font-semibold">[Absent]</span>' : ''}</p>
                    <p class="text-slate-500 dark:text-slate-400 mt-0.5">${new Date(i.date).toLocaleDateString('en-IN')} | ${i.qty} ${i.unit} ${i.comment ? `(${i.comment})` : ''}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-slate-800 dark:text-slate-200">
                        ₹${formatAmount(i.amount)}
                    </span>

                    <button
                        onclick="loadEntryForEdit('${i.id}')"
                        class="text-blue-500 hover:text-blue-700 font-bold p-1 text-sm"
                        title="Edit">
                        ✏️
                    </button>

                    <button
                        onclick="deleteLedgerRow('${i.id}')"
                        class="text-red-400 hover:text-red-600 font-bold p-1 text-sm"
                        title="Delete">
                        🗑️
                    </button>
                </div>
            </div>`;
    });

    const outBox = document.getElementById('report-output-box');
    outBox.classList.remove('hidden');
    outBox.innerHTML = `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-2xs rounded-xl">
            <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Statement Entries</span>
                <span class="text-sm font-black text-emerald-600 dark:text-emerald-400">Total Spent: ₹${formatAmount(sum)}</span>
            </div>
            <div class="max-h-64 overflow-y-auto pr-1 no-scrollbar space-y-1">${listHtml || '<p class="text-xs italic text-slate-400 dark:text-slate-500 py-2">No transactions recorded.</p>'}</div>
        </div>`;
});

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
// 6. ISOLATED VENDOR STATEMENT SYSTEM (A5 Fit)
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

    let milkItems = [];
    let paperItems = [];
    let totalMilkCost = 0;
    let totalPaperCost = 0;

    matched.forEach(i => {
        const isVendorMilk = i.name.toLowerCase() === 'milk' && String(i.unit).toLowerCase() !== 'packet';
        if (isVendorMilk && (scope === 'both' || scope === 'milk')) {
            milkItems.push(i);
            if (i.status !== 'Absent') totalMilkCost += (parseFloat(i.amount) || 0);
        }
        if (i.name.toLowerCase() === 'newspaper' && (scope === 'both' || scope === 'newspaper')) {
            paperItems.push(i);
            if (i.status !== 'Absent') totalPaperCost += (parseFloat(i.amount) || 0);
        }
    });

    // Single Row Generator for Milk
    const buildMilkRow = (i) => {
        const d = new Date(i.date);
        const cleanDateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        if (i.status === 'Absent') {
            return `<tr class="border-b border-slate-100 text-[9.5px]">
                <td class="py-1 px-1 font-semibold text-slate-900">${cleanDateStr}</td>
                <td class="py-1 px-1 text-center font-semibold text-red-600">0 L</td>
                <td class="py-1 px-1 text-right text-slate-400">-</td>
                <td class="py-1 px-1 text-right font-bold text-red-600 italic">${i.comment || 'Absent'}</td>
            </tr>`;
        }
        const itemQty = parseFloat(i.qty) || 0;
        const itemAmount = parseFloat(i.amount) || 0;
        const singleRate = itemQty > 0 ? (itemAmount / itemQty) : 0;
        return `<tr class="border-b border-slate-100 text-[9.5px]">
            <td class="py-1 px-1 font-semibold text-slate-900">${cleanDateStr}</td>
            <td class="py-1 px-1 text-center font-medium text-slate-800">${itemQty} L</td>
            <td class="py-1 px-1 text-right font-medium text-slate-700">₹${singleRate.toFixed(0)}</td>
            <td class="py-1 px-1 text-right font-bold text-slate-950">₹${itemAmount.toFixed(0)}</td>
        </tr>`;
    };

    // Single Row Generator for Newspaper
    const buildPaperRow = (i) => {
        const d = new Date(i.date);
        const cleanDateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        if (i.status === 'Absent') {
            return `<tr class="border-b border-slate-100 text-[9.5px]">
                <td class="py-1 px-1 font-semibold text-slate-900">${cleanDateStr}</td>
                <td class="py-1 px-1 text-center font-semibold text-red-600">0</td>
                <td class="py-1 px-1 text-right text-slate-400">-</td>
                <td class="py-1 px-1 text-right font-bold text-red-600 italic">${i.comment || 'No Paper'}</td>
            </tr>`;
        }
        const itemQty = parseFloat(i.qty) || 1;
        const itemAmount = parseFloat(i.amount) || 0;
        const singleRate = itemQty > 0 ? (itemAmount / itemQty) : 0;
        return `<tr class="border-b border-slate-100 text-[9.5px]">
            <td class="py-1 px-1 font-semibold text-slate-900">${cleanDateStr}</td>
            <td class="py-1 px-1 text-center font-medium text-slate-800">${itemQty} Pc</td>
            <td class="py-1 px-1 text-right font-medium text-slate-700">₹${singleRate.toFixed(0)}</td>
            <td class="py-1 px-1 text-right font-bold text-slate-950">₹${itemAmount.toFixed(0)}</td>
        </tr>`;
    };

    const renderTable = (rowsHtml) => `
        <table class="w-full text-[9.5px] text-left border-collapse">
            <thead>
                <tr class="border-b-2 border-slate-800 font-bold text-slate-900">
                    <th class="py-0.5 px-1">Date</th>
                    <th class="py-0.5 px-1 text-center">Quantity</th>
                    <th class="py-0.5 px-1 text-right">Rate</th>
                    <th class="py-0.5 px-1 text-right">Amount</th>
                </tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="4" class="py-1 text-center italic text-slate-400">No records found</td></tr>'}</tbody>
        </table>`;

    let finalTablesBlock = "";

    if (scope === 'both' || scope === 'milk') {
        const milkRows = milkItems.map(buildMilkRow).join('');
        finalTablesBlock += `
            <div class="mb-1.5">
                <h4 class="text-[10px] font-black uppercase text-slate-900 border-b border-slate-400 pb-0.5 mb-0.5">
                    🥛 Milk Delivery Statement (Subtotal: ₹${totalMilkCost.toFixed(0)})
                </h4>
                ${renderTable(milkRows)}
            </div>`;
    }

    if (scope === 'both' || scope === 'newspaper') {
        const paperRows = paperItems.map(buildPaperRow).join('');
        finalTablesBlock += `
            <div class="mb-1.5">
                <h4 class="text-[10px] font-black uppercase text-slate-900 border-b border-slate-400 pb-0.5 mb-0.5">
                    📰 Newspaper Delivery Statement (Subtotal: ₹${totalPaperCost.toFixed(0)})
                </h4>
                ${renderTable(paperRows)}
            </div>`;
    }

    const grandTotal = totalMilkCost + totalPaperCost;
    const cleanFrom = formatDate(sDate);
    const cleanTo = formatDate(eDate);

    const outBox = document.getElementById('report-output-box');
    outBox.classList.remove('hidden');
    outBox.innerHTML = `
        <div class="space-y-1 bg-white p-1">
            <div class="flex justify-end no-print mb-2">
                <button onclick="exportInvoicePDF()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-xs">
                    📥 Download / Print A5 Invoice
                </button>
            </div>
            <div style="background-color: #ffffff !important; color: #000000 !important;" class="p-1 border-0 shadow-none">
                <div class="border-b-2 border-slate-900 pb-1 mb-1.5 flex justify-between items-end">
                    <div>
                        <h3 class="text-xs font-black uppercase tracking-wider text-slate-950">📄 Vendor Account Statement</h3>
                        <p class="text-[9px] font-semibold text-slate-600">${cleanFrom} to ${cleanTo}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-[8px] uppercase font-black text-slate-500 block">Total Payable</span>
                        <span class="text-sm font-black text-slate-950">₹${grandTotal.toFixed(0)}</span>
                    </div>
                </div>
                ${finalTablesBlock}
            </div>
        </div>`;
});

window.exportInvoicePDF = async function() {
    const element = document.getElementById('report-output-box');
    if (!element) return;

    const noPrintElements = element.querySelectorAll('.no-print');
    noPrintElements.forEach(el => el.style.display = 'none');

    try {
        const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                const clonedBox = clonedDoc.getElementById('report-output-box');
                if (clonedBox) {
                    clonedBox.style.backgroundColor = '#ffffff';
                    clonedBox.style.color = '#000000';
                    clonedBox.style.border = 'none';
                    clonedBox.style.boxShadow = 'none';
                    
                    const containers = clonedBox.querySelectorAll('*');
                    containers.forEach(child => {
                        child.style.backgroundColor = 'transparent';
                        child.style.color = '#000000';
                        if (!child.tagName.toLowerCase().includes('tr') && 
                            !child.tagName.toLowerCase().includes('th') && 
                            !child.tagName.toLowerCase().includes('td') &&
                            !child.tagName.toLowerCase().includes('h3') &&
                            !child.tagName.toLowerCase().includes('h4')) {
                            child.style.borderColor = 'transparent';
                        }
                    });
                }
            }
        });

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a5'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const imgProps = pdf.getImageProperties(imgData);
        let renderedHeight = (imgProps.height * pdfWidth) / imgProps.width;

        // Cap scaling to ensure content strictly fits on 1 page height
        if (renderedHeight > pdfHeight) {
            renderedHeight = pdfHeight;
        }

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, renderedHeight);
        pdf.save(`Vendor_Invoice_${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (err) {
        console.error("PDF Export Error:", err);
        window.print();
    } finally {
        noPrintElements.forEach(el => el.style.display = '');
    }
};

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
        alertDiv.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic">No items selected for stock tracking inside Settings.</p>`;
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
                <div class="flex justify-between p-2.5 rounded-lg border text-xs font-medium ${theme}">
                    <span>${StrategyTag} <strong>${name}</strong></span>
                    <span>${label}</span>
                </div>`;
        }
    });

    if(!active) {
        alertDiv.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic">All watched pantry items are stable.</p>`;
    }
}