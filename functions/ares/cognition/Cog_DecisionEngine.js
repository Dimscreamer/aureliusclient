/**
 * ==============================================================================
 * ⚖️ Cog_DecisionEngine.js — Плагин принятия решений
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "decision",
    capability: "cognition",
    dependsOn: ["curiosity"],
    enabled: true,
    version: "1.0",
    description: "Выбирает действие (ASK, NOTIFY, IGNORE...)",

    process: function(ctx) {
      if (!ctx.cognition.insight || typeof geminiCall === 'undefined') return;

      if (typeof sysLog !== 'undefined') sysLog('⚖️ [DECISION] Принятие решения по инсайту...');

      var prompt = "Ты - Модуль Принятия Решений (Decision Engine) когнитивного AI-ассистента Ареса.\n";
      prompt += "Проанализируй входящий Инсайт (и Гипотезу). Выбери ОДНО действие из списка:\n";
      prompt += "- ASK (если нужно задать вопрос пользователю)\n";
      prompt += "- NOTIFY (если нужно просто сообщить факт)\n";
      prompt += "- IGNORE (если это ерунда)\n";
      prompt += "- WAIT (если нужно больше данных)\n";
      prompt += "- SAVE_ONLY (если факт полезный, но говорить об этом не нужно)\n\n";
      
      prompt += "=== INSIGHT ===\n";
      prompt += JSON.stringify(ctx.cognition.insight, null, 2) + "\n";
      if (ctx.cognition.hypothesis) {
        prompt += "=== HYPOTHESIS ===\n";
        prompt += ctx.cognition.hypothesis + "\n";
      }

      prompt += "\nСформируй ответ строго в JSON формате:\n";
      prompt += "{\n";
      prompt += '  "action": "одно из действий"\n';
      prompt += "}";

      try {
        var rawResponse = geminiCall([
          { role: "system", content: prompt },
          { role: "user", content: "Прими решение." }
        ], false);

        var cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        var data = JSON.parse(cleanResponse);

        ctx.cognition.decision = data.action || "IGNORE";
        if (typeof sysLog !== 'undefined') sysLog('🎯 [DECISION] Решение: ' + ctx.cognition.decision);

      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [DECISION_ERROR] ' + e.message);
        ctx.cognition.decision = "IGNORE";
      }
    }
  });
})();
