/**
 * ==============================================================================
 * 🍎 MODULE NUTRITION v1.1
 * Отслеживание КБЖУ, микроэлементов, лимитов и анализ питания.
 * ==============================================================================
 */

function _getNutritionLimits() {
  var targetSheetId = getModuleSetting('nutrition', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return { calories: 2000, protein: 150, fat: 70, carbs: 250, mag: 400, calc: 1000, iron: 15, zinc: 11, vitC: 90, vitD: 15 };
  
  const ss = SpreadsheetApp.openById(targetSheetId);
  var limitsSheetName = getModuleSetting('nutrition', 'limitsSheet', 'Nutrition_Limits');
  let sheet = ss.getSheetByName(limitsSheetName);
  if (!sheet) return { calories: 2000, protein: 150, fat: 70, carbs: 250, mag: 400, calc: 1000, iron: 15, zinc: 11, vitC: 90, vitD: 15 };
  
  var data = sheet.getDataRange().getValues();
  var limits = {};
  for (var i = 1; i < data.length; i++) {
    var metric = data[i][0];
    var val = parseFloat(data[i][1]) || 0;
    if (metric === 'Calories') limits.calories = val;
    if (metric === 'Protein') limits.protein = val;
    if (metric === 'Fat') limits.fat = val;
    if (metric === 'Carbs') limits.carbs = val;
    if (metric === 'Magnesium') limits.mag = val;
    if (metric === 'Calcium') limits.calc = val;
    if (metric === 'Iron') limits.iron = val;
    if (metric === 'Zinc') limits.zinc = val;
    if (metric === 'Vitamin C') limits.vitC = val;
    if (metric === 'Vitamin D') limits.vitD = val;
  }
  return limits;
}

function _getNutritionToday(targetDateObj) {
  var targetSheetId = getModuleSetting('nutrition', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return { calories: 0, protein: 0, fat: 0, carbs: 0, mag: 0, calc: 0, iron: 0, zinc: 0, vitC: 0, vitD: 0 };
  
  const ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('nutrition', 'logSheet', 'Nutrition_Log');
  let sheet = ss.getSheetByName(logSheetName);
  if (!sheet) return { calories: 0, protein: 0, fat: 0, carbs: 0, mag: 0, calc: 0, iron: 0, zinc: 0, vitC: 0, vitD: 0 };
  
  var data = sheet.getDataRange().getValues();
  var today = targetDateObj || new Date();
  var currentMonth = today.getMonth();
  var currentYear = today.getFullYear();
  var currentDay = today.getDate();
  
  var totals = { calories: 0, protein: 0, fat: 0, carbs: 0, mag: 0, calc: 0, iron: 0, zinc: 0, vitC: 0, vitD: 0 };
  
  var colDate = colToIdx(getModuleSetting('nutrition', 'col_date', 'A'), 0);
  var colCal  = colToIdx(getModuleSetting('nutrition', 'col_cal', 'B'), 1);
  var colPro  = colToIdx(getModuleSetting('nutrition', 'col_pro', 'C'), 2);
  var colFat  = colToIdx(getModuleSetting('nutrition', 'col_fat', 'D'), 3);
  var colCarb = colToIdx(getModuleSetting('nutrition', 'col_carb', 'E'), 4);
  
  var colMag  = colToIdx(getModuleSetting('nutrition', 'col_mag', 'G'), 6);
  var colCalc = colToIdx(getModuleSetting('nutrition', 'col_calc', 'H'), 7);
  var colIron = colToIdx(getModuleSetting('nutrition', 'col_iron', 'I'), 8);
  var colZinc = colToIdx(getModuleSetting('nutrition', 'col_zinc', 'J'), 9);
  var colVitC = colToIdx(getModuleSetting('nutrition', 'col_vitC', 'K'), 10);
  var colVitD = colToIdx(getModuleSetting('nutrition', 'col_vitD', 'L'), 11);

  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][colDate];
    if (!rawDate) continue;
    
    var txDate;
    if (rawDate instanceof Date) {
      var sheetTz = ss.getSpreadsheetTimeZone();
      var formatted = Utilities.formatDate(rawDate, sheetTz, "yyyy-MM-dd");
      var parts = formatted.split('-');
      txDate = new Date(parts[0], parts[1]-1, parts[2]);
    } else {
      var parts = rawDate.toString().split(' ');
      if (parts.length < 1) continue;
      
      var datePart = parts[0];
      var dParts;
      if (datePart.indexOf('-') !== -1) {
        dParts = datePart.split('-');
        if (dParts.length >= 3) {
          // YYYY-MM-DD
          if (dParts[0].length === 4) {
            txDate = new Date(dParts[0], dParts[1] - 1, dParts[2]);
          } else { // DD-MM-YYYY
            txDate = new Date(dParts[2], dParts[1] - 1, dParts[0]);
          }
        }
      } else if (datePart.indexOf('.') !== -1) {
        dParts = datePart.split('.');
        if (dParts.length >= 3) {
          // DD.MM.YYYY
          if (dParts[2].length === 4) {
            txDate = new Date(dParts[2], dParts[1] - 1, dParts[0]);
          } else { // YYYY.MM.DD
            txDate = new Date(dParts[0], dParts[1] - 1, dParts[2]);
          }
        }
      }
      
      if (!txDate || isNaN(txDate.getTime())) continue;
    }
    
    if (txDate.getDate() === currentDay && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
      totals.calories += parseFloat(data[i][colCal]) || 0;
      totals.protein += parseFloat(data[i][colPro]) || 0;
      totals.fat += parseFloat(data[i][colFat]) || 0;
      totals.carbs += parseFloat(data[i][colCarb]) || 0;
      
      totals.mag += parseFloat(data[i][colMag]) || 0;
      totals.calc += parseFloat(data[i][colCalc]) || 0;
      totals.iron += parseFloat(data[i][colIron]) || 0;
      totals.zinc += parseFloat(data[i][colZinc]) || 0;
      totals.vitC += parseFloat(data[i][colVitC]) || 0;
      totals.vitD += parseFloat(data[i][colVitD]) || 0;
    }
  }
  return totals;
}

function _writeToNutritionLog(payload, ctx) {
  var targetSheetId = getModuleSetting('nutrition', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return;
  
  const ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('nutrition', 'logSheet', 'Nutrition_Log');
  let sheet = ss.getSheetByName(logSheetName);
  if (!sheet) return;

  var row = [];
  row[colToIdx(getModuleSetting('nutrition', 'col_date', 'A'), 0)] = payload.date;
  row[colToIdx(getModuleSetting('nutrition', 'col_cal', 'B'), 1)] = payload.calories;
  row[colToIdx(getModuleSetting('nutrition', 'col_pro', 'C'), 2)] = payload.protein;
  row[colToIdx(getModuleSetting('nutrition', 'col_fat', 'D'), 3)] = payload.fat;
  row[colToIdx(getModuleSetting('nutrition', 'col_carb', 'E'), 4)] = payload.carbs;
  row[colToIdx(getModuleSetting('nutrition', 'col_desc', 'F'), 5)] = payload.description;
  
  row[colToIdx(getModuleSetting('nutrition', 'col_mag', 'G'), 6)] = payload.mag || 0;
  row[colToIdx(getModuleSetting('nutrition', 'col_calc', 'H'), 7)] = payload.calc || 0;
  row[colToIdx(getModuleSetting('nutrition', 'col_iron', 'I'), 8)] = payload.iron || 0;
  row[colToIdx(getModuleSetting('nutrition', 'col_zinc', 'J'), 9)] = payload.zinc || 0;
  row[colToIdx(getModuleSetting('nutrition', 'col_vitC', 'K'), 10)] = payload.vitC || 0;
  row[colToIdx(getModuleSetting('nutrition', 'col_vitD', 'L'), 11)] = payload.vitD || 0;

  // Replace empty indices with ""
  for (var i = 0; i < row.length; i++) {
    if (row[i] === undefined) row[i] = "";
  }

  try {
    sheet.appendRow(row);
    SpreadsheetApp.flush(); // Принудительно применяем изменения без задержки
    
    if (typeof sysLog !== 'undefined') sysLog(`📝 [SHEET_WRITE]: Вкладка '${logSheetName}'. Добавлена еда: ` + payload.description);
    if (ctx && ctx.trace) ctx.trace.stage('SHEET_WRITE', { sheet: logSheetName, action: 'add entry', food: payload.description, calories: payload.calories });
  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog(`❌ [SHEET_ERROR]: Ошибка при записи еды: ` + e.message);
    if (ctx && ctx.trace) ctx.trace.stage('SHEET_ERROR', { error: e.message, sheet: logSheetName });
  }
}


// ==============================================================================
// 🧠 ИНТЕРФЕЙСЫ ДЛЯ ЯДРА (v10)
// ==============================================================================

function nutritionIntentResolver(text) {
  var t = typeof text === 'string' ? text.toLowerCase() : '';
  
  // ADD markers
  if (t.indexOf('запиши') !== -1 || t.indexOf('съел') !== -1 || t.indexOf('добавь') !== -1 || t.indexOf('грамм') !== -1 || t.indexOf('ккал') !== -1 || t.indexOf('калорий') !== -1) {
    if (t.indexOf('сколько') !== -1 && (t.indexOf('я съел') !== -1 || t.indexOf('осталось') !== -1)) return 'QUERY';
    return 'ADD';
  }
  
  // QUERY markers
  if (t === 'сводка' || t === 'сводка питания' || t === 'итоги' || t === 'статистика' || t === 'покажи питание') {
    return {
      intent: 'QUERY',
      bypassLLM: true,
      tags: ['[[NUTRITION_SUMMARY: {"date": "today"}]]']
    };
  }
  if (t.indexOf('сводка') !== -1 || t.indexOf('итоги') !== -1 || t.indexOf('покажи питание') !== -1 || t.indexOf('статистика') !== -1) {
    return 'QUERY';
  }
  
  // PLAN markers
  if (t.indexOf('прикинь') !== -1 || t.indexOf('план') !== -1 || t.indexOf('прогноз') !== -1 || t.indexOf('калькуляция') !== -1 || t.indexOf('если я съем') !== -1) {
    return 'PLAN';
  }
  
  return null;
}

function getNutritionIntent() {
  var custom = getModuleSetting('nutrition', 'customPrompt', '');
  if (custom && custom.length > 10) return custom;

  return `MODE: NUTRITION MODULE (Питание)
Ты — эксперт-диетолог. Анализируй сообщения пользователя о еде и переводи их в нутриенты.

⚠️ АБСОЛЮТНОЕ ПРАВИЛО №1 — НИКОГДА НЕ СТАВЬ 0 ДЛЯ protein, fat, carbs:
Ты — нейросеть с базой знаний о составе ВСЕХ продуктов. Оладьи с картофелем, суши, гречка, яблоко — ты ЗНАЕШЬ их БЖУ.
Если пользователь не указал БЖУ — РАССЧИТАЙ ИХ САМИ из своей базы знаний по весу блюда.
Нулевые белки/жиры/углеводы = критическая ошибка данных = нельзя ни при каких условиях.

⚠️ ОБЯЗАТЕЛЬНЫЙ АЛГОРИТМ для NUTRITION_ADD (выполнять В БЛОКЕ <thought>):
1. Определить блюдо и его вес в граммах.
2. Вспомнить из базы знаний: сколько БЕЛКОВ, ЖИРОВ, УГЛЕВОДОВ на 100г этого блюда.
3. Умножить каждый нутриент на (вес/100).
4. Записать результаты в JSON тег.
Пример: Оладьи с картофелем: Б≈5г/100г, Ж≈8г/100г, У≈25г/100г.
При весе 300г: Б=15, Ж=24, У=75. CALORIES=600 (из данных пользователя).`;
}

function getNutritionProtocols() {
  var limits = _getNutritionLimits();
  var today = _getNutritionToday();
  
  return `ШАГИ ОТВЕТА (СТРОГО СОБЛЮДАТЬ ПОРЯДОК):
1. СНАЧАЛА определи намерение пользователя и свою уверенность в нём.
2. Выведи ПЕРВОЙ СТРОКОЙ тег намерения: [[MODULE_INTENT: <INTENT>]]
   Где INTENT — одно из: ADD (запись еды), QUERY (вопрос/сводка), PLAN (планирование/прикидка), SMALL_TALK (обычный разговор/привет/вопрос не про еду), UNKNOWN (непонятно)
3. Выведи ВТОРОЙ СТРОКОЙ тег уверенности: [[MODULE_CONFIDENCE: <0.0-1.0>]]
   Это твоя честная оценка, насколько ты уверен в определении намерения.
4. Если намерение SMALL_TALK или UNKNOWN — дай короткий разговорный ответ БЕЗ таблиц КБЖУ и БЕЗ протоколов.
5. Если уверенность < 0.6 — спроси уточнение, не выполняй действие.
6. Только при ADD/QUERY/PLAN — выполняй логику ниже.

КРИТИЧЕСКОЕ ПРАВИЛО (CHAIN OF THOUGHT + БЖУ):
В блоке <thought> ТЫ ОБЯЗАН сначала рассчитать БЖУ блюда из своей базы знаний:
— Вспомни: сколько белков, жиров, углеводов на 100г этого блюда?
— Умножь на фактический вес.
— Только потом генерируй JSON тег с НЕНУЛЕВЫМИ значениями protein, fat, carbs.

МАРКЕРЫ НАМЕРЕНИЯ ПОЛЬЗОВАТЕЛЯ (КРИТИЧЕСКИ ВАЖНО):
1. ПРИКИДКА/ФОРЕКАСТ: Если пользователь просит "прикинь", "план", "прогноз", "расчет", "калькуляция", "посчитай", "сколько будет", "а если я съем", или задает гипотетический вопрос (что будет если) — СТРОГО возвращай [[NUTRITION_PLAN]] (мы НЕ записываем это в базу, мы просто считаем варианты). НЕ ИСПОЛЬЗУЙ NUTRITION_ADD!
2. ФАКТ/ЗАПИСЬ: Если в тексте есть слова "съел", "запись", "факт", "готово", "добавь" или явно понятно, что еда УЖЕ съедена — СТРОГО возвращай [[NUTRITION_ADD]].
3. СВОДКА/ИТОГИ: Если пользователь просит "сводка", "итоги", "сколько я съел", "покажи питание" — СТРОГО возвращай [[NUTRITION_SUMMARY: {"date": "YYYY-MM-DD"}]]. Если за сегодня, оставь объект пустым: {}. Если за вчера, вычисли вчерашнюю дату и подставь.

ФОРМАТ ТЕГА (ДЛЯ ЗАПИСИ ЕДЫ):
1. Если блюд несколько, объединяй их в ОДИН тег NUTRITION_ADD, суммируя нутриенты.

[[NUTRITION_ADD: {"calories":600, "protein":15, "fat":24, "carbs":75, "mag":25, "calc":35, "iron":1, "zinc":1, "vitC":3, "vitD":0, "description":"Оладьи с картофелем"}]]

ПРАВИЛА ДЛЯ СОВЕТОВ И ПЛАНИРОВАНИЯ:
1. Опирайся на блок "ТЕКУЩИЙ ПРОГРЕСС". Твоя математическая задача — вычислить ТОЧНЫЕ граммы.
2. Формат тега: [[NUTRITION_PLAN: [ массив из 3-х объектов ]]]

Шпаргалка JSON для NUTRITION_PLAN:
[[NUTRITION_PLAN: [
  {
    "_thought": "расчёты",
    "title": "Упор на белок",
    "items": [
      {"name": "Булгур", "weight": "350г", "cal": 616, "pro": 42, "fat": 14, "carb": 77}
    ]
  }
]]]

ПРАВИЛА ДЛЯ ЗАПИСИ ЕДЫ (ЕСЛИ ГЕНЕРИРУЕШЬ ТЕГ NUTRITION_ADD):
1. Если перечисляет несколько блюд, генерируй ОДИН тег [[NUTRITION_ADD: {...}]] с общими суммами и общим описанием.
2. Используй целые числа для макронутриентов. Твоя нейросеть содержит данные обо всей еде. НИКОГДА не пиши "БЖУ неизвестны".
3. АБСОЛЮТНЫЙ ЗАПРЕТ НА НУЛИ В БЖУ: Поля protein, fat, carbs НИКОГДА не могут быть 0. Даже если пользователь дал только калории — ты ОБЯЗАН вычислить примерные граммы. Используй среднее соотношение для блюда из своей базы знаний (1г белка=4ккал, 1г угл=4ккал, 1г жира=9ккал). Вычисли "_thought" и получи реальные цифры.
4. ЕСЛИ ПОЛЬЗОВАТЕЛЬ ДАЛ ТОЛЬКО КАЛОРИИ (например, "в суши 187 ккал") — ТЫ ВСЕ РАВНО ОБЯЗАН РАССЧИТАТЬ ПРИМЕРНЫЕ БЕЛКИ, ЖИРЫ И УГЛЕВОДЫ. НИКОГДА НЕ ПИШИ 0 ДЛЯ БЖУ, это ломает статистику! Подгони граммы БЖУ так, чтобы они в сумме давали эти калории (1г белка=4ккал, 1г углеводов=4ккал, 1г жира=9ккал).
5. ОПЦИОНАЛЬНАЯ ДАТА: ДОБАВЛЯЙ ПОЛЕ "date" ТОЛЬКО ЕСЛИ ПОЛЬЗОВАТЕЛЬ ЯВНО НАПИСАЛ "вчера", "позавчера" ИЛИ УКАЗАЛ ДАТУ! По умолчанию поле "date" писать КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО!
6. МИКРОНУТРИЕНТЫ: Обязательно добавь в JSON поля mag (магний, мг), calc (кальций, мг), iron (железо, мг), zinc (цинк, мг), vitC (витамин С, мг), vitD (витамин D, мкг), даже если это примерные оценки! НИКОГДА не пиши 0 для всех сразу.
7. АБСОЛЮТНЫЙ ЗАПРЕТ НА НАКОПИТЕЛЬНЫЙ УЧЕТ: Рассчитывай нутриенты ИСКЛЮЧИТЕЛЬНО для той еды, которая описана в ТЕКУЩЕМ (последнем) сообщении пользователя. Каждый тег [[NUTRITION_ADD]] создает НОВУЮ строку в логе. Категорически запрещено суммировать текущую еду с едой из прошлых сообщений истории чата или блока "ТЕКУЩИЙ ПРОГРЕСС", иначе это приведет к двойному суммированию!

ДНЕВНЫЕ ЛИМИТЫ ПОЛЬЗОВАТЕЛЯ:
Калории: ${limits.calories} | Белки: ${limits.protein}г | Жиры: ${limits.fat}г | Углеводы: ${limits.carbs}г
Mg: ${limits.mag}мг | Ca: ${limits.calc}мг | Fe: ${limits.iron}мг | Zn: ${limits.zinc}мг | Vit C: ${limits.vitC}мг | Vit D: ${limits.vitD}мкг

ТЕКУЩИЙ ПРОГРЕСС:
Калории: ${Math.round(today.calories)} | Белки: ${Math.round(today.protein)}г | Жиры: ${Math.round(today.fat)}г | Углеводы: ${Math.round(today.carbs)}г
`;
}

function handleNutritionResponse(response, payloadContext, input, parsedTags, ctx) {
  if (typeof sysLog !== 'undefined') sysLog("⚙️ [MODULE_FUNCTION] Выполняется обработчик: handleNutritionResponse", MY_ID);

  var processedAny = false;
  var foodsAdded = [];
  var summaryTargetDateStr = null;
  var planVariants = null;
  
  if (parsedTags && parsedTags.length > 0) {
    for (var k = 0; k < parsedTags.length; k++) {
      var tag = parsedTags[k];
      
      if (tag.name === 'NUTRITION_ADD') {
        var payload = tag.payload;
        if (typeof sysLog !== 'undefined') sysLog("🍔 [NUTRITION_ADD] Распознана еда: " + payload.description, MY_ID);
        
        var m_mag = payload.mag || 0;
        var m_calc = payload.calc || 0;
        var m_iron = payload.iron || 0;
        var m_zinc = payload.zinc || 0;
        var m_vitC = payload.vitC || 0;
        var m_vitD = payload.vitD || 0;
        
        payload.protein = payload.protein !== undefined ? payload.protein : (payload.pro || 0);
        payload.fat = payload.fat !== undefined ? payload.fat : 0;
        payload.carbs = payload.carbs !== undefined ? payload.carbs : (payload.carb || 0);

        var dateStr = Utilities.formatDate(new Date(), TIME_ZONE, "dd.MM.yyyy HH:mm");
        if (payload.date) {
          var todayStr = Utilities.formatDate(new Date(), TIME_ZONE, "dd.MM.yyyy");
          if (payload.date === todayStr) {
            if (typeof sysLog !== 'undefined') sysLog("⚠️ [NUTRITION] ИИ указал сегодняшнюю дату — игнорируем, используем текущее время");
          } else {
            dateStr = payload.date + " 12:00";
          }
        }
        _writeToNutritionLog({
          date: dateStr,
          calories: payload.calories,
          protein: payload.protein,
          fat: payload.fat,
          carbs: payload.carbs,
          description: payload.description,
          mag: m_mag, calc: m_calc, iron: m_iron, zinc: m_zinc, vitC: m_vitC, vitD: m_vitD
        }, ctx);
        
        payload.parsedDateStr = dateStr;
        foodsAdded.push(payload);
        processedAny = true;
        
        if (typeof emitEvent === 'function') {
          emitEvent('NUTRITION_ADD', payload);
        }
      } else if (tag.name === 'NUTRITION_SUMMARY' || tag.name === 'NUTRITION_GET') {
        processedAny = true;
        if (tag.payload && tag.payload.date) summaryTargetDateStr = tag.payload.date;
      } else if (tag.name === 'NUTRITION_PLAN') {
        planVariants = tag.payload;
      }
    }
  }

  // Fallback для старых модулей или если теги не были распарсены глобально
  if (!processedAny && !planVariants) {
    var regex = /\[\[NUTRITION_ADD:\s*(\{[\s\S]*?\})\s*\]\]/g;
    var match;
    var sumMatch = /\[\[NUTRITION_(?:SUMMARY|GET):?\s*(\{[\s\S]*?\})?\]\]/i.exec(response);
    if (sumMatch || /\[\[NUTRITION_SUMMARY\]\]/i.test(response)) {
      processedAny = true;
      if (sumMatch && sumMatch[1]) {
        try {
          var sumPayload = JSON.parse(sumMatch[1]);
          if (sumPayload.date) summaryTargetDateStr = sumPayload.date;
        } catch(e) {}
      }
    }

    while ((match = regex.exec(response)) !== null) {
      try {
        var payload = JSON.parse(match[1]);
        if (typeof sysLog !== 'undefined') sysLog("🍔 [NUTRITION_ADD] Распознана еда: " + payload.description, MY_ID);
        
        var m_mag = payload.mag || 0;
        var m_calc = payload.calc || 0;
        var m_iron = payload.iron || 0;
        var m_zinc = payload.zinc || 0;
        var m_vitC = payload.vitC || 0;
        var m_vitD = payload.vitD || 0;
        
        payload.protein = payload.protein !== undefined ? payload.protein : (payload.pro || 0);
        payload.fat = payload.fat !== undefined ? payload.fat : 0;
        payload.carbs = payload.carbs !== undefined ? payload.carbs : (payload.carb || 0);

        var dateStr = Utilities.formatDate(new Date(), TIME_ZONE, "dd.MM.yyyy HH:mm");
        if (payload.date) {
          var todayStr = Utilities.formatDate(new Date(), TIME_ZONE, "dd.MM.yyyy");
          if (payload.date === todayStr) {
            if (typeof sysLog !== 'undefined') sysLog("⚠️ [NUTRITION] ИИ указал сегодняшнюю дату — игнорируем, используем текущее время");
          } else {
            dateStr = payload.date + " 12:00";
          }
        }
        _writeToNutritionLog({
          date: dateStr,
          calories: payload.calories,
          protein: payload.protein,
          fat: payload.fat,
          carbs: payload.carbs,
          description: payload.description,
          mag: m_mag, calc: m_calc, iron: m_iron, zinc: m_zinc, vitC: m_vitC, vitD: m_vitD
        }, ctx);
        
        payload.parsedDateStr = dateStr;
        foodsAdded.push(payload);
        processedAny = true;
        
        if (typeof emitEvent === 'function') {
          emitEvent('NUTRITION_ADD', payload);
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog("❌ [NUTRITION] Ошибка парсинга JSON: " + e.toString());
      }
    }
  }

  // Обработка NUTRITION_PLAN
  if (!processedAny) {
    if (!planVariants) {
      var planRegex = /\[\[NUTRITION_PLAN:\s*(\[[\s\S]*?\])\s*\]\]/i;
      var planMatch = planRegex.exec(response);
      if (planMatch) {
        try { planVariants = JSON.parse(planMatch[1]); } catch(e) {}
      }
    }
    
    if (planVariants) {
      try {
        var variants = planVariants;
        var body = "";
        
        var limits = _getNutritionLimits();
        var today = _getNutritionToday();
        
        for (var i = 0; i < variants.length; i++) {
          var v = variants[i];
          body += "<b>ВАРИАНТ " + (i+1) + (v.title ? " (" + v.title + ")" : "") + ":</b>\n";
          
          var sumCal = 0, sumPro = 0, sumFat = 0, sumCarb = 0;
          
          if (v.items && v.items.length) {
            for (var j = 0; j < v.items.length; j++) {
               var item = v.items[j];
               body += "🔹 " + item.name + ": <b>" + item.weight + "</b>\n";
               sumCal += (item.cal || 0);
               sumPro += (item.pro || 0);
               sumFat += (item.fat || 0);
               sumCarb += (item.carb || 0);
            }
          }
          body += "➕ Даст: " + Math.round(sumCal) + " ккал | Б: " + Math.round(sumPro) + "г | Ж: " + Math.round(sumFat) + "г | У: " + Math.round(sumCarb) + "г\n\n";
          
          var renderStat = function(emoji, name, addedVal, todayVal, limitVal, suffix) {
             var total = Math.round(todayVal + addedVal);
             var pct = limitVal > 0 ? Math.round((total / limitVal) * 100) : 0;
             var icon = pct >= 130 ? '⚠️' : (pct >= 95 ? '✅' : '');
             return emoji + " " + name + ": " + total + " / " + limitVal + " " + suffix + " (" + pct + "%) " + icon;
          };
          
          body += renderStat("🔥", "Калории", sumCal, today.calories, limits.calories, "ккал") + "\n";
          body += renderStat("💪", "Белки", sumPro, today.protein, limits.protein, "г") + "\n";
          body += renderStat("🥑", "Жиры", sumFat, today.fat, limits.fat, "г") + "\n";
          body += renderStat("🍞", "Углеводы", sumCarb, today.carbs, limits.carbs, "г") + "\n";
          
          if (i < variants.length - 1) body += "\n═════════════════════\n\n";
        }
        
        if (typeof aresFormatMessage === 'function') {
          return aresFormatMessage("АНАЛИЗ РАЦИОНА", "💡", body);
        } else {
          return "💡 <b>АНАЛИЗ РАЦИОНА</b>\n\n" + body;
        }
      } catch (e) {
        // Fallback если ИИ сломал JSON
        return "💡 <b>Ошибка формирования ответа.</b>\n\n" + response.replace(/\[\[NUTRITION_PLAN:[\s\S]*?\]\]/g, '').trim();
      }
      // Fallback если тег не найден
      var cleanText = response.replace(/\[\[[\s\S]*?\]\]/g, '').trim();
      if (!cleanText) return response;
      
      var fallbackAdvice = cleanText.replace(/\*/g, '🔹');
      var variantIndex = fallbackAdvice.search(/🍎\s*(?:<b>)?ВАРИАНТ|📝\s*(?:<b>)?ВАРИАНТ|(?:<b>)?ВАРИАНТ 1/i);
      
      // Если это не похоже на рацион/план питания и нет слова "вариант", возвращаем чистый текст
      var hasNutritionKeywords = /калори|белк|жир|углевод|рацион|еда|питание|меню/i.test(fallbackAdvice);
      if (variantIndex === -1 && !hasNutritionKeywords) {
        return cleanText;
      }
      
      if (variantIndex !== -1) fallbackAdvice = fallbackAdvice.substring(variantIndex);
      
      if (typeof aresFormatMessage === 'function') {
        return aresFormatMessage("АНАЛИЗ РАЦИОНА", "💡", fallbackAdvice);
      } else {
        return "💡 <b>АНАЛИЗ РАЦИОНА:</b>\n\n" + fallbackAdvice;
      }
    }
  }
  
  // Пересчитываем итоги за день с учетом новой еды
  var limits = _getNutritionLimits();
  var targetDateObj = null;
  var dateLabel = "СВОДКА ЗА ДЕНЬ";
  
  if (summaryTargetDateStr) {
    // Expected formats: YYYY-MM-DD or DD.MM.YYYY
    if (summaryTargetDateStr === 'today') {
      targetDateObj = new Date();
    } else if (summaryTargetDateStr.indexOf('-') !== -1) {
      p = summaryTargetDateStr.split('-');
      targetDateObj = new Date(p[0], p[1]-1, p[2]);
    } else if (summaryTargetDateStr.indexOf('.') !== -1) {
      p = summaryTargetDateStr.split('.');
      targetDateObj = new Date(p[2], p[1]-1, p[0]);
    }
    if (targetDateObj && !isNaN(targetDateObj.getTime())) {
      dateLabel = "СВОДКА ЗА " + Utilities.formatDate(targetDateObj, TIME_ZONE, "dd.MM.yyyy");
    }
  } else if (foodsAdded.length > 0 && foodsAdded[0].parsedDateStr) {
    var p = foodsAdded[0].parsedDateStr.split(' ')[0].split('.');
    targetDateObj = new Date(p[2], p[1]-1, p[0]);
    var now = new Date();
    if (targetDateObj.getDate() !== now.getDate() || targetDateObj.getMonth() !== now.getMonth()) {
      dateLabel = "СВОДКА ЗА " + foodsAdded[0].parsedDateStr.split(' ')[0];
    }
  }
  var today = _getNutritionToday(targetDateObj);
  
  var pctCal = Math.round((today.calories / limits.calories) * 100) || 0;
  var pctPro = Math.round((today.protein / limits.protein) * 100) || 0;
  var pctFat = Math.round((today.fat / limits.fat) * 100) || 0;
  var pctCarb = Math.round((today.carbs / limits.carbs) * 100) || 0;
  
  var calWarn = pctCal > 100 ? " ⚠️" : "";
  var proWarn = pctPro > 100 ? " ⚠️" : "";
  
  var body = "";
  if (foodsAdded.length > 0) {
    body += "<b>ПРИЕМ ПИЩИ (" + foodsAdded.length + "):</b>\n";
    for (var i = 0; i < foodsAdded.length; i++) {
      var f = foodsAdded[i];
      body += "🔹 " + f.description + " <code>[" + f.calories + " ккал | Б:" + f.protein + " Ж:" + f.fat + " У:" + f.carbs + "]</code>\n";
    }
    body += "\n";
  }
  
  body += "<b>" + dateLabel + " (КБЖУ):</b>\n";
  body += "🔥 Калории: <code>" + Math.round(today.calories) + " / " + limits.calories + " ккал (" + pctCal + "%)</code>" + calWarn + "\n";
  body += "💪 Белки: <code>" + Math.round(today.protein) + " / " + limits.protein + " г (" + pctPro + "%)</code>" + proWarn + "\n";
  body += "🥑 Жиры: <code>" + Math.round(today.fat) + " / " + limits.fat + " г (" + pctFat + "%)</code>\n";
  body += "🍞 Углеводы: <code>" + Math.round(today.carbs) + " / " + limits.carbs + " г (" + pctCarb + "%)</code>\n\n";
  
  body += "<b>МИКРОНУТРИЕНТЫ (СЪЕДЕНО):</b>\n";
  body += "Mg: <code>" + Math.round(today.mag) + "/" + limits.mag + "</code> | Ca: <code>" + Math.round(today.calc) + "/" + limits.calc + "</code>\n";
  body += "Fe: <code>" + Math.round(today.iron) + "/" + limits.iron + "</code> | Zn: <code>" + Math.round(today.zinc) + "/" + limits.zinc + "</code>\n";
  body += "Vit C: <code>" + Math.round(today.vitC) + "/" + limits.vitC + "</code> | Vit D: <code>" + Math.round(today.vitD) + "/" + limits.vitD + "</code>\n";
  
  if (typeof aresFormatMessage === 'function') {
    return aresFormatMessage("ПИТАНИЕ И КБЖУ", "📊", body);
  } else {
    return "📊 <b>ПИТАНИЕ И КБЖУ</b>\n\n" + body;
  }
}

// ==============================================================================
// 🔌 РЕГИСТРАЦИЯ МОДУЛЯ
// ==============================================================================
if (typeof registerModule === 'function') {
  registerModule({
    name: 'nutrition',
    installFn: 'ARES_INSTALL_NUTRITION',
    enabled: true,
    triggers: ['еда', 'еду', 'еде', 'еды', 'питание', 'кбжу', 'калори', 'калорий', 'съел', 'съела', 'поел', 'поела', 'рацион', 'перекус', 'завтрак', 'обед', 'ужин', 'оладьи', 'блюдо', 'продукт', 'грамм'],
    promptIntentFn: 'getNutritionIntent',
    promptProtocolsFn: 'getNutritionProtocols',
    intentResolverFn: 'nutritionIntentResolver',
    handler: 'handleNutritionResponse',
    protocols: [
      { tag: '[[NUTRITION_ADD:', handler: 'handleNutritionResponse', desc: 'Запись еды (ФАКТ): [[NUTRITION_ADD: {"calories":300, "protein":20, "fat":10, "carbs":30, "mag":40, "calc":150, "iron":2, "zinc":1, "vitC":5, "vitD":0, "description":"Куриное филе"}]] (ОБЯЗАТЕЛЬНО рассчитывай protein, fat, carbs и микронутриенты, никогда не оставляй 0!)' },
      { tag: '[[NUTRITION_PLAN:', handler: 'handleNutritionResponse', desc: 'Прикидка/Совет/План (ФОРЕКАСТ): [[NUTRITION_PLAN: [ { "title": "Упор на белок", "items": [{"name": "Булгур", "weight": "350г", "cal": 616, "pro": 42, "fat": 14, "carb": 77}] } ]]]' },
      { tag: '[[NUTRITION_SUMMARY:', handler: 'handleNutritionResponse', desc: 'Сводка за день: [[NUTRITION_SUMMARY: {}]]' }
    ],
    allowedProtocols: ['[[NUTRITION_ADD:', '[[NUTRITION_PLAN:', '[[NUTRITION_SUMMARY:'],
    sessionTimeout: 10,
    priority: 85,
    aiOpts: { max_tokens: 4000 },
    intentsSchema: {
      '[[NUTRITION_ADD:': {
        "calories": 0,
        "protein": 0,
        "fat": 0,
        "carbs": 0,
        "mag": 0,
        "calc": 0,
        "iron": 0,
        "zinc": 0,
        "vitC": 0,
        "vitD": 0,
        "description": "Название блюда",
        "date": "DD.MM.YYYY"
      }
    },
    settings: [
      { key: 'customPrompt', label: 'Системный Промпт', type: 'textarea', default: 'Ты — Senior Nutritionist Ареса...', group: 'Промпты' },
      { key: 'sheetId', label: 'ID таблицы Google Sheets (пусто = по умолчанию)', type: 'text', default: '', group: 'Основные Настройки' },
      { key: 'limitsSheet', label: 'Имя листа с лимитами', type: 'text', default: 'Nutrition_Limits', group: 'Основные Настройки' },
      { key: 'logSheet', label: 'Имя листа логов', type: 'text', default: 'Nutrition_Log', group: 'Основные Настройки' },
      { key: 'col_date', label: 'Колонка: Дата (буква)', type: 'text', default: 'A', group: 'Таблица: Логи питания' },
      { key: 'col_cal', label: 'Колонка: Калории', type: 'text', default: 'B', group: 'Таблица: Логи питания' },
      { key: 'col_pro', label: 'Колонка: Белки', type: 'text', default: 'C', group: 'Таблица: Логи питания' },
      { key: 'col_fat', label: 'Колонка: Жиры', type: 'text', default: 'D', group: 'Таблица: Логи питания' },
      { key: 'col_carb', label: 'Колонка: Углеводы', type: 'text', default: 'E', group: 'Таблица: Логи питания' },
      { key: 'col_desc', label: 'Колонка: Описание (еда)', type: 'text', default: 'F', group: 'Таблица: Логи питания' }
    ]
  });
}

/**
 * ==============================================================================
 * ⏰ CRON: ЕЖЕДНЕВНОЕ ЗАКРЫТИЕ ДНЯ
 * Запускается раз в день в 23:55 (по триггеру)
 * ==============================================================================
 */
function cron_NutritionDailyClose(testDateObj) {
  if (typeof ADS_DATA_SHEET_ID === 'undefined') return;
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  let logSheet = ss.getSheetByName('Nutrition_Log');
  let dailySheet = ss.getSheetByName('Nutrition_Daily');
  if (!logSheet || !dailySheet) return;
  
  // Целевая дата: переданная (для тестов) или "сегодня" (т.к. запускаем в 23:55)
  var targetDate = (testDateObj && typeof testDateObj.getTime === 'function') ? testDateObj : new Date();
  var dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday...
  
  var dateStr = Utilities.formatDate(targetDate, TIME_ZONE, "dd.MM.yyyy");
  
  // 1. Проверяем, не закрыт ли уже этот день
  var dData = dailySheet.getDataRange().getValues();
  var existingRowIndex = -1;
  for (var i = 1; i < dData.length; i++) {
    if (dData[i][0] == dateStr) {
      existingRowIndex = i + 1; // 1-based index for getRange
      Logger.log("День " + dateStr + " уже существует в Nutrition_Daily. Будет перезаписан.");
      break;
    }
  }
  
  function saveRow(rowArr) {
    if (existingRowIndex > 0) {
      dailySheet.getRange(existingRowIndex, 1, 1, rowArr.length).setValues([rowArr]);
    } else {
      dailySheet.appendRow(rowArr);
    }
  }
  
  // 2. Собираем итоги за целевую дату из Nutrition_Log
  var totals = _getNutritionToday(targetDate);
  
  // 3. Логика записи
  var hasRecords = (totals.calories > 0 || totals.protein > 0 || totals.fat > 0 || totals.carbs > 0);
  
  if (hasRecords) {
    // Есть записи — сохраняем как есть
    saveRow([dateStr, totals.calories, totals.protein, totals.fat, totals.carbs, totals.mag, totals.calc, totals.iron, totals.zinc, totals.vitC, totals.vitD, false, false]);
    Logger.log("Закрыт день " + dateStr + " с фактом: " + totals.calories + " ккал.");
  } else {
    // Записей нет
    if (dayOfWeek === 0) {
      // Воскресенье — Аутофагия
      saveRow([dateStr, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, true]);
      Logger.log("Закрыт день " + dateStr + " (Воскресенье) — Аутофагия (0 ккал).");
    } else {
      // Обычный день — Среднее за 10 дней
      var sumCal=0, sumPro=0, sumFat=0, sumCarb=0;
      var sumMg=0, sumCa=0, sumFe=0, sumZn=0, sumVitC=0, sumVitD=0;
      var count = 0;
      // Идем с конца, берем последние 10 НЕ-аутофагийных дней
      for (var j = dData.length - 1; j > 0; j--) {
        if (dData[j][12] === true) continue; // skip autophagy
        sumCal += parseFloat(dData[j][1]) || 0;
        sumPro += parseFloat(dData[j][2]) || 0;
        sumFat += parseFloat(dData[j][3]) || 0;
        sumCarb += parseFloat(dData[j][4]) || 0;
        sumMg += parseFloat(dData[j][5]) || 0;
        sumCa += parseFloat(dData[j][6]) || 0;
        sumFe += parseFloat(dData[j][7]) || 0;
        sumZn += parseFloat(dData[j][8]) || 0;
        sumVitC += parseFloat(dData[j][9]) || 0;
        sumVitD += parseFloat(dData[j][10]) || 0;
        count++;
        if (count >= 10) break;
      }
      
      if (count > 0) {
        saveRow([
          dateStr, 
          Math.round(sumCal / count), 
          Math.round(sumPro / count), 
          Math.round(sumFat / count), 
          Math.round(sumCarb / count), 
          Math.round(sumMg / count), 
          Math.round(sumCa / count), 
          Math.round(sumFe / count), 
          Math.round(sumZn / count), 
          Math.round(sumVitC / count), 
          Math.round(sumVitD / count), 
          true, 
          false
        ]);
        Logger.log("Закрыт день " + dateStr + " (Среднее за " + count + " дн): " + Math.round(sumCal / count) + " ккал.");
      } else {
        // Если вообще нет истории
        saveRow([dateStr, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, true, false]);
        Logger.log("Закрыт день " + dateStr + " — Нет истории для среднего, записано 0.");
      }
    }
  }
}

// ==============================================================================
// 🚀 INSTALLER
// ==============================================================================

function ARES_INSTALL_NUTRITION(ss) {
  Logger.log("🛠️ Установка таблиц модуля Питания...");
  
  // 1. Nutrition_Log
  let logSheet = ss.getSheetByName('Nutrition_Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('Nutrition_Log');
    let headers = ['Date', 'Calories', 'Protein', 'Fat', 'Carbs', 'Description', 'Magnesium', 'Calcium', 'Iron', 'Zinc', 'Vitamin C', 'Vitamin D'];
    logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    logSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Nutrition_Log");
  } else {
    Logger.log("ℹ️ Лист Nutrition_Log уже существует.");
  }
  SpreadsheetApp.flush();
  
  // 2. Nutrition_Limits
  let limitsSheet = ss.getSheetByName('Nutrition_Limits');
  if (!limitsSheet) {
    limitsSheet = ss.insertSheet('Nutrition_Limits');
    let limitData = [
      ['Metric', 'Daily Limit'],
      ['Calories', 2000],
      ['Protein', 150],
      ['Fat', 70],
      ['Carbs', 250],
      ['Magnesium', 400],
      ['Calcium', 1000],
      ['Iron', 15],
      ['Zinc', 11],
      ['Vitamin C', 90],
      ['Vitamin D', 15]
    ];
    limitsSheet.getRange(1, 1, limitData.length, limitData[0].length).setValues(limitData);
    limitsSheet.getRange(1, 1, 1, limitData[0].length).setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Nutrition_Limits");
  } else {
    Logger.log("ℹ️ Лист Nutrition_Limits уже существует.");
  }
  SpreadsheetApp.flush();
  
  // 3. Nutrition_Daily
  let dailySheet = ss.getSheetByName('Nutrition_Daily');
  if (!dailySheet) {
    dailySheet = ss.insertSheet('Nutrition_Daily');
    let headers = ['Date', 'Total Calories', 'Total Protein', 'Total Fat', 'Total Carbs', 'Mg', 'Ca', 'Fe', 'Zn', 'Vit C', 'Vit D', 'Is Averaged', 'Is Autophagy'];
    dailySheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    dailySheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Nutrition_Daily");
  } else {
    Logger.log("ℹ️ Лист Nutrition_Daily уже существует.");
  }
}
