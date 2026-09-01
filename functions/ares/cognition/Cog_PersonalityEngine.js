/**
 * ==============================================================================
 * 🎭 Cog_PersonalityEngine.js — Плагин Личности
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "personality",
    capability: "cognition",
    dependsOn: ["attention"],
    enabled: true,
    version: "1.0",
    description: "Форматирует решение в стиле Ареса",

    process: function(ctx) {
      var insight = ctx.cognition.insight;
      var action = ctx.cognition.decision;

      if (!insight || !action || typeof geminiCall === 'undefined') return;

      if (typeof sysLog !== 'undefined') sysLog('🎭 [PERSONALITY] Формируем текст сообщения...');

      var prompt = "Ты - Модуль Личности (Personality Engine) когнитивного AI-ассистента Ареса.\n";
      prompt += "Твоя задача — взять сухой системный вывод и перевести его в сообщение для пользователя.\n";
      prompt += "Твой стиль: краткий, немного неформальный, как умный партнер (не робот-прислужник). Используй короткие абзацы.\n\n";
      
      prompt += "Системное решение:\n";
      prompt += "Инсайт: " + insight.summary + "\n";
      if (ctx.cognition.hypothesis) {
        prompt += "Скрытый вопрос/гипотеза: " + ctx.cognition.hypothesis + "\n";
      }
      prompt += "Требуемое действие: " + action + "\n\n";

      prompt += "Напиши ТОЛЬКО текст сообщения, который нужно отправить пользователю.\n";

      try {
        var rawResponse = geminiCall([
          { role: "system", content: prompt },
          { role: "user", content: "Сформируй сообщение." }
        ], false);

        var message = rawResponse.trim();
        if (typeof sysLog !== 'undefined') sysLog('💬 [PERSONALITY] Сообщение готово: ' + message);
        
        ctx.output.message = message;

      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [PERSONALITY_ERROR] ' + e.message);
        ctx.runtime.state = "FAILED";
      }
    }
  });
})();
