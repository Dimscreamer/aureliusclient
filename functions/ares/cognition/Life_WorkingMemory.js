/**
 * ==============================================================================
 * 🧠 Life_WorkingMemory.js — Рабочая память (Current Snapshot)
 * ==============================================================================
 *
 * Хранит инкрементальное состояние "здесь и сейчас".
 * Избавляет от необходимости читать базу данных при каждом чихе.
 */

var _WORKING_MEMORY_KEY = "Ares_Life_WorkingMemory";

var WorkingMemory = {
  /**
   * Получить текущий слепок состояния
   */
  getSnapshot: function() {
    var props = PropertiesService.getUserProperties();
    var raw = props.getProperty(_WORKING_MEMORY_KEY);
    if (!raw) {
      return this.initSnapshot();
    }
    try {
      return JSON.parse(raw);
    } catch(e) {
      return this.initSnapshot();
    }
  },

  /**
   * Инициализация пустой памяти
   */
  initSnapshot: function() {
    var initial = {
      lastUpdated: new Date().toISOString(),
      health: { sleep: null, mood: null },
      tasks: { active: 0, overdue: 0 },
      finance: { todaySpent: 0, alert: false },
      activity: { lastMessageTime: null },
      system: { warnings: [] }
    };
    this.saveSnapshot(initial);
    return initial;
  },

  /**
   * Сохранить слепок
   */
  saveSnapshot: function(snapshot) {
    snapshot.lastUpdated = new Date().toISOString();
    PropertiesService.getUserProperties().setProperty(_WORKING_MEMORY_KEY, JSON.stringify(snapshot));
  }
};

function setupLifeWorkingMemory() {
  if (typeof LifeBus === 'undefined') return;

  LifeBus.on('*', 'WorkingMemory', function(eventName, payload, ctx) {
    if (eventName === 'BEFORE_RESPONSE') return;

    var snapshot = WorkingMemory.getSnapshot();
    var modified = false;

    try {
      // Инкрементальное обновление памяти на основе событий
      switch (eventName) {
        case 'USER_REQUEST':
          snapshot.activity.lastMessageTime = new Date().toISOString();
          modified = true;
          break;
        case 'TASK_ADDED':
          snapshot.tasks.active = (snapshot.tasks.active || 0) + 1;
          modified = true;
          break;
        case 'TASK_COMPLETED':
          snapshot.tasks.active = Math.max(0, (snapshot.tasks.active || 0) - 1);
          modified = true;
          break;
        case 'EXPENSE_ADDED':
          if (payload && payload.metadata && payload.metadata.amount) {
             snapshot.finance.todaySpent = (snapshot.finance.todaySpent || 0) + Number(payload.metadata.amount);
             modified = true;
          }
          break;
        case 'SLEEP_LOGGED':
          if (payload && payload.metadata && payload.metadata.hours) {
            snapshot.health.sleep = payload.metadata.hours;
            modified = true;
          }
          break;
        case 'DIARY_ENTRY':
          snapshot.health.mood = (payload && payload.metadata && payload.metadata.mood) || snapshot.health.mood;
          modified = true;
          break;
      }

      if (modified) {
        WorkingMemory.saveSnapshot(snapshot);
      }
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [WORKING_MEMORY_ERROR] ' + e.message);
    }
  });
  LifeBus.on('SESSION_FLUSH', 'WorkingMemory_SessionFlush', function(payload, ctx) {
    try {
      var snapshot = WorkingMemory.getSnapshot();
      var moduleName = payload.module || 'UNKNOWN';
      // Скелет: обновляем метаданные о последней активности или обнуляем локальные стейты, если требуется.
      // snapshot.system.lastFlushedModule = moduleName;
      // WorkingMemory.saveSnapshot(snapshot);
      if (typeof sysLog !== 'undefined') sysLog('🧠 [WORKING_MEMORY] Зафиксировано завершение сессии: ' + moduleName);
    } catch(e) {
      if (typeof sysLog !== 'undefined') sysLog('❌ [WORKING_MEMORY_FLUSH_ERROR] ' + e.message);
    }
  });
}
setupLifeWorkingMemory();
