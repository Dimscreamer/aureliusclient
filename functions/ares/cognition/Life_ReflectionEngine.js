/**
 * ==============================================================================
 * 🧠 Life_ReflectionEngine.js — Генерация мыслей (Cortex)
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "reflection",
    capability: "cognition",
    dependsOn: ["context_builder"],
    enabled: true,
    version: "2.0",
    description: "Генератор сырых размышлений",

    process: function(ctx) {
      if (typeof geminiCall === 'undefined') {
        ctx.runtime.state = "FAILED";
        return;
      }

      if (typeof sysLog !== 'undefined') sysLog('🧠 [REFLECTION] Анализируем контекст...');

      var prompt = "Ты - Модуль Размышления (Reflection Engine) когнитивного AI-ассистента Ареса.\n";
      prompt += "Твоя задача — просто проанализировать текущий контекст и выдать поток сырых мыслей (Raw Thoughts) о том, что происходит с пользователем. Не делай выводов о том, что нужно написать пользователю, просто перечисли факты и наблюдения.\n\n";
      
      prompt += "=== CONTEXT ===\n";
      prompt += JSON.stringify(ctx.memory, null, 2) + "\n\n";

      prompt += "Сформируй ответ строго в JSON формате (без маркдауна):\n";
      prompt += "{\n";
      prompt += '  "rawThoughts": "Твой текст размышлений (или NONE, если ничего интересного)"\n';
      prompt += "}";

      try {
        var rawResponse = geminiCall([
          { role: "system", content: prompt },
          { role: "user", content: "Проведи рефлексию текущего состояния." }
        ], false);

        var cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        var responseData = JSON.parse(cleanResponse);

        if (responseData.rawThoughts && responseData.rawThoughts !== "NONE") {
          if (typeof sysLog !== 'undefined') sysLog('💡 [REFLECTION] Thoughts: ' + responseData.rawThoughts);
          ctx.cognition.thoughts = responseData.rawThoughts;
        } else {
          if (typeof sysLog !== 'undefined') sysLog('😴 [REFLECTION] Пусто (NONE).');
          ctx.runtime.state = "FINISHED"; // Прерываем пайплайн
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [REFLECTION_ERROR] ' + e.message);
        ctx.runtime.state = "FAILED";
      }
    }
  });
})();
