/**
 * ==============================================================================
 * 🌅 MODULE: PROTOCOLS & ARES MORNING v8.5 [COGNITIVE CORE]
 * - FIX: Полностью удалена биометрия и зависимость от Sleep as Android.
 * - NEW: Новости приходят сразу вместе со сводкой.
 * - NEW: Добавлен призыв к когнитивному тестированию.
 * ==============================================================================
 */

// ==============================================================================
// 🛡️ БЛОК БЕЗОПАСНОСТИ: АВТОНОМНАЯ ОТПРАВКА В TELEGRAM
// ==============================================================================
function aresSendText(text) {
  const props = PropertiesService.getScriptProperties();
  let chatId = (typeof MY_ID !== 'undefined') ? MY_ID : props.getProperty('MY_ID');
  
  try {
    if (typeof sendText === 'function') {
      sendText(chatId, text, true);
      return;
    }
  } catch (e) {
    Logger.log("⚠️ Стандартный sendText недоступен. Включаю автономную отправку...");
  }
  
  try {
    let token = (typeof TG_TOKEN !== 'undefined') ? TG_TOKEN : props.getProperty('TG_TOKEN');
    if (!token) return;
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post",
      payload: { chat_id: chatId, text: text, parse_mode: "HTML" },
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("❌ Полный отказ системы отправки: " + err.message);
  }
}

// ==============================================================================
// 🧱 БЛОК 1: УПРАВЛЕНИЕ ПРОТОКОЛАМИ (ЗАПУСК)
// ==============================================================================

function handleMorningProtocol(aresResponse, isManual = true) {
  let text = (typeof aresResponse === 'string') ? aresResponse : "";
  startMorningSequence('WAKE_UP', isManual);
  return text.replace(/\[\[MORNING_PROTOCOL\]\]/gi, "").trim(); 
}

function startMorningSequence(eventName, isManual) {
  isManual = (isManual !== false);
  Logger.log('[ПРОТОКОЛЫ]: Запуск утренней последовательности: ' + eventName + ' (Manual: ' + isManual + ')');
  var props    = PropertiesService.getScriptProperties();
  var TZ       = 'Europe/Kiev';
  var todayStr = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy');

  if (props.getProperty('last_morning_date') === todayStr && !isManual) {
    Logger.log('🛑 Утренний протокол уже запускался сегодня автоматически.');
    return;
  }
  props.setProperty('last_morning_date', todayStr);

  aresSendText('🌅 <b>Доброе утро, Дима.</b>\n<i>Запускаю компиляцию когнитивного профиля...</i>');

  // =========================================================================
  // DATA-DRIVEN: итерируем по morningCard всех включённых модулей
  // Порядок определяется полем morningOrder (меньше = раньше)
  // Для добавления нового модуля в утренний протокол: добавить morningCard в registerModule()
  // =========================================================================
  var registry = getModuleRegistry();
  var morningModules = [];

  for (var key in registry) {
    var mod = registry[key];
    if (mod.enabled && mod.morningCard) {
      morningModules.push({ name: key, order: mod.morningOrder || 99, card: mod.morningCard });
    }
  }

  // Сортируем по порядку
  morningModules.sort(function(a, b) { return a.order - b.order; });

  for (var i = 0; i < morningModules.length; i++) {
    var item = morningModules[i];
    try {
      var fn = globalThis[item.card];
      if (typeof fn === 'function') {
        var result = fn();
        if (result) aresSendText(result);
      }
    } catch (e) {
      Logger.log('[MORNING] Ошибка модуля ' + item.name + ': ' + e.message);
    }
  }

  // Когнитивный призыв (всегда последним)
  aresSendText('🧠 <b>COGNITIVE CHECK:</b>\nДима, для калибровки системы рекомендую пройти короткий когнитивный тест.\n\n👉 <a href=\'' + WEB_APP_URL + '\'>ЗАПУСТИТЬ ARES LAB</a>');

  clearAllMorningTriggers();
}

// ==============================================================================
// 🧱 БЛОК 2: СИСТЕМНЫЕ ФУНКЦИИ ADS (ВЫЗОВ ИЗ МОДУЛЯ)
// ==============================================================================

function generateAdsMorningCard() {
  try {
    if (typeof handleAdsManualReport === 'function') {
       let adsReport = handleAdsManualReport("[[CHECK_ADS: ВЧЕРА]]");
       if (adsReport) aresSendText("📈 <b>УТРЕННЯЯ СВОДКА ADS (ВЧЕРА)</b>\n" + adsReport);
    }
  } catch (e) {
    Logger.log("Ошибка утренней сводки ADS: " + e.message);
  }
}

// ==============================================================================
// 🧱 БЛОК 3: УТИЛИТЫ И ТРИГГЕРЫ
// ==============================================================================

function clearAllMorningTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    let fnName = triggers[i].getHandlerFunction();
    // Удаляем старые хвосты, если они остались
    if (fnName === "pollHealthData" || fnName === "delayedNewsReport") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function resetProtocols() {
  PropertiesService.getScriptProperties().deleteProperty('last_morning_date');
  aresSendText("♻️ <b>СИСТЕМА:</b> Память утреннего протокола очищена. Готов к повторному запуску.");
}