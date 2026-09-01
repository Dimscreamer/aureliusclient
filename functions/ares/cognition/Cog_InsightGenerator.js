/**
 * ==============================================================================
 * 💡 Cog_InsightGenerator.js — Генератор инсайтов
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "insight",
    capability: "cognition",
    dependsOn: ["reflection"],
    enabled: true,
    version: "1.0",
    description: "Извлекает инсайты из мыслей",

    process: function(ctx) {
      if (!ctx.cognition.thoughts || typeof geminiCall === 'undefined') return;

      if (typeof sysLog !== 'undefined') sysLog('💡 [INSIGHT_GEN] Поиск инсайтов в сырых мыслях...');

      var prompt = "Ты - Модуль Генерации Инсайтов (Insight Generator) когнитивного AI-ассистента Ареса.\n";
      prompt += "Твоя задача — прочитать поток сырых мыслей (Raw Thoughts) и вытащить из них ОДИН полезный инсайт (закономерность, аномалию). Если ничего интересного нет, ответь NONE.\n\n";
      
      prompt += "=== RAW THOUGHTS ===\n";
      prompt += ctx.cognition.thoughts + "\n\n";

      prompt += "Сформируй ответ строго в JSON формате (без маркдауна):\n";
      prompt += "{\n";
      prompt += '  "type": "INSIGHT",\n';
      prompt += '  "topic": "Тема инсайта (например, Здоровье, Работа, Привычки)",\n';
      prompt += '  "category": "Категория (например, Питание, Продуктивность, Психология)",\n';
      prompt += '  "summary": "Текст инсайта (или NONE)",\n';
      prompt += '  "importance": 0.0 to 1.0,\n';
      prompt += '  "novelty": 0.0 to 1.0,\n';
      prompt += '  "urgency": 0.0 to 1.0,\n';
      prompt += '  "confidence": 0.0 to 1.0\n';
      prompt += "}";

      try {
        var rawResponse = geminiCall([
          { role: "system", content: prompt },
          { role: "user", content: "Сгенерируй инсайт." }
        ], true); // true for JSON mode

        var cleanResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        var insightData = JSON.parse(cleanResponse);

        if (insightData.summary && insightData.summary !== "NONE") {
          if (typeof sysLog !== 'undefined') sysLog('✨ [INSIGHT_GEN] Найден инсайт: ' + insightData.summary);
          ctx.cognition.insight = insightData;
          
          // ЗАПИСЬ В СЕМАНТИЧЕСКУЮ ПАМЯТЬ
          try {
            var ss = null;
            if (typeof MASTER_DB_ID !== 'undefined') {
              ss = SpreadsheetApp.openById(MASTER_DB_ID);
            } else if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
              ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
            }
            if (ss) {
              var semSheet = ss.getSheetByName("Ares_Life_Semantic");
              if (semSheet && insightData.importance >= 0.5 && insightData.confidence >= 0.6) {
                semSheet.appendRow([
                  insightData.topic || "Общее",
                  insightData.category || "Анализ",
                  insightData.summary,
                  insightData.confidence,
                  new Date()
                ]);
                if (typeof sysLog !== 'undefined') sysLog('🧠 [SEMANTIC_MEMORY] Новый факт записан в долгосрочную память.');
              }
            }
          } catch(dbErr) {
            if (typeof sysLog !== 'undefined') sysLog('❌ [SEMANTIC_MEMORY_WRITE_ERROR] ' + dbErr.message);
          }
          
        } else {
          if (typeof sysLog !== 'undefined') sysLog('😴 [INSIGHT_GEN] Инсайтов не найдено.');
          ctx.runtime.state = "FINISHED"; // Прерываем
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [INSIGHT_GEN_ERROR] ' + e.message);
        ctx.runtime.state = "FAILED";
      }
    }
  });
})();
