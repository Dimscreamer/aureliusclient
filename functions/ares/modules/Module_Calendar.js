/**
 * ==============================================================================
 * 📅 Module_Calendar.js — ИНТЕГРАЦИЯ С GOOGLE CALENDAR
 * ==============================================================================
 */

if (typeof registerModule === 'function') {
  registerModule({
    name: 'calendar',
    enabled: true,
    promptIntentFn: 'getCalendarIntent',
    promptProtocolsFn: 'getCalendarProtocols',
    handler: 'handleCalendarResponse',
    protocols: [
      { tag: '[[CALENDAR_ADD:', handler: 'handleCalendarResponse', desc: 'ДОБАВИТЬ СОБЫТИЕ: [[CALENDAR_ADD: {"title": "Название", "start": "YYYY-MM-DDTHH:mm:ss", "end": "YYYY-MM-DDTHH:mm:ss"}]]' },
      { tag: '[[CALENDAR_GET:', handler: 'handleCalendarResponse', desc: 'ПОЛУЧИТЬ РАСПИСАНИЕ: [[CALENDAR_GET: {"date": "YYYY-MM-DD"}]]' },
      { tag: '[[CALENDAR_DELETE:', handler: 'handleCalendarResponse', desc: 'УДАЛИТЬ СОБЫТИЕ: [[CALENDAR_DELETE: {"title": "Часть названия", "date": "YYYY-MM-DD"}]]' }
    ],
    allowedProtocols: ['[[CALENDAR_ADD:', '[[CALENDAR_GET:', '[[CALENDAR_DELETE:'],
    sessionTimeout: 3,
    priority: 88, // Высокий приоритет, чтобы ловить планирование
    historyKey: 'history_calendar'
  });
}

function getCalendarIntent() {
  return `MODE: CALENDAR MODULE (Управление временем)
Ты — интеллектуальный ассистент по управлению временем (Календарем).
ТВОЯ ЗАДАЧА: помогать пользователю планировать события, отменять их и рассказывать расписание.`;
}

function getCalendarProtocols() {
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Europe/Kyiv", "yyyy-MM-dd'T'HH:mm:ss");
  
  return `Текущая дата и время сервера: ` + dateStr + ` (Часовой пояс: Киев/МСК)

ПРАВИЛА И ТЕГИ (используй их в конце своего ответа, они сработают автоматически):

1. ВАЖНО: Если пользователь не указал время окончания при создании события, определи его самостоятельно исходя из контекста (например, тренировка ~1-1.5 часа, созвон ~30 мин, кофе ~30-45 мин).
2. ИЗМЕНЕНИЕ СОБЫТИЯ (РЕДАКТИРОВАНИЕ):
Если пользователь хочет перенести событие на другое время или день, верни ДВА тега подряд: сначала CALENDAR_DELETE старого события, а затем CALENDAR_ADD нового события.

ОТВЕТ: Всегда сначала отвечай пользователю нормальным текстом (например, "Хорошо, записал тренировку на завтра!"), а теги ставь в самом конце.
- Если пользователь явно просит ОТКРЫТЬ КАЛЕНДАРЬ (или показать календарь), просто ответь: "Открываю календарь..." без использования тегов протокола.
- ЕСЛИ РЕШЕНИЕ НЕ ТРЕБУЕТ СЛОЖНЫХ ДЕЙСТВИЙ (например, вопрос о времени или деталях), не используй теги протокола. ПРОСТО ВЕДИ ДИАЛОГ.`;
}

function handleCalendarResponse(aresResponse, payload, input) {
  var modifiedResponse = aresResponse;
  var gasUrl = "https://script.google.com/macros/s/AKfycbzzEaa04U_x_Pm8FtAvLiYjvZseGpN6U21otZjWiGdcOWl-Nigozw8vEHtEtZHKEaVwFQ/exec";
  
  var cal = null;
  if (typeof CalendarApp !== 'undefined') {
    try {
      cal = CalendarApp.getDefaultCalendar();
    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка доступа к Календарю: " + e.message, payload ? payload.chatId : null);
    }
  }

  // 1. CALENDAR_ADD
  var addRegex = /\[\[CALENDAR_ADD:\s*(\{.*?\})\s*\]\]/g;
  var addMatch;
  while ((addMatch = addRegex.exec(modifiedResponse)) !== null) {
    try {
      var data = JSON.parse(addMatch[1]);
      var start = new Date(data.start);
      var end = new Date(data.end);
      
      if (cal) {
        cal.createEvent(data.title, start, end);
      } else {
        try {
          var dateOnly = data.start ? data.start.split('T')[0] : '';
          UrlFetchApp.fetch(gasUrl + '?action=saveCalendarEvent&title=' + encodeURIComponent(data.title) + '&start=' + encodeURIComponent(data.start) + '&end=' + encodeURIComponent(data.end) + '&date=' + encodeURIComponent(dateOnly));
        } catch(e) {}
      }

      modifiedResponse = modifiedResponse.replace(addMatch[0], "").trim();
      if (!modifiedResponse) {
        var startFormatted = data.start;
        if (data.start && data.start.indexOf('T') !== -1) {
          var p = data.start.split('T');
          var dP = p[0].split('-');
          var tP = p[1].split(':');
          startFormatted = (dP[2] || '01') + '.' + (dP[1] || '01') + '.' + dP[0] + ' ' + (tP[0] || '00') + ':' + (tP[1] || '00');
        }
        modifiedResponse = "✅ Добавил в Google Календарь: <b>" + (data.title || "Встреча") + "</b> на " + startFormatted;
      }
      if (typeof sysLog !== 'undefined') sysLog("📅 Создано событие: " + data.title, payload ? payload.chatId : null);
    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка CALENDAR_ADD: " + e.message, payload ? payload.chatId : null);
    }
  }

  // 2. CALENDAR_GET
  var getRegex = /\[\[CALENDAR_GET:\s*(\{.*?\})\s*\]\]/g;
  var getMatch;
  while ((getMatch = getRegex.exec(modifiedResponse)) !== null) {
    try {
      var data = JSON.parse(getMatch[1]);
      var schedule = "\n\n📅 <b>Планы на " + data.date + ":</b>\n";
      var events = [];
      
      if (cal) {
        var targetDate = new Date(data.date);
        var calEvents = cal.getEventsForDay(targetDate);
        for (var i = 0; i < calEvents.length; i++) {
          var ev = calEvents[i];
          var s = (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(ev.getStartTime(), "Europe/Kyiv", "HH:mm") : "09:00";
          var e = (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(ev.getEndTime(), "Europe/Kyiv", "HH:mm") : "10:00";
          events.push({ title: ev.getTitle(), start: s, end: e });
        }
      } else {
        try {
          var res = UrlFetchApp.fetch(gasUrl + '?action=getCalendarDay&date=' + encodeURIComponent(data.date));
          var resJson = JSON.parse(res.getContentText());
          if (resJson && resJson.events) {
            events = resJson.events;
          }
        } catch(err) {
          if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка получения событий из GAS: " + err.message);
        }
      }

      if (events.length === 0) {
        schedule += "Свободный день! Запланированных событий нет 🏖";
      } else {
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          var s = ev.start || "09:00";
          var e = ev.end || "10:00";
          schedule += "🔹 " + s + " - " + e + " | <b>" + (ev.title || ev.getTitle ? (ev.title || ev.getTitle()) : "Событие") + "</b>\n";
        }
      }

      modifiedResponse = modifiedResponse.replace(getMatch[0], schedule);
      if (typeof sysLog !== 'undefined') sysLog("📅 Запрошено расписание на: " + data.date, payload ? payload.chatId : null);
    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка CALENDAR_GET: " + e.message, payload ? payload.chatId : null);
    }
  }

  // 3. CALENDAR_DELETE
  var delRegex = /\[\[CALENDAR_DELETE:\s*(\{.*?\})\s*\]\]/g;
  var delMatch;
  while ((delMatch = delRegex.exec(modifiedResponse)) !== null) {
    try {
      var data = JSON.parse(delMatch[1]);
      var deletedCount = 0;
      if (cal) {
        var targetDate = new Date(data.date);
        var events = cal.getEventsForDay(targetDate);
        for (var i = 0; i < events.length; i++) {
          if (events[i].getTitle().toLowerCase().indexOf(data.title.toLowerCase()) !== -1) {
            events[i].deleteEvent();
            deletedCount++;
          }
        }
      } else {
        try {
          var res = UrlFetchApp.fetch(gasUrl + '?action=getCalendarDay&date=' + encodeURIComponent(data.date));
          var resJson = JSON.parse(res.getContentText());
          if (resJson && resJson.events) {
            for (var i = 0; i < resJson.events.length; i++) {
              if (resJson.events[i].title && resJson.events[i].title.toLowerCase().indexOf(data.title.toLowerCase()) !== -1) {
                UrlFetchApp.fetch(gasUrl + '?action=deleteCalendarEvent&id=' + encodeURIComponent(resJson.events[i].id));
                deletedCount++;
              }
            }
          }
        } catch(e) {}
      }
      
      var delMsg = "\n\n🗑 <i>Событие отменено: " + data.title + "</i>";
      modifiedResponse = modifiedResponse.replace(delMatch[0], delMsg);
      if (typeof sysLog !== 'undefined') sysLog("📅 Удалено событий: " + data.title, payload ? payload.chatId : null);
    } catch (e) {
      if (typeof sysLog !== 'undefined') sysLog("❌ Ошибка CALENDAR_DELETE: " + e.message, payload ? payload.chatId : null);
    }
  }

  var cleanText = modifiedResponse.trim();
  
  var webAppUrl = (typeof WEB_APP_URL !== 'undefined') ? WEB_APP_URL + "/?view=ares&sub=calendar" : "https://aureliusclients.web.app/?view=ares&sub=calendar";
  var inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "📅 Открыть Календарь", web_app: { url: webAppUrl } }
      ]
    ]
  };

  return {
    text: cleanText,
    keyboard: inlineKeyboard
  };
}

/**
 * Функция для ручной авторизации доступа к Календарю.
 * Запустите её из редактора Apps Script (кнопка "Выполнить"),
 * чтобы выдать права скрипту.
 */
function ARES_authCalendar() {
  var cal = CalendarApp.getDefaultCalendar();
  Logger.log("Успешный доступ к календарю: " + cal.getName());
}
