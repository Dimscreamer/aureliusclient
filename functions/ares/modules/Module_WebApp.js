/**
 * ГЛАВНЫЙ ВХОД ДЛЯ ВЕБ-ПРИЛОЖЕНИЯ
 */
function doGet(e) {
  // === JSON API ROUTING ===
  if (e && e.parameter && e.parameter.api === 'registry') {
    try {
      var snapshot = getRegistrySnapshot();
      return ContentService.createTextOutput(JSON.stringify(snapshot))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // === DEFAULT HTML WEBAPP ===
  // Auto-register webhook if URL changed (new deployment)
  try {
    var props = PropertiesService.getScriptProperties();
    var lastRegistered = props.getProperty('LAST_WEBHOOK_URL');
    if (lastRegistered !== WEB_APP_URL) {
      setWebhook(WEB_APP_URL);
      props.setProperty('LAST_WEBHOOK_URL', WEB_APP_URL);
      Logger.log('[AUTO-WEBHOOK] Re-registered: ' + WEB_APP_URL);
    }
  } catch(e) {
    Logger.log('[AUTO-WEBHOOK] Error: ' + e.message);
  }

  var template = HtmlService.createTemplateFromFile('Ares_App');
  template.WEB_APP_URL = WEB_APP_URL;
  return template.evaluate()
    .setTitle('ARES OS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ФУНКЦИЯ СОХРАНЕНИЯ РЕЗУЛЬТАТОВ
 * Вызывается из HTML через google.script.run
 */
function saveLabResults(resultsJson) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheet = ss.getSheetByName("Health_Archive");
    const tz = "Europe/Kiev";
    const todayStr = Utilities.formatDate(new Date(), tz, "dd.MM.yyyy");
    const data = sheet.getDataRange().getValues();
    
    let targetRowIndex = -1;
    for (let i = data.length - 1; i >= 1; i--) {
      let dStr = (data[i][0] instanceof Date) ? Utilities.formatDate(data[i][0], tz, "dd.MM.yyyy") : String(data[i][0]).substring(0, 10);
      if (dStr === todayStr) { targetRowIndex = i + 1; break; }
    }
    if (targetRowIndex === -1) targetRowIndex = sheet.getLastRow();

    sheet.getRange(targetRowIndex, 23).setValue(resultsJson); // Пишем в колонку W
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * STUB: handleGenerateImage
 * Зарегистрирован в PROTOCOL_MAP. При необходимости здесь подключить API генерации изображений.
 */
function handleGenerateImage(aresResponse, payload, input, parsedTags) {
  let imgTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (let i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'GENERATE_IMAGE') {
        imgTag = parsedTags[i];
        break;
      }
    }
  }

  let prompt = "";
  let cleanBase = aresResponse;

  if (imgTag) {
    prompt = imgTag.payload.prompt || "";
    cleanBase = aresResponse.replace(imgTag.fullTag, "").trim();
  } else {
    const match = aresResponse.match(/\[\[GENERATE_IMAGE:\s*(.*?)\s*\]\]/i);
    if (!match) return false;
    prompt = match[1].trim();
    cleanBase = aresResponse.replace(match[0], "").trim();
  }

  // Заглушка: функция зарезервирована для будущей интеграции
  Logger.log("[GENERATE_IMAGE] prompt: " + prompt);
  return (cleanBase ? cleanBase + "\n\n" : "") + `🖼️ <i>Генерация изображений пока не подключена.</i> Промт: "${prompt}"`;
}

// ==============================================================================
// 📊 TABLE EDITOR API
// ==============================================================================

function getSheetsList() {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheets = ss.getSheets();
    return sheets.map(s => s.getName());
  } catch (e) {
    Logger.log("Error getSheetsList: " + e.message);
    return [];
  }
}

function getSheetData(sheetName) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { error: "Sheet not found" };
    
    // getDisplayValues returns strings formatted exactly as they appear
    const data = sheet.getDataRange().getDisplayValues();
    return { data: data };
  } catch (e) {
    return { error: e.message };
  }
}

function updateSheetCell(sheetName, rowIndex, colIndex, value) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "Sheet not found" };
    
    // rowIndex and colIndex should be 1-based (passed correctly from frontend)
    sheet.getRange(rowIndex, colIndex).setValue(value);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function addRowToSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, error: "Sheet not found" };
    
    // Append an empty row with a placeholder so getDataRange() picks it up
    const numCols = sheet.getLastColumn() || 1;
    const emptyRow = new Array(numCols).fill("");
    emptyRow[0] = "[Новая]";
    sheet.appendRow(emptyRow);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// CALENDAR WEBAPP API
// ==========================================

function apiGetCalendarMonth(year, month) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    // Use the 1st of the month to the last day of the month
    var start = new Date(year, month, 1);
    var end = new Date(year, month + 1, 0, 23, 59, 59);
    var events = cal.getEvents(start, end);
    
    var datesWithEvents = {};
    for (var i = 0; i < events.length; i++) {
      var d = Utilities.formatDate(events[i].getStartTime(), "Europe/Kyiv", "yyyy-MM-dd");
      datesWithEvents[d] = true;
    }
    return { success: true, dates: Object.keys(datesWithEvents) };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetEventsForDay(dateStr) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var target = new Date(dateStr);
    var events = cal.getEventsForDay(target);
    var result = [];
    for (var i = 0; i < events.length; i++) {
      result.push({
        id: events[i].getId(),
        title: events[i].getTitle(),
        start: Utilities.formatDate(events[i].getStartTime(), "Europe/Kyiv", "HH:mm"),
        end: Utilities.formatDate(events[i].getEndTime(), "Europe/Kyiv", "HH:mm"),
        startRaw: Utilities.formatDate(events[i].getStartTime(), "Europe/Kyiv", "yyyy-MM-dd'T'HH:mm:ss"),
        endRaw: Utilities.formatDate(events[i].getEndTime(), "Europe/Kyiv", "yyyy-MM-dd'T'HH:mm:ss")
      });
    }
    return { success: true, events: result };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiCreateCalendarEvent(title, startStr, endStr) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    cal.createEvent(title, new Date(startStr), new Date(endStr));
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiUpdateCalendarEvent(eventId, title, startStr, endStr) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var ev = cal.getEventById(eventId);
    if (!ev) return { success: false, error: 'Event not found' };
    ev.setTitle(title);
    ev.setTime(new Date(startStr), new Date(endStr));
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiDeleteCalendarEvent(eventId) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var ev = cal.getEventById(eventId);
    if (!ev) return { success: false, error: 'Event not found' };
    ev.deleteEvent();
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function apiGetWebAppUrl() {
  return WEB_APP_URL;
}

// ==========================================
// CONFIG WEBAPP API
// ==========================================

function apiGetConfig() {
  try {
    const props = PropertiesService.getUserProperties().getProperties();
    return { success: true, config: props };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiSaveConfig(configData) {
  try {
    const props = PropertiesService.getUserProperties();
    for (let key in configData) {
      props.setProperty(key, configData[key]);
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// SYSTEM LOGS API
// ==========================================

function apiGetSysLogs() {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('SysLogs');
    
    // Если листа нет, создаем его автоматически
    if (!sheet) {
      setupSysLogsSheet();
      sheet = ss.getSheetByName('SysLogs');
      if (!sheet) return { success: false, error: 'Не удалось создать лист SysLogs' };
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, logs: "Логи пусты." };
    }
    // Берем последние 100 логов
    const startRow = Math.max(2, lastRow - 99);
    const numRows = lastRow - startRow + 1;
    const data = sheet.getRange(startRow, 1, numRows, 3).getDisplayValues();
    
    let logText = "";
    for (let i = 0; i < data.length; i++) {
      logText += `[${data[i][0]}] [${data[i][1]}] ${data[i][2]}\n`;
    }
    
    return { success: true, logs: logText };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiSendLogsToChat() {
  try {
    const res = apiGetSysLogs();
    if (!res.success) return res;
    
    // Отправляем логи как файл (.txt), чтобы избежать лимита Telegram (4096 символов)
    const url = "https://api.telegram.org/bot" + TG_TOKEN + "/sendDocument";
    
    // Создаем текстовый файл
    const blob = Utilities.newBlob(res.logs, "text/plain", "Ares_SysLogs.txt");
    
    const payload = {
      chat_id: String(MY_ID),
      document: blob,
      caption: "🛠 Вот твои системные логи (без обрезаний)"
    };

    const options = {
      method: "post",
      payload: payload, // GAS автоматически сделает multipart/form-data
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      return { success: true };
    } else {
      return { success: false, error: result.description };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiClearSysLogs() {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('SysLogs');
    
    // Если листа нет, создаем его автоматически
    if (!sheet) {
      setupSysLogsSheet();
      sheet = ss.getSheetByName('SysLogs');
      if (!sheet) return { success: false, error: 'Не удалось создать лист SysLogs' };
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// CONSTRUCTOR API (No-Code Module Manager)
// ==========================================

function apiGetModulesList() {
  try {
    const registry = getModuleRegistry();
    let compiledConfig = null;
    if (typeof getAresConfig === 'function') {
      compiledConfig = getAresConfig();
    }
    const modules = [];
    
    for (let key in registry) {
      let mod = registry[key];
      let override = null;
      if (compiledConfig && compiledConfig.modules && compiledConfig.modules[key]) {
        // override = compiledConfig.modules[key] (if it contains override info, we'll merge it in buildConfig)
        override = compiledConfig.modules[key].override;
      }
      
      modules.push({
        id: key,
        factoryEnabled:      mod.factoryEnabled,
        factoryTriggers:     mod.factoryTriggers,
        factoryPrompt:       mod.factoryPrompt,
        customEnabled:       override ? override.enabled : null,
        customPrompt:        override ? override.customPrompt : null,
        customBroadKeywords: override ? (override.triggers ? override.triggers.join(', ') : null) : null,
        protocols:           mod.protocols || [],
        settingsSchema:      mod.settings || [],
        variables:           override ? (override.variables || {}) : {},
        intentsSchema:       mod.intentsSchema || {}
      });
    }
    
    return { success: true, modules: modules };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiSaveModuleConfig(configObj) {
  try {
    const modId = configObj.modId;
    const isEnabled = configObj.isEnabled;
    const customPromptStr = configObj.customPromptStr;
    const broadKeywordsStr = configObj.broadKeywordsStr;
    const variables = configObj.variables || {};

    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('Ares_Config');
    if (!sheet) sheet = setupConfigSheet();
    
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === modId) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) {
      rowIndex = sheet.getLastRow() + 1;
      sheet.getRange(rowIndex, 1).setValue(modId);
    }
    
    sheet.getRange(rowIndex, 2).setValue(isEnabled);
    sheet.getRange(rowIndex, 3).setValue(broadKeywordsStr !== undefined ? (broadKeywordsStr ? broadKeywordsStr.trim() : '') : (data[rowIndex-1] && data[rowIndex-1][2] ? data[rowIndex-1][2] : ''));
    sheet.getRange(rowIndex, 4).setValue(new Date());
    sheet.getRange(rowIndex, 5).setValue(customPromptStr || '');
    sheet.getRange(rowIndex, 6).setValue(Object.keys(variables).length > 0 ? JSON.stringify(variables) : '');
    
    SpreadsheetApp.flush();
    
    if (typeof buildConfig === 'function') {
      buildConfig();
    }

    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiResetModuleConfig(modId) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('Ares_Config');
    if (!sheet) return { success: true }; // Nothing to reset
    
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === modId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
    }
    
    SpreadsheetApp.flush();
    if (typeof buildConfig === 'function') {
      buildConfig();
    }
    
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function apiGetModuleStats(modId) {
  try {
    const ss = SpreadsheetApp.openById(typeof MASTER_DB_ID !== 'undefined' ? MASTER_DB_ID : ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('SysLogs');
    if (!sheet) return { success: true, labels: [], data: [], totalCalls: 0, llmCost: 0 };
    
    const lastRow = sheet.getLastRow();
    if (lastRow === 0) return { success: true, labels: [], data: [], totalCalls: 0, llmCost: 0 };
    
    const startRow = Math.max(1, lastRow - 1000);
    const numRows = lastRow - startRow + 1;
    const data = sheet.getRange(startRow, 1, numRows, 3).getValues();
    
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    
    let labels = [];
    let counts = [0, 0, 0, 0, 0, 0, 0];
    let totalCalls = 0;
    let llmCost = 0;
    
    for (let i = 6; i >= 0; i--) {
      let d = new Date(now.getTime() - i * msInDay);
      let dayStr = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth()+1)).slice(-2);
      labels.push(dayStr);
    }
    
    for (let i = 0; i < data.length; i++) {
      let rowModule = data[i][1];
      if (rowModule !== modId) continue;
      
      let dateStr = data[i][0];
      if (!dateStr) continue;
      
      // Parse "dd.MM.yyyy HH:mm:ss" or Date object
      let rowDate;
      if (dateStr instanceof Date) {
        rowDate = dateStr;
      } else {
        let parts = String(dateStr).split(' ');
        let dParts = parts[0].split('.');
        if (dParts.length < 3) continue;
        rowDate = new Date(dParts[2], parseInt(dParts[1])-1, dParts[0]);
      }
      
      // Zero out time for date diff
      let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let logDay = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
      
      let daysDiff = Math.floor((today.getTime() - logDay.getTime()) / msInDay);
      if (daysDiff >= 0 && daysDiff < 7) {
        counts[6 - daysDiff]++;
      }
      
      totalCalls++;
      
      let message = String(data[i][2]);
      let costMatch = message.match(/Cost\.*\$([0-9.]+)/);
      if (costMatch && costMatch[1]) {
        llmCost += parseFloat(costMatch[1]);
      }
    }
    
    return { 
      success: true, 
      labels: labels, 
      data: counts,
      totalCalls: totalCalls,
      llmCost: llmCost.toFixed(4)
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}