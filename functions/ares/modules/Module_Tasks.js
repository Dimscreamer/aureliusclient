/**
 * ==============================================================================
 * 🧠 Module_Tasks.js v10.0 [PLUGIN ARCHITECTURE]
 * Диспетчер задач: Google Tasks API + Permission Layer.
 *
 * Самодостаточный плагин. Промпт, контекст, обработчики и регистрация —
 * всё в этом файле. Для подключения: файл существует = модуль работает.
 * Для отключения: enabled: false (или удалить файл).
 * ==============================================================================
 */

// ==============================================================================
// 👁️ БЛОК 1: ГЛАЗА И ПРАВИЛА
// ==============================================================================

function tasksIntentResolverFn(text) {
  if (!text) return null;
  var l = text.toLowerCase();
  
  // Явные QUERY запросы -> BYPASS LLM (Экономия 100% токенов)
  if (l === 'мои задачи' || l === 'задачи на сегодня' || l === 'сводка задач' || l === 'что по задачам' || l === 'покажи задачи') {
    return {
      intent: 'QUERY',
      bypassLLM: true,
      tags: ['[[GET_TASKS: {"date": "today"}]]']
    };
  }
  
  if (l.indexOf('добав') !== -1 || l.indexOf('запиши') !== -1 || l.indexOf('создай') !== -1 || l.indexOf('напомни') !== -1) return 'ADD';
  if (l.indexOf('удал') !== -1 || l.indexOf('убери') !== -1) return 'DELETE';
  if (l.indexOf('очист') !== -1 || l.indexOf('сбрось') !== -1) return 'CLEAR';
  
  return 'QUERY'; // По умолчанию показываем задачи
}

/**
 * getTasksContext — контекст для Module Tasks.
 * Подгружает текущий список задач из Google Tasks.
 * Вызывается ТОЛЬКО когда активирован tasks module (через Orchestrator).
 */
function getTasksContext(userText, history) {
  const lowerText = userText.toLowerCase().trim();
  let filterDate = lowerText.includes("завтра") ? "TOMORROW" : "TODAY";

  let extra = `\n\n[ТЕКУЩИЕ ЗАДАЧИ В GOOGLE TASKS]:`;
  try {
    if (typeof fetchGoogleTasks === "function") {
      extra += "\n" + fetchGoogleTasks(filterDate, "Default");
    }
  } catch (e) {
    extra += "\n(Не удалось загрузить задачи)";
  }
  return extra;
}

// Совместимость
function getTasksRules() { return ""; }

// ==============================================================================
// ⚙️ БЛОК 2: ИНТУИТИВНЫЕ ОБРАБОТЧИКИ (HANDLERS)
// ==============================================================================

function handleGetTasks(aresResponse, parsedTags) {
  let filterDate = "TODAY";
  let listName = "Default";
  let tagFound = false;

  if (parsedTags && parsedTags.length > 0) {
    for (var i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'GET_TASKS') {
        filterDate = parsedTags[i].payload.date || "TODAY";
        tagFound = true;
        aresResponse = aresResponse.replace(parsedTags[i].fullTag, "");
        break;
      }
    }
  }

  // Fallback
  if (!tagFound) {
    const match = aresResponse.match(/\[\[GET_TASKS:\s*([^|\]]+)(?:\s*\|\s*([^|\]]+))?\s*\]\]/i);
    if (!match) return aresResponse;
    filterDate = match[1].trim();
    listName = match[2] ? match[2].trim() : "Default";
    aresResponse = aresResponse.replace(match[0], "");
  }

  if (filterDate.includes("ВСЕ") || filterDate.includes("ALL")) filterDate = "ALL";
  const tasksData = fetchGoogleTasks(filterDate, "Default");
  const cleanBase = aresResponse.trim();

  return (cleanBase ? cleanBase + "\n\n" : "") + 
         `📝 <b>РЕЕСТР ЗАДАЧ</b>\n📅 <code>${filterDate}</code>\n───\n${tasksData}\n───`;
}

function handleAddTask(aresResponse, parsedTags, ctx) {
  let updatedResponse = aresResponse;
  let results = [];
  
  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'ADD_TASK') {
        const title = t.payload.title || "Без названия";
        const date = t.payload.date || "today";
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Добавить задачу: ' + title);
        
        const success = addTaskToGoogle(title, date, "Default", ctx);
        if (success) {
          results.push(`✅ <b>ДОБАВЛЕНО:</b> <code>${title}</code>`);
        } else {
          results.push(`⚠️ <b>ОШИБКА:</b> Не удалось создать задачу <code>${title}</code>`);
        }
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  // Fallback
  let matches = [...aresResponse.matchAll(/\[\[ADD_TASK:\s*([^|\]]+)(?:\s*\|\s*([^|\]]+))?\s*\]\]/ig)];
  matches.forEach(m => {
    if (!updatedResponse.includes(m[0])) return;
    const title = m[1].trim();
    const date = m[2] ? m[2].trim() : "today";
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Добавить задачу: ' + title);
    const success = addTaskToGoogle(title, date, "Default", ctx);
    if (success) results.push(`✅ <b>ДОБАВЛЕНО:</b> <code>${title}</code>`);
    else results.push(`⚠️ <b>ОШИБКА:</b> Не удалось создать задачу <code>${title}</code>`);
    updatedResponse = updatedResponse.replace(m[0], "").trim();
  });
  
  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n");
}

function handleDeleteTask(aresResponse, parsedTags) {
  let updatedResponse = aresResponse;
  let results = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'DELETE_TASK') {
        let title = (t.payload.title || "").replace(/\[.*?\]/g, "").replace(/[📌📌🎯]/g, "").trim();
        if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Удалить задачу: ' + title);
        
        const success = deleteTaskFromGoogle(title);
        if (success) results.push(`🗑 <b>УДАЛЕНО:</b> <code>${title}</code>`);
        else results.push(`⚠️ <b>НЕ НАЙДЕНО:</b> <code>${title}</code>`);
        updatedResponse = updatedResponse.replace(t.fullTag, "").trim();
      }
    });
  }

  // Fallback
  let matches = [...aresResponse.matchAll(/\[\[DELETE_TASK:\s*(.*?)\s*\]\]/ig)];
  matches.forEach(m => {
    if (!updatedResponse.includes(m[0])) return;
    let title = m[1].trim().replace(/\[.*?\]/g, "").replace(/[📌📌🎯]/g, "").trim();
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Удалить задачу: ' + title);
    const success = deleteTaskFromGoogle(title);
    if (success) results.push(`🗑 <b>УДАЛЕНО:</b> <code>${title}</code>`);
    else results.push(`⚠️ <b>НЕ НАЙДЕНО:</b> <code>${title}</code>`);
    updatedResponse = updatedResponse.replace(m[0], "").trim();
  });
  
  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n");
}

function handleUpdateTask(aresResponse, parsedTags) {
  let updatedResponse = aresResponse;
  let results = [];

  // Fallback ONLY (JSON Not implemented as it's not used)
  let matches = [...aresResponse.matchAll(/\[\[UPDATE_TASK:\s*([^|]+)\|\s*([^|\]]+)(?:\|\s*([^\]]+))?\s*\]\]/ig)];
  matches.forEach(m => {
    const oldTitle = m[1].trim();
    const newTitle = m[2].trim();
    const newDate = m[3] ? m[3].trim() : "today";
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Обновить задачу: ' + oldTitle + ' -> ' + newTitle);
    
    const deleted = deleteTaskFromGoogle(oldTitle);
    if (deleted) {
      addTaskToGoogle(newTitle, newDate, "Default");
      results.push(`🔄 <b>ОБНОВЛЕНО:</b> <code>${oldTitle}</code> → <code>${newTitle}</code>`);
    } else {
      results.push(`⚠️ <b>НЕ НАЙДЕНО ДЛЯ ОБНОВЛЕНИЯ:</b> <code>${oldTitle}</code>`);
    }
    updatedResponse = updatedResponse.replace(m[0], "").trim();
  });
  
  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n");
}

function handleClearTasks(aresResponse, parsedTags) {
  let updatedResponse = aresResponse;
  let results = [];
  let filterDates = [];

  if (parsedTags && parsedTags.length > 0) {
    parsedTags.forEach(t => {
      if (t.name === 'CLEAR_TASKS') {
        let filterDate = (t.payload.date || "ALL").toUpperCase();
        if (filterDate.includes("ВСЕ") || filterDate.includes("ALL")) filterDate = "ALL";
        filterDates.push({ date: filterDate, tag: t.fullTag });
      }
    });
  }

  // Fallback
  let matches = [...aresResponse.matchAll(/\[\[CLEAR_TASKS:\s*(.*?)\s*\]\]/ig)];
  matches.forEach(m => {
    if (!updatedResponse.includes(m[0])) return;
    let filterDate = m[1].trim().toUpperCase();
    if (filterDate.includes("ВСЕ") || filterDate.includes("ALL")) filterDate = "ALL";
    filterDates.push({ date: filterDate, tag: m[0] });
  });

  if (filterDates.length === 0) return aresResponse;

  filterDates.forEach(fd => {
    let filterDate = fd.date;
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_INTENT] → Очистить задачи на: ' + filterDate);

    const listId = getTaskListId("Default");
    let clearedCount = 0;
    
    try {
      let pageToken;
      let items = [];
      do {
        const response = Tasks.Tasks.list(listId, {
          showCompleted: true, showHidden: true, maxResults: 100, pageToken: pageToken
        });
        if (response.items) items = items.concat(response.items);
        pageToken = response.nextPageToken;
      } while (pageToken);
      
      let targetStr = null;
      if (filterDate !== "ALL") {
        const nowStr = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
        targetStr = (filterDate === "TODAY") ? nowStr : filterDate;
        if (filterDate === "TOMORROW") {
          targetStr = Utilities.formatDate(new Date(Date.now() + 86400000), TIME_ZONE, "yyyy-MM-dd");
        }
      }
      
      items.forEach(task => {
        let matchDate = true;
        if (targetStr && task.due) {
          if (task.due.split('T')[0] !== targetStr) matchDate = false;
        } else if (targetStr && !task.due) {
          matchDate = false;
        }
        
        if (matchDate) {
          Tasks.Tasks.remove(listId, task.id);
          clearedCount++;
        }
      });
      results.push(`🧹 <b>ОЧИЩЕНО:</b> ${clearedCount} задач (Период: ${filterDate})`);
    } catch(e) {
      results.push(`⚠️ <b>ОШИБКА ОЧИСТКИ:</b> ${e.message}`);
    }
    updatedResponse = updatedResponse.replace(fd.tag, "").trim();
  });
  
  return (updatedResponse ? updatedResponse + "\n\n" : "") + results.join("\n");
}

// ==============================================================================
// 🔌 БЛОК 3: ЛОГИКА API (SMART SEARCH)
// ==============================================================================

function fetchGoogleTasks(filterDate, listName) {
  try {
    const listId = getTaskListId(listName);
    const tasks = Tasks.Tasks.list(listId, {showCompleted: false, maxResults: 100});
    if (!tasks.items || tasks.items.length === 0) return "<i>Задач нет.</i>";

    let filtered = tasks.items;
    if (filterDate !== "ALL") {
      const nowStr = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
      let target = (filterDate === "TODAY") ? nowStr : filterDate;
      if (filterDate === "TOMORROW") {
        target = Utilities.formatDate(new Date(Date.now() + 86400000), TIME_ZONE, "yyyy-MM-dd");
      }
      filtered = filtered.filter(t => t.due && t.due.split('T')[0] === target);
    }

    return filtered.length ? filtered.map(t => `📌 <b>${t.title}</b>`).join("\n") : "<i>На эту дату задач нет.</i>";
  } catch (e) { return "⚠️ Сбой API Tasks."; }
}

function addTaskToGoogle(title, date, listName, ctx) {
  try {
    const listId = getTaskListId(listName);
    const task = Tasks.newTask().setTitle(title);
    let d = new Date();
    
    // Безопасный парсинг даты
    if (!date || date.toLowerCase() === "default") {
      // Ничего не делаем, дата останется "сегодня"
    } else if (date.toLowerCase().includes("tomor")) {
      d.setDate(d.getDate() + 1);
    } else if (!date.toLowerCase().includes("tod")) {
      const parsedDate = new Date(date.split('T')[0]);
      if (!isNaN(parsedDate.getTime())) {
        d = parsedDate;
      }
    }
    
    // Надежная привязка к часовому поясу: извлекаем точную дату и жестко ставим UTC 00:00,
    // что предотвращает скачок на прошлый день при сохранении в Google Tasks
    const localDateStr = Utilities.formatDate(d, (typeof TIME_ZONE !== 'undefined' ? TIME_ZONE : "Europe/Kiev"), "yyyy-MM-dd");
    task.setDue(localDateStr + "T00:00:00.000Z");
    
    const result = Tasks.Tasks.insert(task, listId);
    if (typeof sysLog !== 'undefined') sysLog('✅ [API_WRITE]: Записано в Google Tasks (Список: ' + listName + '). Задача: ' + title);
    if (ctx && ctx.trace) ctx.trace.stage('API_WRITE', { api: 'Google Tasks', list: listName, task: title });
    return result;
  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: [TASKS_API] Ошибка при создании задачи: ' + e.message);
    return null;
  }
}

function deleteTaskFromGoogle(title) {
  try {
    const listId = "@default"; 
    const tasks = Tasks.Tasks.list(listId, {showCompleted: false, maxResults: 100});
    if (!tasks.items || tasks.items.length === 0) return false;

    // Очистка и нормализация поискового запроса
    let search = title.toLowerCase().trim();
    search = search.replace(/^[📌📌🎯\s-]+/g, "").trim(); // Убираем эмодзи из начала
    search = search.replace(/\s+/g, " "); // Нормализуем пробелы

    Logger.log("[DELETE_TASK] Поиск: " + search);

    const task = tasks.items.find(t => {
      if (!t.title) return false;
      const tTitle = t.title.toLowerCase().trim().replace(/^[📌📌🎯\s-]+/g, "").trim();
      
      // Нечеткое вхождение: либо заголовок содержит поиск, либо поиск содержит заголовок
      return tTitle.includes(search) || search.includes(tTitle);
    });
    
    if (task) { 
      Logger.log("[DELETE_TASK] Найдена задача: " + task.title + " (ID: " + task.id + ")");
      if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_API] Задача найдена и удалена: ' + task.title);
      Tasks.Tasks.remove(listId, task.id); 
      return true; 
    }
    Logger.log("[DELETE_TASK] Задача не найдена в списке.");
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [TASKS_API] Задача не найдена для удаления.');
    return false;
  } catch(e) { 
    Logger.log("[DELETE_TASK] Ошибка: " + e.message);
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: [TASKS_API] Ошибка при удалении задачи: ' + e.message);
    return false; 
  }
}

function getTaskListId(name) {
  if (!name || name.toLowerCase() === "default") return "@default";
  try {
    const lists = Tasks.Tasklists.list().items;
    const found = lists.find(l => l.title.toLowerCase().includes(name.toLowerCase()));
    return found ? found.id : "@default";
  } catch (e) { return "@default"; }
}

// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ (перенесён из Prompt.js в v10.0)
// ==============================================================================
function getTasksModuleIntent() {
  return `MODE: TASK MODULE (управление задачами)
Ты сейчас в режиме управления задачами Google Tasks.`;
}

function getTasksModuleProtocols() {
  return `ПРАВИЛА:
— ДОБАВЛЕНИЕ: ТОЛЬКО тег [[ADD_TASK: Название | Дата]]. В качестве даты используй TODAY, TOMORROW или формат YYYY-MM-DD. Никакого обычного текста!
— НАЗВАНИЕ ЗАДАЧИ: Извлекай ТОЧНУЮ суть из запроса (например: "добавь задачу купить молоко" -> Название: "Купить молоко", а НЕ "Добавить задачу").
— ЗАПРОС СПИСКА: ТОЛЬКО ТЕГ [[GET_TASKS: TODAY | Default]].
— УДАЛЕНИЕ 1 ЗАДАЧИ: ТОЛЬКО ТЕГ [[DELETE_TASK: Точное название]].
— УДАЛЕНИЕ ВСЕХ ЗАДАЧ: Если просят удалить "все задачи на сегодня" или "очистить день", используй ТОЛЬКО ТЕГ [[CLEAR_TASKS: TODAY]] или [[CLEAR_TASKS: TOMORROW]].
КРИТИЧЕСКИ ВАЖНО: НИКОГДА НЕ ЗАПРАШИВАЙ СПИСОК ЗАДАЧ ПЕРЕД ОЧИСТКОЙ! СРАЗУ ВЫДАВАЙ ТЕГ [[CLEAR_TASKS: TODAY]].
— ВАЖНО: Google Tasks не поддерживает время. Если сказано "на 11 утра", пиши это в название задачи.
— АНТИ-ГАЛЛЮЦИНАЦИЯ: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ВЫДУМЫВАТЬ НЕСУЩЕСТВУЮЩИЕ ЗАДАЧИ или называть задачу словами "Добавить задачу".
— КРИТИЧЕСКИ: ТЕБЕ СТРОЖАЙШЕ ЗАПРЕЩЕНО ПИСАТЬ ФРАЗЫ "УДАЛЕНО", "ДОБАВЛЕНО" или "ЗАФИКСИРОВАНО"! Эти слова система сгенерирует сама после выполнения тега. Если ты напишешь эти слова текстом без тега, система сломается и задачи не сохранятся! Твой ответ должен содержать ТОЛЬКО тег.`;
}

// Утренняя сводка задач (для Protocol_GoodMorning.js)
function getTasksMorningCard() {
  try {
    return handleGetTasks('[[GET_TASKS: TODAY | Default]]');
  } catch(e) { return null; }
}

// ==============================================================================
// 🔌 SELF-REGISTRATION — регистрация в реестре при загрузке скрипта
// ==============================================================================
registerModule({
  name:     'tasks',
  enabled:  true,
  intentResolverFn: 'tasksIntentResolverFn',
  promptIntentFn: 'getTasksModuleIntent',
  promptProtocolsFn: 'getTasksModuleProtocols',
  contextFn: 'getTasksContext',
  allowTextFallback: true,
  protocols: [
    { tag: '[[ADD_TASK:',    handler: 'handleAddTask',    desc: 'Добавить задачу: [[ADD_TASK: {"title": "Название", "date": "TODAY/TOMORROW/YYYY-MM-DD"}]]' },
    { tag: '[[GET_TASKS:',   handler: 'handleGetTasks',   desc: 'Список задач: [[GET_TASKS: {"date": "TODAY"}]]' },
    { tag: '[[UPDATE_TASK:', handler: 'handleUpdateTask', desc: 'Обновить задачу (сейчас не используется)' },
    { tag: '[[DELETE_TASK:', handler: 'handleDeleteTask', desc: 'Удалить задачу: [[DELETE_TASK: {"title": "Точное название"}]]' },
    { tag: '[[CLEAR_TASKS:', handler: 'handleClearTasks', desc: 'Удалить все задачи за день: [[CLEAR_TASKS: {"date": "TODAY/TOMORROW/ALL"}]]' }
  ],
  allowedProtocols: [
    '[[ADD_TASK:', '[[GET_TASKS:', '[[DELETE_TASK:', '[[UPDATE_TASK:', '[[CLEAR_TASKS:',
    '[[TG_REMINDER:', '[[DELETE_REMINDER:', '[[GET_REMINDERS]]'
  ],
  sessionTimeout: 15,
  priority:       70,
  historyKey:     'history_tasks',
  morningCard:    'getTasksMorningCard',
  morningOrder:   2
});