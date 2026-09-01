/**
 * ==============================================================================
 * 📡 MODULE PARSER
 * Парсинг Telegram-каналов по ключевым словам. Действия: FORWARD и STATS.
 * ==============================================================================
 */

function ARES_INSTALL_PARSER(ss) {
  var channels = ss.getSheetByName('Ares_Parser_Channels');
  if (!channels) {
    channels = ss.insertSheet('Ares_Parser_Channels');
    channels.appendRow(["Channel URL", "Keywords", "Action", "Description", "Enabled"]);
    channels.getRange("A1:E1").setFontWeight("bold").setBackground("#cfe2f3");
    channels.setFrozenRows(1);
    channels.appendRow(["https://t.me/s/flamingo_news", "фламинго, ракета", "FORWARD", "Пример пересылки", "FALSE"]);
    channels.appendRow(["https://t.me/s/military_ua", "война, мир", "STATS", "Пример статистики", "FALSE"]);
  }

  var stats = ss.getSheetByName('Ares_Parser_Stats');
  if (!stats) {
    stats = ss.insertSheet('Ares_Parser_Stats');
    stats.appendRow(["Date", "Keyword", "Count"]);
    stats.getRange("A1:C1").setFontWeight("bold").setBackground("#cfe2f3");
    stats.setFrozenRows(1);
  }

  var processed = ss.getSheetByName('Ares_Parser_Processed');
  if (!processed) {
    processed = ss.insertSheet('Ares_Parser_Processed');
    processed.appendRow(["Channel URL", "LastProcessedTime"]);
    processed.getRange("A1:B1").setFontWeight("bold").setBackground("#cfe2f3");
    processed.setFrozenRows(1);
  }
}

function runTelegramParser() {
  try {
    var dbId = (typeof MASTER_DB_ID !== 'undefined') ? MASTER_DB_ID : (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
    if (!dbId) return;
    
    var ss = SpreadsheetApp.openById(dbId);
    var channelsSheet = ss.getSheetByName('Ares_Parser_Channels');
    var statsSheet = ss.getSheetByName('Ares_Parser_Stats');
    var processedSheet = ss.getSheetByName('Ares_Parser_Processed');
    
    if (!channelsSheet || !statsSheet || !processedSheet) return;

    var channelsData = channelsSheet.getDataRange().getValues();
    var processedData = processedSheet.getDataRange().getValues();
    
    // Build map of processed times
    var processedMap = {};
    for (var i = 1; i < processedData.length; i++) {
      processedMap[processedData[i][0]] = new Date(processedData[i][1]).getTime() || 0;
    }

    var now = new Date();
    var todayStr = Utilities.formatDate(now, TIME_ZONE || "Europe/Kiev", "dd.MM.yyyy");

    for (var i = 1; i < channelsData.length; i++) {
      var url = channelsData[i][0];
      var kwStr = channelsData[i][1];
      var action = channelsData[i][2];
      var enabled = channelsData[i][4];
      
      if (enabled !== true && enabled !== 'TRUE' && enabled !== 'true') continue;
      if (!url || !kwStr) continue;

      var keywords = kwStr.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(function(k) { return k; });
      if (keywords.length === 0) continue;

      var lastTime = processedMap[url] || (now.getTime() - 24*3600*1000); // look back max 24 hours if new
      var newLastTime = lastTime;

      try {
        var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        if (response.getResponseCode() !== 200) continue;
        
        var html = response.getContentText();
        html = html.replace(/&#33;/g, '!').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
        var msgBlocks = html.match(/<div class="tgme_widget_message_wrap[\s\S]*?<\/time>/g) || [];
        
        for (var j = 0; j < msgBlocks.length; j++) {
          var block = msgBlocks[j];
          var timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/i);
          if (!timeMatch) continue;
          
          var msgTimeObj = new Date(timeMatch[1]);
          var msgTime = msgTimeObj.getTime();
          
          if (msgTime <= lastTime) continue; // Already processed
          if (msgTime > newLastTime) newLastTime = msgTime; // Update max time
          
          var textMatch = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
          if (!textMatch) continue;
          
          var text = textMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
          var lowerText = text.toLowerCase();
          
          // Check keywords
          for (var k = 0; k < keywords.length; k++) {
            var keyword = keywords[k];
            if (lowerText.includes(keyword)) {
              if (action === 'FORWARD') {
                if (typeof sendText !== 'undefined') {
                  sendText(MY_ID, "📡 <b>ПАРСИНГ:</b> " + url + "\nКлюч: <i>" + keyword + "</i>\n\n" + text, "HTML");
                }
              } else if (action === 'STATS') {
                // Update stats
                _updateParserStat(statsSheet, todayStr, keyword);
              }
            }
          }
        }
        
        // Save new last time
        _updateProcessedTime(processedSheet, url, new Date(newLastTime).toISOString());
        
      } catch(e) {
        if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка парсинга " + url + ": " + e.message);
      }
    }
    
  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка runTelegramParser: " + e.message);
  }
}

function _updateParserStat(sheet, dateStr, keyword) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == dateStr && data[i][1] == keyword) {
      var current = parseInt(data[i][2], 10) || 0;
      sheet.getRange(i + 1, 3).setValue(current + 1);
      return;
    }
  }
  sheet.appendRow([dateStr, keyword, 1]);
}

function _updateProcessedTime(sheet, url, timeStr) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == url) {
      sheet.getRange(i + 1, 2).setValue(timeStr);
      return;
    }
  }
  sheet.appendRow([url, timeStr]);
}

function handleParserResponse(aresResponse, parsedTags, ctx) {
  let updatedResponse = aresResponse;
  let results = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'PARSER_RUN') {
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [MODULE_INTENT] → Запуск парсера');
        runTelegramParser();
        results.push(`✅ <b>ПАРСЕР:</b> Проверка завершена.`);
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
      
      if (t.name === 'PARSER_GET_STATS') {
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [MODULE_INTENT] → Статистика парсинга');
        var dbId = (typeof MASTER_DB_ID !== 'undefined') ? MASTER_DB_ID : (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
        if (dbId) {
          var ss = SpreadsheetApp.openById(dbId);
          var statsSheet = ss.getSheetByName('Ares_Parser_Stats');
          if (statsSheet) {
            var data = statsSheet.getDataRange().getValues();
            var report = "📊 <b>СТАТИСТИКА ПАРСИНГА:</b>\n\n";
            var limit = parseInt(t.payload.days) || 7; // Currently just gets all for simplicity, can filter by date
            
            var aggregated = {};
            for (var i = 1; i < data.length; i++) {
              var kw = data[i][1];
              var count = parseInt(data[i][2], 10) || 0;
              if (!aggregated[kw]) aggregated[kw] = 0;
              aggregated[kw] += count;
            }
            
            for (var key in aggregated) {
              report += `🔹 ${key}: ${aggregated[key]}\n`;
            }
            if (Object.keys(aggregated).length === 0) report += "Пусто.";
            
            results.push(report);
          }
        }
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n\n");
}

function getParserIntent() {
  return `MODE: PARSER MODULE (Парсинг Telegram-каналов)
Твоя задача — показывать статистику по парсингу ключевых слов из ТГ каналов, или вручную запускать сбор данных.`;
}

function getParserProtocols() {
  return `ПРАВИЛА И ТЕГИ:
— Для получения статистики используй: [[PARSER_GET_STATS: {"days": 7}]]
— Для принудительного запуска парсера: [[PARSER_RUN: {}]]`;
}

function getParserContext(userText, history) {
  if (userText.toLowerCase().includes('парсер') || userText.toLowerCase().includes('статистик') && (userText.toLowerCase().includes('войн') || userText.toLowerCase().includes('мир'))) {
    return `\n\n[ИНСТРУКЦИЯ ПАРСЕР]: Пользователь просит статистику парсера.`;
  }
  return "";
}

if (typeof registerModule === 'function') {
  registerModule({
    name:     'parser',
    installFn: 'ARES_INSTALL_PARSER',
    enabled:  true,
    promptIntentFn:  'getParserIntent',
    promptProtocolsFn: 'getParserProtocols',
    contextFn: 'getParserContext',
    protocols: [
      { tag: '[[PARSER_RUN:', handler: 'handleParserResponse', desc: 'Запуск парсера: [[PARSER_RUN: {}]]' },
      { tag: '[[PARSER_GET_STATS:', handler: 'handleParserResponse', desc: 'Статистика парсинга: [[PARSER_GET_STATS: {"days": 7}]]' }
    ],
    allowedProtocols: ['[[PARSER_RUN:', '[[PARSER_GET_STATS:'],
    sessionTimeout: 5,
    priority:       80,
    historyKey:     'history_general'
  });
}
