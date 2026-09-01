/**
 * ==============================================================================
 * 🧠 Life_Bus.js — Единая шина событий (Sensory System)
 * ==============================================================================
 *
 * Все модули и слои системы общаются через эту шину. 
 * Это позволяет отвязать ядро от подсистемы Life Engine.
 */

var _LIFE_BUS_SUBSCRIBERS = {};

var LifeBus = {
  /**
   * Подписаться на событие
   * @param {string} eventName - Имя события (например, 'ROUTER_MATCHED', 'EXPENSE_ADDED')
   * @param {string|function} arg1 - Имя подписчика (optional) или callback
   * @param {function} [arg2] - Функция-обработчик, если arg1 это имя
   */
  on: function(eventName, arg1, arg2) {
    var listenerName = typeof arg1 === 'string' ? arg1 : 'Anonymous';
    var callback = typeof arg1 === 'function' ? arg1 : arg2;
    
    if (!_LIFE_BUS_SUBSCRIBERS[eventName]) {
      _LIFE_BUS_SUBSCRIBERS[eventName] = [];
    }
    _LIFE_BUS_SUBSCRIBERS[eventName].push({ name: listenerName, fn: callback });
  },

  /**
   * Инициировать событие
   * @param {string} eventName - Имя события (type)
   * @param {Object} payload - Данные события. Ожидается: { module, entity, metadata }
   * @param {Object} ctx - Глобальный контекст выполнения
   */
  emit: function(eventName, payload, ctx) {
    var eventId = 'ev_' + Math.floor(1000 + Math.random() * 9000);
    var parentId = (payload && payload.parentId) ? payload.parentId : (ctx && ctx.currentEventId ? ctx.currentEventId : null);
    
    // 1. Формируем универсальный Event Payload
    var eventPayload = {
      id: eventId,
      parentId: parentId,
      type: eventName,
      module: (payload && payload.module) ? payload.module : 'system',
      timestamp: new Date().toISOString(),
      entity: (payload && payload.entity) ? payload.entity : null,
      metadata: (payload && payload.metadata) ? payload.metadata : (payload || {})
    };

    if (ctx) {
      ctx.currentEventId = eventId;
    }

    var listenersCount = (_LIFE_BUS_SUBSCRIBERS[eventName] ? _LIFE_BUS_SUBSCRIBERS[eventName].length : 0) + 
                         (_LIFE_BUS_SUBSCRIBERS['*'] ? _LIFE_BUS_SUBSCRIBERS['*'].length : 0);

    if (typeof sysLog !== 'undefined') {
      sysLog('📡 [LIFE_BUS] Emit: ' + eventName + ' | Listeners: ' + listenersCount + ' | ' + JSON.stringify(eventPayload).substring(0, 150));
    }
    
    // Записываем событие в trace
    if (ctx && ctx.trace) {
      ctx.trace.stage('LIFE_EVENT', {
        id: eventId,
        parentId: parentId,
        type: eventName,
        module: eventPayload.module,
        listeners: listenersCount,
        metadata: eventPayload.metadata
      });
    }

    var executedListeners = [];

    if (_LIFE_BUS_SUBSCRIBERS[eventName]) {
      for (var i = 0; i < _LIFE_BUS_SUBSCRIBERS[eventName].length; i++) {
        var sub = _LIFE_BUS_SUBSCRIBERS[eventName][i];
        try {
          sub.fn(eventPayload, ctx);
          executedListeners.push(sub.name + ' OK');
        } catch(e) {
          if (typeof sysLog !== 'undefined') sysLog('❌ [LIFE_BUS_ERROR] Listener ' + sub.name + ' failed on ' + eventName + ': ' + e.message);
          executedListeners.push(sub.name + ' ERROR');
        }
      }
    }
    
    // Wildcard подписка для логгера событий
    if (_LIFE_BUS_SUBSCRIBERS['*']) {
       for (var j = 0; j < _LIFE_BUS_SUBSCRIBERS['*'].length; j++) {
        var wsub = _LIFE_BUS_SUBSCRIBERS['*'][j];
        try {
          wsub.fn(eventName, eventPayload, ctx);
          executedListeners.push(wsub.name + ' OK');
        } catch(e) {
          if (typeof sysLog !== 'undefined') sysLog('❌ [LIFE_BUS_ERROR] Wildcard listener ' + wsub.name + ' failed: ' + e.message);
          executedListeners.push(wsub.name + ' ERROR');
        }
      }
    }

    if (ctx && ctx.trace && executedListeners.length > 0) {
      ctx.trace.stage('EVENT_BUS_LISTENERS', { type: eventName, results: executedListeners });
    }
  }
};
