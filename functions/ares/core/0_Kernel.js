/**
 * ==============================================================================
 * 🚀 0_Kernel.js — ЯДРО АРЕСА (Entry Point + Execution Engine)
 * v10.0 [PLUGIN ARCHITECTURE]
 *
 * Архитектура: Input → Kernel → Router → Module → Response
 *
 * Три режима выполнения:
 *   BASE CHAT  — свободный диалог, без протоколов
 *   MODULE MODE — изолированный модуль с Permission Layer
 *   CHAIN MODE  — несколько модулей в одном сообщении
 *
 * Kernel НЕ знает о конкретных модулях — только об интерфейсах.
 * Modules подключаются автоматически через 1_Registry.js.
 *
 * Web-версия: doPost() заменяется на Express.js route handler.
 *             Вся остальная логика (execute*) переносится без изменений.
 * ==============================================================================
 */

/**
 * ==============================================================================
 * 🧠 Trace (Telemetry Pipeline)
 * Единый объект для сбора логов в течение одного запроса
 * ==============================================================================
 */
function createTrace(updateId, messageId) {
  var tz = (typeof TIME_ZONE !== 'undefined') ? TIME_ZONE : "Europe/Kiev";
  var timestamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd-HHmmss");
  var tId = timestamp + "-" + (updateId || "NA") + "-" + (messageId || "NA");
  
  return {
    traceId: tId,
    startTime: new Date().getTime(),
    stages: [],
    
    stage: function(stageName, data) {
      this.stages.push({
        stage: stageName,
        time: new Date().getTime(),
        data: data
      });
    },
    
    flush: function(userId, moduleName) {
      try {
        var endTime = new Date().getTime();
        var duration = endTime - this.startTime;
        
        var logOutput = "[TRACE_START] [" + this.traceId + "]\n";
        logOutput += "Duration: " + duration + "ms\n\n";
        
        var summary = {
          mode: 'UNKNOWN',
          module: moduleName || 'UNKNOWN',
          session: 'NEW',
          model: 'UNKNOWN',
          promptSize: 0,
          tokensIn: 0,
          tokensOut: 0,
          thoughtSize: 0,
          costUSD: 0,
          protocols: [],
          status: 'SUCCESS',
          reason: 'OK',
          cacheHit: 0,
          cacheMiss: 0,
          contextStats: null,
          pipeline: [],
          eventBus: [],
          routerReason: 'UNKNOWN',
          routerScore: null,
          health: {
            Kernel: true,
            Router: false,
            LifeBus: true,
            LLM: false,
            Sheets: true
          }
        };
        
        var _MODEL_PRICING = {
          "google/gemini-2.5-flash-lite": { input: 0.000075 / 1000, output: 0.0003 / 1000 },
          "google/gemini-2.5-flash": { input: 0.000075 / 1000, output: 0.0003 / 1000 },
          "google/gemini-2.5-pro": { input: 0.00125 / 1000, output: 0.005 / 1000 },
          "anthropic/claude-3.5-sonnet": { input: 0.003 / 1000, output: 0.015 / 1000 }
        };
        
        var aiMetrics = {};
        var routerCandidates = [];
        var eventBusListeners = [];

        // Data extraction pass
        for (var i = 0; i < this.stages.length; i++) {
          var s = this.stages[i];
          
          if (s.stage === 'HANDLER_RESULT' || s.stage === 'PROTOCOL_RESULT' || s.stage === 'KERNEL_ERROR' || s.stage === 'SHEET_WRITE') {
             if (s.data && (s.data.status === 'ERROR' || s.data.status === 'FAILED')) {
                 if (s.stage === 'SHEET_WRITE') summary.health.Sheets = false;
                 else {
                   summary.status = 'FAILED';
                   summary.reason = s.data.error || s.data.reason || 'Unknown error';
                 }
             } else if (s.data && (s.data.status === 'SKIPPED' || s.data.status === 'NO_ROOT_HANDLER' || s.data.status === 'NO_HANDLER')) {
                 if (summary.status !== 'FAILED' && summary.protocols.length === 0) {
                    summary.status = 'SKIPPED';
                    summary.reason = s.data.reason || 'Handler not required';
                 }
             } else if (s.stage === 'KERNEL_ERROR') {
                 summary.status = 'FAILED';
                 summary.health.Kernel = false;
                 summary.reason = typeof s.data === 'string' ? s.data : JSON.stringify(s.data);
             }
          }
          
          if (s.stage === 'ROUTER' && s.data) {
             summary.health.Router = true;
             summary.mode = s.data.mode;
             if (s.data.reason === 'SESSION_CONTINUE') summary.session = 'CONTINUE';
             if (s.data.reason) summary.routerReason = s.data.reason;
             else if (s.data.explicit) summary.routerReason = 'EXPLICIT_TAG';
             
             if (s.data.candidates && s.data.candidates.length > 0) {
               summary.routerScore = s.data.candidates[0].score;
               if (!s.data.reason) summary.routerReason = s.data.candidates[0].matchedBy || 'MATCH';
               routerCandidates = s.data.candidates;
             }
          }
          if (s.stage === 'PROMPT_BUILDER' && s.data) {
             summary.promptSize = s.data.promptTotal || 0;
          }
          if (s.stage === 'AI_BRIDGE' && s.data) {
             summary.health.LLM = true;
             aiMetrics = s.data;
             if (s.data.model) summary.model = s.data.model;
             if (s.data.tokensIn) summary.tokensIn += s.data.tokensIn;
             if (s.data.tokensOut) summary.tokensOut += s.data.tokensOut;
             if (s.data.thoughtSize) summary.thoughtSize += s.data.thoughtSize;
          }
          if (s.stage === 'PROTOCOL_RESULT' && s.data && s.data.tag) {
             var pStr = s.data.tag;
             if (s.data.handler) pStr += " → " + s.data.handler;
             if (s.data.status) pStr += " (" + s.data.status + ")";
             summary.protocols.push(pStr);
          }
          if (s.stage === 'CONTEXT_SIZE' && s.data) {
             summary.contextStats = s.data;
          }
          if (s.stage === 'PIPELINE_STAGE' && s.data) {
             summary.pipeline.push({ name: s.data.plugin, ms: s.data.timeMs });
          }
          if (s.stage === 'LIFE_EVENT' && s.data && s.data.type) {
             summary.eventBus.push({ type: s.data.type, listeners: [] });
          }
          if (s.stage === 'EVENT_BUS_LISTENERS' && s.data && s.data.results) {
             if (summary.eventBus.length > 0) {
                 summary.eventBus[summary.eventBus.length - 1].listeners = s.data.results;
             }
          }
          if (s.stage === 'LIFE_BUS_ERROR') {
             summary.health.LifeBus = false;
          }
        }

        // Вывод хронологических блоков
        var hideLog = (typeof LOG_LEVEL !== 'undefined' && LOG_LEVEL === 'INFO');
        var self = this;

        var sections = [];
        var currentSection = null;

        function getSectionType(stageName) {
           if (stageName === 'REQUEST') return 'REQUEST';
           if (stageName.indexOf('KERNEL') === 0 || stageName === 'PROMPT_BUILDER' || stageName === 'CONTEXT_SIZE' || stageName === 'CONTEXT_BUILDER') return 'KERNEL';
           if (stageName.indexOf('LIFE_') === 0 || stageName.indexOf('EVENT_') === 0) return 'EVENT BUS';
           if (stageName.indexOf('ROUTER') === 0 || stageName === 'SESSION_SLEEP' || stageName === 'SESSION_WAKE' || stageName === 'SESSION_END') return 'ROUTER';
           if (stageName.indexOf('AI_') === 0 || stageName === 'LLM_RAW_RESPONSE') return 'AI';
           if (stageName === 'MODULE_INTENT' || stageName === 'CODE_INTENT_RESOLVER' || stageName === 'ASK_USER' || stageName === 'SESSION_SUMMARY') return 'EXECUTION';
           if (stageName === 'FINAL_RESPONSE' || stageName === 'OUTGOING_TG_MSG') return 'RESPONSE';
           return 'EXECUTION';
        }

        // Группируем стадии в секции, сохраняя строгую хронологию
        for (var i = 0; i < this.stages.length; i++) {
           var s = this.stages[i];
           // Скрываем rawResponse если не включен TRACE
           if (s.stage === 'AI_BRIDGE' && typeof LOG_LEVEL !== 'undefined' && LOG_LEVEL !== 'TRACE') {
               var safeData = JSON.parse(JSON.stringify(s.data));
               delete safeData.rawResponse;
               s.data = safeData;
           }

           var secType = getSectionType(s.stage);
           if (!currentSection || currentSection.type !== secType) {
              currentSection = { type: secType, stages: [] };
              sections.push(currentSection);
           }
           currentSection.stages.push(s);
        }

        function formatStage(s) {
           var timeOffset = s.time - self.startTime;
           var icon = '✅';
           if (s.stage === 'KERNEL_ERROR' || (s.data && (s.data.status === 'ERROR' || s.data.status === 'FAILED'))) icon = '❌';
           else if (s.data && (s.data.status === 'SKIPPED' || s.data.status === 'NO_ROOT_HANDLER' || s.data.status === 'NO_HANDLER')) icon = '⏭';
           var dataStr = typeof s.data === 'object' ? JSON.stringify(s.data, null, 2) : s.data;
           return "[" + timeOffset + "ms] " + icon + " [" + s.stage + "] " + dataStr + "\n";
        }

        var reqData = null;
        var responseText = null;
        for (var i = 0; i < this.stages.length; i++) {
           if (this.stages[i].stage === 'REQUEST') reqData = this.stages[i].data;
           if (this.stages[i].stage === 'FINAL_RESPONSE') responseText = this.stages[i].data;
        }

        if (reqData) {
           logOutput += "\n═══════════════\nREQUEST\n═══════════════\n\n";
           logOutput += "User........... " + (reqData.user || "Unknown") + "\n";
           logOutput += "Chat........... " + (reqData.chat || "Telegram") + "\n";
           logOutput += "Message........ " + (reqData.message || "") + "\n";
           logOutput += "Received....... " + (reqData.received || "") + "\n";
        }

        for (var idx = 0; idx < sections.length; idx++) {
           var sec = sections[idx];
           if (sec.type === 'REQUEST') continue;
           
           if (hideLog) continue;

           logOutput += "\n═══════════════\n" + sec.type + "\n═══════════════\n\n";

           if (sec.type === 'EVENT BUS') {
              var eventsStr = "";
              for (var i = 0; i < sec.stages.length; i++) {
                 var s = sec.stages[i];
                 if (s.stage === 'LIFE_EVENT') {
                    eventsStr += "Event: " + s.data.type + " (Listeners: " + s.data.listeners + ")\n";
                 }
                 if (s.stage === 'EVENT_BUS_LISTENERS' && s.data && s.data.results) {
                    for (var el = 0; el < s.data.results.length; el++) {
                       eventsStr += (s.data.results[el].indexOf('OK') !== -1 ? "✓ " : "❌ ") + s.data.results[el].replace(/ OK| ERROR/g, '') + "\n";
                    }
                    eventsStr += "\n";
                 }
                 if (s.stage !== 'LIFE_EVENT' && s.stage !== 'EVENT_BUS_LISTENERS') {
                    eventsStr += formatStage(s);
                 }
              }
              logOutput += eventsStr;
           } 
           else if (sec.type === 'ROUTER') {
              // Сначала выводим инфо о состоянии сессии
              for (var i = 0; i < sec.stages.length; i++) {
                 var ss2 = sec.stages[i];
                 if (ss2.stage === 'SESSION_SLEEP') {
                    logOutput += "💤 SESSION SLEEP: " + ss2.data.module + " (" + ss2.data.elapsedSec + "s \u0431\u0435\u0437 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438)\n";
                 } else if (ss2.stage === 'SESSION_WAKE') {
                    logOutput += "☀️ SESSION WAKE: " + ss2.data.module + "\n";
                 } else if (ss2.stage === 'SESSION_END') {
                    logOutput += "🚹 SESSION END: " + ss2.data.module + " (" + ss2.data.reason + ")\n";
                 }
              }
              // Затем решение роутера
              if (routerCandidates.length > 0) {
                 logOutput += "Decision: " + routerCandidates[0].key + "\n";
                 logOutput += "Reason: " + summary.routerReason + "\n\n";
              }
              // ASK_USER в роутере
              for (var i = 0; i < sec.stages.length; i++) {
                 if (sec.stages[i].stage === 'ROUTER' && sec.stages[i].data && sec.stages[i].data.mode === 'ASK_USER') {
                    var d = sec.stages[i].data;
                    logOutput += "❓ ASK_USER: delta=" + (d.delta ? d.delta.toFixed(3) : '?') + "\n";
                    if (d.candidates && d.candidates.length > 0) {
                       logOutput += "Candidates:\n";
                       for (var c = 0; c < Math.min(d.candidates.length, 3); c++) {
                          logOutput += "  " + d.candidates[c].key + " " + (d.candidates[c].score ? d.candidates[c].score.toFixed(2) : '') + "\n";
                       }
                    }
                 }
              }
              logOutput += "ROUTER TRACE:\n";
              for (var i = 0; i < sec.stages.length; i++) {
                 if (sec.stages[i].stage !== 'SESSION_SLEEP' && sec.stages[i].stage !== 'SESSION_WAKE' && sec.stages[i].stage !== 'SESSION_END') {
                    logOutput += formatStage(sec.stages[i]);
                 }
              }
           }
           else if (sec.type === 'AI') {
              logOutput += "Model......... " + (aiMetrics.model || summary.model) + "\n";
              logOutput += "Input Tokens.. " + summary.tokensIn + "\n";
              logOutput += "Output Tokens. " + summary.tokensOut + "\n";
              logOutput += "Reasoning..... " + summary.thoughtSize + " chars\n";
              logOutput += "Latency....... " + (aiMetrics.timeMs || 0) + " ms\n";
              if (aiMetrics.finishReason) logOutput += "FinishReason.. " + aiMetrics.finishReason + "\n";
              
              if (aiMetrics.thoughtText) {
                 logOutput += "\n[THOUGHT (DEBUG)]:\n" + aiMetrics.thoughtText + "\n\n";
              }

              var rawRespStage = sec.stages.find(function(s) { return s.stage === 'LLM_RAW_RESPONSE'; });
              if (rawRespStage && rawRespStage.data && rawRespStage.data.response) {
                 logOutput += "[RAW RESPONSE]:\n" + rawRespStage.data.response + "\n\n";
              }
              
              if (typeof LOG_LEVEL !== 'undefined' && LOG_LEVEL === 'TRACE') {
                 logOutput += "AI TRACE:\n";
                 for (var i = 0; i < sec.stages.length; i++) {
                    logOutput += formatStage(sec.stages[i]);
                 }
              }
           }
           else if (sec.type === 'RESPONSE') {
              logOutput += "Text:\n" + (responseText || "[No Final Text]") + "\n\n";
              for (var i = 0; i < sec.stages.length; i++) {
                 if (sec.stages[i].stage !== 'FINAL_RESPONSE') {
                    logOutput += formatStage(sec.stages[i]);
                 }
              }
           }
           else {
              // EXECUTION блок: показываем MODULE_INTENT отдельно
              for (var i = 0; i < sec.stages.length; i++) {
                 var eStage = sec.stages[i];
                 if (eStage.stage === 'MODULE_INTENT' || eStage.stage === 'CODE_INTENT_RESOLVER') {
                    var intentIcon = { 'ADD': '➕', 'QUERY': '🔍', 'PLAN': '📊', 'SMALL_TALK': '💬', 'UNKNOWN': '❓' };
                    var icon = intentIcon[eStage.data.intent] || '🧭';
                    var skipNote = eStage.data.action === 'SKIP_PROTOCOLS_GLOBAL' ? ' [ПРОТОКОЛЫ ПРОПУЩЕНЫ]' : '';
                    var prefix = eStage.stage === 'CODE_INTENT_RESOLVER' ? '⚡ CODE_RESOLVER' : 'MODULE_INTENT';
                    logOutput += icon + " " + prefix + " " + eStage.data.module + ": " + eStage.data.intent + " (conf: " + (eStage.data.confidence ? eStage.data.confidence.toFixed(2) : '?') + ")" + skipNote + "\n";
                 } else if (eStage.stage === 'ASK_USER') {
                    logOutput += "❓ ASK_USER: клавиатура выбора отправлена пользователю\n";
                 } else if (eStage.stage === 'SESSION_SUMMARY') {
                    logOutput += "📝 SESSION_SUMMARY: " + eStage.data.module + " (" + eStage.data.reason + ") → Life_Events\n";
                 } else {
                    logOutput += formatStage(eStage);
                 }
              }
           }
        }

        // Cache Stats
        if (arguments.length > 2 && arguments[2] && arguments[2].cacheStats) {
          summary.cacheHit = arguments[2].cacheStats.hit;
          summary.cacheMiss = arguments[2].cacheStats.miss;
        }

        var pricing = _MODEL_PRICING[summary.model] || _MODEL_PRICING["google/gemini-2.5-flash-lite"];
        summary.costUSD = (summary.tokensIn * pricing.input) + (summary.tokensOut * pricing.output);
        
        // --- SUMMARY BLOCK ---
        logOutput += "\n═══════════════════════\nSUMMARY\n\n";
        
        function padDots(label, val) {
          var d = "...................................";
          return (label + d).substring(0, 20) + val + "\n";
        }
        
        logOutput += padDots("Trace", this.traceId);
        logOutput += padDots("Mode", summary.mode);
        logOutput += padDots("Module", summary.module);
        logOutput += padDots("Session", summary.session);
        logOutput += "\n";
        logOutput += padDots("Action", summary.status);
        logOutput += padDots("Protocols", summary.protocols.length);
        logOutput += padDots("Events", summary.eventBus.length);
        logOutput += "\n";
        logOutput += padDots("Model", summary.model);
        logOutput += padDots("Prompt", summary.tokensIn + " tokens");
        logOutput += padDots("Completion", summary.tokensOut + " tokens");
        logOutput += "\n";
        logOutput += padDots("Execution", summary.status);
        if (summary.status !== 'SUCCESS') logOutput += padDots("Reason", summary.reason);
        logOutput += padDots("Total", duration + " ms");
        logOutput += padDots("Cost", "$" + summary.costUSD.toFixed(6));
        
        if (summary.contextStats) {
          logOutput += "\nContext:\n";
          logOutput += padDots("  WorkingMemory", (summary.contextStats.workingMemoryBytes / 1024).toFixed(1) + " KB");
          logOutput += padDots("  Semantic", summary.contextStats.semanticFacts + " facts");
          logOutput += padDots("  Goals", summary.contextStats.goals);
          logOutput += padDots("  History", summary.contextStats.history + " msgs");
        }
        
        if (summary.protocols.length > 0) {
          logOutput += "\nProtocols: " + summary.protocols.join(' | ') + "\n";
        }
        
        if (summary.pipeline.length > 0) {
          logOutput += "\n═══════════════════════\nPIPELINE\n═══════════════════════\n\n";
          var cogs = ['BaseChat', 'PromptBuilder', 'AI Bridge', 'Reflection', 'Insight', 'Curiosity', 'Decision', 'Attention', 'Personality', 'Notification', 'Response'];
          var flow = [];
          for (var p=0; p<summary.pipeline.length; p++) {
             flow.push(summary.pipeline[p].name + " (" + summary.pipeline[p].ms + " ms)");
          }
          if (flow.length === 0) {
             flow = ["Router", "PromptBuilder", "AI Bridge", "Response"]; // Fallback mock pipeline
          }
          logOutput += flow.join("\n↓\n") + "\n";
        } else {
          // Если pipeline пустой, покажем стандартный базовый поток
          logOutput += "\n═══════════════════════\nPIPELINE\n═══════════════════════\n\n";
          logOutput += "Router\n↓\nPromptBuilder\n↓\nAI Bridge\n↓\nResponse\n";
        }
        
        var totalHealth = 0;
        var components = 5;
        if (summary.health.Kernel) totalHealth++;
        if (summary.health.Router) totalHealth++;
        if (summary.health.LifeBus) totalHealth++;
        if (summary.health.LLM) totalHealth++;
        if (summary.health.Sheets) totalHealth++;
        var healthPct = Math.round((totalHealth / components) * 100);
        
        logOutput += "\n═══════════════════════\nSYSTEM HEALTH\n═══════════════════════\n\n";
        logOutput += padDots("Kernel", (summary.health.Kernel ? "✅" : "❌"));
        logOutput += padDots("Router", (summary.health.Router ? "✅" : "❌"));
        logOutput += padDots("LifeBus", (summary.health.LifeBus ? "✅" : "❌"));
        logOutput += padDots("WorkingMemory", "N/A");
        logOutput += padDots("SemanticMemory", "N/A");
        logOutput += padDots("Reflection", "N/A");
        logOutput += padDots("Decision", "N/A");
        logOutput += padDots("Attention", "N/A");
        logOutput += padDots("LLM", (summary.health.LLM ? "✅" : "❌"));
        logOutput += padDots("Sheets", (summary.health.Sheets ? "✅" : "❌"));
        logOutput += padDots("Overall", healthPct + "%");
        logOutput += "\n═══════════════════════\n";
        
        logOutput += "\n[TRACE_END]";
        
        // Компактный формат для Google Sheets — вся запись в одну строку без переносов
        var compactLog = logOutput
          .replace(/\r\n/g, '\n')
          .replace(/\n{2,}/g, '\n')
          .replace(/\n/g, ' | ')
          .replace(/ {2,}/g, ' ')
          .trim();
        
        if (typeof writeToSysLogs === 'function') {
           writeToSysLogs(moduleName || 'TRACE', compactLog);
        } else if (typeof Logger !== 'undefined') {
           Logger.log(logOutput);
        }
      } catch(e) {
        if (typeof Logger !== 'undefined') Logger.log('TRACE FLUSH ERROR: ' + e);
      }
    }
  };
}

/**
 * ==============================================================================
 * 🧠 ExecutionContext
 * Единый объект контекста выполнения для архитектуры No-Code.
 * ==============================================================================
 */
function createExecutionContext(input, chatId, updateId, messageId) {
  return {
    trace: createTrace(updateId, messageId),
    meta: {
      userId: chatId,
      timestamp: new Date(),
      executionTimeMs: 0
    },
    message: {
      rawText: input.text || "",
      cleanText: input.lowerText || "",
      hasPhoto: input.hasPhoto || false,
      photoBase64: input.photoBase64 || null,
      mime: input.hasPhoto ? 'image/jpeg' : null
    },
    session: {
      state: null
    },
    route: {
      mode: "BASE",
      modules: [],
      candidates: [],
      chained: false,
      forcedIntent: null,
      isSessionContinue: false
    },
    context: {
      systemPrompt: "",
      moduleRules: "",
      runtimeData: "",
      history: []
    },
    llm: {
      rawResponse: "",
      thought: "",
      tokensUsed: 0
    },
    pipeline: {
      protocols: [],
      validation: { isValid: true, errors: [] },
      executionResults: [],
      finalText: "",
      outKeyboard: null
    },
    telegram: {
      payloadToSend: null,
      messageIdSent: null
    },
    logs: []
  };
}

function logExecution(ctx, stage, message) {
  var logEntry = "[" + stage + "] " + message;
  ctx.logs.push(logEntry);
  if (ctx.trace) {
    ctx.trace.stage(stage, message);
  }
}
// ==============================================================================
// 🌐 WEBHOOK ENTRY POINT (GAS-специфичная часть)
// В web-версии этот блок заменяется на HTTP route handler.
// ==============================================================================
function doPost(e) {

  
  if (typeof sysLog !== 'undefined') sysLog("🔥 WEBHOOK TRIGGERED: " + JSON.stringify(e));

  // Проверяем что это кастомный webhook (например от CRM)
  if (e.postData && e.postData.contents && e.postData.contents.indexOf('CRM_Notification') !== -1) {  return _ok();
  }

  var contents = "";
  try {
    if (e.postData && e.postData.contents) {
      contents = e.postData.contents;
    }
  } catch(err) {
    return _ok();
  }

  // === MONOBANK WEBHOOK HANDLING ===
  if (contents.indexOf('"StatementItem"') !== -1 || contents.indexOf('"type":"StatementItem"') !== -1) {
    try {
      var monoData = JSON.parse(contents);
      if (typeof handleMonobankWebhook === 'function') {
        handleMonobankWebhook(monoData);
      }
    } catch(err) {
      sysLog("Error processing Monobank webhook: " + err, MY_ID);
    }
    return _ok();
  }
  
  // === CRM WEBHOOK HANDLING ===
  if (contents.indexOf('CRM_ExpectedIncome') !== -1 || contents.indexOf('CRM_Notification') !== -1) {
    try {
      var crmData = JSON.parse(contents);
      if (crmData.type === 'CRM_Notification') {
        sendText(MY_ID, "🤖 <b>Система CRM:</b>\n" + crmData.text, "HTML");
        return _ok();
      }
      if (typeof handleCRMWebhook === 'function') {
        handleCRMWebhook(crmData);
      }
    } catch(err) {
      sysLog("Error processing CRM webhook: " + err, MY_ID);
    }
    return _ok();
  }

  // Проверяем что это Telegram update
  var isTelegram = contents.indexOf('"update_id"') !== -1;

  if (!isTelegram) return _ok();

  try {
    var update = JSON.parse(contents);

    // Дедупликация по update_id (Telegram может повторять webhook при долгих ответах)
    var cache = CacheService.getScriptCache();
    var updateIdKey = 'TG_UPDATE_' + update.update_id;
    if (cache.get(updateIdKey)) {
      sysLog('Duplicate update ignored: ' + update.update_id);
      return _ok();
    }
    // Кэшируем update_id на 5 минут
    cache.put(updateIdKey, '1', 300);

    // Обработка нажатий кнопок
    if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
      return _ok();
    }

    // Фильтр: только авторизованный пользователь
    if (!update.message) return _ok();
    
    var incomingChatId = update.message.chat.id;
    var resolvedSheetId = MASTER_DB_ID; // TEMPORARY BYPASS

    // Устанавливаем ADS_DATA_SHEET_ID глобально для текущего исполнения
    globalThis.ADS_DATA_SHEET_ID = resolvedSheetId;
    var chatId = incomingChatId;

    // === Нормализация входных данных ===
    var input = _parseInputFromUpdate(update.message, chatId);
    if (!input) return _ok();

    processUserMessage(input, chatId, null, update.update_id, update.message.message_id);

  } catch (err) {
    sysLog('❌ CRITICAL KERNEL ERROR: ' + err.toString());
    sendText(MY_ID, '❌ КРИТИЧЕСКИЙ СБОЙ ЯДРА:\n' + err.toString());
  }

  return _ok();
}

function _ok() {
  return HtmlService.createHtmlOutput("OK");
}

function processUserMessage(input, chatId, forceOptions, updateId, messageId) {
  var ctx = createExecutionContext(input, chatId, updateId, messageId);
  try {
    ctx.trace.stage('REQUEST', {
      user: chatId,
      chat: 'Telegram',
      message: input.text,
      received: Utilities.formatDate(new Date(), TIME_ZONE || 'Europe/Moscow', 'HH:mm:ss')
    });
    logExecution(ctx, 'KERNEL', 'processUserMessage сработал.');

    // [LIFE ENGINE] 1. Сенсорный сигнал о новом сообщении
    if (typeof LifeBus !== 'undefined') {
      LifeBus.emit('USER_REQUEST', { text: input.text }, ctx);
    }

    sendAction(chatId, 'typing');

  var hardResult = _handleHardTriggers(input.lowerText, chatId, ctx);
  if (hardResult !== false) {
    if (hardResult) sendText(chatId, hardResult);
    return;
  }

  var sessionState = getSessionState(chatId, ctx);
  ctx.session.state = sessionState;

  if (forceOptions && forceOptions.forceModule) {
    logExecution(ctx, 'ROUTER', 'Форсированный роутинг в модуль: ' + forceOptions.forceModule);
    ctx.route.mode = 'MODULE';
    ctx.route.modules = [forceOptions.forceModule];
    ctx.route.chained = false;
    
    sessionState.currentModule = forceOptions.forceModule;
    sessionState.history = [];
  } else {
    var route = routeInput(input.lowerText, sessionState, ctx);
    ctx.route.mode = route.mode;
    ctx.route.modules = route.modules || [];
    ctx.route.chained = route.chained || false;
    ctx.route.forcedIntent = route.forcedIntent || null;
    ctx.route.broadOnly = route.broadOnly || false;
  }

  var aresResponse;

  if (ctx.route.mode === 'BASE') {
    // Adapter: pass old arguments for now until fully migrated
    aresResponse = executeBaseChat(input, chatId, ctx);
  } else if (ctx.route.mode === 'ASK_USER') {
    // ====================================================
    // ASK_USER: амбивалентный запрос — показываем клавиатуру выбора
    // ====================================================
    var askCandidates = ctx.route.candidates || ctx.route.modules.map(function(m) { return { key: m }; });
    var askText = 'Не совсем понял, к какому разделу относится запрос. Выбери нужный:';
    var moduleIcons = { nutrition: '🍎', tasks: '✅', finance: '💰', diary: '📝', calendar: '📅', reminders: '⏰', news: '📰', metanoia: '🧘' };
    var inlineButtons = askCandidates.slice(0, 3).map(function(c) {
      var icon = moduleIcons[c.key] || '🔸';
      return [{ text: icon + ' ' + c.key, callback_data: '@' + c.key + ' ' + input.text }];
    });
    inlineButtons.push([{ text: '💬 Просто спросить', callback_data: '@base ' + input.text }]);
    var askKeyboard = { inline_keyboard: inlineButtons };
    logExecution(ctx, 'KERNEL', 'ASK_USER: амбивалентный запрос, показываем клавиатуру');
    if (typeof sysLog !== 'undefined') sysLog('❓ [ASK_USER] Кандидаты: ' + askCandidates.map(function(c) { return c.key + '(' + (c.score||'?') + ')'; }).join(', '), chatId);
    ctx.trace.stage('ASK_USER', { candidates: askCandidates.map(function(c) { return { module: c.key, score: c.score }; }) });
    aresResponse = { text: askText, keyboard: askKeyboard };
  } else if (ctx.route.mode === 'MODULE') {
    if (ctx.route.forcedIntent) {
      sessionState.forcedIntent = ctx.route.forcedIntent;
    } else {
      delete sessionState.forcedIntent;
    }

    if (ctx.route.chained) {
      aresResponse = executeChainedModules(ctx.route, input, sessionState, chatId, ctx);
    } else {
      var moduleName = ctx.route.modules[0];
      startSession(sessionState, moduleName);
      aresResponse = executeSingleModule(moduleName, input, sessionState, chatId, null, ctx);
    }
  }
  
  // ALWAYS save the session state so that router's decisions (like dropping a session) are persisted
  saveSessionState(chatId, sessionState);

  if (aresResponse) {
    // [LIFE ENGINE] 2. Анализ возможностей (Assistive Layer) перед отправкой
    if (typeof LifeBus !== 'undefined') {
      var eventData = { response: aresResponse };
      LifeBus.emit('BEFORE_RESPONSE', eventData, ctx);
      aresResponse = eventData.response; // Правила могли дописать Suggestions
    }

    if (typeof aresResponse === 'object' && aresResponse.text) {
      if (typeof aresResponse.text === 'string' && aresResponse.text.includes('[[') && aresResponse.text.includes(']]')) {
        logExecution(ctx, 'KERNEL', '⚠️ Вырезан необработанный тег (объект).');
        aresResponse.text = _cleanLeakedTags(aresResponse.text);
      }
      ctx.trace.stage('FINAL_RESPONSE', aresResponse.text);
      sendText(chatId, aresResponse.text, false, aresResponse.keyboard);
    } else {
      if (typeof aresResponse === 'string' && aresResponse.includes('[[') && aresResponse.includes(']]')) {
        if (ctx.route.mode === 'BASE') {
          // ═══ L3: LLM INTUITION ROUTING ═══
          // Роутер не нашёл модуль (L1/L2), но ИИ сам принял решение и выдал тег.
          // Это легальное маршрутное решение L3 — пробуем исполнить через все протоколы.
          // Фикс бага: передаем пустой массив [], чтобы защита duplicateHandler не вырезала теги
          var l3Result = executeProtocols(aresResponse, [], aresResponse, ctx);
          var l3Text = (typeof l3Result === 'object' && l3Result !== null) ? l3Result.text : l3Result;
          if (l3Result !== false && l3Result !== null && l3Text !== aresResponse && typeof l3Text === 'string' && !l3Text.includes('[[')) {
            // Протокол успешно исполнен — используем результат
            if (typeof sysLog !== 'undefined') sysLog('🧭 [L3_ROUTING] Интуиция ИИ исполнена: ' + aresResponse.substring(0, 60));
            
            // Найдём, какому модулю принадлежит этот тег, чтобы телеметрия (логи) была корректной
            var tagMatch = aresResponse.match(/\[\[([A-Z_]+)(?::|\]\])/);
            if (tagMatch) {
              var prefix = '[[' + tagMatch[1];
              for (var m in _MODULE_REGISTRY) {
                var modObj = _MODULE_REGISTRY[m];
                if (modObj && modObj.protocols) {
                  for (var p = 0; p < modObj.protocols.length; p++) {
                    if (modObj.protocols[p].tag && modObj.protocols[p].tag.startsWith(prefix)) {
                      ctx.route.mode = 'MODULE';
                      ctx.route.modules = [m];
                      break;
                    }
                  }
                }
                if (ctx.route.mode === 'MODULE') break;
              }
            }
            
            aresResponse = l3Result;
          } else {
            // Тег не был распознан ни одним протоколом — вырезаем как прежде
            logExecution(ctx, 'KERNEL', '⚠️ Вырезан необработанный тег (строка).');
            aresResponse = _cleanLeakedTags(aresResponse);
          }
        } else {
          logExecution(ctx, 'KERNEL', '⚠️ Вырезан необработанный тег (строка).');
          aresResponse = _cleanLeakedTags(aresResponse);
        }
      }
      if (typeof aresResponse === 'object' && aresResponse !== null && aresResponse.text) {
        ctx.trace.stage('FINAL_RESPONSE', aresResponse.text);
        sendText(chatId, aresResponse.text, false, aresResponse.keyboard);
      } else {
        ctx.trace.stage('FINAL_RESPONSE', aresResponse);
        sendText(chatId, aresResponse);
      }
    }
  }
  
  } catch (err) {
    logExecution(ctx, 'KERNEL_ERROR', err.toString());
    throw err;
  } finally {
    if (ctx && ctx.trace) {
      var mod = (ctx.route.mode === 'MODULE' && ctx.route.modules && ctx.route.modules.length > 0) ? ctx.route.modules[0] : 'BASE';
      ctx.trace.flush(chatId, mod, ctx);
    }
  }
}

// ==============================================================================
// 📥 ПАРСИНГ ВХОДЯЩЕГО UPDATE
// ==============================================================================
function _parseInputFromUpdate(message, chatId) {
  var input = {
    text:        message.text || message.caption || '',
    hasPhoto:    !!message.photo,
    photoId:     null,
    photoBase64: null,
    hasVoice:    !!message.voice,
    voiceId:     message.voice ? message.voice.file_id : null,
    lowerText:   ''
  };

  // Фото
  if (input.hasPhoto) {
    sendAction(chatId, 'upload_photo');
    var photoArray = message.photo;
    input.photoId     = photoArray[photoArray.length - 1].file_id;
    input.photoBase64 = getTelegramFileAsBase64(input.photoId);
  }

  // Голос
  if (input.hasVoice) {
    sendAction(chatId, 'record_audio');
    try {
      var voiceData = getVoiceData(input.voiceId);
      if (typeof quickTranscribeVoice === 'function') {
        input.text = quickTranscribeVoice(voiceData);
        if (!input.text || input.text.trim() === '') input.text = '[Пустое голосовое сообщение]';
      }
    } catch (err) {
      input.text = '[Ошибка расшифровки]';
    }
  }

  if (!input.text && !input.hasPhoto && !input.hasVoice) return null;

  input.lowerText = input.text.toLowerCase().trim();
  return input;
}

// ==============================================================================
// 🐛 СУПЕР-ОТЛАДКА
// ==============================================================================
function sysLog(msg, chatId) {
  try {
    Logger.log(msg);
    if (globalThis.TEST_DRIVE_MODE && globalThis.TEST_DRIVE_LOGS) {
      globalThis.TEST_DRIVE_LOGS.push('🐛 [DEBUG]: ' + msg);
    }
  } catch (e) {
    Logger.log('sysLog failed: ' + e.toString());
  }
}

/**
 * Пишет строку лога в Google Sheets SysLogs
 * 
 * @param {string} moduleName — Имя текущего модуля (например, 'nutrition' или 'AI_BRIDGE')
 * @param {string} message    — Текст лога
 */
function writeToSysLogs(moduleName, message) {
  try {
    if (typeof globalThis.logToSysLogs === 'function') {
      globalThis.logToSysLogs(moduleName || 'ARES', message);
    }
  } catch (e) {
    Logger.log('writeToSysLogs failed: ' + e.toString());
  }
}

// ==============================================================================
// ⚡ ХАРД-ТРИГГЕРЫ
// Быстрые команды без LLM. Возвращает строку (ответ), null (тихо) или false (не сработало).
// ==============================================================================
function _handleHardTriggers(lowerInput, chatId, ctx) {

  // Режим отладки
  if (lowerInput.includes('/debug_on') || lowerInput.includes('отладка вкл') || lowerInput.includes('откладка вкл')) {
    PropertiesService.getUserProperties().setProperty('DEBUG_MODE', 'ON');
    return '🐛 Режим отладки ВКЛЮЧЕН. Теперь все логи пишутся в Google Sheets (без спама в чат).';
  }
  if (lowerInput.includes('/debug_off') || lowerInput.includes('отладка выкл') || lowerInput.includes('откладка выкл')) {
    PropertiesService.getUserProperties().setProperty('DEBUG_MODE', 'OFF');
    return '🔕 Режим отладки ВЫКЛЮЧЕН.';
  }

  // Очистка истории (кэша)
  if (lowerInput === '/setup') {
    if (typeof registerTelegramCommands === 'function') registerTelegramCommands();
    if (typeof setupSysLogsSheet === 'function') setupSysLogsSheet();
    if (typeof initParentingSheet === 'function') initParentingSheet();
    return '✅ Меню очищено, листы SysLogs и Parenting настроены!';
  }

  if (lowerInput === '/clear' || lowerInput === 'забудь все' || lowerInput === 'сброс' || lowerInput === 'клир') {
    clearAllHistory(chatId);
    if (typeof sysLog !== 'undefined') sysLog("🧹 [HISTORY] История диалога очищена.", chatId);
    sendText(chatId, "✅ <b>Память сессии стёрта.</b> Начинаем с чистого листа.");
    return;
  }
  
  if (lowerInput === '/dumpconfig') {
    try {
      var props = PropertiesService.getScriptProperties().getProperty('MODULE_CFG_nutrition');
      sendText(chatId, "🔧 <b>MODULE_CFG_nutrition:</b>\n" + (props ? props : "null"));
    } catch(e) {
      sendText(chatId, "Error: " + e.message);
    }
    return;
  }// Утренний протокол
  if (lowerInput.includes('доброе утро') || lowerInput === 'утро') {
    if (typeof handleMorningProtocol === 'function') {
      handleMorningProtocol('ЗАПУСК');
    }
    return null;  // GoodMorning сам отправляет сообщения
  }
  
  // Тест Драйв
  if (lowerInput === '/testdrive' || lowerInput === 'тест драйв') {
    if (typeof runTestDrive === 'function') runTestDrive(chatId);
    return null;
  }
  if (lowerInput === '/test_tasks') {
    if (typeof runTestDrive_Tasks === 'function') runTestDrive_Tasks(chatId);
    return null;
  }
  if (lowerInput === '/test_finance') {
    if (typeof runTestDrive_Finance === 'function') runTestDrive_Finance(chatId);
    return null;
  }
  if (lowerInput === '/test_weather') {
    if (typeof runTestDrive_Weather === 'function') runTestDrive_Weather(chatId);
    return null;
  }
  if (lowerInput === '/test_reminders') {
    if (typeof runTestDrive_Reminders === 'function') runTestDrive_Reminders(chatId);
    return null;
  }
  if (lowerInput === '/test_ads') {
    if (typeof runTestDrive_Ads === 'function') runTestDrive_Ads(chatId);
    return null;
  }
  if (lowerInput === '/test_news') {
    if (typeof runTestDrive_News === 'function') runTestDrive_News(chatId);
    return null;
  }
  if (lowerInput === '/test_diary') {
    if (typeof runTestDrive_DiaryAndMetanoia === 'function') runTestDrive_DiaryAndMetanoia(chatId);
    return null;
  }
  if (lowerInput === '/test_multi') {
    if (typeof runTestDrive_Multi === 'function') runTestDrive_Multi(chatId);
    return null;
  }

  // Принудительное удаление задач
  if (lowerInput.includes('удали') && (lowerInput.includes('все задачи') || lowerInput.includes('все планы'))) {
    if (typeof handleClearTasks === 'function') {
      var sessionState = getSessionState(chatId, ctx);
      startSession(sessionState, 'tasks');
      saveSessionState(chatId, sessionState);
      var tag = '[[CLEAR_TASKS: TODAY]]';
      if (lowerInput.includes('завтра')) tag = '[[CLEAR_TASKS: TOMORROW]]';
      if (ctx && ctx.trace) {
        ctx.trace.stage('ROUTER', { mode: 'MODULE', modules: ['tasks'], reason: 'HARD_TRIGGER' });
        ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', tag: tag });
      }
      return handleClearTasks(tag);
    }
  }

  // Принудительный список задач
  if (lowerInput === 'задачи' || lowerInput === 'список задач' || lowerInput === 'планы' ||
      lowerInput.includes('все задачи') || lowerInput === 'реестр' || lowerInput.includes('покажи задач')) {
    if (typeof handleGetTasks === 'function') {
      var sessionState = getSessionState(chatId, ctx);
      startSession(sessionState, 'tasks');
      saveSessionState(chatId, sessionState);
      var tag = '[[GET_TASKS: TODAY | Default]]';
      if (lowerInput.includes('все'))    tag = '[[GET_TASKS: ALL]]';
      if (ctx && ctx.trace) {
        ctx.trace.stage('ROUTER', { mode: 'MODULE', modules: ['tasks'], reason: 'HARD_TRIGGER' });
        ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', tag: tag });
      }
      return handleGetTasks(tag);
    }
  }

  // Принудительный список напоминаний
  if (lowerInput.includes('покажи') && (lowerInput.includes('напоминан') || lowerInput.includes('таймер'))) {
    if (typeof handleGetReminders === 'function') {
      var sess2 = getSessionState(chatId, ctx);
      startSession(sess2, 'reminders');
      if (ctx && ctx.trace) {
        ctx.trace.stage('ROUTER', { mode: 'MODULE', modules: ['reminders'], reason: 'HARD_TRIGGER' });
        ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', tag: '[[GET_REMINDERS]]' });
      }
      return handleGetReminders('[[GET_REMINDERS]]');
    }
  }

  // Сброс сессии
  if (lowerInput === 'стоп' || lowerInput === 'хватит' || lowerInput === 'выйти') {
    var sess3 = getSessionState(chatId, ctx);
    if (sess3.activeModule) {
      resetSession(sess3);
      saveSessionState(chatId, sess3);
      return 'Сессия завершена.';
    }
    return null;
  }

  return false;  // Хард-триггер не сработал
}

// ==============================================================================
// 💬 BASE CHAT EXECUTION
// ==============================================================================
function executeBaseChat(input, chatId, ctx) {
  sysLog('[BASE_CHAT] Свободный диалог', chatId);

  var history = getModuleHistory(chatId, 'history_general', ctx);
  var now     = new Date();
  var timeCtx = '\n\n[ТЕКУЩЕЕ ВРЕМЯ СЕРВЕРА: ' + Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd HH:mm:ss') + ']';

  // Soft Memory: только упомянутые объекты, без личного дневника
  var softMemoryCtx = '';
  try {
    var lowerText   = input.text.toLowerCase();
    var cachedGraph = CacheService.getScriptCache().get('ARES_MEMORY_GRAPH');
    if (cachedGraph) {
      var graphData = JSON.parse(cachedGraph);
      var mentionedEntities = graphData.filter(function(row) {
        return row[0].length > 2 && lowerText.includes(row[0].toLowerCase());
      });
      if (mentionedEntities.length > 0) {
        var topEntities = mentionedEntities
          .sort(function(a, b) { return (parseInt(b[5]) || 0) - (parseInt(a[5]) || 0); })
          .slice(0, 3);
        softMemoryCtx = '\n\n[SOFT MEMORY / ЗАМЕТКИ ОБ ОБЪЕКТАХ]:\n' +
          topEntities.map(function(r) { return '— ' + r[0] + ' (' + r[1] + '): ' + r[2]; }).join('\n');
      }
    }
  } catch (e) { /* soft memory optional */ }

  var finalPrompt  = input.text + timeCtx + softMemoryCtx;
  var systemPrompt = getBaseChatPrompt();
  var media        = input.hasPhoto ? input.photoBase64 : null;
  var mime         = input.hasPhoto ? 'image/jpeg'      : null;

  var aresResponse = askAres(history, finalPrompt, systemPrompt, media, mime, ctx);

  // В BASE CHAT НИКОГДА не выполняем протоколы
  if (typeof aresResponse === 'string' && !aresResponse.includes('Ошибка моста')) {
    history.push({ role: 'user',      content: input.text    });
    history.push({ role: 'assistant', content: aresResponse });
    saveModuleHistory(chatId, 'history_general', history);
  }

  if (typeof sysLog !== 'undefined') {
    sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + aresResponse, chatId);
  }

  return aresResponse;
}

// ==============================================================================
// 🧩 SINGLE MODULE EXECUTION
// ==============================================================================
function executeSingleModule(moduleName, input, sessionState, chatId, customText, ctx) {
  sysLog('[MODULE_EXECUTE] ' + moduleName, chatId);

  var registry    = getModuleRegistry();
  var payloadText = customText || input.text;
  var payload     = buildModulePayload(moduleName, { text: payloadText }, sessionState, chatId, ctx);
  if (!payload) return executeBaseChat(input, chatId);

  var mod = registry[moduleName];
  var now = new Date();
  var timeCtx = '\n\n[ТЕКУЩЕЕ ВРЕМЯ СЕРВЕРА: ' + Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd HH:mm:ss') + ']';

  // Deterministic Bypass: если contextFn вернул [[HARD_RESPONSE]] — пропускаем LLM
  if (payload.memory && payload.memory.includes('[[HARD_RESPONSE]]')) {
    if (ctx && ctx.trace) ctx.trace.stage('LLM_BYPASS', { reason: 'HARD_RESPONSE from contextFn' });
    sysLog('[DETERMINISTIC_BYPASS] LLM skipped for: ' + moduleName, chatId);
    return payload.memory.replace('[[HARD_RESPONSE]]', '').trim();
  }

  var media = input.hasPhoto ? input.photoBase64 : null;
  var mime  = input.hasPhoto ? 'image/jpeg'      : null;

  var aresResponse = "";
  var originalAresResponse = "";
  var passes = 0;
  
  while (passes < 2) {
    passes++;
    
    // СБОРКА БЛОЧНОГО ПРОМПТА (ЭТАП 2)
    var systemPrompt = getPersonalityPrompt();
    try {
      // 1. НАМЕРЕНИЕ (INTENT)
      var intentText = "";
      // Проверяем кастомный промпт из кэша (Constructor)
      var props = PropertiesService.getScriptProperties();
      var overrideJson = props.getProperty('MODULE_CFG_' + moduleName);
      var override = overrideJson ? JSON.parse(overrideJson) : null;
      
      if (override && override.customPrompt && !mod.ignoreCustomPrompt) {
        // Automatically inject the system MODE context so the user doesn't have to define it
        intentText = "MODE: " + moduleName.toUpperCase() + " MODULE\n" + override.customPrompt;
      } else if (mod.promptIntentFn && typeof globalThis[mod.promptIntentFn] === 'function') {
        intentText = globalThis[mod.promptIntentFn]();
      } else if (mod.promptFn && typeof globalThis[mod.promptFn] === 'function') {
        // Fallback для модулей, которые еще не переведены на блочную систему
        intentText = globalThis[mod.promptFn]();
      }
      
      if (intentText) {
        systemPrompt += "\n\n" + intentText;
      }
      
      // ИНЪЕКЦИЯ FORCED INTENT
      if (payload.forcedIntent) {
        systemPrompt += "\n\n[FORCED INTENT / СТРОГОЕ УКАЗАНИЕ ОТ РОУТЕРА]\n" +
                        "Система маршрутизации точно определила намерение пользователя:\n" +
                        "Требуемая функция: " + payload.forcedIntent.function + "\n";
        if (payload.forcedIntent.instruction) {
          systemPrompt += "Специальная инструкция: " + payload.forcedIntent.instruction + "\n";
        }
        if (payload.forcedIntent.json_format) {
          systemPrompt += "Ожидаемый JSON формат: " + payload.forcedIntent.json_format + "\n";
        }
        systemPrompt += "СЛЕДУЙ ЭТОЙ ИНСТРУКЦИИ ПРЯМО СЕЙЧАС И ВЫВЕДИ СООТВЕТСТВУЮЩИЙ ТЕГ/ПРОТОКОЛ.\n";
      }
      // ИНЪЕКЦИЯ BROAD MATCH (LAYER 2 ROUTING)
      if (payload.broadOnly) {
        systemPrompt += "\n\n[ВНИМАНИЕ: ШИРОКОЕ СООТВЕТСТВИЕ]\n" +
                        "Пользователь попал в этот модуль по широкому или общему ключевому слову.\n" +
                        "1. Если из текста запроса абсолютно ясна конкретная функция и все параметры (например, указан конкретный город для погоды или дата для питания), ты имеешь право запустить соответствующий протокол сразу.\n" +
                        "2. Если запрос слишком общий, двусмысленный или не содержит параметров (например, просто 'мяч', 'погода', 'питание'), тебе КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО запускать протоколы наугад. В этом случае задай один короткий уточняющий вопрос (сгенерированный тобой в свободном стиле), чтобы понять конкретное намерение пользователя.\n";
      }

      // 1.5 КРОСС-МОДУЛЬНЫЕ ЗАПРОСЫ (LAYER 3 ROUTING)
      var reg = getModuleRegistry();
      var crossModuleText = "\n\n[КРОСС-МОДУЛЬНЫЕ ЗАПРОСЫ]\nЕсли запрос относится к ДРУГОМУ модулю, ЗАПРЕЩЕНО запускать его рабочие протоколы. СНАЧАЛА ты обязан задать уточняющий вопрос пользователю.\nЕСЛИ пользователь УЖЕ подтвердил переключение (например, ответил 'да' на твой вопрос), ты можешь использовать тег для переключения:\n";
      for (var k in reg) {
        if (k === moduleName || k === 'base') continue;
        var m = reg[k];
        if (m.protocols && m.protocols.length > 0) {
          // Ищем первый протокол с описанием
          for (var p = 0; p < m.protocols.length; p++) {
            if (m.protocols[p].desc) {
              var sigMatch = m.protocols[p].desc.match(/\[\[.*\]\]/);
              if (sigMatch) {
                crossModuleText += "- " + k.toUpperCase() + " -> " + sigMatch[0] + "\n";
                break;
              }
            }
          }
        }
      }
      systemPrompt += crossModuleText;
      
      // 2. ПРОТОКОЛЫ (СЦЕНАРИИ)
      let customProtocols = (override && override.customProtocols) ? override.customProtocols : {};
      
      if (mod.protocols && mod.protocols.length > 0) {
        systemPrompt += "\n\nРАЗРЕШЁННЫЕ ПРОТОКОЛЫ:";
        mod.protocols.forEach(function(p) {
          if (p.desc) {
            let finalDesc = p.desc;
            if (customProtocols[p.tag]) {
              let userDesc = customProtocols[p.tag];
              if (!userDesc.includes('[[')) {
                let sigMatch = p.desc.match(/\[\[.*\]\]/);
                let signature = sigMatch ? sigMatch[0] : p.tag;
                finalDesc = userDesc + " (ОБЯЗАТЕЛЬНО ИСПОЛЬЗУЙ ТЕГ: " + signature + ")";
              } else {
                finalDesc = userDesc;
              }
            }
            systemPrompt += "\n— " + finalDesc;
          }
        });
      }

      // 3. ПРАВИЛА (ЖЕСТКО ВШИТЫЕ PROTOCOL RULES)
      if (mod.promptProtocolsFn && typeof globalThis[mod.promptProtocolsFn] === 'function') {
        systemPrompt += "\n\n" + globalThis[mod.promptProtocolsFn]();
      }

    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog('[PROMPT_ERROR] ' + moduleName + ': ' + e.message, chatId);
    }
    
    var currentMemory = payload.memory || ''; // Use memory from payload, don't call contextFn twice
    var finalPrompt = payloadText + timeCtx + currentMemory;
    
    if (ctx && ctx.trace) {
       var histLength = payload.history ? JSON.stringify(payload.history).length : 0;
       var totalSize = systemPrompt.length + finalPrompt.length + histLength;
       ctx.trace.stage('PROMPT_BUILDER', {
         module: moduleName,
         identitySize: getPersonalityPrompt().length,
         intentAndRulesSize: systemPrompt.length - getPersonalityPrompt().length,
         runtimeContextSize: currentMemory.length,
         historyItems: payload.history ? payload.history.length : 0,
         promptTotal: totalSize,
         approxTokens: Math.floor(totalSize / 4)
       });
    }

    // ============================================================
    // HYBRID INTENT RESOLVER: Determenistic Code Layer
    // ============================================================
    var codeResolvedIntent = null;
    var bypassLLM = false;
    var bypassTags = [];
    if (mod.intentResolverFn && typeof globalThis[mod.intentResolverFn] === 'function') {
      try {
        var resolverOutput = globalThis[mod.intentResolverFn](input.lowerText);
        if (resolverOutput) {
          if (typeof resolverOutput === 'string') {
            codeResolvedIntent = resolverOutput;
          } else if (typeof resolverOutput === 'object') {
            codeResolvedIntent = resolverOutput.intent;
            bypassLLM = resolverOutput.bypassLLM === true;
            bypassTags = resolverOutput.tags || [];
          }
          if (typeof sysLog !== 'undefined') {
            sysLog('⚡ [CODE_INTENT_RESOLVER] ' + moduleName + ' → ' + codeResolvedIntent + (bypassLLM ? ' (BYPASS LLM)' : ''));
          }
          if (ctx && ctx.trace) {
            ctx.trace.stage('CODE_INTENT_RESOLVER', { module: moduleName, intent: codeResolvedIntent, confidence: 1.0, bypassLLM: bypassLLM });
          }
          systemPrompt += "\n\nПРИНУДИТЕЛЬНОЕ НАМЕРЕНИЕ ОТ СИСТЕМЫ: " + codeResolvedIntent + ".\nТебе больше не нужно определять намерение, просто верни соответствующие протоколы для " + codeResolvedIntent + ". Теги [[MODULE_INTENT]] и [[MODULE_CONFIDENCE]] выводить НЕ нужно.";
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('[INTENT_RESOLVER_ERROR] ' + moduleName + ': ' + e.message);
      }
    }

    if (bypassLLM && bypassTags.length > 0) {
      if (typeof sysLog !== 'undefined') sysLog('🚀 [LLM_BYPASS] ИИ пропущен. Использованы заранее подготовленные теги.');
      if (ctx && ctx.trace) ctx.trace.stage('LLM_BYPASS', { tags: bypassTags });
      aresResponse = bypassTags.join('\n');
    } else {
      aresResponse = askAres(payload.history, finalPrompt, systemPrompt, media, mime, ctx);
    }
    if (typeof aresResponse !== 'string') break;

    if (ctx && ctx.trace) {
      ctx.trace.stage('LLM_RAW_RESPONSE', { response: aresResponse });
    }
    
    originalAresResponse = aresResponse;
    
    if (aresResponse.indexOf('[[CONTINUE]]') !== -1) {
      if (typeof sysLog !== 'undefined') sysLog('🔄 [TWO-PASS] Запрос данных в модуле: ' + moduleName, chatId);
      var interimResult = executeProtocols(aresResponse, moduleName, aresResponse, ctx);
      interimResult = interimResult.replace(/\[\[CONTINUE\]\]/g, '').trim();
      
      payload.history.push({ role: 'assistant', content: originalAresResponse });
      payload.history.push({ role: 'user', content: "SYSTEM_DATA:\n" + interimResult + "\n\nТеперь прими окончательное решение и выполни действие." });
      
      continue;
    }
    break;
  }

  if (typeof aresResponse !== 'string') return aresResponse;

  var parsedTags = _parseGlobalProtocols(aresResponse);

  // ============================================================
  // GLOBAL MODULE INTENT RESOLVER (Engine Layer)
  // Исключаем костыли в коде модулей — перехватываем намерения глобально
  // ============================================================
  var moduleIntent = codeResolvedIntent || 'UNKNOWN';
  var moduleConfidence = codeResolvedIntent ? 1.0 : 0.5;
  
  if (!codeResolvedIntent) {
    for (var i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'MODULE_INTENT') {
        moduleIntent = typeof parsedTags[i].payload === 'string' ? parsedTags[i].payload.toUpperCase().trim() : 'UNKNOWN';
      }
      if (parsedTags[i].name === 'MODULE_CONFIDENCE') {
        moduleConfidence = parseFloat(parsedTags[i].payload) || 0.5;
      }
    }
  }

  if (ctx && ctx.trace) {
    ctx.trace.stage('MODULE_INTENT', {
      module: moduleName,
      intent: moduleIntent,
      confidence: moduleConfidence
    });
  }

  // Проверяем, вернул ли ИИ хотя бы один валидный протокол (локально или глобально)
  var hasValidProtocols = false;
  for (var i = 0; i < parsedTags.length; i++) {
    var tName = parsedTags[i].name;
    if (tName !== 'MODULE_INTENT' && tName !== 'MODULE_CONFIDENCE') {
      
      // 1. Проверяем локальные протоколы текущего модуля
      if (mod.allowedProtocols && mod.allowedProtocols.some(function(p) { return p.indexOf(tName) !== -1; })) {
        hasValidProtocols = true;
        break;
      }
      
      // 2. Проверяем глобальные протоколы (CROSS-MODULE SUPPORT)
      if (typeof getProtocolMap === 'function') {
        var pMap = getProtocolMap();
        var keys = Object.keys(pMap);
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].indexOf(tName) !== -1) {
            hasValidProtocols = true;
            break;
          }
        }
      }
      
      if (hasValidProtocols) break;

      // 3. Fallback, если allowedProtocols не задан
      if (!mod.allowedProtocols) {
        hasValidProtocols = true;
        break;
      }
    }
  }

  // Если ИИ вернул UNKNOWN, но при этом выдал ВАЛИДНЫЕ теги (no-code модуль без явного MODULE_INTENT) -> мы пропускаем его!
  // Также не перехватываем если ИИ использовал универсальные теги [[ERROR:]] или [[SAY:]] — это легальный escape для модулей с жёстким протоколом
  var hasUniversalEscapeTag = /\[\[(?:ERROR|SAY):/i.test(aresResponse);
  var shouldIntercept = false;
  if (hasUniversalEscapeTag) {
    shouldIntercept = false; // Всегда пропускаем в executeProtocols
  } else if (moduleIntent === 'SMALL_TALK') {
    shouldIntercept = true;
  } else if ((moduleIntent === 'UNKNOWN' || moduleConfidence < 0.6) && !hasValidProtocols) {
    // Если модуль имеет зарегистрированный root handler или флаг allowTextFallback, не перехватываем отклик
    if (mod && (mod.allowTextFallback || (mod.handler && typeof globalThis[mod.handler] === 'function'))) {
      shouldIntercept = false;
    } else {
      shouldIntercept = true;
    }
  }

  if (shouldIntercept) {
    if (typeof sysLog !== 'undefined') sysLog('🧭 [GLOBAL_INTENT] Intercepted ' + moduleName + ' → Intent: ' + moduleIntent + ' | Confidence: ' + moduleConfidence + ' | ValidProtocols: ' + hasValidProtocols + ' (Bypassing module handler)');
    if (ctx && ctx.trace) {
      ctx.trace.stage('MODULE_INTENT', {
        module: moduleName,
        intent: moduleIntent,
        confidence: moduleConfidence,
        action: 'SKIP_PROTOCOLS_GLOBAL'
      });
    }

    var cleanRes = aresResponse
      .replace(/\[\[MODULE_INTENT:[^\]]*\]\]/g, '')
      .replace(/\[\[MODULE_CONFIDENCE:[^\]]*\]\]/g, '')
      .replace(/\[\[[\s\S]*?\]\]/g, '')
      .replace(/<thought>[\s\S]*?<\/thought>/g, '')
      .trim();

    // Сохраняем историю разговора в модуле
    payload.history.push({ role: 'user',      content: payload.text   });
    payload.history.push({ role: 'assistant', content: originalAresResponse });
    saveModuleHistory(chatId, mod.historyKey, payload.history);

    if (typeof sysLog !== 'undefined') {
      sysLog("📤 [FINAL_RESPONSE] Ответ пользователю (Разговорный): " + cleanRes, chatId);
    }
    return cleanRes;
  }

  // Очищаем служебные теги намерения перед передачей в хэндлер и протоколы
  aresResponse = aresResponse
    .replace(/\[\[MODULE_INTENT:[^\]]*\]\]/g, '')
    .replace(/\[\[MODULE_CONFIDENCE:[^\]]*\]\]/g, '')
    .trim();

  var outKeyboard = null;
  // Модуль-специфичная постобработка через handler (если задан)
  if (mod.handler && typeof globalThis[mod.handler] === 'function') {
    try {
      var handlerResult = globalThis[mod.handler](aresResponse, payload, input, parsedTags, ctx);
      if (typeof handlerResult === 'string') {
        aresResponse = handlerResult;
      } else if (typeof handlerResult === 'object' && handlerResult.text) {
        aresResponse = handlerResult.text;
        outKeyboard = handlerResult.keyboard;
      }
      if (ctx && ctx.trace) ctx.trace.stage('HANDLER_RESULT', { status: 'SUCCESS', module: moduleName });
    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog('[HANDLER_ERROR] ' + moduleName + ': ' + e.message, chatId);
      aresResponse = "⚠️ <b>ОШИБКА ВНУТРЕННЕГО ОБРАБОТЧИКА:</b>\n" + e.message + "\n\n" + aresResponse.replace(/\[\[.*?\]\]/g, '').trim();
      if (ctx && ctx.trace) ctx.trace.stage('HANDLER_RESULT', { status: 'ERROR', error: e.message, module: moduleName });
    }
  } else {
    if (ctx && ctx.trace) ctx.trace.stage('HANDLER_RESULT', { status: 'NO_ROOT_HANDLER', module: moduleName, note: 'Using protocol-based handlers' });
  }



  // Permission Layer: выполняем разрешённые протоколы
  aresResponse = executeProtocols(aresResponse, moduleName, originalAresResponse, ctx);
  aresResponse = aresResponse.replace(/\[\[CONTINUE\]\]/g, '').trim();

  // --- КОГНИТИВНЫЙ ПЕРЕНОС СЕССИИ (CROSS-MODULE SWITCH) ---
  // Если ИИ успешно выполнил протокол из чужого модуля, автоматически переносим туда сессию
  if (parsedTags && parsedTags.length > 0) {
    var reg = getModuleRegistry();
    var foreignModuleFound = null;

    for (var pt = 0; pt < parsedTags.length; pt++) {
      var tName = parsedTags[pt].name;
      if (tName === 'MODULE_INTENT' || tName === 'MODULE_CONFIDENCE') continue;
      
      var isLocal = false;
      if (mod.allowedProtocols && mod.allowedProtocols.some(function(p) { return p.indexOf(tName) !== -1; })) {
        isLocal = true;
      }
      
      if (!isLocal) {
        for (var k in reg) {
          var otherMod = reg[k];
          if (otherMod.allowedProtocols && otherMod.allowedProtocols.some(function(p) { return p.indexOf(tName) !== -1; })) {
            foreignModuleFound = k;
            break;
          }
        }
      }
      if (foreignModuleFound) break;
    }
    
    if (foreignModuleFound && foreignModuleFound !== sessionState.activeModule) {
      if (typeof sysLog !== 'undefined') sysLog("🔄 [COGNITIVE SWITCH] Сгенерирован чужой тег. Перенос сессии: " + sessionState.activeModule + " ➔ " + foreignModuleFound, chatId);
      
      if (ctx && ctx.trace) {
        ctx.trace.stage('COGNITIVE_SWITCH', { from: sessionState.activeModule, to: foreignModuleFound });
        if (ctx.route && ctx.route.modules) {
          ctx.route.modules[0] = foreignModuleFound; // Чтобы в Trace SUMMARY отображался финальный модуль
        }
      }
      
      try {
        if (typeof executeLifeEventBus === 'function') {
          executeLifeEventBus('SESSION_SUMMARY', { chatId: chatId, module: sessionState.activeModule, ctx: ctx });
          executeLifeEventBus('SESSION_FLUSH', { chatId: chatId, ctx: ctx });
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка при Cognitive Flush: " + e.message, chatId);
      }

      if (typeof startSession === 'function') {
        startSession(sessionState, foreignModuleFound);
      }
    }
  }

  // Сохраняем историю
  if (!aresResponse.includes('Ошибка моста')) {
    payload.history.push({ role: 'user',      content: payload.text   });
    payload.history.push({ role: 'assistant', content: originalAresResponse });
    saveModuleHistory(chatId, mod.historyKey, payload.history);
  }

  if (typeof sysLog !== 'undefined' && aresResponse && typeof aresResponse === 'string' && aresResponse.trim() !== '') {
    sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + aresResponse, chatId);
  }

  if (outKeyboard) {
    return { text: aresResponse, keyboard: outKeyboard };
  }
  return aresResponse;
}

// ==============================================================================
// 🔗 CHAIN EXECUTION — несколько модулей в одном сообщении
// ==============================================================================
function executeChainedModules(routeInfo, input, sessionState, chatId, ctx) {
  var modules = routeInfo.modules;
  sysLog('[CHAIN_EXECUTION_MERGED] ' + modules.join(' + '), chatId);

  // Стартуем сессию по первому модулю (главному)
  startSession(sessionState, modules[0]);

  var registry = getModuleRegistry();
  
  // Для цепочек используем общую историю, чтобы контекст не фрагментировался
  var historyPayload = getModuleHistory(chatId, 'history_general', ctx);

  var media = input.hasPhoto ? input.photoBase64 : null;
  var mime  = input.hasPhoto ? 'image/jpeg'      : null;

  // 3. ЕДИНЫЙ ВЫЗОВ ИИ со всеми правилами и контекстами (Two-Pass Logic)
  var aresResponse = "";
  var originalAresResponse = "";
  var passes = 0;
  
  while (passes < 2) {
    passes++;
    
    // Сборка System Prompt (генерируем ЗАНОВО на каждом проходе, чтобы contextFn мог увидеть SYSTEM_DATA в historyPayload)
    var mergedSystemPrompt = getPersonalityPrompt();
    var mergedContext = '';
    
    var cachedIntentsRaw = CacheService.getScriptCache().get('ARES_INTENTS_REGISTRY_V4');
    var cachedIntents = cachedIntentsRaw ? JSON.parse(cachedIntentsRaw) : {};
    var props = PropertiesService.getScriptProperties();

    mergedSystemPrompt += "\n\n[РЕЖИМ МУЛЬТИ-ЗАДАЧНОСТИ]\n" +
      "Пользователь запросил выполнение сразу нескольких действий. Твоя задача — проанализировать запрос и " +
      "выдать ВСЕ необходимые теги (протоколы) в одном ответе (каждый с новой строки), чтобы запустить цепочку действий.\n\n" +
      "РАЗРЕШЁННЫЕ ПРОТОКОЛЫ ДЛЯ ТЕКУЩЕГО ЗАПРОСА:\n";
    
    for (var i = 0; i < modules.length; i++) {
      var modName = modules[i];
      var mod = registry[modName];
      if (!mod) continue;

      mergedSystemPrompt += "\n[" + modName.toUpperCase() + " MODULE]\n";

      try {
        var overrideJson = props.getProperty('MODULE_CFG_' + modName);
        var override = overrideJson ? JSON.parse(overrideJson) : null;
        
        if (override && override.customPrompt && !mod.ignoreCustomPrompt) {
          mergedSystemPrompt += override.customPrompt + "\n";
        } else if (mod.promptIntentFn && typeof globalThis[mod.promptIntentFn] === 'function') {
          mergedSystemPrompt += globalThis[mod.promptIntentFn]() + "\n";
        } else if (mod.promptFn && typeof globalThis[mod.promptFn] === 'function') {
          mergedSystemPrompt += globalThis[mod.promptFn]() + "\n";
        }
        
        var moduleIntents = cachedIntents[modName] || [];
        var customProtocols = (override && override.customProtocols) ? override.customProtocols : {};
        
        if (mod.protocols && mod.protocols.length > 0) {
          mod.protocols.forEach(function(p) {
            var intentData = moduleIntents.find(function(int) { return int.function === p.tag; });
            var finalDesc = p.desc;
            
            if (customProtocols[p.tag]) {
              finalDesc = customProtocols[p.tag];
            }
            
            var line = "— " + p.tag + ": " + finalDesc;
            
            if (intentData && intentData.instruction) {
              line += ". ИНСТРУКЦИЯ: " + intentData.instruction;
            }
            if (intentData && intentData.json_format) {
              line += ". ФОРМАТ: " + intentData.json_format;
            }
            
            mergedSystemPrompt += line + "\n";
          });
        }

        if (mod.promptProtocolsFn && typeof globalThis[mod.promptProtocolsFn] === 'function') {
           mergedSystemPrompt += globalThis[mod.promptProtocolsFn]() + "\n";
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('[CHAIN_PROMPT_ERROR] ' + modName + ': ' + e.message, chatId);
      }

      try {
        if (mod.contextFn && typeof globalThis[mod.contextFn] === 'function') {
          // В historyPayload может быть уже SYSTEM_DATA на 2-м проходе
          var ctx = globalThis[mod.contextFn](input.text, historyPayload, chatId) || '';
          if (ctx) mergedContext += '\n' + ctx;
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('[CHAIN_CTX_ERROR] ' + modName + ': ' + e.message, chatId);
      }
    }
    
    // ИНЪЕКЦИЯ FORCED INTENT В ЦЕПОЧКЕ
    if (sessionState && sessionState.forcedIntent) {
      mergedSystemPrompt += "\n\n[FORCED INTENT / СТРОГОЕ УКАЗАНИЕ ОТ РОУТЕРА]\n" +
                      "Система маршрутизации точно определила намерение пользователя:\n" +
                      "Требуемая функция: " + sessionState.forcedIntent.function + "\n";
      if (sessionState.forcedIntent.instruction) {
        mergedSystemPrompt += "Специальная инструкция: " + sessionState.forcedIntent.instruction + "\n";
      }
      if (sessionState.forcedIntent.json_format) {
        mergedSystemPrompt += "Ожидаемый JSON формат: " + sessionState.forcedIntent.json_format + "\n";
      }
      mergedSystemPrompt += "СЛЕДУЙ ЭТОЙ ИНСТРУКЦИИ ПРЯМО СЕЙЧАС И ВЫВЕДИ СООТВЕТСТВУЮЩИЙ ТЕГ/ПРОТОКОЛ.\n";
    }

    var finalPrompt = input.text;
    if (mergedContext) {
      finalPrompt = finalPrompt + '\n\n' + mergedContext;
    }

    if (ctx && ctx.trace) {
       var histLength = historyPayload ? JSON.stringify(historyPayload).length : 0;
       var totalSize = mergedSystemPrompt.length + finalPrompt.length + histLength;
       ctx.trace.stage('PROMPT_BUILDER', {
         module: modules.join('+'),
         identitySize: getPersonalityPrompt().length,
         intentAndRulesSize: mergedSystemPrompt.length - getPersonalityPrompt().length,
         runtimeContextSize: mergedContext.length,
         historyItems: historyPayload ? historyPayload.length : 0,
         promptTotal: totalSize,
         approxTokens: Math.floor(totalSize / 4)
       });
    }

    aresResponse = askAres(historyPayload, finalPrompt, mergedSystemPrompt, media, mime, ctx);
    if (typeof aresResponse !== 'string') break;
    
    originalAresResponse = aresResponse;
    
    if (aresResponse.indexOf('[[CONTINUE]]') !== -1) {
      if (typeof sysLog !== 'undefined') sysLog('🔄 [TWO-PASS] Запрос данных в цепочке: ' + modules.join('+'), chatId);
      var interimResult = executeProtocols(aresResponse, modules, aresResponse, ctx);
      interimResult = interimResult.replace(/\[\[CONTINUE\]\]/g, '').trim();
      
      historyPayload.push({ role: 'assistant', content: originalAresResponse });
      historyPayload.push({ role: 'user', content: "SYSTEM_DATA:\n" + interimResult + "\n\nТеперь прими окончательное решение и выполни действие." });
      
      continue;
    }
    break;
  }

  if (typeof aresResponse !== 'string') return aresResponse;

  var outKeyboard = null;
  // 4. Прогоняем постобработчики (handlers) всех модулей последовательно
  for (var i = 0; i < modules.length; i++) {
    var modName = modules[i];
    var mod = registry[modName];
    if (mod && mod.handler && typeof globalThis[mod.handler] === 'function') {
      try {
        var payloadForHandler = {
          moduleName: modName,
          text: input.text,
          memory: '',
          history: historyPayload,
          session: sessionState,
          chatId: chatId
        };
        var handlerResult = globalThis[mod.handler](aresResponse, payloadForHandler, input, _parseGlobalProtocols(aresResponse), ctx);
        if (typeof handlerResult === 'string') {
          aresResponse = handlerResult;
        } else if (typeof handlerResult === 'object' && handlerResult.text) {
          aresResponse = handlerResult.text;
          outKeyboard = handlerResult.keyboard || outKeyboard;
        }
      } catch (e) {
        if (typeof sysLog !== 'undefined') sysLog('[CHAIN_HANDLER_ERROR] ' + modName + ': ' + e.message, chatId);
        aresResponse = "⚠️ <b>ОШИБКА ОБРАБОТЧИКА В ЦЕПОЧКЕ:</b>\n" + e.message + "\n\n" + aresResponse.replace(/\[\[.*?\]\]/g, '').trim();
      }
    }
    

  }

  // 5. Разбор всех протоколов (передаем массив модулей)
  aresResponse = executeProtocols(aresResponse, modules, originalAresResponse, ctx);
  aresResponse = aresResponse.replace(/\[\[CONTINUE\]\]/g, '').trim();

  // 6. Сохранение истории
  if (!aresResponse.includes('Ошибка моста')) {
    historyPayload.push({ role: 'user',      content: input.text });
    historyPayload.push({ role: 'assistant', content: originalAresResponse });
    saveModuleHistory(chatId, 'history_general', historyPayload);
  }

  if (typeof sysLog !== 'undefined' && aresResponse && typeof aresResponse === 'string' && aresResponse.trim() !== '') {
    sysLog("📤 [FINAL_RESPONSE] Ответ пользователю:\n" + aresResponse, chatId);
  }

  if (outKeyboard) {
    return { text: aresResponse, keyboard: outKeyboard };
  }
  return aresResponse;
}

// ==============================================================================
// 📞 CALLBACK QUERY (нажатия кнопок в Telegram)
// ==============================================================================
function handleCallbackQuery(cb) {
  if (cb.message.chat.id !== MY_ID) return;
  var chatId = MY_ID;

  try {
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + TG_TOKEN +
      '/answerCallbackQuery?callback_query_id=' + cb.id
    );
  } catch (err) { }

  sendAction(chatId, 'typing');

  var aresResponse = cb.data;
  var protoMap     = getProtocolMap();

  // Callback имеет прямой доступ к протоколам (специальный режим)
  for (var tag in protoMap) {
    if (typeof aresResponse === 'string' && aresResponse.includes(tag)) {
      var result = protoMap[tag](aresResponse);
      aresResponse = (typeof result === 'string') ? result : aresResponse;
    }
  }

  var history = getModuleHistory(chatId, 'history_general', ctx);
  history.push({ role: 'user',      content: '[Кнопка]'   });
  history.push({ role: 'assistant', content: aresResponse });
  saveModuleHistory(chatId, 'history_general', history);

  sendText(chatId, aresResponse);
}

// ==============================================================================
// 🔧 СИСТЕМНЫЕ КОМАНДЫ
// ==============================================================================

/**
 * FIX_EVERYTHING — полный сброс и переинициализация системы.
 * Запускать вручную из редактора GAS при проблемах.
 */
function FIX_EVERYTHING() {
  // Переустановка webhook
  setWebhook(WEB_APP_URL);

  // Очистка истории
  clearAllHistory(MY_ID);

  // Статус модулей
  var registry = getModuleRegistry();
  var moduleList = Object.keys(registry).map(function(k) {
    return '— ' + k + (registry[k].enabled ? ' ✅' : ' ❌');
  }).join('\n');

  sendText(MY_ID,
    '✅ <b>ARES KERNEL v10.0 ПЕРЕЗАГРУЖЕН</b>\n\n' +
    '<b>Зарегистрированные модули:</b>\n' + moduleList + '\n\n' +
    'BASE CHAT — свободный диалог\n' +
    'MODULE MODE — изолированные модули\n' +
    'PLUGIN ARCH — self-registering modules'
  );
}

/**
 * Управление модулями через Telegram (для будущей интеграции с UI).
 * Пример: toggleModule('finance', false) → отключает модуль.
 */
function toggleModule(moduleName, enabled) {
  if (enabled) {
    return enableModule(moduleName);
  } else {
    return disableModule(moduleName);
  }
}

// ==============================================================================
// ⚡ ШИНА СОБЫТИЙ И ПРАВИЛ (EVENT BUS & RULES ENGINE)
// ==============================================================================

function emitEvent(eventName, payload) {
  if (typeof sysLog !== 'undefined') sysLog("⚡ [EVENT BUS] Emit: " + eventName + " | Payload: " + JSON.stringify(payload), MY_ID);
  
  // Авто-создание и запись в Event Log
  var targetSheetId = (typeof ADS_DATA_SHEET_ID !== 'undefined') ? ADS_DATA_SHEET_ID : null;
  if (targetSheetId) {
    try {
      var ss = SpreadsheetApp.openById(targetSheetId);
      var sheet = ss.getSheetByName('Ares_EventLog');
      if (!sheet) {
        sheet = ss.insertSheet('Ares_EventLog');
        sheet.appendRow(['Дата', 'Событие', 'Данные']);
        sheet.getRange("A1:C1").setFontWeight("bold");
      }
      var dateStr = Utilities.formatDate(new Date(), (typeof TIME_ZONE !== 'undefined' ? TIME_ZONE : "Europe/Kiev"), "dd.MM.yyyy HH:mm:ss");
      sheet.appendRow([dateStr, eventName, JSON.stringify(payload)]);
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog("❌ [EVENT BUS] Ошибка записи лога: " + e.toString(), MY_ID);
    }
  }
  
  processRules(eventName, payload);
}

function processRules(eventName, payload) {
  // Пока правила пустые, чтобы события просто логировались.
  // Позже мы вынесем управление правилами в UI (Ares_Modules)
  var rules = [];

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (rule.event === eventName) {
      var passed = false;
      try { passed = rule.condition(payload); } catch(e) {}
      
      if (passed) {
        if (typeof sysLog !== 'undefined') sysLog("🔥 [RULES ENGINE] Сработало правило для " + eventName + " -> Экшен: " + rule.actionText, MY_ID);
        
        var simulatedInput = {
          text: rule.actionText,
          lowerText: rule.actionText.toLowerCase()
        };
        
        try {
          // Вызываем Ядро рекурсивно для симуляции команды
          var options = rule.forceModule ? { forceModule: rule.forceModule } : null;
          processUserMessage(simulatedInput, MY_ID, options);
        } catch (e) {
          if (typeof sysLog !== 'undefined') sysLog("❌ [RULES ENGINE] Ошибка: " + e.toString(), MY_ID);
        }
      }
    }
  }
}

// ==============================================================================
// ?? ���������� ������ ���������� (JSON)
// ==============================================================================
function _parseGlobalProtocols(text) {
  var regex = /\[\[([A-Z0-9_]+)(?:(:\s*)(\{[\s\S]*?\}|\[[\s\S]*?\]|[^\]]+))?\]\]/gi;
  var match;
  var tags = [];
  while ((match = regex.exec(text)) !== null) {
    var tagStr = match[0];
    var name = match[1];
    var jsonStr = match[3];
    var payload = null;
    if (jsonStr) {
      jsonStr = jsonStr.trim();
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        try { payload = JSON.parse(jsonStr); } catch(e) {}
      } else {
        payload = jsonStr;
      }
    }
    tags.push({ name: name, payload: payload || {}, fullTag: tagStr, jsonStr: jsonStr });
  }
  return tags;
}

// ==============================================================================
// 🧹 УДАЛЕНИЕ УТЕЧЕК ТЕГОВ (ЕСЛИ ИИ СГЕНЕРИРОВАЛ ТЕГ, НО ОН НЕ ОБРАБОТАН)
// ==============================================================================
function _cleanLeakedTags(text) {
  if (typeof text !== 'string') return text;
  var cleaned = text.replace(/\[\[[\s\S]*?\]\]/g, '').trim();
  if (cleaned === '') {
     return "⚠️ <i>(Для ответа мне не хватает некоторых деталей. Уточните, пожалуйста, что именно сделать?)</i>";
  } else {
     return cleaned;
  }
}
