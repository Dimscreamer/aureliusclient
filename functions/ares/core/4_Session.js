/**
 * ==============================================================================
 * 🗂️ 4_Session.js — SESSION & HISTORY MANAGER
 *
 * Управление сессиями модулей и историей диалогов.
 * Сессия — это "контекст активного модуля" для конкретного пользователя.
 *
 * Web-версия: CacheService заменяется на Redis/Upstash или аналог.
 *             Интерфейс функций остаётся тем же.
 * ==============================================================================
 */

// ==============================================================================
// 🔑 SESSION MANAGER
// Сессия хранит: какой модуль активен, когда стартовал, когда последняя активность.
// ==============================================================================

/**
 * Получить текущее состояние сессии пользователя.
 * @param {number|string} userId
 * @returns {Object} — { activeModule, moduleStartedAt, lastActivity }
 */
function getSessionState(userId, ctx) {
  var raw = CacheService.getUserCache().get('session_' + userId);
  if (raw) {
    if (ctx && ctx.trace) {
      if (!ctx.cacheStats) ctx.cacheStats = { hit: 0, miss: 0 };
      ctx.cacheStats.hit++;
    }
    try { return JSON.parse(raw); } catch(e) { /* corrupted cache */ }
  } else {
    if (ctx && ctx.trace) {
      if (!ctx.cacheStats) ctx.cacheStats = { hit: 0, miss: 0 };
      ctx.cacheStats.miss++;
    }
  }
  return { activeModule: null, moduleStartedAt: null, lastActivity: null };
}

/**
 * Сохранить состояние сессии.
 * @param {number|string} userId
 * @param {Object}        state
 */
function saveSessionState(userId, state) {
  CacheService.getUserCache().put(
    'session_' + userId,
    JSON.stringify(state),
    3600  // 1 час хранения
  );
}

/**
 * Открыть сессию для модуля.
 * @param {Object} state      — объект сессии (мутируется)
 * @param {string} moduleName — имя модуля
 */
function startSession(state, moduleName) {
  state.activeModule    = moduleName;
  state.moduleStartedAt = Date.now();
  state.lastActivity    = Date.now();
  state.isSleeping      = false;
  if (typeof sysLog !== 'undefined') sysLog('[SESSION_START] ' + moduleName);
  else Logger.log('[SESSION_START] ' + moduleName);
}

/**
 * Сбросить сессию (возврат в BASE CHAT).
 * @param {Object} state — объект сессии (мутируется)
 */
function resetSession(state) {
  state.activeModule    = null;
  state.moduleStartedAt = null;
  state.lastActivity    = null;
  state.isSleeping      = false;
  Logger.log('[SESSION_END] Session reset');
}

// ==============================================================================
// 📚 HISTORY MANAGER
// История диалога разделена по модулям и не смешивается.
// Ключ в кэше: historyKey + "_" + userId
// ==============================================================================

/**
 * Получить историю диалога для конкретного модуля/ключа.
 * @param {number|string} userId
 * @param {string}        historyKey — из MODULE_REGISTRY (например "history_tasks")
 * @returns {Array} — массив { role, content }
 */
function getModuleHistory(userId, historyKey, ctx) {
  var raw = CacheService.getUserCache().get(historyKey + '_' + userId);
  if (raw) {
    if (ctx && ctx.trace) {
      if (!ctx.cacheStats) ctx.cacheStats = { hit: 0, miss: 0 };
      ctx.cacheStats.hit++;
    }
    try { return JSON.parse(raw); } catch(e) { /* */ }
  } else {
    if (ctx && ctx.trace) {
      if (!ctx.cacheStats) ctx.cacheStats = { hit: 0, miss: 0 };
      ctx.cacheStats.miss++;
    }
  }
  return [];
}

/**
 * Сохранить историю диалога.
 * Хранит только последние 10 сообщений.
 * @param {number|string} userId
 * @param {string}        historyKey
 * @param {Array}         history
 */
function saveModuleHistory(userId, historyKey, history) {
  CacheService.getUserCache().put(
    historyKey + '_' + userId,
    JSON.stringify(history.slice(-10)),
    21600  // 6 часов хранения
  );
}

/**
 * Очистить всю историю пользователя (все модули).
 * @param {number|string} userId
 */
function clearAllHistory(userId) {
  var cache = CacheService.getUserCache();
  var keys = [
    'history_general',
    'history_tasks',
    'history_diary',
    'history_metanoia',
    'history_flex'
  ];

  // Динамически добавляем ключи из реестра
  try {
    var registry = getModuleRegistry();
    Object.keys(registry).forEach(function(name) {
      var key = registry[name].historyKey;
      if (key && keys.indexOf(key) === -1) keys.push(key);
    });
  } catch(e) { /* registry may not be ready */ }

  keys.forEach(function(key) { cache.remove(key + '_' + userId); });
  cache.remove('session_' + userId);
  Logger.log('[SESSION] Cleared all history for user: ' + userId);
}

// ==============================================================================
// 🔄 СОВМЕСТИМОСТЬ со старым Core_Engine.js
// ==============================================================================
function saveHistory(id, h) { saveModuleHistory(id, 'history_general', h); }
function getHistory(id)     { return getModuleHistory(id, 'history_general'); }
