/**
 * ==============================================================================
 * 🧠 Life_EventLog.js — Долговременная память событий (Event Sourcing)
 * ==============================================================================
 *
 * Сохраняет "сырые" события в таблицу Life_Events.
 * Подписывается на ВСЕ события LifeBus (*).
 * Отдельно обрабатывает SESSION_END — создает Session Summary.
 */

var _LIFE_EVENTS_SHEET_NAME = "Ares_Life_Events";

function setupLifeEventLog() {
  if (typeof LifeBus !== 'undefined') {
    // ==========================================================
    // Основной подписчик: пишет все события в таблицу
    // ==========================================================
    LifeBus.on('*', 'EventLog', function(eventName, payload, ctx) {
      // Игнорируем слишком частые или служебные события
      if (eventName === 'BEFORE_RESPONSE') return;

      try {
        var ss = null;
        if (typeof MASTER_DB_ID !== 'undefined') {
          ss = SpreadsheetApp.openById(MASTER_DB_ID);
        } else if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
          ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
        }
        
        if (!ss) return;
        var sheet = ss.getSheetByName(_LIFE_EVENTS_SHEET_NAME);
        if (!sheet) {
          if (typeof sysLog !== 'undefined') sysLog('⚠️ [LIFE_EVENTLOG] Лист ' + _LIFE_EVENTS_SHEET_NAME + ' не найден.');
          return;
        }

        var timestamp = new Date();
        var traceId = (ctx && ctx.trace) ? ctx.trace.id : "NO_TRACE";
        var payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);

        sheet.appendRow([
          timestamp,
          traceId,
          eventName,
          payloadStr
        ]);
        if (typeof sysLog !== 'undefined') {
           sysLog(`📝 [SHEET_WRITE]: Вкладка '${_LIFE_EVENTS_SHEET_NAME}'. Добавлена новая строка (Событие: ${eventName})`);
        }
        if (ctx && ctx.trace) {
           ctx.trace.stage('SHEET_WRITE', { sheet: _LIFE_EVENTS_SHEET_NAME, event: eventName });
        }
      } catch(e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [LIFE_EVENTLOG_ERROR] ' + e.message);
        if (ctx && ctx.trace) ctx.trace.stage('SHEET_ERROR', { error: e.message, sheet: _LIFE_EVENTS_SHEET_NAME });
      }
    });

    // ==========================================================
    // SESSION_END: Создаём Session Summary и пишем в Life Events
    // Это источник для ночного Hippocampus (не WorkingMemory напрямую)
    // ==========================================================
    LifeBus.on('SESSION_FLUSH', 'SessionSummaryFlush', function(payload, ctx) {
      try {
        var moduleName = (payload && payload.module) ? payload.module : 'UNKNOWN';
        var reason = (payload && payload.reason) ? payload.reason : 'UNKNOWN';
        var elapsedInfo = '';
        if (payload && payload.elapsedSec) elapsedInfo = ' (' + payload.elapsedSec + 'с неактивности)';
        if (payload && payload.elapsedMin) elapsedInfo = ' (' + payload.elapsedMin + ' мин)';

        if (typeof sysLog !== 'undefined') sysLog('📋 [SESSION_SUMMARY] Закрытие сессии: ' + moduleName + ', причина: ' + reason + elapsedInfo);
        if (ctx && ctx.trace) {
          ctx.trace.stage('SESSION_SUMMARY', {
            module: moduleName,
            reason: reason,
            note: 'Сохранено в Life_Events для Hippocampus'
          });
        }

        // Записываем SESSION_SUMMARY в таблицу
        var ss = null;
        if (typeof MASTER_DB_ID !== 'undefined') {
          ss = SpreadsheetApp.openById(MASTER_DB_ID);
        } else if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
          ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
        }
        if (!ss) return;

        var sheet = ss.getSheetByName(_LIFE_EVENTS_SHEET_NAME);
        if (!sheet) return;

        var summaryText = 'SESSION_SUMMARY [' + moduleName.toUpperCase() + ']: Сессия завершена. Причина: ' + reason + elapsedInfo;
        var traceId = (ctx && ctx.trace) ? ctx.trace.id : 'NO_TRACE';

        sheet.appendRow([new Date(), traceId, 'SESSION_SUMMARY', summaryText]);

        if (typeof sysLog !== 'undefined') {
          sysLog('📝 [SHEET_WRITE]: SESSION_SUMMARY для ' + moduleName + ' записан в ' + _LIFE_EVENTS_SHEET_NAME);
        }
        if (ctx && ctx.trace) {
          ctx.trace.stage('SHEET_WRITE', { sheet: _LIFE_EVENTS_SHEET_NAME, event: 'SESSION_SUMMARY', module: moduleName });
        }
      } catch(e) {
        if (typeof sysLog !== 'undefined') sysLog('❌ [SESSION_SUMMARY_ERROR] ' + e.message);
      }
    });
  }
}

// Инициализация при загрузке
setupLifeEventLog();
