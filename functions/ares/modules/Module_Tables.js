/**
 * ==============================================================================
 * 📊 МОДУЛЬ РЕДАКТОРА ТАБЛИЦ (TABLE EDITOR)
 * Маршрутизирует пользователя в WebApp для редактирования базы данных
 * ==============================================================================
 */

function getTablesIntent() {
  return `MODE: TABLES MODULE (Редактор таблиц)
Пользователь запрашивает доступ к базе данных или таблицам.`;
}

function getTablesProtocols() {
  return `Ответь кратко, подтвердив, что ты открываешь доступ к интерфейсу управления таблицами.
Например:
"Доступ к базе данных предоставлен. Нажми кнопку ниже, чтобы открыть редактор таблиц."
[[OPEN_TABLES]]`;
}

function handleTablesResponse(response) {
  if (typeof sysLog !== 'undefined') sysLog("⚙️ [MODULE_FUNCTION] Выполняется обработчик: handleTablesResponse", MY_ID);
  
  if (/\[\[OPEN_TABLES\]\]/i.test(response)) {
    // Generate inline keyboard for WebApp
    var webAppUrl = WEB_APP_URL + "?page=table_editor&t=" + new Date().getTime();
    
    var inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "📊 Открыть Редактор Таблиц", web_app: { url: webAppUrl } }
        ]
      ]
    };

    var cleanResponse = response.replace(/\[\[OPEN_TABLES\]\]/gi, '').trim();
    if (!cleanResponse) {
      cleanResponse = "Доступ к базе данных предоставлен. Нажми кнопку ниже, чтобы открыть редактор таблиц.";
    }

    if (typeof aresFormatMessage === 'function') {
      var formatted = aresFormatMessage("РЕДАКТОР ТАБЛИЦ", "📊", cleanResponse);
      return { text: formatted, keyboard: inlineKeyboard };
    } else {
      return { text: "📊 <b>РЕДАКТОР ТАБЛИЦ</b>\n\n" + cleanResponse, keyboard: inlineKeyboard };
    }
  }

  return response;
}

// ==============================================================================
// 🔌 РЕГИСТРАЦИЯ МОДУЛЯ
// ==============================================================================
if (typeof registerModule === 'function') {
  registerModule({
    name: 'tables',
    enabled: true,
    promptIntentFn: 'getTablesIntent',
    promptProtocolsFn: 'getTablesProtocols',
    handler: 'handleTablesResponse',
    protocols: [
      { tag: '[[OPEN_TABLES]]', handler: 'handleTablesResponse', desc: 'Открыть редактор таблиц: [[OPEN_TABLES]]' }
    ],
    allowedProtocols: ['[[OPEN_TABLES]]'],
    sessionTimeout: 1, // Doesn't need long session
    priority: 85
  });
}
