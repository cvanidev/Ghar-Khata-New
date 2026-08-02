const SECRET_TOKEN = "Sat-Chit-Anand"; 
const SPREADSHEET_ID = "1M8XJHm0cSxrumZR9r-CV-SKKZAGG9hstwmBrUeLwlhA";
const LEDGER_SHEET = "Ledger";
const CONFIG_SHEET = "Config";

// Read both Inventory and Configurations from Google Sheets
function doGet(e) {
  const clientToken = e.parameter.token;
  if (clientToken !== SECRET_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Unauthorized access" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Fetch Ledger Data
    const ledgerSheet = ss.getSheetByName(LEDGER_SHEET);
    const ledgerRows = ledgerSheet.getDataRange().getValues();
    const inventoryData = [];
    
    if (ledgerRows.length > 1) {
      const headers = ledgerRows[0];
      for (let i = 1; i < ledgerRows.length; i++) {
        let rowData = {};
        headers.forEach((header, index) => {
          let val = ledgerRows[i][index];
          if (header.toLowerCase() === 'date' && val instanceof Date) {
            val = val.toISOString();
          }
          rowData[header.trim().toLowerCase()] = val;
        });

        rowData.share = Number(rowData.contributionpercent || 0);
        inventoryData.push(rowData);
      }
    }

    // 2. Fetch App Configuration Data
    const configSheet = ss.getSheetByName(CONFIG_SHEET);
    const configRaw = configSheet.getRange(1, 1).getValue();
    let parsedConfig = null;
    if (configRaw) {
      try {
        parsedConfig = JSON.parse(configRaw);
      } catch (err) {
        // Fallback if empty or corrupted JSON
        parsedConfig = null;
      }
    }

    // Send unified object package down to frontend
    return createJsonResponse({
      inventory: inventoryData,
      config: parsedConfig
    });
    
  } catch (error) {
    return createJsonResponse({ error: error.toString() });
  }
}

// Write/Sync Unified State from Frontend to Sheets
function doPost(e) {
  const clientToken = e.parameter.token;
  if (clientToken !== SECRET_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Unauthorized access" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. Process Configurations Sync (Cell A1 Save)
    if (payload.config) {
      const configSheet = ss.getSheetByName(CONFIG_SHEET);
      configSheet.clearContents(); // Clear old configurations
      configSheet.getRange(1, 1).setValue(JSON.stringify(payload.config));
    }
    
    // 2. Process Ledger Transactions Sync
    if (payload.inventory && Array.isArray(payload.inventory)) {
      const ledgerSheet = ss.getSheetByName(LEDGER_SHEET);
      
      // Clear rows below the header
      if (ledgerSheet.getLastRow() > 1) {
        ledgerSheet.getRange(2, 1, ledgerSheet.getLastRow() - 1, ledgerSheet.getLastColumn()).clearContent();
      }
      
      if (payload.inventory.length > 0) {
        Logger.log(JSON.stringify(payload.inventory[0]));
        const rowsToAppend = payload.inventory.map(item => [
          item.id,
          new Date(item.date),
          item.name,
          item.category || item.cat || "",
          parseFloat(item.qty) || 0,
          item.unit || "",
          parseFloat(item.amount) || 0,
          item.status || "Delivered",
          item.comment || "",
          item.contributor || "Self",
          item.share ?? 0
        ]);
        
        ledgerSheet.getRange(2, 1, rowsToAppend.length, 11).setValues(rowsToAppend);
      }
    }
    
    return createJsonResponse({ status: "success" });
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}