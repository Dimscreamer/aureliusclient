/**
 * ==============================================================================
 * 🧠 Ares_Runtime.js — Когнитивная Операционная Система
 * ==============================================================================
 *
 * Ядро системы плагинов. Регистрирует плагины, строит граф зависимостей (DAG),
 * и прогоняет структурированный контекст через цепочку модулей.
 */

var AresRuntime = (function() {
  var plugins = [];

  /**
   * Построить пустой структурированный контекст
   */
  function buildEmptyContext() {
    return {
      memory: { working: {}, semantic: {}, goals: [] },
      cognition: { thoughts: null, insight: null, hypothesis: null, decision: null },
      output: { message: null, notifications: [] },
      runtime: { traceId: _generateTraceId(), startedAt: new Date().getTime(), state: "READY" },
      debug: { logs: [] }
    };
  }

  function _generateTraceId() {
    return 'req_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Топологическая сортировка плагинов (DAG)
   */
  function sortPluginsTopology(capability) {
    var filtered = plugins.filter(function(p) { return p.capability === capability && p.enabled !== false; });
    
    var sorted = [];
    var visited = {};
    var tempMark = {};

    function visit(p) {
      if (tempMark[p.id]) throw new Error("AresRuntime: Циклическая зависимость найдена у плагина " + p.id);
      if (!visited[p.id]) {
        tempMark[p.id] = true;
        
        var deps = p.dependsOn || [];
        for (var i = 0; i < deps.length; i++) {
          var depId = deps[i];
          var depPlugin = filtered.filter(function(x) { return x.id === depId; })[0];
          if (depPlugin) visit(depPlugin);
        }

        visited[p.id] = true;
        tempMark[p.id] = false;
        sorted.push(p);
      }
    }

    for (var i = 0; i < filtered.length; i++) {
      if (!visited[filtered[i].id]) {
        visit(filtered[i]);
      }
    }

    return sorted;
  }

  return {
    /**
     * Регистрация плагина
     * @param {Object} plugin { id, capability, dependsOn, process(ctx), init(ctx), destroy(ctx) }
     */
    register: function(plugin) {
      if (!plugin.id || !plugin.capability) {
        if (typeof sysLog !== 'undefined') sysLog("❌ [RUNTIME] Ошибка регистрации: нет id или capability");
        return;
      }
      plugins.push(plugin);
    },

    /**
     * Запуск конвейера (Pipeline)
     * @param {string} capability - Какую цепочку запускаем (напр., 'cognition')
     * @param {Object} overrideContext - Частичный контекст (если восстанавливаем состояние)
     */
    execute: function(capability, overrideContext) {
      var ctx = buildEmptyContext();
      // Мержим overrideContext если есть
      if (overrideContext) {
        // Упрощенный мерж
        for (var k in overrideContext) {
          ctx[k] = overrideContext[k];
        }
      }

      if (typeof sysLog !== 'undefined') sysLog('🚀 [RUNTIME] Запуск пайплайна: ' + capability + ' [Trace: ' + ctx.runtime.traceId + ']');

      try {
        var sortedPlugins = sortPluginsTopology(capability);
        
        // 1. INIT Phase
        for (var i = 0; i < sortedPlugins.length; i++) {
          if (sortedPlugins[i].init) sortedPlugins[i].init(ctx);
        }

        // 2. PROCESS Phase
        for (var i = 0; i < sortedPlugins.length; i++) {
          if (ctx.runtime.state !== "READY") {
            if (typeof sysLog !== 'undefined') sysLog('⏹ [RUNTIME] Пайплайн прерван, состояние: ' + ctx.runtime.state);
            break; // Кто-то прервал пайплайн (например, WAIT или FINISHED)
          }

          var p = sortedPlugins[i];
          if (typeof sysLog !== 'undefined') sysLog('▶️ [RUNTIME] Выполнение: ' + p.id);
          
          if (p.process) {
            var startTime = Date.now();
            p.process(ctx);
            var duration = Date.now() - startTime;
            
            if (ctx.trace) {
              ctx.trace.stage('PIPELINE_STAGE', { plugin: p.id, timeMs: duration });
            }
          }
        }

        // 3. DESTROY Phase
        for (var i = 0; i < sortedPlugins.length; i++) {
          if (sortedPlugins[i].destroy) sortedPlugins[i].destroy(ctx);
        }

        if (ctx.runtime.state === "READY") {
            ctx.runtime.state = "FINISHED"; // Если дошли до конца и статус не изменен
        }

        if (typeof sysLog !== 'undefined') sysLog('🏁 [RUNTIME] Цикл завершен. Состояние: ' + ctx.runtime.state);
        
      } catch (e) {
        ctx.runtime.state = "FAILED";
        if (typeof sysLog !== 'undefined') sysLog('❌ [RUNTIME_ERROR] ' + e.message);
      }

      return ctx;
    }
  };
})();
