function exportBackup() {

    const backup = {
        version: "7.0",
        exportedAt: new Date().toISOString(),
        inventory,
        db
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    const now = new Date();

    const stamp =
        now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0") + "_" +
        String(now.getHours()).padStart(2, "0") + "-" +
        String(now.getMinutes()).padStart(2, "0");

    a.download =
        `ghar-khata-backup-${stamp}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

function importBackup(file) {

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        try {

            const backup = JSON.parse(e.target.result);

            // Validate backup
            if (!backup.db || !Array.isArray(backup.inventory) ||
                !backup.inventory.every(row => row && typeof row === "object" && !Array.isArray(row)) ||
                !Array.isArray(backup.db.categories)) {
                alert("❌ Invalid Ghar Khata backup.");
                return;
            }

            const exported =
                backup.exportedAt
                    ? new Date(backup.exportedAt).toLocaleString("en-IN")
                    : "Unknown";

            const proceed = confirm(

`Restore this backup?

Exported:
${exported}

Transactions:
${backup.inventory.length}

Categories:
${backup.db.categories.length}

⚠️ This will replace ALL existing local data.

Continue?`

            );

            if (!proceed) return;

            db = normalizeDatabase(backup.db);
            inventory = normalizeInventory(backup.inventory);
            markLocalChange();

            localStorage.setItem(
                STORAGE.CONFIG,
                JSON.stringify(db)
            );

            localStorage.setItem(
                STORAGE.INVENTORY,
                JSON.stringify(inventory)
            );

            alphabetizeCatalogItems();

            initDashboardDropdowns();

            renderSettingsWorkspace();

            renderDashboardLedger();

            triggerCloudPush();

            alert("✅ Backup restored successfully.");

        }

        catch (err) {

            console.error(err);

            alert("❌ Invalid backup file.");

        }

    };

    reader.readAsText(file);

}

document
    .getElementById("btn-export-backup")
    .addEventListener("click", exportBackup);

const restoreInput = document.getElementById("restore-backup-file");

document
    .getElementById("btn-import-backup")
    .addEventListener("click", () => {
        restoreInput.value = "";
        restoreInput.click();
    });

restoreInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        importBackup(e.target.files[0]);
    }
});
