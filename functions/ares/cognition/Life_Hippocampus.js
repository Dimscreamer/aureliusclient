/**
 * ==============================================================================
 * 🧠 Life_Hippocampus.js — Долговременная память (Consolidation)
 * ==============================================================================
 *
 * Ночной процесс. Сжимает сырые события дня в короткий вывод.
 */

var _LIFE_SUMMARIES_SHEET = "Ares_Life_Summaries";

var LifeHippocampus = {
  /**
   * Запуск консолидации памяти за день
   */
  runDailySummary: function() {
    if (typeof geminiCall === 'undefined') return;
    if (typeof sysLog !== 'undefined') sysLog('🧠 [HIPPOCAMPUS] Начинаем консолидацию памяти (Daily Summary)...');

    // 1. Получаем сырые события за день из Life_Events
    var ss = null;
    if (typeof MASTER_DB_ID !== 'undefined') {
      ss = SpreadsheetApp.openById(MASTER_DB_ID);
    } else if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
      ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    }
    if (!ss) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [HIPPOCAMPUS] Таблица БД не найдена!');
      return;
    }
    
    var sheet = ss.getSheetByName("Ares_Life_Events");
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var todayEvents = [];
    var now = new Date();
    
    // Считаем, что нас интересуют события за последние 24 часа
    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      var eventDate = new Date(row[0]);
      if ((now - eventDate) < 24 * 60 * 60 * 1000) {
        todayEvents.push(row[2] + ": " + row[3]);
      } else {
        break; // События отсортированы по времени, можно прервать
      }
    }

    if (todayEvents.length === 0) {
      if (typeof sysLog !== 'undefined') sysLog('💤 [HIPPOCAMPUS] Нет событий за день. Сводка отменена.');
      return;
    }

    // 2. Отправляем в LLM для сжатия
    var prompt = "Ты гиппокамп AI-ассистента Ареса. Твоя задача — консолидировать память за день.\n\n";
    prompt += "Вот список сырых событий за последние 24 часа:\n";
    prompt += todayEvents.join("\n") + "\n\n";
    prompt += "Сделай ОДИН короткий абзац (Daily Summary) о том, как прошел день пользователя.\n";
    prompt += "Пример: 'Сегодня Дмитрий был продуктивен (3 задачи), но мало спал. Эмоциональный фон стабильный.'\n";
    
    try {
      var rawSummary = geminiCall([
        { role: "system", content: prompt },
        { role: "user", content: "Сформируй вывод дня." }
      ], false);

      var summaryText = rawSummary.replace(/```/g, '').trim();
      if (typeof sysLog !== 'undefined') sysLog('✅ [HIPPOCAMPUS] Сводка готова: ' + summaryText);

      // 3. Сохраняем в таблицу
      if (ss) {
        var sumSheet = ss.getSheetByName(_LIFE_SUMMARIES_SHEET);
        if (sumSheet) {
          sumSheet.appendRow([new Date(), "DAILY", summaryText]);
        }
      }
      
      // 4. Очищаем текущий Snapshot (если нужно сбрасывать счетчики дня)
      if (typeof WorkingMemory !== 'undefined') {
        var snap = WorkingMemory.getSnapshot();
        snap.finance.todaySpent = 0;
        WorkingMemory.saveSnapshot(snap);
      }

    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [HIPPOCAMPUS_ERROR] ' + e.message);
    }
  }
};
