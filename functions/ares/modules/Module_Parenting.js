/**
 * ==============================================================================
 * 👶 Модуль ВОСПИТАНИЯ И ДЕТСКОЙ ПСИХОЛОГИИ (v10 Architecture)
 * ==============================================================================
 */

// ==============================================================================
// 🧠 БЛОК 1: ДЕТЕРМИНИРОВАННЫЙ ДВИЖОК (БИЗНЕС-ЛОГИКА)
// ==============================================================================

function _saveParentingLog(type, context, outcome) {
  var ss;
  try {
    ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [PARENTING]: Не найден ADS_DATA_SHEET_ID');
    return false;
  }
  
  var sheet = ss.getSheetByName('Parenting');
  if (!sheet) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [PARENTING]: Лист Parenting не найден');
    return false;
  }
  
  var now = new Date();
  var dateStr = ("0" + now.getDate()).slice(-2) + "." + ("0" + (now.getMonth() + 1)).slice(-2) + "." + now.getFullYear() + " " + ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
  
  sheet.appendRow([dateStr, type, context, outcome || "", new Date()]);
  return true;
}

function _getParentingLogs(limit) {
  var ss;
  try {
    ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  } catch(e) { return []; }
  
  var sheet = ss.getSheetByName('Parenting');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Только заголовки
  
  var logs = [];
  var start = Math.max(1, data.length - limit);
  for (var i = start; i < data.length; i++) {
    logs.push({
      date: data[i][0],
      type: data[i][1],
      context: data[i][2],
      outcome: data[i][3]
    });
  }
  return logs;
}

// ==============================================================================
// 🧠 БЛОК 2: ИНТЕРФЕЙС РОУТЕРА (LLM PROMPTS)
// ==============================================================================

function getParentingIntent() {
  return `MODE: PARENTING MODULE (Детский психолог)
Ты — Карманный Детский Психолог Ареса.
Твоя задача — анализировать запросы пользователя о ребенке (3 года 1 месяц) и отдавать правильный протокол-тег.`;
}

function getParentingProtocols() {
  return `ОБЯЗАТЕЛЬНОЕ ПРАВИЛО (JSON Chain of Thought):
Ты должен отвечать СТРОГО одним JSON-тегом в самом начале ответа. Внутри JSON обязательно используй поле "_thought" для своих рассуждений.

ВАЖНО: Игнорируй формат предыдущих сообщений. Возвращай только один тег, начинающийся с [[ и заканчивающийся на ]].`;
}

function getParentingContext(userText, history) {
  return `User text: ` + userText;
}

// ==============================================================================
// 🧠 БЛОК 3: ИСПОЛНИТЕЛЬНЫЕ ОБРАБОТЧИКИ ТЕГОВ
// ==============================================================================

function handleParentingResponse(aresResponse, payload, input, parsedTags) {
  var chatId = payload.chatId;

  if (parsedTags && parsedTags.length > 0) {
    for (var i = 0; i < parsedTags.length; i++) {
      var tag = parsedTags[i];
      if (tag.name === 'PARENTING_LOG') {
        var success = _saveParentingLog(tag.payload.type, tag.payload.context, tag.payload.outcome);
        var msg = aresFormatMessage(
          "Запись в детский дневник сохранена",
          "📝",
          "Тип: <code>" + tag.payload.type + "</code>\nКонтекст: <code>" + tag.payload.context + "</code>\nРезультат: <code>" + (tag.payload.outcome || 'Не указан') + "</code>",
          (tag.payload.type === 'Истерика' ? "💡 Записать-то я записал. Но если нужен быстрый совет, как это разрулить в следующий раз — просто скажи." : null)
        );
        
        if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
        if (typeof sendText !== 'undefined') sendText(chatId, msg);
        return "";
      } else if (tag.name === 'PARENTING_SOS') {
        var prompt = `Ты эксперт по детской психологии (возраст 3 года 1 месяц). 
Твоя задача дать СРОЧНЫЙ, короткий и прикладной совет для решения ситуации: "${tag.payload.issue}".
Используй только научно обоснованные методы (Дэниел Сигел, Росс Грин, Джон Готтман, Людмила Петрановская, Гордон Ньюфелд и т.д.).
Без воды. Дай алгоритм 1-2-3 (что делать прямо сейчас).

ОБЯЗАТЕЛЬНО:
Верни ответ СТРОГО в виде JSON объекта (и ничего кроме JSON), со следующими ключами:
- "advice": Строка с текстом совета. РАЗРЕШЕНО использовать ТОЛЬКО теги <b>, <i>, <code>. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать <br>, <p>, <ul>, <ol>, <li>, <h3> и любые другие HTML теги. Для списков используй обычные дефисы или цифры, для переноса строк используй \\n.
- "author": Имя автора или название фреймворка, на котором основан совет.`;

        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [PARENTING] Запрос к глубокому LLM для SOS-совета');
        
        var responseRaw = askAres([], tag.payload.issue, prompt, null, null, {temperature: 0.7});
        
        var matchObj = responseRaw.match(/\{[\s\S]*\}/);
        if (matchObj) {
           var adviceObj = JSON.parse(matchObj[0]);
           
           var msg = aresFormatMessage(
             "SOS-СОВЕТ ОТ АРЕСА",
             "🆘",
             adviceObj.advice,
             "🔬 Научная база: " + adviceObj.author
           );
           
           if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
           if (typeof sendText !== 'undefined') sendText(chatId, msg);
        } else {
           if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Не удалось сгенерировать структурированный совет. Сырой ответ ИИ:\n\n" + responseRaw);
        }
        return "";
      } else if (tag.name === 'PARENTING_ANALYZE') {
        var logs = _getParentingLogs(20);
        if (logs.length === 0) {
          if (typeof sendText !== 'undefined') sendText(chatId, "📊 Пока в дневнике нет записей для анализа. Записывай наблюдения и истерики, чтобы я мог найти паттерны!");
          return "";
        }
        
        var logText = logs.map(function(l) { return "[" + l.date + "] " + l.type + ": " + l.context + (l.outcome ? " -> " + l.outcome : ""); }).join("\n");
        
        var prompt = `Ты научный эксперт по детской психологии.
Проанализируй следующие записи дневника ребенка (3 года 1 месяц) и найди паттерны (например, время суток, триггеры, признаки усталости по HALT).
Записи:
${logText}

Верни анализ СТРОГО в виде JSON объекта со следующими ключами:
- "analysis": Максимально компактный и емкий текст анализа (до 1500 символов). РАЗРЕШЕНО использовать ТОЛЬКО теги <b>, <i>, <code>. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать <br>, <p>, <ul>, <ol>, <li>, <h3>, а также звездочки Markdown (* или **). Для выделения используй <b>, для списков — обычные дефисы или цифры, для переноса строк — \\n. Пиши суть, без лишней воды.
- "author": Имя автора или фреймворк, на который ты опираешься при анализе.`;

        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [PARENTING] Запрос к глубокому LLM для Анализа');
        
        var responseRaw = askAres([], "Проанализируй записи дневника", prompt, null, null, {temperature: 0.7});
        try {
          var matchObj = responseRaw.match(/\{[\s\S]*\}/);
          if (matchObj) {
             var analysisObj = JSON.parse(matchObj[0]);
             
             var msg = aresFormatMessage(
               "АНАЛИЗ ПАТТЕРНОВ ПОВЕДЕНИЯ",
               "📊",
               analysisObj.analysis,
               "🔬 Научная база: " + analysisObj.author
             );
             
             if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
             if (typeof sendText !== 'undefined') sendText(chatId, msg);
          } else {
             if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Не удалось сгенерировать анализ. Сырой ответ ИИ:\n\n" + responseRaw);
          }
        } catch(e) {
          if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Ошибка при анализе дневника.");
        }
        return "";
      } else if (tag.name === 'NO_ACTION') {
        // Fall through
      }
    }
  }

  // Fallback для старых форматов
  var logMatch = aresResponse.match(/\[\[PARENTING_LOG:?\s*(\{.*?\})\s*\]\]/is);
  if (logMatch) {
    try {
      var json = JSON.parse(logMatch[1]);
      var success = _saveParentingLog(json.type, json.context, json.outcome);
      var msg = aresFormatMessage(
        "Запись в детский дневник сохранена",
        "📝",
        "Тип: <code>" + json.type + "</code>\nКонтекст: <code>" + json.context + "</code>\nРезультат: <code>" + (json.outcome || 'Не указан') + "</code>",
        (json.type === 'Истерика' ? "💡 Записать-то я записал. Но если нужен быстрый совет, как это разрулить в следующий раз — просто скажи." : null)
      );
      
      if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
      if (typeof sendText !== 'undefined') sendText(chatId, msg);
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog("⚠️ [PARENTING] JSON Parse Error: " + e.message);
    }
    return ""; // Возвращаем пустую строку, чтобы предотвратить стандартную отправку
  }
  
  var sosMatch = aresResponse.match(/\[\[PARENTING_SOS:?\s*(\{.*?\})\s*\]\]/is);
  if (sosMatch) {
    try {
      var json = JSON.parse(sosMatch[1]);
      var prompt = `Ты эксперт по детской психологии (возраст 3 года 1 месяц). 
Твоя задача дать СРОЧНЫЙ, короткий и прикладной совет для решения ситуации: "${json.issue}".
Используй только научно обоснованные методы (Дэниел Сигел, Росс Грин, Джон Готтман, Людмила Петрановская, Гордон Ньюфелд и т.д.).
Без воды. Дай алгоритм 1-2-3 (что делать прямо сейчас).

ОБЯЗАТЕЛЬНО:
Верни ответ СТРОГО в виде JSON объекта (и ничего кроме JSON), со следующими ключами:
- "advice": Строка с текстом совета. РАЗРЕШЕНО использовать ТОЛЬКО теги <b>, <i>, <code>. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать <br>, <p>, <ul>, <ol>, <li>, <h3> и любые другие HTML теги. Для списков используй обычные дефисы или цифры, для переноса строк используй \\n.
- "author": Имя автора или название фреймворка, на котором основан совет.`;

      if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [PARENTING] Запрос к глубокому LLM для SOS-совета');
      
      var responseRaw = askAres([], json.issue, prompt, null, null, {temperature: 0.7});
      
      var match = responseRaw.match(/\{[\s\S]*\}/);
      if (match) {
         var adviceObj = JSON.parse(match[0]);
         
         var msg = aresFormatMessage(
           "SOS-СОВЕТ ОТ АРЕСА",
           "🆘",
           adviceObj.advice,
           "🔬 Научная база: " + adviceObj.author
         );
         
         if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
         if (typeof sendText !== 'undefined') sendText(chatId, msg);
      } else {
         if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Не удалось сгенерировать структурированный совет. Сырой ответ ИИ:\n\n" + responseRaw);
      }
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('⚠️ [PARENTING]: Ошибка парсинга SOS ответа ИИ: ' + e.message);
      if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Произошла ошибка при анализе совета.");
    }
    return "";
  }
  
  var analyzeMatch = aresResponse.match(/\[\[PARENTING_ANALYZE(?::\s*(\{.*?\}))?\s*\]\]/is);
  if (analyzeMatch) {
    var logs = _getParentingLogs(20);
    if (logs.length === 0) {
      if (typeof sendText !== 'undefined') sendText(chatId, "📊 Пока в дневнике нет записей для анализа. Записывай наблюдения и истерики, чтобы я мог найти паттерны!");
      return "";
    }
    
    var logText = logs.map(function(l) { return "[" + l.date + "] " + l.type + ": " + l.context + (l.outcome ? " -> " + l.outcome : ""); }).join("\n");
    
    var prompt = `Ты научный эксперт по детской психологии.
Проанализируй следующие записи дневника ребенка (3 года 1 месяц) и найди паттерны (например, время суток, триггеры, признаки усталости по HALT).
Записи:
${logText}

Верни анализ СТРОГО в виде JSON объекта со следующими ключами:
- "analysis": Максимально компактный и емкий текст анализа (до 1500 символов). РАЗРЕШЕНО использовать ТОЛЬКО теги <b>, <i>, <code>. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать <br>, <p>, <ul>, <ol>, <li>, <h3>, а также звездочки Markdown (* или **). Для выделения используй <b>, для списков — обычные дефисы или цифры, для переноса строк — \\n. Пиши суть, без лишней воды.
- "author": Имя автора или фреймворк, на который ты опираешься при анализе.`;

    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [PARENTING] Запрос к глубокому LLM для Анализа');
    
    var responseRaw = askAres([], "Проанализируй записи дневника", prompt, null, null, {temperature: 0.7});
    try {
      var match = responseRaw.match(/\{[\s\S]*\}/);
      if (match) {
         var analysisObj = JSON.parse(match[0]);
         
         var msg = aresFormatMessage(
           "АНАЛИЗ ПАТТЕРНОВ ПОВЕДЕНИЯ",
           "📊",
           analysisObj.analysis,
           "🔬 Научная база: " + analysisObj.author
         );
         
         if (typeof sysLog !== 'undefined') sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + msg, chatId);
         if (typeof sendText !== 'undefined') sendText(chatId, msg);
      } else {
         if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Не удалось сгенерировать анализ. Сырой ответ ИИ:\n\n" + responseRaw);
      }
    } catch(e) {
      if (typeof sendText !== 'undefined') sendText(chatId, "⚠️ Ошибка при анализе дневника.");
    }
    return "";
  }
  
  return aresResponse;
}

// ==============================================================================
// 🔌 РЕГИСТРАЦИЯ МОДУЛЯ
// ==============================================================================
if (typeof registerModule === 'function') {
  registerModule({
    name: 'parenting',
    installFn: 'ARES_INSTALL_PARENTING',
    enabled: true,
    promptIntentFn: 'getParentingIntent',
    promptProtocolsFn: 'getParentingProtocols',
    contextFn: 'getParentingContext',
    handler: 'handleParentingResponse',
    protocols: [
      { tag: '[[PARENTING_SOS:', handler: 'handleParentingResponse', desc: 'Срочный совет: [[PARENTING_SOS: {"issue": "описание проблемы", "_thought": "рассуждения"}]]' },
      { tag: '[[PARENTING_LOG:', handler: 'handleParentingResponse', desc: 'Запись наблюдения: [[PARENTING_LOG: {"type": "Истерика", "context": "ситуация", "outcome": "исход", "_thought": "рассуждения"}]]' },
      { tag: '[[PARENTING_ANALYZE:', handler: 'handleParentingResponse', desc: 'Анализ поведения: [[PARENTING_ANALYZE: {"_thought": "рассуждения"}]]' },
      { tag: '[[NO_ACTION:', handler: 'handleParentingResponse', desc: 'Запрос не относится к воспитанию: [[NO_ACTION: {"_thought": "рассуждения"}]]' }
    ],
    allowedProtocols: ['[[PARENTING_SOS:', '[[PARENTING_LOG:', '[[PARENTING_ANALYZE:', '[[NO_ACTION:'],
    sessionTimeout: 10,
    priority: 85
  });
}

// ==============================================================================
// 🚀 INSTALLER
// ==============================================================================

function ARES_INSTALL_PARENTING(ss) {
  Logger.log("🛠️ Установка таблиц модуля Воспитания...");
  
  var sheetName = "Parenting";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = ["Date", "Type", "Context", "Outcome", "Timestamp"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9ead3");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 120);
    sheet.setColumnWidth(3, 400);
    sheet.setColumnWidth(4, 400);
    sheet.setColumnWidth(5, 120);
    Logger.log("✅ Created sheet: " + sheetName);
  } else {
    Logger.log("ℹ️ Sheet " + sheetName + " already exists.");
  }
}
