function ARES_INSTALL_NEW_MODULES_FAST() {
  try {
    var dbId = (typeof MASTER_DB_ID !== 'undefined') ? MASTER_DB_ID : (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
    if (!dbId) return { success: false, error: "Не найден ID базы данных" };
    
    var ss = SpreadsheetApp.openById(dbId);
    
    // --- ПАРСЕР ---
    var channels = ss.getSheetByName('Ares_Parser_Channels');
    if (!channels) channels = ss.insertSheet('Ares_Parser_Channels');
    if (channels.getLastRow() === 0) {
      channels.appendRow(["Channel URL", "Keywords", "Action", "Description", "Enabled"]);
      channels.getRange("A1:E1").setFontWeight("bold").setBackground("#cfe2f3");
      channels.setFrozenRows(1);
      channels.appendRow(["https://t.me/s/flamingo_news", "фламинго, ракета", "FORWARD", "Пример пересылки", "FALSE"]);
      channels.appendRow(["https://t.me/s/military_ua", "война, мир", "STATS", "Пример статистики", "FALSE"]);
    }

    var stats = ss.getSheetByName('Ares_Parser_Stats');
    if (!stats) stats = ss.insertSheet('Ares_Parser_Stats');
    if (stats.getLastRow() === 0) {
      stats.appendRow(["Date", "Keyword", "Count"]);
      stats.getRange("A1:C1").setFontWeight("bold").setBackground("#cfe2f3");
      stats.setFrozenRows(1);
    }

    var processed = ss.getSheetByName('Ares_Parser_Processed');
    if (!processed) processed = ss.insertSheet('Ares_Parser_Processed');
    if (processed.getLastRow() === 0) {
      processed.appendRow(["Channel URL", "LastProcessedTime"]);
      processed.getRange("A1:B1").setFontWeight("bold").setBackground("#cfe2f3");
      processed.setFrozenRows(1);
    }

    // --- ДУМСКРОЛЛ ---
    var topics = ss.getSheetByName('Ares_Doomscroll_Topics');
    if (!topics) topics = ss.insertSheet('Ares_Doomscroll_Topics');
    if (topics.getLastRow() === 0) {
      topics.appendRow(["Topic", "Source URL", "Enabled", "LastDelivered"]);
      topics.getRange("A1:D1").setFontWeight("bold").setBackground("#d9d2e9");
      topics.setFrozenRows(1);
      topics.appendRow(["Technology", "https://www.reddit.com/r/technology/top.json?t=day&limit=3", "FALSE", ""]);
      topics.appendRow(["UpliftingNews", "https://www.reddit.com/r/UpliftingNews/top.json?t=day&limit=3", "FALSE", ""]);
    }

    SpreadsheetApp.flush();

    // --- ТРИГГЕРЫ ---
    var triggers = ScriptApp.getProjectTriggers();
    var existing = triggers.map(function(t) { return t.getHandlerFunction(); });

    if (existing.indexOf('runTelegramParser') === -1) {
      ScriptApp.newTrigger('runTelegramParser').timeBased().everyMinutes(15).create();
    }

    if (existing.indexOf('runAntiDoomscrollDelivery') === -1) {
      ScriptApp.newTrigger('runAntiDoomscrollDelivery').timeBased().everyHours(1).create();
    }
    
    return { success: true, message: "Вкладки и триггеры успешно созданы!" };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
