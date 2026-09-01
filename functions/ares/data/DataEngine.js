/**
 * ==============================================================================
 * 🗄 DataEngine.js — УНИФИЦИРОВАННЫЙ СЛОЙ ДОСТУПА К ДАННЫМ
 * ==============================================================================
 * Здесь собраны все функции работы с хранилищем (Google Sheets, ScriptApp Triggers,
 * Cache, и т.д.). Модули (Handlers) и Context Builder больше не делают прямых вызовов
 * к Google Sheets или другим низкоуровневым API.
 * 
 * Если мы когда-либо перейдём на Firebase, изменения будут только в этом файле.
 */

var DataEngine = (function() {
  
  // ==========================================
  // ⏰ REMINDERS (Напоминания и Таймеры)
  // Использует Google Apps Script Triggers.
  // ==========================================
  var reminders = {
    /**
     * Создает триггер-напоминание.
     */
    schedule: function(text, dateTimeStr) {
      try {
        var triggers = ScriptApp.getProjectTriggers();
        var count = 0;
        for (var i = 0; i < triggers.length; i++) {
          if (triggers[i].getHandlerFunction() === 'fireTelegramReminder') count++;
        }
        if (count >= 19) {
          return { success: false, error: "Лимит триггеров исчерпан. Очисти старые." };
        }

        var cleanStr = dateTimeStr.split('.')[0].replace('T', ' ');
        if (cleanStr.split(':').length === 2) cleanStr += ':00';
        
        // Assume TIME_ZONE is global (usually "Europe/Kiev")
        var targetDate = Utilities.parseDate(cleanStr, TIME_ZONE || "Europe/Kiev", "yyyy-MM-dd HH:mm:ss");
        var diffMs = targetDate.getTime() - new Date().getTime();
        
        if (diffMs <= 0) return { success: false, error: "Время уже прошло." };

        var trigger = ScriptApp.newTrigger('fireTelegramReminder')
          .timeBased()
          .after(Math.max(diffMs, 1000))
          .create();

        PropertiesService.getScriptProperties().setProperty('rem_' + trigger.getUniqueId(), JSON.stringify({
          chatId: MY_ID, 
          text: text,
          timestamp: dateTimeStr
        }));
        
        return { success: true };
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [DataEngine.reminders.schedule] Error: ' + e.message);
        return { success: false, error: e.message };
      }
    },
    
    /**
     * Удаляет напоминание по частичному совпадению текста.
     */
    deleteByText: function(textPart) {
      if (!textPart) return false;
      var triggers = ScriptApp.getProjectTriggers();
      var props = PropertiesService.getScriptProperties();
      var found = false;
      
      for (var i = 0; i < triggers.length; i++) {
        var t = triggers[i];
        if (t.getHandlerFunction() === 'fireTelegramReminder') {
          var id = t.getUniqueId();
          var dStr = props.getProperty('rem_' + id);
          if (dStr && JSON.parse(dStr).text.toLowerCase().includes(textPart.toLowerCase())) {
            ScriptApp.deleteTrigger(t);
            props.deleteProperty('rem_' + id);
            found = true;
          }
        }
      }
      return found;
    },
    
    /**
     * Возвращает список активных напоминаний в текстовом виде.
     */
    getListNumbered: function() {
      var triggers = ScriptApp.getProjectTriggers();
      var props = PropertiesService.getScriptProperties();
      var res = [];
      var idx = 1;
      for (var i = 0; i < triggers.length; i++) {
        var t = triggers[i];
        if (t.getHandlerFunction() === 'fireTelegramReminder') {
          var dStr = props.getProperty('rem_' + t.getUniqueId());
          if (dStr) {
            var d = JSON.parse(dStr);
            res.push("#" + idx + " — [" + d.timestamp + "] " + d.text);
            idx++;
          }
        }
      }
      return res.length > 0 ? res.join("\n") : "Активных таймеров нет.";
    },
    
    getList: function() {
      var triggers = ScriptApp.getProjectTriggers();
      var props = PropertiesService.getScriptProperties();
      var res = [];
      for (var i = 0; i < triggers.length; i++) {
        var t = triggers[i];
        if (t.getHandlerFunction() === 'fireTelegramReminder') {
          var dStr = props.getProperty('rem_' + t.getUniqueId());
          if (dStr) {
            var d = JSON.parse(dStr);
            res.push("— [" + d.timestamp + "] " + d.text);
          }
        }
      }
      return res.length > 0 ? res.join("\n") : "Активных таймеров нет.";
    },
    
    /**
     * Вызывается из глобального триггера.
     */
    fire: function(e) {
      if (!e) return;
      var triggerId = e.triggerUid;
      var props = PropertiesService.getScriptProperties();
      var dataStr = props.getProperty('rem_' + triggerId);
      
      if (dataStr) {
        var data = JSON.parse(dataStr);
        // 1. ОТПРАВКА
        var msg = "⏰ <b>ДИМА, СРАБОТАЛ ТАЙМЕР:</b>\n\n└ " + data.text.toUpperCase();
        if (typeof sendText !== 'undefined') sendText(data.chatId, msg);
        // 2. УДАЛЕНИЕ ДАННЫХ
        props.deleteProperty('rem_' + triggerId);
      }

      // 3. САМОЛИКВИДАЦИЯ ТРИГГЕРА
      var allTriggers = ScriptApp.getProjectTriggers();
      for (var i = 0; i < allTriggers.length; i++) {
        var t = allTriggers[i];
        if (t.getUniqueId() === triggerId) {
          ScriptApp.deleteTrigger(t);
        }
      }
    }
  };

  return {
    reminders: reminders
  };
})();

// ==============================================================================
// 🌐 ГЛОБАЛЬНЫЕ ФУНКЦИИ-ТРИГГЕРЫ (GAS требует глобальных функций)
// ==============================================================================
function fireTelegramReminder(e) {
  DataEngine.reminders.fire(e);
}
