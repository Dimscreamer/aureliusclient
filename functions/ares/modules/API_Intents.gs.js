/**
 * ==============================================================================
 * API_Intents.gs.js — INTENT MANAGEMENT API
 * ==============================================================================
 */

function setupIntentsSheet() {
  var ss = SpreadsheetApp.openById(MASTER_DB_ID);
  var sheet = ss.getSheetByName('Ares_Intents');
  if (!sheet) {
    sheet = ss.insertSheet('Ares_Intents');
    var headers = [
      "Module",
      "Function (ID)", 
      "Intent Type", 
      "Exact Match (comma separated)", 
      "Phrase Patterns (comma separated regex)", 
      "Requires Confirmation (TRUE/FALSE)",
      "Enabled (TRUE/FALSE)",
      "Instruction",
      "JSON Format"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9ead3");
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  } else {
    // Make sure 'Instruction' column exists
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Instruction') === -1) {
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Instruction').setFontWeight("bold").setBackground("#d9ead3");
    }
    if (headers.indexOf('JSON Format') === -1) {
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue('JSON Format').setFontWeight("bold").setBackground("#d9ead3");
    }
  }
  return sheet;
}

function getHeaderMap(data) {
  var headers = data[0] || [];
  var hMap = {};
  for (var j = 0; j < headers.length; j++) {
    hMap[headers[j]] = j;
  }
  return hMap;
}

function syncIntentsToCache() {
  try {
    const sheet = setupIntentsSheet();
    const data = sheet.getDataRange().getValues();
    const cache = CacheService.getScriptCache();
    let intentsByModule = {};
    
    if (data.length < 1) return true;
    let hMap = getHeaderMap(data);

    for (let i = 1; i < data.length; i++) {
      let modName = hMap["Module"] !== undefined ? data[i][hMap["Module"]] : null;
      if (!modName) continue;
      
      let enabled = hMap["Enabled (TRUE/FALSE)"] !== undefined ? data[i][hMap["Enabled (TRUE/FALSE)"]] : true;
      if (enabled === false || enabled === 'FALSE' || enabled === 'false') continue;
      
      if (!intentsByModule[modName]) {
        intentsByModule[modName] = [];
      }
      
      intentsByModule[modName].push({
        function: hMap["Function (ID)"] !== undefined ? data[i][hMap["Function (ID)"]] : null,
        type: hMap["Intent Type"] !== undefined ? data[i][hMap["Intent Type"]] : 'action',
        exact: (hMap["Exact Match (comma separated)"] !== undefined && data[i][hMap["Exact Match (comma separated)"]]) ? data[i][hMap["Exact Match (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        patterns: (hMap["Phrase Patterns (comma separated regex)"] !== undefined && data[i][hMap["Phrase Patterns (comma separated regex)"]]) ? data[i][hMap["Phrase Patterns (comma separated regex)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        broad: (hMap["Broad Keywords (comma separated)"] !== undefined && data[i][hMap["Broad Keywords (comma separated)"]]) ? data[i][hMap["Broad Keywords (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        reqConf: hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined ? data[i][hMap["Requires Confirmation (TRUE/FALSE)"]] : false,
        instruction: hMap["Instruction"] !== undefined ? (data[i][hMap["Instruction"]] || '') : '',
        json_format: hMap["JSON Format"] !== undefined ? (data[i][hMap["JSON Format"]] || '') : ''
      });
    }
    
    cache.put('ARES_INTENTS_REGISTRY_V4', JSON.stringify(intentsByModule), 21600); // 6 hours
    return true;
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: Ошибка syncIntentsToCache: ' + e.message);
    return false;
  }
}

function getCachedIntents() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ARES_INTENTS_REGISTRY_V4');
  if (cached) {
    return JSON.parse(cached);
  } else {
    syncIntentsToCache();
    cached = cache.get('ARES_INTENTS_REGISTRY_V4');
    return cached ? JSON.parse(cached) : {};
  }
}

function apiGetIntentsForModule(moduleName) {
  try {
    const sheet = setupIntentsSheet();
    const data = sheet.getDataRange().getValues();
    let intents = [];
    let foundFunctions = new Set();
    
    if (data.length < 1) return { success: true, intents: intents };
    let hMap = getHeaderMap(data);

    for (let i = 1; i < data.length; i++) {
      let mod = hMap["Module"] !== undefined ? data[i][hMap["Module"]] : null;
      if (mod === moduleName) {
        let funcId = hMap["Function (ID)"] !== undefined ? data[i][hMap["Function (ID)"]] : null;
        foundFunctions.add(funcId);
        intents.push({
          rowId: i + 1,
          function: funcId,
          type: hMap["Intent Type"] !== undefined ? data[i][hMap["Intent Type"]] : 'action',
          exact: (hMap["Exact Match (comma separated)"] !== undefined && data[i][hMap["Exact Match (comma separated)"]]) ? data[i][hMap["Exact Match (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          patterns: (hMap["Phrase Patterns (comma separated regex)"] !== undefined && data[i][hMap["Phrase Patterns (comma separated regex)"]]) ? data[i][hMap["Phrase Patterns (comma separated regex)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          broad: (hMap["Broad Keywords (comma separated)"] !== undefined && data[i][hMap["Broad Keywords (comma separated)"]]) ? data[i][hMap["Broad Keywords (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          reqConf: hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined ? data[i][hMap["Requires Confirmation (TRUE/FALSE)"]] : false,
          enabled: hMap["Enabled (TRUE/FALSE)"] !== undefined ? data[i][hMap["Enabled (TRUE/FALSE)"]] : true,
          instruction: hMap["Instruction"] !== undefined ? (data[i][hMap["Instruction"]] || '') : '',
          json_format: hMap["JSON Format"] !== undefined ? (data[i][hMap["JSON Format"]] || '') : ''
        });
      }
    }
    
    // Auto-populate missing protocols from code
    if (typeof getModuleRegistry === 'function') {
      const registry = getModuleRegistry();
      const mod = registry[moduleName];
      let addedNew = false;
      
      if (mod && mod.protocols) {
        let nextRow = sheet.getLastRow() + 1;
        for (let p of mod.protocols) {
          if (!foundFunctions.has(p.tag)) {
            let defExact = (p.defaultExact && Array.isArray(p.defaultExact)) ? p.defaultExact.join(', ') : '';
            let defInst = p.defaultInstruction || '';
            
            if (hMap["Module"] !== undefined) sheet.getRange(nextRow, hMap["Module"] + 1).setValue(moduleName);
            if (hMap["Function (ID)"] !== undefined) sheet.getRange(nextRow, hMap["Function (ID)"] + 1).setValue(p.tag);
            if (hMap["Intent Type"] !== undefined) sheet.getRange(nextRow, hMap["Intent Type"] + 1).setValue('action');
            if (hMap["Exact Match (comma separated)"] !== undefined) sheet.getRange(nextRow, hMap["Exact Match (comma separated)"] + 1).setValue(defExact);
            if (hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined) sheet.getRange(nextRow, hMap["Requires Confirmation (TRUE/FALSE)"] + 1).setValue(false);
            if (hMap["Enabled (TRUE/FALSE)"] !== undefined) sheet.getRange(nextRow, hMap["Enabled (TRUE/FALSE)"] + 1).setValue(true);
            if (hMap["Instruction"] !== undefined) sheet.getRange(nextRow, hMap["Instruction"] + 1).setValue(defInst);
            if (hMap["JSON Format"] !== undefined) sheet.getRange(nextRow, hMap["JSON Format"] + 1).setValue('');
            
            intents.push({
              rowId: nextRow,
              function: p.tag,
              type: 'action',
              exact: defExact ? defExact.split(',').map(s=>s.trim()) : [],
              patterns: [],
              broad: [],
              reqConf: false,
              enabled: true,
              instruction: defInst,
              json_format: ''
            });
            
            nextRow++;
            addedNew = true;
          }
        }
      }
      
      if (addedNew) {
        SpreadsheetApp.flush();
        syncIntentsToCache();
      }
    }
    
    return { success: true, intents: intents };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiSaveIntent(intentData) {
  try {
    const sheet = setupIntentsSheet();
    const data = sheet.getDataRange().getValues();
    let hMap = getHeaderMap(data);
    let rowToUpdate = parseInt(intentData.rowId, 10);
    
    if (isNaN(rowToUpdate) || rowToUpdate <= 0) {
      rowToUpdate = sheet.getLastRow() + 1;
      if (hMap["Module"] !== undefined) sheet.getRange(rowToUpdate, hMap["Module"] + 1).setValue(intentData.module);
    }
    
    if (hMap["Function (ID)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Function (ID)"] + 1).setValue(intentData.function || '');
    if (hMap["Intent Type"] !== undefined) sheet.getRange(rowToUpdate, hMap["Intent Type"] + 1).setValue(intentData.type || 'action');
    if (hMap["Exact Match (comma separated)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Exact Match (comma separated)"] + 1).setValue(intentData.exact ? intentData.exact.join(', ') : '');
    if (hMap["Phrase Patterns (comma separated regex)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Phrase Patterns (comma separated regex)"] + 1).setValue(intentData.patterns || '');
    if (hMap["Broad Keywords (comma separated)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Broad Keywords (comma separated)"] + 1).setValue(intentData.broad ? intentData.broad.join(', ') : '');
    if (hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Requires Confirmation (TRUE/FALSE)"] + 1).setValue(intentData.reqConf !== undefined ? intentData.reqConf : true);
    if (hMap["Enabled (TRUE/FALSE)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Enabled (TRUE/FALSE)"] + 1).setValue(intentData.enabled !== undefined ? intentData.enabled : true);
    if (hMap["Instruction"] !== undefined) sheet.getRange(rowToUpdate, hMap["Instruction"] + 1).setValue(intentData.instruction || '');
    if (hMap["JSON Format"] !== undefined) sheet.getRange(rowToUpdate, hMap["JSON Format"] + 1).setValue(intentData.json_format || '');
    
    SpreadsheetApp.flush();
    syncIntentsToCache();
    if (typeof buildConfig === 'function') {
      buildConfig();
    }
    
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiDeleteIntent(rowId) {
  try {
    const sheet = setupIntentsSheet();
    let rId = parseInt(rowId, 10);
    if (!isNaN(rId) && rId > 1) {
      sheet.deleteRow(rId);
      SpreadsheetApp.flush();
      syncIntentsToCache();
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiGetAllModulesIntents() {
  try {
    const sheet = setupIntentsSheet();
    const data = sheet.getDataRange().getValues();
    let intentsByModule = {};
    let foundFunctions = new Set();
    
    if (data.length < 1) return { success: true, intents: intentsByModule };
    let hMap = getHeaderMap(data);
    
    for (let i = 1; i < data.length; i++) {
      let modName = hMap["Module"] !== undefined ? data[i][hMap["Module"]] : null;
      if (!modName) continue;
      
      if (!intentsByModule[modName]) intentsByModule[modName] = [];
      
      let funcId = hMap["Function (ID)"] !== undefined ? data[i][hMap["Function (ID)"]] : null;
      foundFunctions.add(modName + "_" + funcId);
      
      intentsByModule[modName].push({
        rowId: i + 1,
        function: funcId,
        type: hMap["Intent Type"] !== undefined ? data[i][hMap["Intent Type"]] : 'action',
        exact: (hMap["Exact Match (comma separated)"] !== undefined && data[i][hMap["Exact Match (comma separated)"]]) ? data[i][hMap["Exact Match (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        patterns: (hMap["Phrase Patterns (comma separated regex)"] !== undefined && data[i][hMap["Phrase Patterns (comma separated regex)"]]) ? data[i][hMap["Phrase Patterns (comma separated regex)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        broad: (hMap["Broad Keywords (comma separated)"] !== undefined && data[i][hMap["Broad Keywords (comma separated)"]]) ? data[i][hMap["Broad Keywords (comma separated)"]].toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
        reqConf: hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined ? data[i][hMap["Requires Confirmation (TRUE/FALSE)"]] : false,
        enabled: hMap["Enabled (TRUE/FALSE)"] !== undefined ? data[i][hMap["Enabled (TRUE/FALSE)"]] : true,
        instruction: hMap["Instruction"] !== undefined ? (data[i][hMap["Instruction"]] || '') : '',
        json_format: hMap["JSON Format"] !== undefined ? (data[i][hMap["JSON Format"]] || '') : ''
      });
    }
    
    // Auto-populate missing from code
    if (typeof getModuleRegistry === 'function') {
      const registry = getModuleRegistry();
      let addedNew = false;
      let nextRow = sheet.getLastRow() + 1;
      
      for (let moduleName in registry) {
        const mod = registry[moduleName];
        if (mod && mod.protocols) {
          if (!intentsByModule[moduleName]) intentsByModule[moduleName] = [];
          
          for (let p of mod.protocols) {
            let key = moduleName + "_" + p.tag;
            if (!foundFunctions.has(key)) {
              let defExact = (p.defaultExact && Array.isArray(p.defaultExact)) ? p.defaultExact.join(', ') : '';
              let defInst = p.defaultInstruction || '';
              
              if (hMap["Module"] !== undefined) sheet.getRange(nextRow, hMap["Module"] + 1).setValue(moduleName);
              if (hMap["Function (ID)"] !== undefined) sheet.getRange(nextRow, hMap["Function (ID)"] + 1).setValue(p.tag);
              if (hMap["Intent Type"] !== undefined) sheet.getRange(nextRow, hMap["Intent Type"] + 1).setValue('action');
              if (hMap["Exact Match (comma separated)"] !== undefined) sheet.getRange(nextRow, hMap["Exact Match (comma separated)"] + 1).setValue(defExact);
              if (hMap["Requires Confirmation (TRUE/FALSE)"] !== undefined) sheet.getRange(nextRow, hMap["Requires Confirmation (TRUE/FALSE)"] + 1).setValue(false);
              if (hMap["Enabled (TRUE/FALSE)"] !== undefined) sheet.getRange(nextRow, hMap["Enabled (TRUE/FALSE)"] + 1).setValue(true);
              if (hMap["Instruction"] !== undefined) sheet.getRange(nextRow, hMap["Instruction"] + 1).setValue(defInst);
              if (hMap["JSON Format"] !== undefined) sheet.getRange(nextRow, hMap["JSON Format"] + 1).setValue('');
              
              intentsByModule[moduleName].push({
                rowId: nextRow,
                function: p.tag,
                type: 'action',
                exact: defExact ? defExact.split(',').map(s=>s.trim()).filter(s=>s) : [],
                patterns: [],
                broad: [],
                reqConf: false,
                enabled: true,
                instruction: defInst,
                json_format: ''
              });
              
              nextRow++;
              addedNew = true;
            }
          }
        }
      }
      
      if (addedNew) {
        SpreadsheetApp.flush();
        syncIntentsToCache();
      }
    }
    
    return { success: true, intents: intentsByModule };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiSyncAllIntents(payload) {
  try {
    const sheet = setupIntentsSheet();
    const data = sheet.getDataRange().getValues();
    let hMap = getHeaderMap(data);
    
    const intents = payload.intents;
    const broadKeywords = payload.broadKeywords; // { modId: "keywords" }
    
    // 1. Sync Intents to Sheet
    if (intents && intents.length > 0) {
      for (let i = 0; i < intents.length; i++) {
        const intentData = intents[i];
        let rowToUpdate = parseInt(intentData.rowId, 10);
        
        if (isNaN(rowToUpdate) || rowToUpdate <= 0) {
          rowToUpdate = sheet.getLastRow() + 1;
          if (hMap["Module"] !== undefined) sheet.getRange(rowToUpdate, hMap["Module"] + 1).setValue(intentData.module);
        }
        
        if (hMap["Function (ID)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Function (ID)"] + 1).setValue(intentData.function || '');
        if (hMap["Intent Type"] !== undefined) sheet.getRange(rowToUpdate, hMap["Intent Type"] + 1).setValue(intentData.type || 'action');
        if (hMap["Exact Match (comma separated)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Exact Match (comma separated)"] + 1).setValue(intentData.exact ? intentData.exact.join(', ') : '');
        if (hMap["Phrase Patterns (comma separated regex)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Phrase Patterns (comma separated regex)"] + 1).setValue(intentData.patterns ? intentData.patterns.join(', ') : '');
        if (hMap["Broad Keywords (comma separated)"] !== undefined) sheet.getRange(rowToUpdate, hMap["Broad Keywords (comma separated)"] + 1).setValue(intentData.broad ? intentData.broad.join(', ') : '');
        
        if (intentData.instruction !== undefined && hMap["Instruction"] !== undefined) sheet.getRange(rowToUpdate, hMap["Instruction"] + 1).setValue(intentData.instruction || '');
        if (intentData.json_format !== undefined && hMap["JSON Format"] !== undefined) sheet.getRange(rowToUpdate, hMap["JSON Format"] + 1).setValue(intentData.json_format || '');
      }
    }
    
    SpreadsheetApp.flush();
    syncIntentsToCache();
    
    // 2. Sync Broad Keywords to Settings (Ares_Config)
    if (broadKeywords) {
      const ss = SpreadsheetApp.openById(typeof MASTER_DB_ID !== 'undefined' ? MASTER_DB_ID : ADS_DATA_SHEET_ID);
      let configSheet = ss.getSheetByName('Ares_Config');
      if (!configSheet) {
        if (typeof setupConfigSheet === 'function') configSheet = setupConfigSheet();
        else {
          configSheet = ss.insertSheet('Ares_Config');
          configSheet.getRange(1, 1, 1, 6).setValues([["Module_Name", "Enabled", "Triggers", "Last_Updated", "Custom_Prompt", "Custom_Protocols"]]).setFontWeight("bold");
        }
      }
      let configData = configSheet.getDataRange().getValues();
      
      for (let modId in broadKeywords) {
        let rowIndex = -1;
        for (let i = 1; i < configData.length; i++) {
          if (configData[i][0] === modId) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) {
          rowIndex = configSheet.getLastRow() + 1;
          configSheet.getRange(rowIndex, 1).setValue(modId);
          configSheet.getRange(rowIndex, 2).setValue(true); // default enabled
        }
        configSheet.getRange(rowIndex, 3).setValue(broadKeywords[modId]);
        configSheet.getRange(rowIndex, 4).setValue(new Date());
      }
    }
    
    // 3. Rebuild Config
    if (typeof buildConfig === 'function') {
      buildConfig();
    }
    
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
