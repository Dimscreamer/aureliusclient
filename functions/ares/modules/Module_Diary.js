/**
 * ==============================================================================
 * 📔 MODULE DIARY & MEMORY v1.2 [ORCHESTRATOR ARCHITECTURE]
 * Центр управления памятью: Логирование, Инсайты, Граф Памяти.
 * Архитектура: Raw First -> Async Analysis -> Memory Graph & Events
 * Промпт живёт в Prompt.js -> getDiaryModulePrompt()
 * ==============================================================================
 */

// ==============================================================================
// 👁️ БЛОК 1: ГЛАЗА АРЕСА (КОНТЕКСТ И КЭШИРОВАНИЕ)
// ==============================================================================

function getDiaryContext(userText, history) {
  try {
    let lowerText = userText.toLowerCase();
    let memoryPrompt = "";

    // 1. Поиск упоминаний в кэше (CacheService)
    let cachedGraph = CacheService.getScriptCache().get("ARES_MEMORY_GRAPH");
    let graphData;
    
    if (cachedGraph) {
      graphData = JSON.parse(cachedGraph);
    } else {
      // Если кэш пуст — читаем из таблицы и обновляем кэш
      const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
      const graphSheet = ss.getSheetByName('MEMORY_GRAPH');
      if (graphSheet) {
        graphData = graphSheet.getDataRange().getDisplayValues().slice(1);
        CacheService.getScriptCache().put("ARES_MEMORY_GRAPH", JSON.stringify(graphData), 21600); // 6 часов
      }
    }

    if (graphData && graphData.length > 0) {
      const mentionedEntities = graphData.filter(row => {
        const entityName = row[0].toLowerCase();
        return entityName.length > 2 && lowerText.includes(entityName);
      });

      if (mentionedEntities.length > 0) {
        // Сортируем по частоте упоминаний (индекс 5) и берем только топ-3 релевантных сущностей
        const topEntities = mentionedEntities.sort((a, b) => (parseInt(b[5]) || 0) - (parseInt(a[5]) || 0)).slice(0, 3);
        
        memoryPrompt += "\n[АКТУАЛЬНАЯ ПАМЯТЬ О СУЩНОСТЯХ]:\n" + 
          topEntities.map(r => `— ${r[0]} (${r[1]}): ${r[2]} | Эмоции: Pos: ${r[6]}, Neg: ${r[7]}, Neu: ${r[8]}`).join("\n");
          
        memoryPrompt += "\n[ARES MEMORY PROTOCOL]: Используй эту память ТОЛЬКО для глубокого понимания контекста. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ повторять пользователю старые факты, начинать с 'Я помню, что...' или давать исторические справки, если он не просил. Отвечай строго по сути текущего сообщения.";
      }
    }

    // 2. Детекция команды дневника
    const diaryCommands = ["дневник", "запись", "запиши в дневник"];
    const isDiaryEntry = diaryCommands.some(cmd => lowerText.startsWith(cmd));

    // Если введено только слово-триггер без текста записи — ждем саму запись
    if (lowerText === "дневник" || lowerText === "запись" || lowerText === "запиши в дневник") {
      return "[[HARD_RESPONSE]] Жду твою запись...";
    }

    if (isDiaryEntry) {
      memoryPrompt += "\n\n[DIARY ENTRY MODE]: Пользователь делает запись в дневник. ЗАПРЕЩЕНЫ советы, анализ и мотивационные фразы. ТОЛЬКО: 1 краткая строка-подтверждение, что запись зафиксирована. Никакого \"ты молодец\". Никаких рекомендаций. Фоновый анализ проведет отдельный процесс.";
    }

    return memoryPrompt;
  } catch (e) {
    Logger.log("Ошибка getDiaryContext: " + e.message);
    return "";
  }
}

// ==============================================================================
// 🧠 БЛОК 2: ПРАВИЛА (MEMORY PROTOCOL)
// ==============================================================================

// Совместимость: в v9.0 правила дневника для User-mode живут в getDiaryModulePrompt() (Prompt.js)
// getDiaryRules() теперь возвращает промпт для фонового анализа
function getDiaryRules() {
  if (typeof getDiaryAnalysisPrompt === 'function') return getDiaryAnalysisPrompt();
  return `// ARES DIARY & MEMORY AGENT: извлекай инсайты, события и обновляй граф
[[DIARY_INSIGHT: Type | Entity | Summary | Confidence]]
[[MEMORY_EVENT: Entity | Event | Emotion | Intensity(1-5)]]
[[MEMORY_UPDATE: Entity | Category | Summary]]`;
}

// ==============================================================================
// ⚙️ БЛОК 3: ЛОГИКА И НОРМАЛИЗАЦИЯ
// ==============================================================================

/**
 * Нормализация имен сущностей для предотвращения дублей
 */
function normalizeEntityName(name) {
  if (!name) return "";
  let n = name.toLowerCase()
    .replace(/[\(\)\[\]\{\}]/g, "") // Убираем скобки
    .replace(/\b(клиент|друг|заказчик|проект|товарищ|знакомый)\b/gi, "") // Убираем роли
    .replace(/\s+/g, " ") // Лишние пробелы
    .trim();

  // Канонизация сущностей (Правило №1)
  const aliases = {
    "пользователь": ["user", "self", "me", "я", "дима", "дмитрий", "owner"],
    "мама": ["mother", "mom", "мать"],
    "виктория": ["victoria", "vika", "вика"],
    "валерий": ["valery", "valeriy", "валера"]
  };

  for (let canonical in aliases) {
    if (n === canonical || aliases[canonical].includes(n)) {
      n = canonical;
      break;
    }
  }

  return n.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Прямое логирование в DIARY_RAW
 */
function logDiaryRaw(text, source = "text") {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    let sheet = ss.getSheetByName('DIARY_RAW');
    if (!sheet) { ARES_INSTALL_DIARY(ss); sheet = ss.getSheetByName('DIARY_RAW'); }

    const timestamp = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
    let cleanText = text.replace(/^(дневник|запись|запиши в дневник)\s*:?\s*/i, "").trim();
    
    if (cleanText) {
      sheet.appendRow([timestamp, source, cleanText, "PENDING"]);
      if (typeof sysLog !== 'undefined') sysLog("📝 [DIARY] Запись успешно добавлена в таблицу DIARY_RAW: " + cleanText);
      return true;
    }
  } catch (e) { Logger.log("Ошибка logDiaryRaw: " + e.message); }
  return false;
}

// ==============================================================================
// 🔄 БЛОК 4: ФОНОВЫЕ ПРОЦЕССЫ (TRIGGERED)
// ==============================================================================

function ARES_DIARY_REFLECT_HOURLY() {
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  const rawSheet = ss.getSheetByName('DIARY_RAW');
  if (!rawSheet) return;

  const data = rawSheet.getDataRange().getValues();
  const pendingRows = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === "PENDING" || data[i][3] === "FAILED") {
      pendingRows.push({ index: i + 1, content: data[i][2], timestamp: data[i][0] });
      // Предварительно ставим статус PROCESSING для предотвращения race condition
      rawSheet.getRange(i + 1, 4).setValue("PROCESSING");
    }
    if (pendingRows.length >= 10) break; // Ограничение на один запуск
  }

  if (pendingRows.length === 0) return;

  const batchSize = 5;
  for (let i = 0; i < pendingRows.length; i += batchSize) {
    const batch = pendingRows.slice(i, i + batchSize);
    const combinedText = batch.map(b => `[RowID: ${b.index} | Time: ${b.timestamp}]: ${b.content}`).join("\n");
    
    const success = processDiaryBatch(combinedText, batch);
    
    batch.forEach(b => {
      rawSheet.getRange(b.index, 4).setValue(success ? "PROCESSED" : "FAILED");
    });
  }
  
  // Обновляем кэш после обработки
  refreshMemoryCache();
}

function processDiaryBatch(text, batchInfo) {
  const systemPrompt = getDiaryRules() + "\n\nТЕБЕ ДАНЫ ЗАПИСИ. ИЗВЛЕКИ ИНСАЙТЫ, СОБЫТИЯ И ОБНОВИ ГРАФ.";
  
  const payload = {
    "model": MODEL,
    "messages": [
      { "role": "system", "content": systemPrompt },
      { "role": "user", "content": "Проанализируй записи:\n" + text }
    ],
    "temperature": 0.2
  };

  try {
    const res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
      "method": "post",
      "headers": { "Authorization": "Bearer " + OR_KEY, "Content-Type": "application/json" },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });
    
    if (res.getResponseCode() !== 200) return false;
    const responseText = JSON.parse(res.getContentText()).choices[0].message.content;
    
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    
    // 1. Обработка Инсайтов (DIARY_INSIGHTS)
    const insightMatches = responseText.matchAll(/\[\[DIARY_INSIGHT:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\]\]/gi);
    const insightSheet = ss.getSheetByName('DIARY_INSIGHTS');
    for (const m of insightMatches) insightSheet.appendRow([new Date(), m[1], normalizeEntityName(m[2]), m[3], m[4]]);

    // 2. Обработка Событий (MEMORY_EVENTS)
    const eventMatches = responseText.matchAll(/\[\[MEMORY_EVENT:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\]\]/gi);
    const eventSheet = ss.getSheetByName('MEMORY_EVENTS');
    for (const m of eventMatches) {
      const entity = normalizeEntityName(m[1]);
      eventSheet.appendRow([new Date(), entity, m[2], m[3], m[4]]);
      updateEntityStats(entity, m[3]); // m[3] - Эмоция
    }

    // 3. Обновление Графа (MEMORY_GRAPH)
    const updateMatches = responseText.matchAll(/\[\[MEMORY_UPDATE:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\]\]/gi);
    const graphSheet = ss.getSheetByName('MEMORY_GRAPH');
    for (const m of updateMatches) {
      updateMemoryGraph(graphSheet, normalizeEntityName(m[1]), m[2], m[3]);
    }

    return true;
  } catch (e) {
    Logger.log("Ошибка processDiaryBatch: " + e.message);
    return false;
  }
}

function updateEntityStats(entity, emotion) {
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  const sheet = ss.getSheetByName('MEMORY_GRAPH');
  const data = sheet.getDataRange().getValues();
  
  // Нормализация эмоции (безопасно)
  let colOffset = 8; // По умолчанию Neutral (0-based index)
  if (!emotion || typeof emotion !== 'string') emotion = '';
  const e = emotion.toLowerCase().trim();

  // Правило №4: Эмоциональная матрица (поддерживаем подстрочное совпадение на русском и английском)
  const posWords = ["positive", "joy", "pride", "gratitude", "success", "happy", "satisfied", "hopeful", "позитив", "рад", "успех", "спокойн", "спокойств"];
  const negWords = ["frustration", "anger", "fear", "anxiety", "stress", "jealousy", "guilt", "sadness", "негатив", "зло", "гнев", "страх", "тревож", "вина", "грусть", "разочарова", "печаль", "злость"];

  if (posWords.some(w => e.indexOf(w) !== -1)) colOffset = 6;
  else if (negWords.some(w => e.indexOf(w) !== -1)) colOffset = 7;
  else colOffset = 8; // Не распознана — считаем нейтральной

  // Обновляем счетчик безопасно (сравнение по lowercase для устойчивости)
  const target = (entity || '').toString().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    const rowEntity = (data[i][0] || '').toString().toLowerCase();
    if (rowEntity === target) {
      let val = parseInt(data[i][colOffset]) || 0;
      sheet.getRange(i + 1, colOffset + 1).setValue(val + 1);
      break;
    }
  }
}

function updateMemoryGraph(sheet, entity, category, description) {
  const data = sheet.getDataRange().getValues();
  const now = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
  
  let foundIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === entity) { foundIndex = i + 1; break; }
  }

  if (foundIndex > -1) {
    const mentions = parseInt(data[foundIndex - 1][5]) || 0;
    // Безопасное обновление: не заменяем, а уточняем, если описание пустое или устарело
    sheet.getRange(foundIndex, 3).setValue(description); 
    sheet.getRange(foundIndex, 5).setValue(now);
    sheet.getRange(foundIndex, 6).setValue(mentions + 1);
  } else {
    sheet.appendRow([entity, category, description, now, now, 1, 0, 0, 0]);
  }
}

/**
 * Правило №6: Вечерняя рефлексия (Daily Summary)
 */
function ARES_DIARY_REFLECT_DAILY() {
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

  const systemPrompt = `Ты — Арес, когнитивный ааналитический агент.

ЗАДАЧА: вечерняя рефлексия дня.

CTRICTLY ОТВЕТИТЬ HTML-форматом (Telegram поддерживает только <b>, <i>, <code>, не <h2>/<ul>):

<b>🌙 ВЕЧЕРНИЙ ОТЧЕТ</b>

<b>1. События</b>
— ...
— ...

<b>2. Эмоции</b>
— ...

<b>3. Паттерны</b>
— ...

<b>4. Гипотеза на завтра</b>
<i>[ОДНА проверяемая идея поведения]</i>

ОГРАНИЧЕНИЯ:
— НЕТ мотивационных речей.
— Не писать "ты молодец", "держись", "продолжай".
— Не повторять шаблонные фразы.
— Только 1 гипотеза (4-я секция).
— Минимум слов. Максимум сути.`;

  const userPrompt = `Записи за сегодня:\n— ${todaysEntries}`;

  const payload = {
    "model": MODEL,
    "messages": [
      { "role": "system", "content": systemPrompt },
      { "role": "user", "content": userPrompt }
    ],
    "temperature": 0.3
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
      sendText(MY_ID, summary);
    }
  } catch (e) {
    Logger.log("Ошибка ARES_DIARY_REFLECT_DAILY: " + e.message);
  }
}

function refreshMemoryCache() {
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  const graphSheet = ss.getSheetByName('MEMORY_GRAPH');
  if (graphSheet) {
    const data = graphSheet.getDataRange().getDisplayValues().slice(1);
    CacheService.getScriptCache().put("ARES_MEMORY_GRAPH", JSON.stringify(data), 21600);
  }
}

// ==============================================================================
// 🚀 БЛОК 5: УСТАНОВКА И ИНИЦИАЛИЗАЦИЯ
// ==============================================================================

function ARES_INSTALL_DIARY(ss) {
  Logger.log("🛠️ Установка таблиц модуля Дневника (ARES MEMORY SYSTEM)...");
  if (!ss) {
    if (typeof ADS_DATA_SHEET_ID === 'undefined') {
      Logger.log("❌ Ошибка: не найден ADS_DATA_SHEET_ID");
      return;
    }
    ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  }
  const sheets = {
    'DIARY_RAW': ['Timestamp', 'Source', 'Content', 'Status'],
    'DIARY_INSIGHTS': ['Timestamp', 'Type', 'Entity', 'Summary', 'Confidence'],
    'MEMORY_EVENTS': ['Timestamp', 'Entity', 'Event', 'Emotion', 'Intensity'],
    'MEMORY_GRAPH': ['Entity', 'Category', 'Description', 'FirstSeen', 'LastSeen', 'Mentions', 'Pos', 'Neg', 'Neu']
  };

  for (let name in sheets) {
    if (!ss.getSheetByName(name)) {
      Logger.log(`Создание листа: ${name}...`);
      const newSheet = ss.insertSheet(name);
      newSheet.appendRow(sheets[name]);
      newSheet.getRange(1, 1, 1, sheets[name].length).setFontWeight("bold").setBackground("#cfe2f3");
      newSheet.setFrozenRows(1);
      SpreadsheetApp.flush(); // Принудительно сохраняем изменения
    }
  }
}

// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ (перенесён из Prompt.js в v10.0)
// ==============================================================================
function getDiaryIntent() {
  return `MODE: DIARY MODULE (запись в дневник)
Ты сейчас в режиме фиксации записи в дневник Димы.`;
}

function getDiaryProtocols() {
  return `ПОВЕДЕНИЕ:
— Пользователь делает запись в дневник. Записали. Всё.
— Дай ТОЛЬКО 1 краткую строку-подтверждение что запись зафиксирована.
— ЗАПРЕЩЕНЫ любые советы, анализ, мотивационные фразы.
— ЗАПРЕЩЕНО: "ты молодец", "держись", рекомендации, психологические наблюдения.
— Фоновый анализ проведёт отдельный процесс — ты его не дублируешь.

КРИТИЧЕСКИЕ ЗАПРЕТЫ:
— КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые теги (например, [[ADD_DIARY_ENTRY:...]], [[ADD_TASK:...]]) — НИКОГДА.
— Отвечай ТОЛЬКО обычным текстом. Не придумывай свои теги! Система УЖЕ сохранила запись.
— КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО анализировать эмоции и триггеры без явного запроса.
— Diary только ПОДТВЕРЖДАЕТ запись. Не анализирует.`;
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'diary',
  installFn: 'ARES_INSTALL_DIARY',
  enabled:  true,
  handler:  'handleDiary',
  promptIntentFn:  'getDiaryIntent',
  promptProtocolsFn: 'getDiaryProtocols',
  contextFn: 'getDiaryContext',
  protocols: [],
  allowedProtocols: [],
  allowTextFallback: true,
  sessionTimeout: 10,
  priority:       50,
  historyKey:     'history_diary',
  triggers: ['дневник', 'запись', 'запиши в дневник', 'заметк']
});

function handleDiary(aresResponse, payload, input, parsedTags, ctx) {
  var source = input && input.hasVoice ? 'voice' : 'text';
  logDiaryRaw(payload.text, source);
  return aresResponse;
}
