/**
 * ==============================================================================
 * 🛠 API_ConfigCompiler.gs.js — NO-CODE CONFIG COMPILER
 * ==============================================================================
 * Этот файл отвечает за чтение таблиц конфигурации из Google Sheets 
 * и их "компиляцию" в единый кэшированный JSON-файл (ares.config.json), 
 * чтобы Арес мог работать молниеносно без запросов к таблицам во время Runtime.
 */

function setupConfigSheets() {
  var ss = SpreadsheetApp.openById(MASTER_DB_ID);
  
  // 1. Ares_Modules
  var sheetModules = ss.getSheetByName('Ares_Modules');
  if (!sheetModules) {
    sheetModules = ss.insertSheet('Ares_Modules');
    var headers = ["Module ID", "Enabled", "Priority", "Session Timeout", "Allow Override", "Allow Fallback", "Custom Prompt"];
    sheetModules.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9ead3");
    sheetModules.setFrozenRows(1);
  }

  // 2. Ares_Intents (Убедимся, что есть все колонки)
  var sheetIntents = ss.getSheetByName('Ares_Intents');
  if (!sheetIntents) {
    sheetIntents = ss.insertSheet('Ares_Intents');
    var intHeaders = [
      "Module", "Function (ID)", "Intent Type", "Exact Match (comma separated)", 
      "Phrase Patterns (comma separated regex)", "Broad Keywords (comma separated)", 
      "Requires Confirmation (TRUE/FALSE)", "Enabled (TRUE/FALSE)", 
      "Instruction", "JSON Format", "Negative", "Weight", "Priority"
    ];
    sheetIntents.getRange(1, 1, 1, intHeaders.length).setValues([intHeaders]).setFontWeight("bold").setBackground("#d9ead3");
    sheetIntents.setFrozenRows(1);
  } else {
    var headers = sheetIntents.getRange(1, 1, 1, sheetIntents.getLastColumn()).getValues()[0];
    if (headers.indexOf('Negative') === -1) {
      sheetIntents.getRange(1, headers.length + 1).setValue('Negative').setFontWeight("bold").setBackground("#d9ead3");
      sheetIntents.getRange(1, headers.length + 2).setValue('Weight').setFontWeight("bold").setBackground("#d9ead3");
      sheetIntents.getRange(1, headers.length + 3).setValue('Priority').setFontWeight("bold").setBackground("#d9ead3");
    }
  }

  // 3. Ares_Protocols
  var sheetProtocols = ss.getSheetByName('Ares_Protocols');
  if (!sheetProtocols) {
    sheetProtocols = ss.insertSheet('Ares_Protocols');
    var protHeaders = ["Module", "Tag", "Description", "Handler Name", "Enabled"];
    sheetProtocols.getRange(1, 1, 1, protHeaders.length).setValues([protHeaders]).setFontWeight("bold").setBackground("#d9ead3");
    sheetProtocols.setFrozenRows(1);
  }

  // 4. Ares_Feature_Flags
  var sheetFlags = ss.getSheetByName('Ares_Feature_Flags');
  if (!sheetFlags) {
    sheetFlags = ss.insertSheet('Ares_Feature_Flags');
    var flagHeaders = ["Flag Name", "Value", "Description"];
    sheetFlags.getRange(1, 1, 1, flagHeaders.length).setValues([flagHeaders]).setFontWeight("bold").setBackground("#d9ead3");
    sheetFlags.setFrozenRows(1);
  }
}

/**
 * 🚀 buildConfig() — Компилирует все таблицы в ares.config.json и кладет в кэш.
 * Запускать вручную из меню Ареса или по кнопке "Опубликовать".
 */
function buildConfig() {
  var ss = SpreadsheetApp.openById(MASTER_DB_ID);
  var config = {
    modules: {},
    intents: [],
    protocols: {},
    flags: {},
    buildTime: new Date().getTime()
  };

  try {
    // === 1. Parse Modules ===
    var sheetModules = ss.getSheetByName('Ares_Modules');
    if (sheetModules) {
      var data = sheetModules.getDataRange().getValues();
      var headers = data[0];
      for (var i = 1; i < data.length; i++) {
        var modId = data[i][0];
        if (!modId) continue;
        config.modules[modId] = {
          enabled: data[i][1] === true || data[i][1] === 'TRUE',
          priority: parseInt(data[i][2]) || 0,
          sessionTimeout: parseInt(data[i][3]) || 5,
          allowOverride: data[i][4] === true || data[i][4] === 'TRUE',
          allowFallback: data[i][5] === true || data[i][5] === 'TRUE',
          customPrompt: data[i][6] || ""
        };
      }
    }

    // === 1.5 Parse Ares_Config ===
    var sheetConfig = ss.getSheetByName('Ares_Config');
    if (sheetConfig) {
      var data = sheetConfig.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var modId = data[i][0];
        if (!modId) continue;
        
        var isEnabled = data[i][1] === true || data[i][1] === 'TRUE' || data[i][1] === 1;
        var triggersStr = data[i][2] || '';
        var customPrompt = data[i][4] || '';
        
        if (!config.modules[modId]) {
          config.modules[modId] = {
            enabled: isEnabled,
            priority: 0,
            sessionTimeout: 5,
            allowOverride: true,
            allowFallback: true,
            customPrompt: customPrompt
          };
        } else {
          config.modules[modId].enabled = isEnabled;
          if (customPrompt) config.modules[modId].customPrompt = customPrompt;
        }
        
        // Parse triggers
        config.modules[modId].triggers = triggersStr ? triggersStr.toString().split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
      }
    }

    // === 2. Parse Intents ===
    var sheetIntents = ss.getSheetByName('Ares_Intents');
    if (sheetIntents) {
      var data = sheetIntents.getDataRange().getValues();
      var headers = data[0];
      
      // Index mapping
      var hMap = {};
      for (var j = 0; j < headers.length; j++) {
        hMap[headers[j]] = j;
      }

      for (var i = 1; i < data.length; i++) {
        var enabled = data[i][hMap["Enabled (TRUE/FALSE)"]];
        if (enabled === false || enabled === 'FALSE') continue;

        var exactStr = data[i][hMap["Exact Match (comma separated)"]] || '';
        var pattStr = data[i][hMap["Phrase Patterns (comma separated regex)"]] || '';
        var broadStr = data[i][hMap["Broad Keywords (comma separated)"]] || '';
        var negStr = data[i][hMap["Negative"]] || '';

        config.intents.push({
          module: data[i][hMap["Module"]],
          function: data[i][hMap["Function (ID)"]],
          type: data[i][hMap["Intent Type"]],
          exact: exactStr ? exactStr.toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          patterns: pattStr ? pattStr.toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          broad: broadStr ? broadStr.toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          negative: negStr ? negStr.toString().split(',').map(s=>s.trim()).filter(s=>s.length>0) : [],
          reqConf: data[i][hMap["Requires Confirmation (TRUE/FALSE)"]],
          instruction: data[i][hMap["Instruction"]] || "",
          jsonFormat: data[i][hMap["JSON Format"]] || "",
          weight: parseInt(data[i][hMap["Weight"]]) || 1,
          priority: parseInt(data[i][hMap["Priority"]]) || 0
        });
      }
    }

    // === 3. Parse Protocols ===
    var sheetProtocols = ss.getSheetByName('Ares_Protocols');
    if (sheetProtocols) {
      var data = sheetProtocols.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var modId = data[i][0];
        var tag = data[i][1];
        var enabled = data[i][4];
        if (!modId || !tag || enabled === false || enabled === 'FALSE') continue;
        
        if (!config.protocols[modId]) config.protocols[modId] = [];
        config.protocols[modId].push({
          tag: tag,
          description: data[i][2] || "",
          handlerName: data[i][3] || ""
        });
      }
    }

    // === 4. Parse Feature Flags ===
    var sheetFlags = ss.getSheetByName('Ares_Feature_Flags');
    if (sheetFlags) {
      var data = sheetFlags.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var flagName = data[i][0];
        if (!flagName) continue;
        config.flags[flagName] = data[i][1];
      }
    }

    // === 5. Parse Ares_Config (User Overrides) ===
    var sheetConfig = ss.getSheetByName('Ares_Config');
    if (sheetConfig) {
      var data = sheetConfig.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var modName = data[i][0];
        if (!modName) continue;
        
        var override = {
          enabled: data[i][1] === true || data[i][1] === 'TRUE',
          triggers: data[i][2] ? data[i][2].toString().split(',').map(s => s.trim()).filter(s => s.length > 0) : null,
          customPrompt: data[i][4] ? data[i][4].toString().trim() : null,
          variables: {}
        };
        
        try {
          if (data[i][5]) { // Column F (6)
            override.variables = JSON.parse(data[i][5].toString());
          }
        } catch(e) {
          if (typeof sysLog !== 'undefined') sysLog('⚠️ [CONFIG_COMPILER] Ошибка парсинга Variables_JSON для ' + modName);
        }
        
        if (config.modules[modName]) {
          config.modules[modName].override = override;
        } else {
          // Module not in Ares_Modules but is in Ares_Config?
          config.modules[modName] = { override: override };
        }
      }
    }

    // Сохраняем в Cache и Properties (бэкап)
    var jsonString = JSON.stringify(config);
    CacheService.getScriptCache().put('ARES_CONFIG_V1', jsonString, 21600);
    
    // PropertiesService has 100KB limit per property, so we might need to chunk it if it's too big.
    // For now, assume it fits or try-catch it.
    try {
      PropertiesService.getScriptProperties().setProperty('ARES_CONFIG_V1', jsonString);
    } catch(err) {
      if (typeof sysLog !== 'undefined') sysLog('⚠️ [CONFIG_COMPILER] Конфиг слишком большой для PropertiesService. Используется только CacheService.');
    }

    if (typeof sysLog !== 'undefined') sysLog('✅ [CONFIG_COMPILER] Конфигурация успешно скомпилирована! Размеры: ' + jsonString.length + ' байт.');
    return { success: true, message: 'Configuration built successfully', size: jsonString.length };

  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog('❌ [CONFIG_COMPILER_ERROR] ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 🚀 getAresConfig() — Быстрое получение скомпилированного конфига
 */
function getAresConfig() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ARES_CONFIG_V1');
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Фолбэк на PropertiesService
  var props = PropertiesService.getScriptProperties().getProperty('ARES_CONFIG_V1');
  if (props) {
    // Восстанавливаем кэш
    cache.put('ARES_CONFIG_V1', props, 21600);
    return JSON.parse(props);
  }

  // Если вообще пусто, пытаемся скомпилировать
  buildConfig();
  var fresh = cache.get('ARES_CONFIG_V1');
  return fresh ? JSON.parse(fresh) : null;
}

/**
 * Синхронизирует старые данные из таблицы Ares_Config в кэш (ScriptProperties).
 * Оставлено для обратной совместимости с 3_Router.js.
 */
function syncConfigToCache() {
  try {
    var ss = SpreadsheetApp.openById(MASTER_DB_ID || ADS_DATA_SHEET_ID);
    var sheet = ss.getSheetByName('Ares_Config');
    if (!sheet) return false;
    
    const data = sheet.getDataRange().getValues();
    const props = PropertiesService.getScriptProperties();
    
    // Сначала очищаем старый кэш модулей, чтобы удаленные (сброшенные) настройки стерлись
    const allProps = props.getProperties();
    for (let key in allProps) {
      if (key.startsWith('MODULE_CFG_')) {
        props.deleteProperty(key);
      }
    }
    
    // Записываем новые
    for (let i = 1; i < data.length; i++) {
      let modName = data[i][0];
      let enabled = data[i][1];
      let triggers = data[i][2];
      let customPrompt = data[i][4]; // Колонка E
      let customProtocolsRaw = data[i][5]; // Колонка F
      
      let customProtocols = {};
      try {
        if (customProtocolsRaw) {
          customProtocols = JSON.parse(customProtocolsRaw);
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('⚠️ Ошибка парсинга Custom_Protocols для ' + modName);
      }
      
      if (modName) {
        let cfg = {
          enabled: (enabled === true || enabled === 'TRUE' || enabled === 'true'),
          triggers: triggers ? triggers.toString().split(',').map(s => s.trim()).filter(s => s.length > 0) : null,
          customPrompt: customPrompt ? customPrompt.toString().trim() : null,
          customProtocols: Object.keys(customProtocols).length > 0 ? customProtocols : null
        };
        props.setProperty('MODULE_CFG_' + modName, JSON.stringify(cfg));
      }
    }
    return true;
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: Ошибка syncConfigToCache: ' + e.message);
    return false;
  }
}
