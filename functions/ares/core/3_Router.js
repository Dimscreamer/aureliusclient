/**
 * ==============================================================================
 * 🔀 3_Router.js — ДЕТЕРМИНИСТИЧЕСКИЙ МАРШРУТИЗАТОР
 *
 * Определяет, какой модуль обработает входящее сообщение.
 * Использует ТОЛЬКО keyword matching (НЕ AI intent detection).
 * Читает MODULE_REGISTRY из 1_Registry.js — знает только о включённых модулях.
 *
 * Порядок приоритетов:
 *   L0: Entity-First Routing (именованные объекты)
 *   L1: Module Trigger Matching (ключевые слова)
 *   L2: Session Continuation (продолжение активной сессии)
 *   L3: Isolation Logic (защита от ложных срабатываний)
 *
 * Web-версия: роутер не меняется — он агностичен к транспорту.
 * ==============================================================================
 */

// ==============================================================================
// 🧠 ГЛАВНАЯ ФУНКЦИЯ РОУТИНГА
// ==============================================================================

/**
 * Определяет маршрут для входящего сообщения.
 *
 * @param {string} lowerInput  — текст в нижнем регистре
 * @param {Object} sessionState — текущая сессия пользователя
 * @param {Object} ctx - The Execution Context (trace pipeline)
 * @returns {Object} — { mode: 'BASE'|'MODULE', modules: [], chained: bool }
 */
function routeInput(lowerInput, sessionState, ctx) {
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function matchesTrigger(input, trigger) {
    var t = trigger.toLowerCase().trim();
    if (t.length === 0) return false;
    if (t.length < 4) {
      var regex = new RegExp("(^|[^a-zA-Z0-9а-яА-ЯёЁ])" + escapeRegExp(t) + "($|[^a-zA-Z0-9а-яА-ЯёЁ])");
      return regex.test(input);
    }
    return input.indexOf(t) !== -1;
  }

  sysLog('[ROUTER] Input: ' + lowerInput.substring(0, 80));

  var registry = getModuleRegistry(); // we still need registry for entityRegistry and fallback functions
  var entityRegistry = getEntityRegistry();
  var config = typeof getAresConfig === 'function' ? getAresConfig() : null;
  
  if (!config) {
    sysLog('[ROUTER] No-Code Config missing! Fallback to legacy config build.');
    if (typeof buildConfig === 'function') {
      buildConfig();
      config = getAresConfig();
    }
  }
  
  var noCodeIntents = (config && config.intents) ? config.intents : [];
  var noCodeModules = (config && config.modules) ? config.modules : {};

  // Эмоциональные маркеры
  var emotionalWords = ['бесит', 'устал', 'грустно', 'злит', 'страшно', 'тревога', 'боюсь', 'радость', 'счастлив', 'обидно', 'печаль', 'одинок'];
  var isEmotional = emotionalWords.some(function(w) { return lowerInput.includes(w); });

  var adsKeywords = ['реклам', 'адс', 'аналитик', 'трафик', 'конверси', 'лид', 'расход', 'cpa', 'номад', 'виктория'];
  var isAdsIntent = adsKeywords.some(function(w) { return lowerInput.includes(w); });

  var matched = [];
  var entityDomainForced = null;
  var forcedIntentData = null;

  // =========================================================
  // ⚡ L-1: EXPLICIT ROUTING (через @)
  // =========================================================
  var explicitModules = [];
  var words = lowerInput.split(/\s+/);
  for (var w = 0; w < words.length; w++) {
    var word = words[w];
    if (word.startsWith('@')) {
      var modName = word.substring(1).replace(/[^a-z0-9_]/g, '');
      var mCfg = noCodeModules[modName];
      var isModEnabled = mCfg ? mCfg.enabled : (registry[modName] && registry[modName].enabled);
      if (isModEnabled) {
        if (explicitModules.indexOf(modName) === -1) {
          explicitModules.push(modName);
        }
      }
    }
  }

  if (explicitModules.length > 0) {
    sysLog('[ROUTER L-1] Explicit routing via @ → ' + explicitModules.join(', '));
    var cands = explicitModules.map(function(m) { return { key: m, priority: 100, score: 1.0, matchedBy: 'EXPLICIT_TAG' }; });
    if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'MODULE', explicit: true, modules: explicitModules, candidates: cands });
    return {
      mode: 'MODULE',
      modules: explicitModules,
      chained: explicitModules.length > 1
    };
  }

  // =========================================================
  // 🧠 L0: ENTITY-FIRST ROUTING
  // =========================================================
  for (var domain in entityRegistry) {
    var entities = entityRegistry[domain];
    if (!Array.isArray(entities)) continue;
    var hit = entities.some(function(entity) {
      return lowerInput.indexOf(entity.toLowerCase()) !== -1;
    });
    var mCfg = noCodeModules[domain];
    var isModEnabled = mCfg ? mCfg.enabled : (registry[domain] && registry[domain].enabled);
    if (hit && isModEnabled) {
      sysLog('[ROUTER L0] Entity detected → domain: ' + domain);
      matched.push({ key: domain, priority: 100, score: 1.0, matchedBy: 'ENTITY', matchedText: domain });
      entityDomainForced = domain;
    }
  }

  // Очищаем обращение по имени бота в начале сообщения
  var cleanInput = lowerInput
    .replace(/^(арес|ares|аресик|марк|mark|бот|эй арес|слушай арес)[,\s:!.-]+/i, '')
    .trim();
  if (!cleanInput) cleanInput = lowerInput;

  // =========================================================
  // ⚡ L0.5: NO-CODE INTENTS EXACT MATCHING
  // =========================================================
  var exactMatched = false;
  for (var i = 0; i < noCodeIntents.length; i++) {
    var intent = noCodeIntents[i];
    var mCfg = noCodeModules[intent.module];
    var isModEnabled = mCfg ? mCfg.enabled : (registry[intent.module] && registry[intent.module].enabled);
    if (!isModEnabled || intent.enabled === false) continue;
    
    // Check negatives
    if (intent.negative && intent.negative.length > 0) {
      var hasNegative = intent.negative.some(function(n) { return lowerInput.indexOf(n) !== -1 || cleanInput.indexOf(n) !== -1; });
      if (hasNegative) continue;
    }

    if (!intent.exact || intent.exact.length === 0) continue;

    var hitExact = null;
    for (var j = 0; j < intent.exact.length; j++) {
      var phrase = intent.exact[j].toLowerCase().trim();
      if (!phrase) continue;
      if (
        cleanInput === phrase ||
        cleanInput.startsWith(phrase + ' ') ||
        cleanInput.startsWith(phrase + '\n') ||
        lowerInput === phrase ||
        lowerInput.startsWith(phrase + ' ') ||
        (phrase.length >= 6 && cleanInput.indexOf(phrase) !== -1)
      ) {
        hitExact = phrase;
        break;
      }
    }

    if (hitExact) {
      sysLog('[ROUTER L0.5] Exact Match: "' + hitExact + '" → ' + intent.module + ' (' + intent.function + ')');
      var prio = intent.priority || (mCfg ? mCfg.priority : 50);
      matched.push({ key: intent.module, priority: prio, score: 1.0, matchedBy: 'EXACT', matchedText: hitExact });
      forcedIntentData = intent;
      exactMatched = true;
      break;
    }
  }

  // =========================================================
  // 🧩 L1: NO-CODE INTENTS BROAD MATCHING
  // =========================================================
  if (!exactMatched) {
    for (var i = 0; i < noCodeIntents.length; i++) {
      var intent = noCodeIntents[i];
      var mCfg = noCodeModules[intent.module];
      var isModEnabled = mCfg ? mCfg.enabled : (registry[intent.module] && registry[intent.module].enabled);
      if (!isModEnabled || intent.enabled === false) continue;
      
      // Check negatives
      if (intent.negative && intent.negative.length > 0) {
        var hasNegative = intent.negative.some(function(n) { return lowerInput.indexOf(n) !== -1; });
        if (hasNegative) continue;
      }

      if (!intent.broad || intent.broad.length === 0) continue;

      var hitBroad = null;
      var moduleConfidence = 0;

      for (var j = 0; j < intent.broad.length; j++) {
        var word = intent.broad[j].toLowerCase();
        if (matchesTrigger(lowerInput, word)) {
          hitBroad = word;
          var wVal = intent.weight || 1;
          moduleConfidence = 0.8 * wVal;
          if (lowerInput.startsWith(word)) moduleConfidence += 0.2;
          break;
        }
      }

      if (hitBroad) {
        var prio = intent.priority || (mCfg ? mCfg.priority : 50);
        matched.push({ key: intent.module, priority: prio, score: moduleConfidence, matchedBy: 'BROAD', matchedText: hitBroad });
      }
    }
    
    // Фолбек на старые триггеры (выполняем всегда, чтобы подстраховать No-Code)
    for (var key in registry) {
      if (matched.some(function(m) { return m.key === key; })) continue;

      var mod = registry[key];
      var mCfg = noCodeModules[key];
      var isModEnabled = mCfg ? mCfg.enabled : mod.enabled;
      if (!isModEnabled) continue;

      var triggerList = (mCfg && mCfg.triggers && mCfg.triggers.length > 0) ? mCfg.triggers : (mod.triggers || []);
      var hitFallback = null;
      for (var ti = 0; ti < triggerList.length; ti++) {
        if (matchesTrigger(lowerInput, triggerList[ti])) {
          hitFallback = triggerList[ti];
          break;
        }
      }
      if (hitFallback) {
        var fallbackConfidence = 0.8;
        if (lowerInput.startsWith(hitFallback.toLowerCase())) fallbackConfidence += 0.2;
        var prio = mCfg ? mCfg.priority : mod.priority;
        matched.push({ key: key, priority: prio, score: fallbackConfidence, matchedBy: 'FALLBACK', matchedText: hitFallback });
      }
    }
  }

  // Добавляем Entity-forced домен
  if (entityDomainForced && !matched.some(function(m) { return m.key === entityDomainForced; })) {
    var mCfg = noCodeModules[entityDomainForced];
    var forcedMod = registry[entityDomainForced];
    var prio = mCfg ? mCfg.priority : (forcedMod ? forcedMod.priority : 50);
    matched.push({ key: entityDomainForced, priority: prio, score: 1.0, matchedBy: 'ENTITY_FORCED', matchedText: entityDomainForced });
  }

  // =========================================================
  // 🗂️ L2: SESSION CONTINUATION + SOFT TIMEOUT
  // =========================================================
  if (sessionState.activeModule) {
    var mCfg = noCodeModules[sessionState.activeModule];
    var activeMod = registry[sessionState.activeModule];
    var isModEnabled = mCfg ? mCfg.enabled : (activeMod && activeMod.enabled);
    if (isModEnabled) {
      var elapsedMs = Date.now() - (sessionState.lastActivity || sessionState.moduleStartedAt || 0);
      var elapsedMin = elapsedMs / 60000;
      var timeout = mCfg && mCfg.sessionTimeout ? mCfg.sessionTimeout : (activeMod ? activeMod.sessionTimeout : 10);

      // Проверяем SOFT TIMEOUT: половина от тайм-аута сессии, но не менее 3 минут
      var SOFT_TIMEOUT_MIN = Math.max(3, timeout / 2);
      if (elapsedMin >= SOFT_TIMEOUT_MIN && !sessionState.isSleeping) {
        sysLog('[SESSION_SLEEP] ' + sessionState.activeModule + ' → Сессия засыпает (' + Math.round(elapsedMs/1000) + 's без активности)');
        sessionState.isSleeping = true;
        if (ctx && ctx.trace) ctx.trace.stage('SESSION_SLEEP', { module: sessionState.activeModule, elapsedSec: Math.round(elapsedMs/1000) });
      }

      // Если сессия спит — проверяем, можно ли её разбудить
      if (sessionState.isSleeping) {
        var matchesActiveModule = matched.some(function(m) { return m.key === sessionState.activeModule && m.score >= 0.6; });
        if (matchesActiveModule) {
          // Разбудить сессию!
          sysLog('[SESSION_WAKE] ' + sessionState.activeModule + ' → сессия проснулась (триггер совпал).');
          sessionState.isSleeping = false;
          sessionState.lastActivity = Date.now();
          if (ctx && ctx.trace) ctx.trace.stage('SESSION_WAKE', { module: sessionState.activeModule });
          if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'MODULE', modules: [sessionState.activeModule], reason: 'SESSION_WAKE', candidates: matched });
          return { mode: 'MODULE', modules: [sessionState.activeModule], chained: false, fromSession: true };
        } else {
          // Не совпал — закрываем сессию
          sysLog('[SESSION_END] ' + sessionState.activeModule + ' → Сессия закрыта (не совпал после SLEEP)');
          if (ctx && ctx.trace) ctx.trace.stage('SESSION_END', { module: sessionState.activeModule, reason: 'SLEEP_NO_MATCH' });
          if (typeof LifeBus !== 'undefined') {
            LifeBus.emit('SESSION_FLUSH', {
              module: sessionState.activeModule,
              reason: 'SLEEP_NO_MATCH',
              elapsedSec: Math.round(elapsedMs / 1000)
            }, ctx);
          }
          resetSession(sessionState);
          // Продолжаем маршрутизацию для текущего сообщения
        }
      } else if (elapsedMin >= timeout) {
        // Полный хард-таймаут (подстраховачный механизм)
        sysLog('[SESSION_END] Таймаут хард: ' + sessionState.activeModule + ' (' + Math.round(elapsedMin) + ' мин)');
        if (ctx && ctx.trace) ctx.trace.stage('SESSION_END', { module: sessionState.activeModule, reason: 'HARD_TIMEOUT', elapsedMin: Math.round(elapsedMin) });
        if (typeof LifeBus !== 'undefined') {
          LifeBus.emit('SESSION_FLUSH', {
            module: sessionState.activeModule,
            reason: 'HARD_TIMEOUT',
            elapsedMin: Math.round(elapsedMin)
          }, ctx);
        }
        resetSession(sessionState);
      } else {
        // Сессия активна (normal flow)
        var explicitSwitch = matched.find(function(m) {
          return m.key !== sessionState.activeModule && m.score >= 0.8;
        });

        if (explicitSwitch) {
          sysLog('[SESSION_OVERRIDE] Explicit switch → ' + explicitSwitch.key);
          if (ctx && ctx.trace) ctx.trace.stage('SESSION_END', { module: sessionState.activeModule, reason: 'EXPLICIT_SWITCH_TO_' + explicitSwitch.key });
          if (typeof LifeBus !== 'undefined') {
            LifeBus.emit('SESSION_FLUSH', {
              module: sessionState.activeModule,
              reason: 'EXPLICIT_SWITCH',
              switchedTo: explicitSwitch.key
            }, ctx);
          }
          resetSession(sessionState);
        } else if (isEmotional && sessionState.activeModule !== 'metanoia' && sessionState.activeModule !== 'diary') {
          sysLog('[ROUTER] Emotional input → drop session: ' + sessionState.activeModule);
          if (ctx && ctx.trace) ctx.trace.stage('SESSION_END', { module: sessionState.activeModule, reason: 'EMOTIONAL_INPUT' });
          if (typeof LifeBus !== 'undefined') {
            LifeBus.emit('SESSION_FLUSH', { module: sessionState.activeModule, reason: 'EMOTIONAL_INPUT' }, ctx);
          }
          resetSession(sessionState);
        } else if (sessionState.activeModule === 'ads' && matched.length === 0 && !isAdsIntent) {
          sysLog('[SESSION_OVERRIDE] Non-ads input → drop Ads session');
          if (typeof LifeBus !== 'undefined') {
            LifeBus.emit('ADS_SESSION_END', { module: 'ads', reason: 'NON_ADS_INPUT' }, ctx);
          }
          resetSession(sessionState);
          if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'BASE', reason: 'Session dropped (ads -> non-ads)' });
          return { mode: 'BASE', modules: [], chained: false };
        } else if (isAdsIntent && sessionState.activeModule !== 'ads') {
          sysLog('[ROUTER] Ads intent → drop session: ' + sessionState.activeModule);
          if (typeof LifeBus !== 'undefined') {
            LifeBus.emit('SESSION_FLUSH', { module: sessionState.activeModule, reason: 'ADS_OVERRIDE' }, ctx);
          }
          resetSession(sessionState);
        } else {
          if (matched.length === 0 || (matched.length === 1 && matched[0].key === sessionState.activeModule)) {
            var keepSession = ['ads', 'metanoia', 'diary', 'reminders', 'nutrition', 'calendar', 'weather', 'news', 'tasks'];
            if (keepSession.indexOf(sessionState.activeModule) === -1) {
              sysLog('[SESSION_END] Drop non-stateful session: ' + sessionState.activeModule);
              if (typeof LifeBus !== 'undefined') {
                LifeBus.emit('SESSION_FLUSH', { module: sessionState.activeModule, reason: 'NON_STATEFUL' }, ctx);
              }
              resetSession(sessionState);
            } else {
              sysLog('[ROUTER] → SESSION CONTINUE: ' + sessionState.activeModule);
              sessionState.lastActivity = Date.now(); // Обновляем lastActivity
              if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'MODULE', modules: [sessionState.activeModule], reason: 'SESSION_CONTINUE', candidates: matched });
              return { mode: 'MODULE', modules: [sessionState.activeModule], chained: false, fromSession: true };
            }
          }
        }
      }
    } else {
      resetSession(sessionState);
    }
  }

  // Фильтруем низкую уверенность
  matched = matched.filter(function(m) { return m.score >= 0.6; });

  if (matched.length === 0) {
    sysLog('[ROUTER] → BASE CHAT');
    if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'BASE', reason: 'No matching intents (score < 0.6)', candidates: matched });
    return { mode: 'BASE', modules: [], chained: false };
  }

  // =========================================================
  // ⚔️ L3: CONFLICT ISOLATION
  // =========================================================
  matched = matched.filter(function(m) { return m.score >= 0.6; });
  var hasTasks   = matched.some(function(m) { return m.key === 'tasks'; });
  var hasFinance = matched.some(function(m) { return m.key === 'finance'; });
  var hasParenting = matched.some(function(m) { return m.key === 'parenting'; });
  var hasDiary = matched.some(function(m) { return m.key === 'diary'; });

  if (hasTasks && hasFinance) {
    var financeMatch = matched.find(function(m) { return m.key === 'finance'; });
    if (financeMatch && (financeMatch.matchedText === 'купить' || financeMatch.matchedText === 'куплю' || financeMatch.matchedText === 'покупк')) {
      if (lowerInput.indexOf('сколько') === -1 && lowerInput.indexOf('могу') === -1 && lowerInput.indexOf('остал') === -1) {
        sysLog('[ROUTER] FINANCE isolation: удалён из цепочки (слово купить относилось к задаче)');
        matched = matched.filter(function(m) { return m.key !== 'finance'; });
      }
    }
  }

  if (hasParenting && hasDiary) {
    sysLog('[ROUTER] DIARY isolation: удалён из цепочки (дневник относится к ребенку)');
    matched = matched.filter(function(m) { return m.key !== 'diary'; });
  }
  
  var hasNews = matched.some(function(m) { return m.key === 'news'; });
  if (hasNews && matched.length > 1) {
    var newsMatch = matched.find(function(m) { return m.key === 'news'; });
    if (newsMatch && newsMatch.matchedText === 'сводк') {
      sysLog('[ROUTER] NEWS isolation: удалён из цепочки (слово сводка относится к другому модулю)');
      matched = matched.filter(function(m) { return m.key !== 'news'; });
    }
  }

  matched.sort(function(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    return b.priority - a.priority;
  });
  var moduleKeys = [];
  matched.forEach(function(m) { if (moduleKeys.indexOf(m.key) === -1) moduleKeys.push(m.key); });

  // =========================================================
  // ❓ L4: DELTA-BASED ASK_USER
  // Если лучший кандидат есть, но разница в скорах между 1ст и 2м < 0.15 — переспросить
  // =========================================================
  if (moduleKeys.length >= 2) {
    var score1 = matched.find(function(m) { return m.key === moduleKeys[0]; });
    var score2 = matched.find(function(m) { return m.key === moduleKeys[1]; });
    if (score1 && score2) {
      var scoreDelta = (score1.score || 0) - (score2.score || 0);
      if (scoreDelta < 0.15) {
        sysLog('[ROUTER] → ASK_USER: дельта недостаточна (' + score1.key + ':' + score1.score.toFixed(2) + ' vs ' + score2.key + ':' + score2.score.toFixed(2) + ')');
        if (ctx && ctx.trace) ctx.trace.stage('ROUTER', {
          mode: 'ASK_USER',
          candidates: matched,
          delta: scoreDelta,
          reason: 'AMBIGUOUS_CANDIDATES'
        });
        return { mode: 'ASK_USER', modules: moduleKeys, candidates: matched, chained: false };
      }
    }
  }

  if (moduleKeys.length > 1) {
    sysLog('[ROUTER] → CHAIN: ' + moduleKeys.join(' → '));
    if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'MODULE', chained: true, modules: moduleKeys, candidates: matched });
    return { mode: 'MODULE', modules: moduleKeys, chained: true, matchedTriggers: matched, forcedIntent: forcedIntentData };
  }

  var isBroadOnly = !matched.some(function(m) {
    return m.key === moduleKeys[0] && (m.matchedBy === 'EXACT' || m.matchedBy === 'EXPLICIT_TAG');
  });

  sysLog('[ROUTER] → MODULE: ' + moduleKeys[0]);
  if (ctx && ctx.trace) ctx.trace.stage('ROUTER', { mode: 'MODULE', chained: false, modules: [moduleKeys[0]], candidates: matched });
  return { mode: 'MODULE', modules: moduleKeys, chained: false, matchedTriggers: matched, forcedIntent: forcedIntentData, broadOnly: isBroadOnly };
}

// ==============================================================================
// 🔧 ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ РОУТЕРА
// ==============================================================================


/**
 * Собрать payload для передачи в модуль.
 * Загружает контекст через contextFn модуля.
 */
function buildModulePayload(moduleName, input, sessionState, chatId, ctx) {
  var registry = getModuleRegistry();
  var mod      = registry[moduleName];
  if (!mod) return null;

  var history   = getModuleHistory(chatId, mod.historyKey, ctx);
  var moduleCtx = '';

  var contextStatus = 'NONE';
  try {
    if (mod.contextFn && typeof globalThis[mod.contextFn] === 'function') {
      moduleCtx = globalThis[mod.contextFn](input.text, history) || '';
      contextStatus = 'SUCCESS';
    } else if (mod.contextFn) {
      contextStatus = 'NOT_FOUND';
    }
  } catch (e) {
    sysLog('[MODULE_CTX_ERROR] ' + moduleName + ': ' + e.message);
    contextStatus = 'ERROR: ' + e.message;
  }
  
  if (ctx && ctx.trace) {
    ctx.trace.stage('CONTEXT_BUILDER', { status: contextStatus, fn: mod.contextFn || 'none' });
  }

  return {
    moduleName: moduleName,
    text:       input.text,
    memory:     moduleCtx,
    history:    history,
    session:    sessionState,
    chatId:     chatId,
    forcedIntent: sessionState && sessionState.forcedIntent ? sessionState.forcedIntent : null,
    broadOnly:  ctx && ctx.route ? ctx.route.broadOnly : false
  };
}

/**
 * Проверить, есть ли в тексте триггер другого модуля (для обнаружения переключений).
 */
function detectNewModuleTrigger(lowerInput, currentModuleName) {
  var registry = getModuleRegistry();
  for (var key in registry) {
    if (key === currentModuleName) continue;
    var mod = registry[key];
    if (!mod.enabled) continue;
    if ((mod.triggers || []).some(function(kw) { return lowerInput.indexOf(kw) !== -1; })) return key;
  }
  return null;
}
