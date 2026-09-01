/**
 * ==============================================================================
 * 🧠 Life_SemanticMemory.js — Долговременная семантическая память
 * ==============================================================================
 *
 * Хранит статические и долгосрочные знания о пользователе.
 * Читает факты из вкладки Ares_Life_Semantic.
 */

var _SEMANTIC_MEMORY_SHEET = "Ares_Life_Semantic";

var LifeSemanticMemory = {
  /**
   * Возвращает список фактов о пользователе
   * Для экономии квоты можно кэшировать в PropertiesService на N минут
   */
  getFacts: function() {
    var props = PropertiesService.getUserProperties();
    var cached = props.getProperty('Life_SemanticMemory_Cache');
    
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (new Date().getTime() - parsed.timestamp < 3600000) { // 1 час
          return parsed.facts;
        }
      } catch(e) {}
    }

    // Если нет кэша, читаем из таблицы
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_SEMANTIC_MEMORY_SHEET);
      if (!sheet) return ["Таблица Ares_Life_Semantic не найдена"];
      
      var data = sheet.getDataRange().getValues();
      var facts = [];
      
      // Пропускаем заголовок (i = 1)
      for (var i = 1; i < data.length; i++) {
        var fact = data[i][0];
        if (fact) {
          facts.push(fact);
        }
      }
      
      // Кэшируем результат
      props.setProperty('Life_SemanticMemory_Cache', JSON.stringify({
        timestamp: new Date().getTime(),
        facts: facts
      }));

      return facts;
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [SEMANTIC_MEMORY_ERROR] ' + e.message);
      return [];
    }
  }
};

function setupLifeSemanticMemory() {
  if (typeof LifeBus === 'undefined') return;

  LifeBus.on('SESSION_FLUSH', 'SemanticMemory_SessionFlush', function(payload, ctx) {
    try {
      var moduleName = payload.module || 'UNKNOWN';
      // Скелет: анализ фактов или инвалидация кэша при завершении сессии
      if (typeof sysLog !== 'undefined') sysLog('🧠 [SEMANTIC_MEMORY] Зафиксировано завершение сессии: ' + moduleName);
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [SEMANTIC_MEMORY_FLUSH_ERROR] ' + e.message);
    }
  });
}

setupLifeSemanticMemory();
