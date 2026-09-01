/**
 * ==============================================================================
 * 🧩 1_Registry.js — ДИНАМИЧЕСКИЙ РЕЕСТР МОДУЛЕЙ
 *
 * Это сердце plug-in архитектуры Ареса.
 * Модули НЕ прописываются здесь вручную — они сами регистрируются через
 * registerModule() в конце своего файла (Module_Xxx.js).
 *
 * Для добавления нового модуля: создать Module_Xxx.js + вызвать registerModule().
 * Для удаления модуля: удалить файл. Система ничего не сломает.
 * Для отключения модуля: enabled: false (без удаления файла).
 *
 * Web-версия: состояние enabled будет сохраняться в PropertiesService
 *             или внешней БД, управляться через UI.
 * ==============================================================================
 */

// ==============================================================================
// 📦 ВНУТРЕННИЕ ХРАНИЛИЩА (не трогать напрямую — только через геттеры)
// ==============================================================================
var _MODULE_REGISTRY  = {};
var _PROTOCOL_MAP     = {};
var _ENTITY_REGISTRY  = {};

// ==============================================================================
// 🔌 ГЛАВНАЯ ФУНКЦИЯ: РЕГИСТРАЦИЯ МОДУЛЯ
// Вызывается из каждого Module_Xxx.js один раз при загрузке скрипта.
// ==============================================================================

/**
 * Регистрирует модуль в системе.
 *
 * @param {Object} config — конфигурация модуля:
 *   name             {string}   — уникальный ключ модуля (например "finance")
 *   enabled          {boolean}  — включен ли модуль (default: true)
 *   triggers         {string[]} — ключевые слова для роутера
 *   promptFn         {string}   — имя функции промпта (в том же файле)
 *   contextFn        {string}   — имя функции контекста (в том же файле)
 *   protocols        {Object[]} — массив { tag, handler } для PROTOCOL_MAP
 *   allowedProtocols {string[]} — разрешённые теги для Permission Layer
 *   sessionTimeout   {number}   — тайм-аут сессии в минутах
 *   priority         {number}   — приоритет при конкурирующих триггерах
 *   historyKey       {string}   — ключ истории в кэше
 *   morningCard      {string}   — имя функции для утреннего протокола (опционально)
 *   entities         {string[]} — Entity Registry (Entity-First Routing) (опционально)
 */
var _COMPILED_CONFIG = null;
function getCompiledConfigOnce() {
  if (!_COMPILED_CONFIG) {
    if (typeof getAresConfig === 'function') {
      _COMPILED_CONFIG = getAresConfig();
    } else {
      _COMPILED_CONFIG = { modules: {} };
    }
  }
  return _COMPILED_CONFIG;
}

function registerModule(config) {
  if (!config || !config.name) {
    Logger.log('[REGISTRY] ❌ registerModule вызван без имени модуля');
    return;
  }

  // --- Читаем кастомные настройки из закэшированного конфига (Конструктор Модулей) ---
  var compiled = getCompiledConfigOnce();
  var override = (compiled && compiled.modules && compiled.modules[config.name]) ? compiled.modules[config.name].override : null;
  
  var isEnabled = override && override.enabled !== undefined ? override.enabled : (config.enabled !== false);
  
  var rawTriggers = [];
  if (override && override.triggers && override.triggers.length > 0) {
    rawTriggers = override.triggers;
  } else {
    rawTriggers = config.triggers || [];
  }
  
  var finalTriggers = [];
  if (Array.isArray(rawTriggers)) {
    for (var i = 0; i < rawTriggers.length; i++) {
      var t = rawTriggers[i];
      if (t && typeof t === 'string' && t.trim().length > 0) {
        finalTriggers.push(t.toLowerCase().trim());
      }
    }
  }

  _MODULE_REGISTRY[config.name] = {
    triggers:         finalTriggers,
    handler:          config.handler          || null,
    promptFn:         config.promptFn         || null,
    promptIntentFn:   config.promptIntentFn   || null,
    promptProtocolsFn:config.promptProtocolsFn|| null,
    intentResolverFn: config.intentResolverFn || null,
    contextFn:        config.contextFn        || null,
    allowedProtocols: config.allowedProtocols || [],
    sessionTimeout:   config.sessionTimeout   || 10,
    priority:         config.priority         || 50,
    historyKey:       config.historyKey       || 'history_general',
    morningCard:      config.morningCard      || null,
    morningOrder:     config.morningOrder     || 99,
    allowTextFallback: config.allowTextFallback || false,
    ignoreCustomPrompt: config.ignoreCustomPrompt || false,
    enabled:          isEnabled,
    factoryEnabled:   config.enabled !== false,
    factoryTriggers:  config.triggers || [],
    protocols:        config.protocols || [],
    settings:         config.settings || [],
    intentsSchema:    config.intentsSchema || {}
  };

  // Resolve factory prompt for UI display (если разбит на части)
  var defaultPrompt = "";
  if (config.promptIntentFn && typeof globalThis[config.promptIntentFn] === 'function') {
    defaultPrompt = globalThis[config.promptIntentFn]();
  } else if (config.promptFn && typeof globalThis[config.promptFn] === 'function') {
    // Fallback: попытаемся вытащить что-то из старого монолитного
    // Но лучше просто оставить пустым в UI, так как он смешан с протоколами
  }
  _MODULE_REGISTRY[config.name].factoryPrompt = defaultPrompt;

  // --- Регистрируем протоколы модуля в PROTOCOL_MAP ---
  (config.protocols || []).forEach(function(proto) {
    if (proto.tag && proto.handler) {
      _PROTOCOL_MAP[proto.tag] = safeCall(proto.handler);
    }
  });

  // --- Регистрируем Entity Registry (Entity-First Routing) ---
  if (config.entities && config.entities.length > 0) {
    _ENTITY_REGISTRY[config.name] = config.entities;
  }

  // Logger.log('[REGISTRY] ✅ Модуль зарегистрирован: ' + config.name +
  //            ' | enabled=' + isEnabled +
  //            ' | triggers=' + (config.triggers || []).length);
}

// ==============================================================================
// 🔧 UI УПРАВЛЕНИЕ МОДУЛЯМИ (для будущего веб-интерфейса)
// ==============================================================================

/**
 * Включить модуль (сохраняется между перезапусками)
 */
function enableModule(moduleName) {
  if (!_MODULE_REGISTRY[moduleName]) {
    Logger.log('[REGISTRY] ⚠️ enableModule: модуль не найден — ' + moduleName);
    return false;
  }
  _MODULE_REGISTRY[moduleName].enabled = true;
  PropertiesService.getScriptProperties()
    .setProperty('module_enabled_' + moduleName, 'true');
  Logger.log('[REGISTRY] 🟢 Модуль включён: ' + moduleName);
  return true;
}

/**
 * Отключить модуль (сохраняется между перезапусками)
 */
function disableModule(moduleName) {
  if (!_MODULE_REGISTRY[moduleName]) {
    Logger.log('[REGISTRY] ⚠️ disableModule: модуль не найден — ' + moduleName);
    return false;
  }
  _MODULE_REGISTRY[moduleName].enabled = false;
  PropertiesService.getScriptProperties()
    .setProperty('module_enabled_' + moduleName, 'false');
  Logger.log('[REGISTRY] 🔴 Модуль отключён: ' + moduleName);
  return true;
}

/**
 * Получить статус всех модулей (для UI)
 * Возвращает массив { name, enabled, triggers, priority }
 */
function getModulesStatus() {
  return Object.keys(_MODULE_REGISTRY).map(function(key) {
    var mod = _MODULE_REGISTRY[key];
    return {
      name:     key,
      enabled:  mod.enabled,
      triggers: mod.triggers,
      priority: mod.priority
    };
  });
}

// ==============================================================================
// 📖 ГЕТТЕРЫ (используются в Router, Kernel, GoodMorning и т.д.)
// ==============================================================================

/** Возвращает весь реестр модулей */
function getModuleRegistry()  { return _MODULE_REGISTRY;  }

/** Возвращает карту протоколов */
function getProtocolMap()     { return _PROTOCOL_MAP;     }

/** Возвращает Entity Registry */
function getEntityRegistry()  { return _ENTITY_REGISTRY;  }

/** Возвращает реестр Интентов (из базы) */
function getIntentRegistry() {
  if (typeof getCachedIntents === 'function') {
    return getCachedIntents();
  }
  return {};
}

// ==============================================================================
// 🛡️ PERMISSION LAYER — executeProtocols()
// Фильтрует теги через allowedProtocols текущего модуля.
// В BASE CHAT не вызывается вообще.
// ==============================================================================
function executeProtocols(aresResponse, activeModuleNameOrArray, originalAresResponse, ctx) {
  if (!activeModuleNameOrArray) return aresResponse;

  var allowed = [];
  var allowTextFallback = false;

  if (Array.isArray(activeModuleNameOrArray)) {
    for (var i = 0; i < activeModuleNameOrArray.length; i++) {
      var mod = _MODULE_REGISTRY[activeModuleNameOrArray[i]];
      if (mod && mod.allowedProtocols) {
        allowed = allowed.concat(mod.allowedProtocols);
        if (mod.allowTextFallback) allowTextFallback = true;
      }
    }
  } else {
    var mod = _MODULE_REGISTRY[activeModuleNameOrArray];
    if (!mod) return aresResponse;
    allowed = mod.allowedProtocols || [];
    allowTextFallback = mod.allowTextFallback;
  }

  var stringToParse = originalAresResponse || aresResponse;
  var tags = stringToParse.match(/\[\[([\s\S]*?)\]\]/g);
  
  if (!tags) {
    // Если модуль имеет протоколы, но ИИ ответил простым текстом
    if (allowed.length > 0 && !allowTextFallback && typeof sysLog !== 'undefined') {
      sysLog('⚠️ [WARNING]: [PARSE_ERROR] Ожидался тег (протокол), но ИИ ответил обычным текстом: ' + aresResponse.substring(0, 50) + '...');
    }
    return aresResponse;
  }

  var protoMap = _PROTOCOL_MAP;
  var parsedTags = (typeof _parseGlobalProtocols === 'function') ? _parseGlobalProtocols(stringToParse) : [];

  for (var ti = 0; ti < tags.length; ti++) {
    var completeTag = tags[ti];
    var handled = false;

    if (completeTag.startsWith('[[ERROR:') || completeTag.startsWith('[[SAY:')) {
      handled = true;
      var msgMatch = completeTag.match(/\[\[(?:ERROR|SAY):\s*([\s\S]*?)\]\]/i);
      var msg = msgMatch ? msgMatch[1].trim() : '';
      aresResponse = aresResponse.replace(completeTag, '').trim() + (msg ? '\n' + msg : '');
      if (ctx && ctx.trace) ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', note: 'UNIVERSAL_TEXT_TAG', tag: completeTag });
      continue;
    }

    for (var prefix in protoMap) {
      if (completeTag.startsWith(prefix)) {
        handled = true;

        // Cross-module execution is ALLOWED: 
        // If the LLM generates a valid protocol tag from another module (e.g. from history or cross-domain context),
        // we execute it rather than blocking it. This removes the "crutch" of hardcoded warning messages.

        // Проверяем, не дублирует ли обработчик протокола главный обработчик (root handler) модуля.
        // Если они совпадают, то действие уже было полностью выполнено на фазе root handler.
        var duplicateHandler = false;
        if (Array.isArray(activeModuleNameOrArray)) {
          for (var i = 0; i < activeModuleNameOrArray.length; i++) {
            var m = _MODULE_REGISTRY[activeModuleNameOrArray[i]];
            if (m && m.handler) {
              var proto = m.protocols.find(function(p) { return p.tag === prefix; });
              if (proto && proto.handler === m.handler) {
                duplicateHandler = true;
                break;
              }
            }
          }
        } else {
          var m = _MODULE_REGISTRY[activeModuleNameOrArray];
          if (m && m.handler) {
            var proto = m.protocols.find(function(p) { return p.tag === prefix; });
            if (proto && proto.handler === m.handler) {
              duplicateHandler = true;
            }
          }
        }

        if (duplicateHandler) {
          if (ctx && ctx.trace) ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', note: 'Bypassed duplicate root handler', tag: prefix });
          aresResponse = aresResponse.replace(completeTag, '').trim();
          Logger.log('[PROTOCOL_BYPASSED_DUPLICATE] ' + completeTag);
          break;
        }

        var result = protoMap[prefix](aresResponse, parsedTags, ctx);
        
        // safeCall returns an object { error: true, message: ... } if handler is missing or failed
        if (typeof result === 'object' && result.error) {
           if (ctx && ctx.trace) ctx.trace.stage('PROTOCOL_RESULT', { status: 'FAILED', reason: result.message, tag: prefix });
           aresResponse = result.aresResponse || aresResponse.replace(completeTag, '').trim();
        } else {
           if (ctx && ctx.trace) ctx.trace.stage('PROTOCOL_RESULT', { status: 'SUCCESS', tag: prefix });
           if (typeof result === 'string') {
             aresResponse = result;
           } else if (typeof result === 'object' && result !== null && typeof result.text === 'string') {
             aresResponse = result.text;
           }
        }
        
        Logger.log('[PROTOCOL_EXECUTED] ' + completeTag);
        break;
      }
    }

    if (!handled) {
      if (ctx && ctx.trace) ctx.trace.stage('PROTOCOL_RESULT', { status: 'FAILED', reason: 'Unknown protocol tag', tag: completeTag.substring(0, 30) });
      if (completeTag.includes('_TASK') || completeTag.includes('_REMINDER')) {
        aresResponse = aresResponse.replace(completeTag, '').trim();
      }
    }
  }

  return aresResponse;
}

// ==============================================================================
// 🔧 СИСТЕМНЫЙ ХЕЛПЕР: safeCall
// Оборачивает вызов функции по имени с защитой от ошибок.
// Живёт здесь — нужен для registerModule и executeProtocols.
// ==============================================================================
function safeCall(funcName) {
  return function(aresResponse, parsedTags, ctx) {
    try {
      if (typeof globalThis[funcName] === 'function') {
        return globalThis[funcName](aresResponse, parsedTags, ctx);
      } else {
        Logger.log('⚠️ [safeCall] Функция не найдена: ' + funcName);
        return { error: true, message: 'Handler not registered: ' + funcName, aresResponse: aresResponse.replace(/\[\[.*?\]\]/g, '') };
      }
    } catch (e) {
      Logger.log('❌ [safeCall] Ошибка в ' + funcName + ': ' + e.message);
      if (typeof sysLog !== 'undefined') sysLog('❌ [PROTOCOL_ERROR] ' + funcName + ': ' + e.message);
      var errStr = "⚠️ <b>ОШИБКА ПРОТОКОЛА:</b>\n" + e.message + "\n\n" + aresResponse.replace(/\[\[.*?\]\]/g, '').trim();
      return { error: true, message: e.message, aresResponse: errStr };
    }
  };
}

// ==============================================================================
// ⚙️ ПОЛУЧЕНИЕ НАСТРОЕК (ПЕРЕМЕННЫХ) МОДУЛЯ
// ==============================================================================
function getModuleSetting(modName, key, defaultVal) {
  try {
    var overrideJson = PropertiesService.getScriptProperties().getProperty('MODULE_CFG_' + modName);
    var override = overrideJson ? JSON.parse(overrideJson) : null;
    
    // 1. Ищем кастомное значение из UI
    if (override && override.variables && override.variables[key] !== undefined && override.variables[key] !== '') {
      return override.variables[key];
    }
    
    // 2. Ищем дефолтное значение из схемы
    if (_MODULE_REGISTRY[modName] && _MODULE_REGISTRY[modName].settings) {
      var settingDef = _MODULE_REGISTRY[modName].settings.find(function(s) { return s.key === key; });
      if (settingDef && settingDef.default !== undefined) {
        return settingDef.default;
      }
    }
  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog('[SETTING_ERROR] ' + modName + ' -> ' + key + ': ' + e.message);
  }
  
  // 3. Возвращаем fallback
  return defaultVal;
}

// ==============================================================================
// 🔠 УТИЛИТА КОНВЕРТАЦИИ КОЛОНОК (A -> 0, B -> 1)
// ==============================================================================
function colToIdx(val, defaultIdx) {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return defaultIdx !== undefined ? defaultIdx : -1;
  var str = val.toUpperCase().replace(/[^A-Z]/g, '');
  if (!str) return defaultIdx !== undefined ? defaultIdx : -1;
  var idx = 0;
  for (var i = 0; i < str.length; i++) {
    idx = idx * 26 + (str.charCodeAt(i) - 64);
  }
  return idx - 1; // 0-based (для работы с массивами data[i][col])
}

// ==============================================================================
// 🗄️ CENTRAL REGISTRY API (SSoT Endpoint)
// ==============================================================================

/**
 * Возвращает текущую версию реестра
 */
function getRegistryVersion() {
  try {
    var props = PropertiesService.getScriptProperties();
    var ver = props.getProperty('REGISTRY_VERSION');
    if (!ver) {
      ver = '1';
      props.setProperty('REGISTRY_VERSION', ver);
    }
    return parseInt(ver, 10);
  } catch (e) {
    return 1;
  }
}

/**
 * Увеличивает версию реестра (вызывать при любом изменении конфигурации из админки)
 */
function bumpRegistryVersion() {
  try {
    var props = PropertiesService.getScriptProperties();
    var ver = getRegistryVersion() + 1;
    props.setProperty('REGISTRY_VERSION', ver.toString());
    return ver;
  } catch (e) {
    return 1;
  }
}

/**
 * Формирует полный JSON-слепок всей конфигурации системы для WebApp.
 */
function getRegistrySnapshot() {
  var modulesArray = Object.keys(_MODULE_REGISTRY).map(function(key) {
    var mod = _MODULE_REGISTRY[key];
    return {
      key: mod.name,
      enabled: mod.enabled,
      priority: mod.priority,
      sessionTimeout: mod.sessionTimeout,
      allowTextFallback: mod.allowTextFallback,
      triggers: mod.triggers || [],
      allowedProtocols: mod.allowedProtocols || [],
      settings: mod.settings || []
    };
  });

  var protocolsArray = Object.keys(_PROTOCOL_MAP).map(function(tag) {
    return {
      tag: tag,
      handler: _PROTOCOL_MAP[tag].name // Имя функции-обработчика
    };
  });

  var tz = (typeof TIME_ZONE !== 'undefined') ? TIME_ZONE : "Europe/Kiev";

  return {
    registryVersion: getRegistryVersion(),
    generatedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    modules: modulesArray,
    protocols: protocolsArray,
    intents: typeof getCachedIntents === 'function' ? getCachedIntents() : {}
  };
}

