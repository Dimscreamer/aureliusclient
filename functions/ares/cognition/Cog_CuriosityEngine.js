/**
 * ==============================================================================
 * 🧐 Cog_CuriosityEngine.js — Плагин Любопытства
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "curiosity",
    capability: "cognition",
    dependsOn: ["insight"],
    enabled: true,
    version: "1.0",
    description: "Строит гипотезы на базе инсайтов",

    process: function(ctx) {
      if (!ctx.cognition.insight || typeof geminiCall === 'undefined') return;

      if (typeof sysLog !== 'undefined') sysLog('🧐 [CURIOSITY] Проверка инсайта на скрытые причины...');

      var prompt = "Ты - Модуль Любопытства (Curiosity Engine) когнитивного AI-ассистента Ареса.\n";
      prompt += "Твоя задача — прочитать Инсайт. Если инсайт очевиден, верни NONE. Если он вызывает вопросы (например, 'почему сон упал?'), построй 1-2 гипотезы.\n\n";
      
      prompt += "=== INSIGHT ===\n";
      prompt += JSON.stringify(ctx.cognition.insight, null, 2) + "\n\n";

      prompt += "Сформируй ответ строго в JSON формате:\n";
      prompt += "{\n";
      prompt += '  "hypothesis": "Твои гипотезы или вопрос (или NONE, если всё и так ясно)"\n';
      prompt += "}";

      try {
        var rawResponse = geminiCall([
          { role: "system", content: prompt },
          { role: "user", content: "Построй гипотезу." }
        ], false);

        var cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        var data = JSON.parse(cleanResponse);

        if (data.hypothesis && data.hypothesis !== "NONE") {
          if (typeof sysLog !== 'undefined') sysLog('🔍 [CURIOSITY] Гипотеза: ' + data.hypothesis);
          ctx.cognition.hypothesis = data.hypothesis;
        } else {
          if (typeof sysLog !== 'undefined') sysLog('🤷‍♂️ [CURIOSITY] Нет дополнительных гипотез.');
        }

      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [CURIOSITY_ERROR] ' + e.message);
      }
    }
  });
})();
