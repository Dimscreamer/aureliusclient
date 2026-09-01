/**
 * ==============================================================================
 * 🧩 Cog_ContextBuilder.js — Плагин Сборки Контекста
 * ==============================================================================
 */

(function() {
  if (typeof AresRuntime === 'undefined') return;

  AresRuntime.register({
    id: "context_builder",
    capability: "cognition",
    dependsOn: [], // Самый первый
    enabled: true,
    version: "1.0",
    description: "Сборщик рабочего контекста",
    
    process: function(ctx) {
      if (typeof sysLog !== 'undefined') sysLog('🧩 [CONTEXT_BUILDER] Сборка контекста...');

      // 1. Working Memory
      if (typeof WorkingMemory !== 'undefined') {
        ctx.memory.working = WorkingMemory.getSnapshot();
      }

      // 2. Semantic Memory
      if (typeof LifeSemanticMemory !== 'undefined') {
        ctx.memory.semantic = LifeSemanticMemory.getFacts();
      }

      // 3. Goals
      if (typeof CogGoalManager !== 'undefined') {
        ctx.memory.goals = CogGoalManager.getGoals();
      }

      if (ctx.trace) {
        var workingSize = ctx.memory.working ? JSON.stringify(ctx.memory.working).length : 0;
        var semanticCount = ctx.memory.semantic ? ctx.memory.semantic.length : 0;
        var goalsCount = ctx.memory.goals ? ctx.memory.goals.length : 0;
        
        ctx.trace.stage('CONTEXT_SIZE', {
          workingMemoryBytes: workingSize,
          semanticFacts: semanticCount,
          goals: goalsCount
        });
      }
    }
  });
})();
