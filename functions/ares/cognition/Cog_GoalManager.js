/**
 * ==============================================================================
 * 🎯 Cog_GoalManager.js — Управление целями
 * ==============================================================================
 *
 * Читает стратегические цели пользователя из таблицы Ares_Goals.
 * Эти цели задают долгосрочный контекст для рефлексии (в отличие от Tasks).
 */

var _GOALS_SHEET = "Ares_Goals";

var CogGoalManager = {
  /**
   * Возвращает список активных целей
   */
  getGoals: function() {
    var props = PropertiesService.getUserProperties();
    var cached = props.getProperty('Cog_GoalManager_Cache');
    
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (new Date().getTime() - parsed.timestamp < 3600000) { // 1 час кэш
          return parsed.goals;
        }
      } catch(e) {}
    }

    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_GOALS_SHEET);
      if (!sheet) return ["Таблица Ares_Goals не найдена"];
      
      var data = sheet.getDataRange().getValues();
      var goals = [];
      
      for (var i = 1; i < data.length; i++) {
        var goal = data[i][0];
        var status = data[i][1];
        // Берем только активные цели
        if (goal && status !== "DONE") {
          goals.push(goal);
        }
      }
      
      props.setProperty('Cog_GoalManager_Cache', JSON.stringify({
        timestamp: new Date().getTime(),
        goals: goals
      }));

      return goals;
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [GOAL_MANAGER_ERROR] ' + e.message);
      return [];
    }
  }
};
