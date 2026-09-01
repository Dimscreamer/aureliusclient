/**
 * ==============================================================================
 * ⏰ MODULE REMINDERS v6.0 (SELF-CLEANING & PRECISE)
 * Фикс: Автоматическое удаление триггеров после срабатывания.
 * ==============================================================================
 */

/**
 * [ГЛАЗА АРЕСА: ТАЙМЕРЫ]
 */
function getRemindersContext(userText, history) {
  const lowerText = userText.toLowerCase();
  if (lowerText.match(/(напоминани|напомн|таймер|будильник|засеки|через|удали напоминание|удали таймер|удали все напоминания|удали первое|удали второе|удали третье|покажи.*напомин|покажи.*таймер)/)) {
    const activeTimers = DataEngine.reminders.getListNumbered();
    return `\n\n[ИНСТРУКЦИЯ ТАЙМЕРЫ]: Пользователь работает с напоминаниями.
Используй теги:
- Создать: [[TG_REMINDER: Текст | YYYY-MM-DD HH:mm:ss]] (вычисли время от текущего!)
- Удалить: [[DELETE_REMINDER: часть текста напоминания]] (достаточно ключевого слова!)
- Список: [[GET_REMINDERS]]

ПРАВИЛА УДАЛЕНИЯ:
— Если пользователь пишет "удали Шен" — используй [[DELETE_REMINDER: Шен]] (достаточно части текста!)
— Если пользователь пишет "удали первое" — найди #1 в списке ниже и возьми его ТЕКСТ для тега [[DELETE_REMINDER: текст]]
— Если пользователь пишет "удали второе" — найди #2 в списке ниже
— ВСЕГДА бери текст из списка ниже, НЕ выдумывай!

[АКТИВНЫЕ ТАЙМЕРЫ (с номерами)]:
${activeTimers}`;
  }
  return "";
}

function getRemindersRules() {
  return getPersonalityPrompt() + `

MODE: REMINDERS MODULE (напоминания и таймеры)
Ты сейчас в режиме управления напоминаниями.

РАЗРЕШЁННЫЕ ПРОТОКОЛЫ (ИСПОЛЬЗУЙ ТОЛЬКО JSON!):
— Создание: [[TG_REMINDER: {"_thought": "вычисляю время...", "title": "название", "time": "YYYY-MM-DD HH:mm:ss"}]]
— Удаление: [[DELETE_REMINDER: {"_thought": "ищу совпадение...", "keyword": "часть текста"}]]
— Список: [[GET_REMINDERS]]

КРИТИЧЕСКИЕ ПРАВИЛА (JSON Chain of Thought):
— Всегда пиши тег с валидным JSON внутри.
— Ключ \`_thought\` ОБЯЗАТЕЛЕН для вычисления времени! Опиши свои шаги, прибавь часы/минуты.
— КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать "Таймер установлен" обычным текстом.
— ВРЕМЯ ПО УМОЛЧАНИЮ: Если день указан, но время нет — ставь на 09:00:00. Если время вообще неясно ("напомни полить цветы"), прибавляй ровно 1 час к ТЕКУЩЕМУ ВРЕМЕНИ!
— Не выдумывай таймеры, если пользователь не просил.

ПРАВИЛО ВЫХОДА ИЗ ТУПИКА:
Если запрос пользователя НЕ связан с напоминаниями — ответь текстом: "Это вне зоны модуля напоминаний."`;
}

// ==============================================================================
// ⚙️ ОБРАБОТЧИКИ (HANDLERS)
// ==============================================================================

function handleGetReminders(aresResponse, parsedTags) {
  let tagFound = false;
  if (parsedTags) {
    for (var i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'GET_REMINDERS') {
        tagFound = true;
        aresResponse = aresResponse.replace(parsedTags[i].fullTag, "");
        break;
      }
    }
  }

  // Fallback
  if (!tagFound) {
    const match = aresResponse.match(/\[\[GET_REMINDERS.*?\]\]/i);
    if (!match) return aresResponse;
    aresResponse = aresResponse.replace(match[0], "");
  }

  const reminders = DataEngine.reminders.getList();
  const cleanBase = aresResponse.trim();
  let msg = "⏰ <b>АКТИВНЫЕ ТАЙМЕРЫ:</b>\n" + (reminders !== "Активных таймеров нет." ? reminders : "<i>Пусто.</i>");
  return (cleanBase ? cleanBase + "\n\n" : "") + msg;
}

function validateReminderData(title, dateTimeStr) {
  if (!title) return { success: false, error: "Отсутствует текст напоминания" };
  if (!dateTimeStr) return { success: false, error: "Отсутствует время" };
  if (!dateTimeStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    return { success: false, error: "Неверный формат времени. Ожидается YYYY-MM-DD HH:mm:ss" };
  }
  let targetDate = Utilities.parseDate(dateTimeStr, TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
  if (!targetDate) return { success: false, error: "Невозможно распарсить дату" };
  if (targetDate.getTime() <= new Date().getTime()) return { success: false, error: "Время уже прошло" };
  return { success: true };
}

function formatReminderOutput(results) {
  if (results.length === 0) return "";
  return results.join("\n\n");
}

function handleReminder(aresResponse, parsedTags, ctx) {
  let updatedResponse = aresResponse;
  let results = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'TG_REMINDER') {
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [MODULE_INTENT] → Установка таймера');
        
        let title = "Напоминание";
        let dateTimeStr = "";
        
        if (typeof t.payload === 'string') {
          if (t.payload.includes('|')) {
            let parts = t.payload.split('|').map(s => s.trim());
            title = parts[0];
            dateTimeStr = parts[1];
          } else {
            title = t.payload.trim();
          }
        } else if (typeof t.payload === 'object' && t.payload !== null) {
          title = t.payload.title || t.payload.text || "Напоминание";
          dateTimeStr = t.payload.time || t.payload.date || "";
        }
        
        const valid = validateReminderData(title, dateTimeStr);
        if (!valid.success) {
          if (typeof sysLog !== 'undefined') sysLog('⚠️ [WARNING]: [VALIDATION_ERROR] ' + valid.error);
          results.push(`❌ <b>ОШИБКА:</b> ${valid.error}`);
        } else {
          const res = DataEngine.reminders.schedule(title, dateTimeStr);
          if (res.success) {
            results.push(`⏰ <b>ТАЙМЕР ЗАРЯЖЕН:</b>\n└ ${title}\n📅 ${dateTimeStr}`);
          } else {
            results.push(`❌ <b>ОШИБКА АПИ:</b> ${res.error}`);
          }
        }
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  // Fallback for old format
  let matches = [...updatedResponse.matchAll(/\[\[TG_REMINDER:\s*(.*?)\s*\]\]/ig)];
  matches.forEach(m => {
    let content = m[1].trim();
    let title = "", dateTimeStr = "";
    if (content.startsWith('{')) {
      try {
        let j = JSON.parse(content);
        title = j.title; dateTimeStr = j.time;
      } catch(e) {}
    } else if (content.includes('|')) {
      [title, dateTimeStr] = content.split('|').map(s => s.trim());
    }
    
    if (title && dateTimeStr) {
      let valid = validateReminderData(title, dateTimeStr);
      if (valid.success) {
        DataEngine.reminders.schedule(title, dateTimeStr);
        results.push(`⏰ <b>ТАЙМЕР ЗАРЯЖЕН:</b>\n└ ${title}\n📅 ${dateTimeStr}`);
      }
    }
    updatedResponse = updatedResponse.replace(m[0], "").trim();
  });
  
  return (updatedResponse ? updatedResponse + "\n\n" : "") + formatReminderOutput(results);
}

function handleDeleteReminder(aresResponse, parsedTags, ctx) {
  let updatedResponse = aresResponse;
  let results = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'DELETE_REMINDER') {
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [MODULE_INTENT] → Удаление таймера');
        let textPart = t.payload.keyword || t.payload.text || "";
        if (DataEngine.reminders.deleteByText(textPart)) {
          results.push(textPart.toUpperCase());
        }
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  // Fallback
  let matches = [...updatedResponse.matchAll(/\[\[DELETE_REMINDER:\s*(.*?)\s*\]\]/ig)];
  matches.forEach(m => {
    let content = m[1].trim();
    let textPart = content;
    if (content.startsWith('{')) {
      try {
        let j = JSON.parse(content);
        textPart = j.keyword || j.text || content;
      } catch(e) {}
    }
    
    if (DataEngine.reminders.deleteByText(textPart)) results.push(textPart.toUpperCase());
    updatedResponse = updatedResponse.replace(m[0], "").trim();
  });
  
  if (results.length === 0) {
    let oldMatches = [...aresResponse.matchAll(/\[\[DELETE_REMINDER.*?\]\]/ig)];
    if (oldMatches.length > 0) return updatedResponse + "\n\n🗑 <b>УДАЛЕНО:</b> не найдено";
    return updatedResponse;
  }
  return updatedResponse + "\n\n🗑 <b>УДАЛЕНО:</b> " + results.join(", ");
}

// Removed triggers and functions, they are now in DataEngine.js
// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ
// ==============================================================================
function getRemindersIntent() {
  return `MODE: REMINDERS MODULE (напоминания и таймеры)
Ты сейчас в режиме установки напоминаний.`;
}

function getRemindersProtocols() {
  return `ПРАВИЛА:
— Вычисли точное время от [ТЕКУЩЕЕ ВРЕМЯ СЕРВЕРА].
— Используй JSON с ключом "_thought" внутри тега для расчетов.
— ЗАПРЕЩЕНО выдумывать подтверждения без выполнения тега.`;
}

// Утренняя карточка напоминаний
function getRemindersMorningCard() {
  try {
    var result = typeof handleGetReminders === 'function'
      ? handleGetReminders('[[GET_REMINDERS]]')
      : null;
    // Не показываем если нет напоминаний
    if (result && result.includes('не обнаружено')) return null;
    return result;
  } catch(e) { return null; }
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'reminders',
  enabled:  true,
  promptIntentFn:  'getRemindersIntent',
  promptProtocolsFn: 'getRemindersProtocols',
  contextFn: 'getRemindersContext',
  allowTextFallback: true,
  protocols: [
    { tag: '[[TG_REMINDER:',    handler: 'handleReminder',       desc: 'Создать напоминание: [[TG_REMINDER: Текст | YYYY-MM-DD HH:mm:ss]]' },
    { tag: '[[DELETE_REMINDER:',handler: 'handleDeleteReminder', desc: 'Удалить напоминание: [[DELETE_REMINDER: ключевое слово]]' },
    { tag: '[[GET_REMINDERS:',  handler: 'handleGetReminders',   desc: 'Получить список активных напоминаний: [[GET_REMINDERS]]' }
  ],
  allowedProtocols: ['[[TG_REMINDER:', '[[DELETE_REMINDER:', '[[GET_REMINDERS:'],
  sessionTimeout: 10,
  priority:       85,
  historyKey:     'history_general',
  morningCard:    'getRemindersMorningCard',
  morningOrder:   3
});
