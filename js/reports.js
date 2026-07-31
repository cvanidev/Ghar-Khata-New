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
                repTargetSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
            });
        } else if (val === 'item') {
            const allItems = [];
            Object.values(db.items).forEach(list => {
                list.forEach(i => { if(!allItems.includes(i)) allItems.push(i); });
            });
            allItems.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(item => {
                repTargetSelect.innerHTML += `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`;
            });
        }
    }
});

document.getElementById('btn-generate-rep').addEventListener('click', () => {
    document.getElementById('vendor-bill-scope').disabled = true;
    const sDate = document.getElementById('rep-start').value;
    const eDate = document.getElementById('rep-end').value;
    if(!sDate || !eDate) return alert("Select Date Limits");

    const start = parseLocalDate(sDate).setHours(0,0,0,0);
    const end = parseLocalDate(eDate).setHours(23,59,59,999);
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
                    <p class="font-bold text-sm text-slate-800 dark:text-slate-200">${escapeHtml(i.name)} ${i.status === 'Absent' ? '<span class="text-red-500 dark:text-red-400 font-semibold">[Absent]</span>' : ''}</p>
                    <p class="text-slate-500 dark:text-slate-400 mt-0.5">${new Date(i.date).toLocaleDateString('en-IN')} | ${escapeHtml(i.qty)} ${escapeHtml(i.unit)} ${i.comment ? `(${escapeHtml(i.comment)})` : ''}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-slate-800 dark:text-slate-200">
                        ₹${formatAmount(i.amount)}
                    </span>

                    <button
                        onclick="loadEntryForEdit('${escapeForInlineHandler(i.id)}')"
                        class="text-blue-500 hover:text-blue-700 font-bold p-1 text-sm"
                        title="Edit">
                        ✏️
                    </button>

                    <button
                        onclick="deleteLedgerRow('${escapeForInlineHandler(i.id)}')"
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

document.getElementById('btn-generate-bill').addEventListener('click', () => {
    document.getElementById('vendor-bill-scope').disabled = false;
    const sDate = document.getElementById('rep-start').value;
    const eDate = document.getElementById('rep-end').value;
    const scope = document.getElementById('vendor-bill-scope').value;

    if(!sDate || !eDate) return alert("Select Date Limits");

    const start = parseLocalDate(sDate).setHours(0,0,0,0);
    const end = parseLocalDate(eDate).setHours(23,59,59,999);

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
                <td class="py-1 px-1 text-right font-bold text-red-600 italic">${escapeHtml(i.comment || 'Absent')}</td>
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
                <td class="py-1 px-1 text-right font-bold text-red-600 italic">${escapeHtml(i.comment || 'No Paper')}</td>
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

document.getElementById("btn-generate-contribution")
    .addEventListener("click", generateContributionStatement);

function generateContributionStatement() {

    const from = document.getElementById("contrib-from").value;
    const to = document.getElementById("contrib-to").value;

    if (!from || !to) {
        alert("Please select both From and To dates.");
        return;
    }

    const fromDate = parseLocalDate(from);
    const toDate = parseLocalDate(to);
    toDate.setHours(23, 59, 59, 999);

    const entries = inventory.filter(item => {

        const d = new Date(item.date);

        return (
            d >= fromDate &&
            d <= toDate &&
            item.contributor === "Son"
        );
    });

    if (entries.length === 0) {
        document.getElementById("contribution-report").innerHTML = `
            <p class="text-sm text-slate-500 italic">
                No contribution found for selected period.
            </p>`;
        return;
    }

    // ======================================
    // Group by Item + Contribution %
    // ======================================

    const summary = {};

    let grandPurchase = 0;
    let grandContribution = 0;

    entries.forEach(item => {

        const percent = Number(
            item.contributionPercent ?? item.share ?? 0
        );

        // Milk-50, Milk-100 etc.
        const key = `${item.name}-${percent}`;

        const qty = Number(item.qty || 0);
        const purchase = Number(item.amount || 0);
        const contribution = purchase * percent / 100;

        grandPurchase += purchase;
        grandContribution += contribution;

        if (!summary[key]) {

            summary[key] = {

                item: item.name,
                share: percent,
                qty: 0,
                unit: item.unit || "",
                purchase: 0,
                contribution: 0

            };

        }

        summary[key].qty += qty;
        summary[key].purchase += purchase;
        summary[key].contribution += contribution;

    });

    // ======================================
    // Build Table
    // ======================================

    const today = new Date().toLocaleDateString('en-IN');

    let html = `

    <div class="mb-5 text-center">

        <h2 class="text-xl font-bold">
            GHAR KHATA
        </h2>

        <h3 class="text-lg font-semibold mt-1">
            Son's Contribution Statement
        </h3>

        <div class="text-sm text-slate-500 mt-1">

            Period :
            ${formatDate(fromDate)}
            to
            ${formatDate(toDate)}

        </div>

        <div class="text-xs text-slate-400">

            Generated on ${today}

        </div>

    </div>

    <div class="overflow-x-auto">

    <div class="grid grid-cols-2 gap-3 mb-4">

        <div class="rounded-xl border p-3 bg-slate-50 dark:bg-slate-800">

            <div class="text-xs text-slate-500">
                Total Purchases
            </div>

            <div class="text-xl font-bold">
                ₹${formatAmount(grandPurchase)}
            </div>

        </div>

        <div class="rounded-xl border p-3 bg-emerald-50 dark:bg-emerald-900/20">

            <div class="text-xs text-slate-500">
                Son's Contribution
            </div>

            <div class="text-xl font-bold text-emerald-600">
                ₹${formatAmount(grandContribution)}
            </div>

        </div>

    </div>

    <table class="min-w-full text-xs border border-slate-300 dark:border-slate-700">

    <thead class="bg-slate-100 dark:bg-slate-800">

    <tr>

    <th class="border p-2 text-left">Item</th>

    <th class="border p-2 text-center">Share</th>

    <th class="border p-2 text-right">Qty</th>

    <th class="border p-2 text-right">Purchase</th>

    <th class="border p-2 text-right">Contribution</th>

    </tr>

    </thead>

    <tbody>
    `;

    Object.values(summary)
        .sort((a, b) => {

            if (a.item === b.item) {
                return a.share - b.share;
            }

            return a.item.localeCompare(b.item);

        })
        .forEach(row => {

            html += `

    <tr>

    <td class="border p-2">
    ${escapeHtml(row.item)}
    </td>

    <td class="border p-2 text-center">
    ${row.share}%
    </td>

    <td class="border p-2 text-right">
    ${formatAmount(row.qty)} ${row.unit}
    </td>

    <td class="border p-2 text-right">
    ₹${formatAmount(row.purchase)}
    </td>

    <td class="border p-2 text-right font-semibold text-emerald-600">
    ₹${formatAmount(row.contribution)}
    </td>

    </tr>

    `;

        });

    html += `

    </tbody>

    <tfoot class="bg-slate-100 dark:bg-slate-800 font-bold">

    <tr>

    <td colspan="3" class="border p-2">
    Grand Total
    </td>

    <td class="border p-2 text-right">
    ₹${formatAmount(grandPurchase)}
    </td>

    <td class="border p-2 text-right text-emerald-700 text-base">
    ₹${formatAmount(grandContribution)}
    </td>

    </tr>

    </tfoot>

    </table>

    </div>
    `;

    document.getElementById("contribution-report").innerHTML = html;
}

function printSection(sectionToPrintId) {

    const printableSections = [
        "report-output-box",
        "printable-contribution"
    ];

    printableSections.forEach(id => {

        const el = document.getElementById(id);

        if (!el) return;

        el.style.display = (id === sectionToPrintId)
            ? "block"
            : "none";

    });

    window.print();

    printableSections.forEach(id => {

        const el = document.getElementById(id);

        if (el) el.style.display = "";

    });

}

function printContributionStatement() {
    printSection("printable-contribution");
}

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
    printSection("report-output-box");
}

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
                    <span>${StrategyTag} <strong>${escapeHtml(name)}</strong></span>
                    <span>${label}</span>
                </div>`;
        }
    });

    if(!active) {
        alertDiv.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic">All watched pantry items are stable.</p>`;
    }
}
