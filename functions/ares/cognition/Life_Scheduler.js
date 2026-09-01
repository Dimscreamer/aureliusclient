/**
 * ==============================================================================
 * ⏱️ Life_Scheduler.js — Триггеры и расписания
 * ==============================================================================
 *
 * Управляет временем Ареса. Вызывает AresRuntime для когнитивных циклов.
 */

/**
 * ==============================================================================
 * ⏱️ Life_Scheduler.js — Триггеры и расписания
 * ==============================================================================
 */

/**
 * Ежедневная консолидация памяти (Триггер: каждый день ночью)
 */
function ARES_HIPPOCAMPUS_DAILY() {
  if (typeof sysLog !== 'undefined') sysLog('📅 [SCHEDULER] Запуск Hippocampus Daily Summary...');
  if (typeof LifeHippocampus !== 'undefined' && typeof LifeHippocampus.runDailySummary === 'function') {
    LifeHippocampus.runDailySummary();
  } else {
    if (typeof sysLog !== 'undefined') sysLog('❌ [SCHEDULER] LifeHippocampus не найден!');
  }
}
/**
 * Главный когнитивный цикл (Триггер: раз в 2-4 часа)
 * Инициирует размышления, генерацию инсайтов и проактивные сообщения.
 */
function ARES_COGNITION_CYCLE() {
  // Проверяем текущее время (в часовом поясе Киева/Москвы, чтобы избежать сдвигов сервера)
  var hourStr = Utilities.formatDate(new Date(), "Europe/Kiev", "HH");
  var currentHour = parseInt(hourStr, 10);
  
  if (currentHour < 11 || currentHour >= 23) {
    if (typeof sysLog !== 'undefined') sysLog('💤 [SCHEDULER] Когнитивный цикл пропущен (Режим сна: ' + currentHour + ':00).');
    return;
  }

  if (typeof sysLog !== 'undefined') sysLog('======================================');
  if (typeof sysLog !== 'undefined') sysLog('⏰ [SCHEDULER] Старт когнитивного цикла (Ares OS)');
  
  if (typeof AresRuntime === 'undefined') {
    if (typeof sysLog !== 'undefined') sysLog('❌ [SCHEDULER] AresRuntime не найден!');
    return;
  }

  // Запускаем пайплайн познания
  var ctx = AresRuntime.execute("cognition", null);

  if (typeof sysLog !== 'undefined') sysLog('🏁 [SCHEDULER] Когнитивный цикл завершен. Итоговое состояние: ' + ctx.runtime.state);
  if (typeof sysLog !== 'undefined') sysLog('======================================');
}
