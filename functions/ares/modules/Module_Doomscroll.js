/**
 * ==============================================================================
 * 🛡️ MODULE DOOMSCROLL
 * Анти-думскроллинг. Дозированная подача новостей и развлекательного контента.
 * ==============================================================================
 */

function ARES_INSTALL_DOOMSCROLL(ss) {
  var topics = ss.getSheetByName('Ares_Doomscroll_Topics');
  if (!topics) {
    topics = ss.insertSheet('Ares_Doomscroll_Topics');
    topics.appendRow(["Topic", "Source URL", "Enabled", "LastDelivered"]);
    topics.getRange("A1:D1").setFontWeight("bold").setBackground("#d9d2e9");
    topics.setFrozenRows(1);
    topics.appendRow(["Technology", "https://www.reddit.com/r/technology/top.json?t=day&limit=3", "FALSE", ""]);
    topics.appendRow(["UpliftingNews", "https://www.reddit.com/r/UpliftingNews/top.json?t=day&limit=3", "FALSE", ""]);
  }
}

function runAntiDoomscrollDelivery() {
  try {
    // 1. Check time limits (deliver between 10:00 and 22:00)
    var now = new Date();
    var tz = TIME_ZONE || "Europe/Kiev";
    var hour = parseInt(Utilities.formatDate(now, tz, "H"));
    
    if (hour < 10 || hour >= 22) {
      if (typeof sysLog !== 'undefined') sysLog("💤 [DOOMSCROLL] Режим сна (" + hour + ":00). Доставка отключена.");
      return;
    }

    var dbId = (typeof MASTER_DB_ID !== 'undefined') ? MASTER_DB_ID : (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
    if (!dbId) return;
    
    var ss = SpreadsheetApp.openById(dbId);
    var topicsSheet = ss.getSheetByName('Ares_Doomscroll_Topics');
    if (!topicsSheet) return;

    var data = topicsSheet.getDataRange().getValues();
    var todayStr = Utilities.formatDate(now, tz, "dd.MM.yyyy");

    for (var i = 1; i < data.length; i++) {
      var topicName = data[i][0];
      var sourceUrl = data[i][1];
      var enabled = data[i][2];
      var lastDelivered = data[i][3];
      
      if (enabled !== true && enabled !== 'TRUE' && enabled !== 'true') continue;
      
      // Send max once per day per topic (for testing, you can change this)
      if (lastDelivered === todayStr) continue;
      
      try {
        var response = UrlFetchApp.fetch(sourceUrl, {muteHttpExceptions: true});
        if (response.getResponseCode() !== 200) continue;
        
        var json = JSON.parse(response.getContentText());
        var posts = json.data && json.data.children ? json.data.children : [];
        if (posts.length === 0) continue;
        
        var summaryText = "🛡️ <b>АНТИ-ДУМСКРОЛЛИНГ: " + topicName + "</b>\n\n";
        
        for (var j = 0; j < Math.min(3, posts.length); j++) {
          var post = posts[j].data;
          summaryText += "🔹 <a href='https://reddit.com" + post.permalink + "'>" + post.title + "</a>\n";
        }
        
        if (typeof sendText !== 'undefined') {
          sendText(MY_ID, summaryText, "HTML");
          // Mark as delivered
          topicsSheet.getRange(i + 1, 4).setValue(todayStr);
        }
        
      } catch(e) {
        if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка загрузки топика " + topicName + ": " + e.message);
      }
    }

  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка runAntiDoomscrollDelivery: " + e.message);
  }
}

function handleDoomscrollResponse(aresResponse, parsedTags, ctx) {
  let updatedResponse = aresResponse;
  let results = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'DOOMSCROLL_FORCE_RUN') {
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [MODULE_INTENT] → Принудительная доставка думскролла');
        
        var now = new Date();
        var hour = parseInt(Utilities.formatDate(now, TIME_ZONE || "Europe/Kiev", "H"));
        if (hour < 10 || hour >= 22) {
          results.push("⚠️ Сейчас не время для новостей (сплю). Но так как это принудительный запуск — выполняю.");
        }
        
        runAntiDoomscrollDelivery();
        results.push(`✅ Рассылка контента инициирована.`);
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n\n");
}

function getDoomscrollIntent() {
  return `MODE: ANTI-DOOMSCROLL MODULE (Информационная гигиена)
Твоя задача — по запросу запускать принудительную доставку новостей/контента.`;
}

function getDoomscrollProtocols() {
  return `ПРАВИЛА И ТЕГИ:
— Для принудительного запроса контента используй: [[DOOMSCROLL_FORCE_RUN: {}]]`;
}

function getDoomscrollContext(userText, history) {
  if (userText.toLowerCase().includes('новости') || userText.toLowerCase().includes('думскролл')) {
    return `\n\n[ИНСТРУКЦИЯ DOOMSCROLL]: Пользователь хочет почитать новости/контент.`;
  }
  return "";
}

if (typeof registerModule === 'function') {
  registerModule({
    name:     'doomscroll',
    installFn: 'ARES_INSTALL_DOOMSCROLL',
    enabled:  true,
    promptIntentFn:  'getDoomscrollIntent',
    promptProtocolsFn: 'getDoomscrollProtocols',
    contextFn: 'getDoomscrollContext',
    protocols: [
      { tag: '[[DOOMSCROLL_FORCE_RUN:', handler: 'handleDoomscrollResponse', desc: 'Принудительная доставка новостей: [[DOOMSCROLL_FORCE_RUN: {}]]' }
    ],
    allowedProtocols: ['[[DOOMSCROLL_FORCE_RUN:'],
    sessionTimeout: 5,
    priority:       85,
    historyKey:     'history_general'
  });
}
