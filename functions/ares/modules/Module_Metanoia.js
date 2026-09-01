/**
 * ==============================================================================
 * 🧠 MODULE METANOIA v2.0 [ORCHESTRATOR ARCHITECTURE]
 * Архитектура: Trigger → Emotion → Impulse → Reaction analysis
 * Промпт живёт в Prompt.js → getMetanoiaModulePrompt()
 * Self-bootstrapping: создает METANOIA_LOG автоматически при первом запуске.
 * ==============================================================================
 */

// ==============================================================================
// 🔧 БЛОК 0: ИНФРАСТРУКТУРА (SELF-BOOTSTRAPPING)
// ==============================================================================

function ensureMetanoiaLog() {
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  let sheet = ss.getSheetByName('METANOIA_LOG');
  if (!sheet) {
    Logger.log("METANOIA_LOG не найден. Создаю автоматически...");
    sheet = ss.insertSheet('METANOIA_LOG');
    const headers = ['Timestamp', 'Trigger', 'Emotion', 'Auto Reaction', 'Cognitive Note', 'Alternative', 'Intensity (1-5)', 'Notes'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#ffe0b2");
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
    Logger.log("✅ METANOIA_LOG создан.");
  }
  return sheet;
}

// ==============================================================================
// 👁️ БЛОК 1: КОНТЕКСТ (для основного ИИ)
// ==============================================================================

function getMetanoiaContext(userText, history, chatId) {
  if (typeof sysLog !== 'undefined') sysLog(`[DEBUG_METANOIA] getMetanoiaContext called with: ${userText}`, chatId);
  const lowerText = userText.toLowerCase().trim();
  // Активируем контекст, если есть ключевые слова
  const hasMetanoiaWords = /мета|анализ|сводк|разбор|состояни|рефлекси|клир/.test(lowerText);
  if (typeof sysLog !== 'undefined') sysLog(`[DEBUG_METANOIA] hasMetanoiaWords: ${hasMetanoiaWords}`, chatId);
  if (!hasMetanoiaWords) return "";

  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let context = "\n\n[METANOIA MODE ACTIVATED]";

    const isAnalysisRequest = lowerText.indexOf('анализ') !== -1 || lowerText.indexOf('сводк') !== -1;

    // Загружаем DIARY_RAW
    const rawSheet = ss.getSheetByName('DIARY_RAW');
    if (rawSheet) {
      const daysToLoad = isAnalysisRequest ? 14 : 3;
      const cutoff = new Date(Date.now() - daysToLoad * 24 * 60 * 60 * 1000);
      const rawData = rawSheet.getDataRange().getValues().slice(1)
        .filter(row => {
          if (!row[0]) return false;
          let d = row[0] instanceof Date ? row[0] : new Date(row[0]);
          return !isNaN(d.getTime()) && d > cutoff;
        })
        .map(row => row[2]);
      if (rawData.length > 0) {
        const sliceCount = isAnalysisRequest ? 50 : 10;
        context += `\n[ДНЕВНИК (последние ${daysToLoad} дней)]:\n— ` + rawData.slice(-sliceCount).join('\n— ');
      }
      if (typeof sysLog !== 'undefined') sysLog(`[METANOIA_DEBUG] rawData.length = ${rawData.length}, daysToLoad = ${daysToLoad}, cutoff = ${cutoff}`, chatId);
    }

    const metaSheet = ss.getSheetByName('METANOIA_LOG');
    if (metaSheet && metaSheet.getLastRow() > 1) {
      const metaDataAll = metaSheet.getDataRange().getValues().slice(1).filter(r => r[0]);
      const sliceCount = isAnalysisRequest ? 30 : 5;
      const metaData = metaDataAll.slice(-sliceCount);
      if (metaData.length > 0) {
        context += "\n[ПРЕДЫДУЩИЕ МЕТАНОЯ-СЕССИИ]:\n" +
          metaData.map(r => {
            const dateObj = new Date(r[0]);
            const dateStr = isNaN(dateObj.getTime()) ? "??" : Utilities.formatDate(dateObj, "GMT+3", "dd.MM");
            return `${dateStr} | ТРИГГЕР: ${r[1]} → ЭМОЦИЯ: ${r[2]} → РЕАКЦИЯ: ${r[3]} (Инт: ${r[6]})`;
          }).join("\n");
      }
      if (typeof sysLog !== 'undefined') sysLog(`[METANOIA_DEBUG] metaData.length = ${metaData.length}`, chatId);
    } else {
      if (typeof sysLog !== 'undefined') sysLog(`[METANOIA_DEBUG] metaSheet not found or empty`, chatId);
    }

    if (isAnalysisRequest) {
      context += "\n\n=========================================\n" +
                 "[CRITICAL SYSTEM OVERRIDE]: РЕЖИМ ГЛУБОКОГО ПСИХОАНАЛИЗА!\n" +
                 "ТВОЯ ЗАДАЧА: Проанализировать предоставленную выше историю из Дневника и Метаноя-сессий.\n" +
                 "ИГНОРИРУЙ стандартный формат Триггер→Эмоция→Реакция. ИГНОРИРУЙ тег [[METANOIA_LOG]].\n" +
                 "ОТВЕЧАЙ СТРОГО В ФОРМАТЕ JSON, ОПИСАННОМ НИЖЕ!\n" +
                 "=========================================";
      context += "\n\n[METANOIA SYSTEM PROMPT (ANALYSIS MODE)]:\n" + getMetanoiaSystemPrompt(true);
    }
    // В стандартном режиме промпт уже задан Kernel'ом через promptIntentFn/promptProtocolsFn
    
    return context;
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog("❌ [ERROR] getMetanoiaContext: " + e.message);
    return "";
  }
}

// ==============================================================================
// 🧠 БЛОК 2: СИСТЕМНЫЙ ПРОМТ МЕТАНОИ
// ==============================================================================

// ==============================================================================
// 🧠 БЛОК 2: СИСТЕМНЫЙ ПРОМТ МЕТАНОИ (2.0)
// ==============================================================================

function getMetanoiaSystemPrompt(isAnalysisRequest = false) {
  if (isAnalysisRequest) {
    return `ПОЛЬЗОВАТЕЛЬ ЗАПРОСИЛ ГЛУБОКИЙ АНАЛИЗ ПАТТЕРНОВ.
Тебе предоставлены логи Дневника и предыдущих сессий Метанои.

ФИЛОСОФСКОЕ ЯДРО (Используй эти фреймворки для анализа):
1. Стоицизм (Марк Аврелий, Сенека): Дихотомия контроля, радикальное принятие реальности, разделение фактов и суждений.
2. Светский Буддизм: Непостоянство (ты — не твоя эмоция), осознанность момента, разотождествление с эго.
3. Христианская философия (Суть): Трансформация через прощение (отпускание обиды = сброс когнитивного груза), принцип не-сопротивления злу (смена фокуса с борьбы на созидание).
4. Учения Ганди: Ненасилие (в т.ч. к себе), мягкая сила, победа через терпение.
5. КПТ (Когнитивно-поведенческая терапия): Распознавание искажений (катастрофизация, дихотомическое мышление, персонализация).

НАУЧНЫЙ СКОРИНГ (Оцени пользователя по 100% шкале на основе логов):
- CFI (Когнитивная гибкость): Способность менять мнение и не застревать.
- ERI (Эмоциональная реактивность): Сила и скорость триггерной реакции (чем выше процент, тем ХУЖЕ контроль).
- MAAS (Индекс осознанности): Способность наблюдать за собой со стороны.

ТВОЯ ЗАДАЧА:
1. Выявить главные когнитивные паттерны.
2. Оценить динамику состояний.
3. Выдать 1-2 глубокие рекомендации (как "практики" или сдвиги парадигмы), опираясь на Философское Ядро.

КРИТИЧЕСКИ ВАЖНО:
Свои внутренние размышления ты ОБЯЗАН писать ВНУТРИ тегов <thought>...</thought>, как предписано в базовых правилах.
Но ПОСЛЕ закрывающего тега </thought>, ты ОБЯЗАН СРАЗУ выдать валидный JSON-тег [[METANOIA_ANALYSIS: { ... } ]].

ФОРМАТ ОТВЕТА:
<thought>
Анализирую логи... Дихотомическое мышление... Буддизм говорит... ERI высокий...
</thought>
[[METANOIA_ANALYSIS: {
  "patterns": [{"name": "Название", "desc": "Краткое описание"}],
  "dynamics": ["Факт о динамике 1", "Факт о динамике 2"],
  "recommendations": [{"title": "Практика", "desc": "Что делать (опираясь на философию)"}],
  "scores": {"cfi": 65, "eri": 80, "maas": 40}
}]]`;
  }
  return "";
}

// ==============================================================================
// ⚙️ БЛОК 3: ОБРАБОТЧИКИ ПРОТОКОЛОВ
// ==============================================================================

function handleMetanoiaLog(aresResponse, payload, input, parsedTags) {
  let logTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (let i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'METANOIA_LOG') {
        logTag = parsedTags[i];
        break;
      }
    }
  }

  let data = null;
  if (logTag) {
    data = logTag.payload;
  } else {
    const match = aresResponse.match(/\[\[METANOIA_LOG:\s*(\{[\s\S]*?\})\s*\]\]/s);
    if (!match) return false;
    try {
      data = JSON.parse(match[1]);
    } catch(e) { return false; }
  }

  try {
    const sheet = ensureMetanoiaLog();
    const timestamp = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([
      timestamp,
      data.trigger || '',
      data.emotion || '',
      data.reaction || '',
      '', // Cognitive Note
      data.alternative || '',
      data.intensity || '',
      ''  // Notes
    ]);
    if (typeof sysLog !== 'undefined') sysLog("📝 [METANOIA_LOG] Запись: " + (data.trigger||''));
    
    // Форматируем красивый короткий ответ
    return `💡 <b>ПАТТЕРН ЗАФИКСИРОВАН</b>\n\n<b>Триггер:</b> ${data.trigger}\n<b>Эмоция:</b> ${data.emotion}\n<b>Реакция:</b> ${data.reaction}\n\n<i>${data.reply}</i>`;
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog("Ошибка handleMetanoiaLog JSON: " + e.message);
    return "❌ Ошибка парсинга Метаноя-лога.";
  }
}

function handleMetanoiaAnalysis(aresResponse, payload, input, parsedTags) {
  let analysisTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (let i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'METANOIA_ANALYSIS') {
        analysisTag = parsedTags[i];
        break;
      }
    }
  }

  let data = null;
  if (analysisTag) {
    data = analysisTag.payload;
  } else {
    const match = aresResponse.match(/\[\[METANOIA_ANALYSIS:\s*(\{[\s\S]*?\})\s*\]\]/s);
    if (!match) return false;
    try {
      data = JSON.parse(match[1]);
    } catch(e) { return false; }
  }

  try {
    let html = "💡 <b>ГЛУБОКИЙ АНАЛИЗ МЕТАНОИ</b>\n\n";
    
    html += "🧠 <b>КОГНИТИВНЫЕ ПАТТЕРНЫ</b>\n";
    if (data.patterns && data.patterns.length > 0) {
      data.patterns.forEach(p => html += `🔹 <b>${p.name}:</b> ${p.desc}\n`);
    } else {
      html += "🔹 Явных искажений не выявлено.\n";
    }
    
    html += "\n⚡ <b>ЭМОЦИОНАЛЬНАЯ ДИНАМИКА</b>\n";
    if (data.dynamics && data.dynamics.length > 0) {
      data.dynamics.forEach(d => html += `🔹 ${d}\n`);
    }
    
    html += "\n🛡 <b>ПРАКТИКА И СДВИГ ПАРАДИГМЫ</b>\n";
    if (data.recommendations && data.recommendations.length > 0) {
      data.recommendations.forEach(r => html += `🔹 <b>${r.title}:</b> ${r.desc}\n`);
    }
    
    if (data.scores) {
      html += "\n📊 <b>НАУЧНЫЙ СКОРИНГ (Индексы)</b>\n";
      html += `🧠 Когнитивная гибкость (CFI): <code>${data.scores.cfi}%</code>\n`;
      html += `⚡ Эмоциональная реактивность (ERI): <code>${data.scores.eri}%</code>\n`;
      html += `👁 Индекс Осознанности (MAAS): <code>${data.scores.maas}%</code>\n`;
    }
    
    return html;
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog("Ошибка handleMetanoiaAnalysis JSON: " + e.message);
    return "❌ Ошибка парсинга Метаноя-анализа.";
  }
}

// ==============================================================================
// 🔄 БЛОК 4: ЕЖЕДНЕВНЫЙ ТРИГГЕР (22:10)
// ==============================================================================
function ARES_METANOIA_DAILY_TRIGGER() {
  ensureMetanoiaLog();

  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  const rawSheet = ss.getSheetByName('DIARY_RAW');
  if (!rawSheet) return;

  const todayStr = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const data = rawSheet.getDataRange().getValues();

  const todaysEntries = data.filter(row => {
    const timestamp = row[0];
    if (!(timestamp instanceof Date)) return false;
    return Utilities.formatDate(timestamp, TIME_ZONE, "yyyy-MM-dd") === todayStr;
  }).map(row => row[2]).join("\n— ");

  if (!todaysEntries) return;

  const systemPrompt = `${getMetanoiaSystemPrompt(true)}`;

  const payload = {
    "model": MODEL,
    "messages": [
      { "role": "system", "content": systemPrompt },
      { "role": "user", "content": `ЗАДАЧА: Проведи ежедневный метаноя-разбор дня.\nЗаписи за сегодня:\n— ${todaysEntries}` }
    ],
    "temperature": 0.4
  };

  try {
    const res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
      "method": "post",
      "headers": { "Authorization": "Bearer " + OR_KEY, "Content-Type": "application/json" },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });

    if (res.getResponseCode() === 200) {
      const summary = JSON.parse(res.getContentText()).choices[0].message.content;
      const cleaned = handleMetanoiaAnalysis(summary);
      sendText(MY_ID, cleaned.replace(/\[\[METANOIA_ANALYSIS:[\s\S]*?\]\]/gi, "").trim());
    }
  } catch(e) {
    Logger.log("Ошибка ARES_METANOIA_DAILY_TRIGGER: " + e.message);
  }
}

// ==============================================================================
// 🔧 БЛОК 5: РУЧНОЙ ТРИГГЕР (для запуска вручную)
// ==============================================================================
function ARES_METANOIA_MANUAL_TRIGGER() {
  ensureMetanoiaLog();

  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  const rawSheet = ss.getSheetByName('DIARY_RAW');
  if (!rawSheet) { Logger.log("DIARY_RAW не найден."); return; }

  const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const recentEntries = rawSheet.getDataRange().getValues().slice(1)
    .filter(row => row[0] instanceof Date && row[0] > cutoff72h)
    .map(row => row[2]);

  const metaSheet = ss.getSheetByName('METANOIA_LOG');
  const recentMeta = (metaSheet && metaSheet.getLastRow() > 1)
    ? metaSheet.getDataRange().getValues().slice(1).slice(-5)
        .map(r => `${r[1]} → ${r[2]} → ${r[3]}`).join("\n")
    : "";

  const context = [
    recentEntries.length > 0 ? `Дневник (72ч):\n— ${recentEntries.join('\n— ')}` : "",
    recentMeta ? `Предыдущие паттерны:\n${recentMeta}` : ""
  ].filter(Boolean).join("\n\n");

  if (!context) {
    sendText(MY_ID, "Нет данных для метаноя-анализа за последние 72 часа.");
    return;
  }

  const payload = {
    "model": MODEL,
    "messages": [
      { "role": "system", "content": getMetanoiaSystemPrompt(true) },
      { "role": "user", "content": `ЗАДАЧА: полный метаноя-анализ последних 72 часов.\n\n${context}` }
    ],
    "temperature": 0.4
  };

  try {
    const res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
      "method": "post",
      "headers": { "Authorization": "Bearer " + OR_KEY, "Content-Type": "application/json" },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });

    if (res.getResponseCode() === 200) {
      const result = JSON.parse(res.getContentText()).choices[0].message.content;
      const cleaned = handleMetanoiaAnalysis(result);
      sendText(MY_ID, cleaned.replace(/\[\[METANOIA_ANALYSIS:[\s\S]*?\]\]/gi, "").trim());
    }
  } catch(e) {
    Logger.log("Ошибка ARES_METANOIA_MANUAL_TRIGGER: " + e.message);
  }
}

// ==============================================================================
// 🚀 БЛОК 6: УСТАНОВКА ТРИГГЕРОВ
// ==============================================================================
function ARES_INSTALL_METANOIA(ss) {
  Logger.log("🛠️ Установка таблиц модуля Metanoia...");
  if (!ss) {
    if (typeof ADS_DATA_SHEET_ID === 'undefined') {
      Logger.log("❌ Ошибка: не найден ADS_DATA_SHEET_ID");
      return;
    }
    ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  }
  
  ensureMetanoiaLog(); // Uses internal ensureMetanoiaLog, but we can pass ss
  // Let's modify ensureMetanoiaLog to use ss if we want, but calling ensureMetanoiaLog() is fine because it opens it by ID anyway.
  
  Logger.log("✅ METANOIA MODULE установлен.");
  return "Metanoia module installed.";
}

// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ (Интенты и Протоколы)
// ==============================================================================
function getMetanoiaIntent() {
  return `MODE: METANOIA MODULE 2.0 (Психоаналитик и философ)
Ты — Метаноя. Когнитивный и духовный архитектор.

РОЛЬ: Трансформация сознания пользователя (Дима) через фиксацию триггеров и философско-научный подход.
Твоя база: Стоицизм, Буддизм, Иисус (учения о прощении), Ганди, современная КПТ. Никакой религии, только чистый когнитивный сдвиг.`;
}

function getMetanoiaProtocols() {
  return `ЕСЛИ ПОЛЬЗОВАТЕЛЬ ПРОСИТ ПРОСТО ЗАПИСАТЬ СИТУАЦИЮ:
Твоя ЕДИНСТВЕННАЯ задача — зафиксировать паттерн в таблицу и дать МАКСИМАЛЬНО короткую обратную связь.

КРИТИЧЕСКИ ВАЖНО:
Свои внутренние размышления ты ОБЯЗАН писать ВНУТРИ тегов <thought>...</thought>.
Но ПОСЛЕ закрывающего тега </thought>, ты ОБЯЗАН СРАЗУ выдать валидный JSON-тег [[METANOIA_LOG: { ... } ]].

ФОРМАТ ОТВЕТА:
<thought>
Анализирую ситуацию. Триггер: завершение работы. Эмоция: удовлетворение...
</thought>
[[METANOIA_LOG: {
  "trigger": "Коротко триггер",
  "emotion": "Эмоция",
  "reaction": "Как отреагировал",
  "alternative": "Альтернативный (более осознанный) взгляд или реакция",
  "intensity": 4,
  "reply": "Фраза-поддержка от лица мудреца (Сенеки, Будды и тд)"
}]]

ВНИМАНИЕ: Если активирован [CRITICAL SYSTEM OVERRIDE] для ГЛУБОКОГО ПСИХОАНАЛИЗА, ИГНОРИРУЙ тег METANOIA_LOG и используй тег [[METANOIA_ANALYSIS: ...]] (инструкция передана в контексте).

КРИТИЧЕСКИЕ ЗАПРЕТЫ:
— КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО создавать задачи [[ADD_TASK:...]]
— КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО отвечать обычным текстом, минуя JSON теги.`;
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'metanoia',
  installFn: 'ARES_INSTALL_METANOIA',
  enabled:  true,
  promptIntentFn:  'getMetanoiaIntent',
  promptProtocolsFn: 'getMetanoiaProtocols',
  contextFn: 'getMetanoiaContext',
  ignoreCustomPrompt: true,
  protocols: [
    { tag: '[[METANOIA_LOG:', handler: 'handleMetanoiaLog', desc: 'Запись триггера' },
    { tag: '[[METANOIA_ANALYSIS:', handler: 'handleMetanoiaAnalysis', desc: 'Глубокий анализ' }
  ],
  allowedProtocols: ['[[METANOIA_LOG:', '[[METANOIA_ANALYSIS:'],
  allowTextFallback: false, // Отключаем текст-фоллбэк, заставляем всегда использовать JSON
  sessionTimeout: 25,
  priority:       90,
  historyKey:     'history_metanoia'
});
