/**
 * ==============================================================================
 * 🎯 Life_AttentionManager.js — Плагин Внимания
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  var _ATTENTION_THRESHOLD = 0.50; // Порог внимания

  AresRuntime.register({
    id: "attention",
    capability: "cognition",
    dependsOn: ["decision"],
    enabled: true,
    version: "2.0",
    description: "Фильтрует малозначимые инициативы",

    process: function(ctx) {
      var action = ctx.cognition.decision;
      if (!action || action === "IGNORE" || action === "WAIT" || action === "SAVE_ONLY") {
        if (typeof sysLog !== 'undefined') sysLog('🚫 [ATTENTION] Пропуск. Действие не требует внимания (' + action + ').');
        if (ctx.trace) ctx.trace.stage('ATTENTION', { blocked: true, reason: 'action=' + action });
        ctx.runtime.state = "FINISHED"; // Прерываем пайплайн
        return;
      }

      var insight = ctx.cognition.insight;
      if (!insight) return;

      var snapshot = ctx.memory.working;
      
      // Провайдеры внимания (каждый возвращает от 0.0 до 1.0)
      var providers = [
        // 1. UserLoadProvider: чем больше задач, тем меньше внимания
        function(snap) {
          if (!snap || !snap.tasks) return { score: 1.0, reason: 'no_task_data' };
          if (snap.tasks.active > 5) return { score: 0.5, reason: 'high_task_load' };
          if (snap.tasks.overdue > 2) return { score: 0.2, reason: 'overdue_tasks' };
          return { score: 1.0, reason: 'normal_load' };
        },
        // 2. CooldownProvider (пока заглушка)
        function(snap) {
          return { score: 1.0, reason: 'no_cooldown' }; 
        }
      ];

      var providerSum = 0;
      var reasons = [];
      for (var i = 0; i < providers.length; i++) {
        var res = providers[i](snapshot);
        providerSum += res.score;
        if (res.score < 1.0) reasons.push(res.reason);
      }
      var providerAverage = providerSum / providers.length;

      var imp = insight.importance || 0.5;
      var nov = insight.novelty || 0.5;
      var attentionScore = imp * nov * providerAverage;

      if (typeof sysLog !== 'undefined') {
        sysLog('⚖️ [ATTENTION] Score: ' + attentionScore.toFixed(2) + ' (Imp: ' + imp + ', Nov: ' + nov + ', Prov: ' + providerAverage.toFixed(2) + ')');
      }

      var blocked = attentionScore < _ATTENTION_THRESHOLD;
      var blockReason = blocked ? (reasons.length > 0 ? reasons.join(', ') : 'low_importance') : 'passed';

      if (ctx.trace) {
        ctx.trace.stage('ATTENTION', {
          score: parseFloat(attentionScore.toFixed(2)),
          threshold: _ATTENTION_THRESHOLD,
          blocked: blocked,
          reason: blockReason
        });
      }

      if (!blocked) {
        if (typeof sysLog !== 'undefined') sysLog('✅ [ATTENTION] Фильтр пройден.');
      } else {
        if (typeof sysLog !== 'undefined') sysLog('🚫 [ATTENTION] Инсайт отклонен: ' + blockReason);
        ctx.runtime.state = "FINISHED";
      }
    }
  });
})();
