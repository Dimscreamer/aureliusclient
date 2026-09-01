/**
 * ==============================================================================
 * 🧠 Life_Rules.js — Assistive Layer (Реагирование "здесь и сейчас")
 * ==============================================================================
 *
 * Обрабатывает жесткие правила из таблицы Life_Rules.
 * Например: WHEN 'TASK_ADDED' AND payload.hasDeadline === false THEN Suggest 'Добавить дедлайн?'
 */

var _LIFE_RULES_SHEET_NAME = "Ares_Life_Rules";

function setupLifeRules() {
  if (typeof LifeBus === 'undefined') return;

  // Слушаем ВСЕ события, чтобы проверять правила
  LifeBus.on('*', 'RulesEngine', function(eventName, payload, ctx) {
    if (eventName === 'BEFORE_RESPONSE') return;
    if (eventName === 'USER_REQUEST') return;

    // TODO: Загрузка правил из кэша / Google Sheets
    // Пока что захардкодим пример для демонстрации логики
    var rules = [
      {
        event: 'TASK_ADDED',
        condition: function(p) { return p && p.metadata && p.metadata.hasDeadline === false; },
        suggestion: "\n\n💡 <i>Хотите сразу поставить дедлайн для этой задачи?</i>"
      }
    ];

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.event === eventName) {
        if (rule.condition(payload)) {
          if (!ctx.execution) ctx.execution = {};
          if (!ctx.execution.suggestions) ctx.execution.suggestions = [];
          ctx.execution.suggestions.push(rule.suggestion);
          
          if (typeof sysLog !== 'undefined') sysLog('🎯 [LIFE_RULES] Сработало правило для ' + eventName);
        }
      }
    }
  });

  // Встраиваем Suggestions в ответ пользователю
  LifeBus.on('BEFORE_RESPONSE', 'RulesSuggestions', function(payload, ctx) {
    if (ctx && ctx.execution && ctx.execution.suggestions && ctx.execution.suggestions.length > 0) {
      // Берем только одну (первую) подсказку, чтобы не спамить
      var suggestion = ctx.execution.suggestions[0];
      // В универсальном формате текст ответа лежит в payload.metadata.response
      if (payload.metadata && typeof payload.metadata.response === 'string') {
        payload.metadata.response += suggestion;
      } else if (payload.metadata && typeof payload.metadata.response === 'object' && payload.metadata.response.text) {
        payload.metadata.response.text += suggestion;
      }
    }
  });
}

setupLifeRules();
