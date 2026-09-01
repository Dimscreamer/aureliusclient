/**
 * ==============================================================================
 * 📰 MODULE NEWS v5.0 (MODULAR EYES, AI SUMMARY, TELEGRAM SCRAPER)
 * Информационный радар Ареса. Сбор, фильтрация и сухая аналитика.
 * ==============================================================================
 */

// ==============================================================================
// 👁️ БЛОК 1: "ГЛАЗА АРЕСА" (СИСТЕМНЫЙ КОНТЕКСТ)
// ==============================================================================

/**
 * [ГЛАЗА АРЕСА: НОВОСТИ]
 * Автономная функция. Вызывается из Core_Engine. 
 * Проверяет запрос на новости и жестко требует тег.
 */
function getNewsContext(userText, history) {
  const lowerText = userText.toLowerCase();
  if (lowerText.match(/(новост|что в мире|что нового|произошло|события|происходит|сводк|ситуаци|что сейчас|заголовк|последн)/)) {
    // Определяем, нужны ли списки ссылок или просто сухая выжимка
    let format = lowerText.match(/(заголовк|ссылк|стать|почитат|списк|спис|дай 5|дай 10|дай 15|дай 20)/) ? "HEADLINES" : "SUMMARY";
    return `\n\n[ИНСТРУКЦИЯ НОВОСТИ]: Пользователь запрашивает новости. Сформулируй ТОЧНЫЙ короткий поисковый запрос для Google News исходя из контекста беседы (например: 'Украинский теннис', 'ФК Ливерпуль', 'Илон Маск', 'Биткоин'). Если тема вообще не ясна, используй 'Главные новости'. ТЫ ОБЯЗАН ответить СТРОГО ТОЛЬКО тегом [[GET_NEWS: {"query": "ТвойЗапрос", "format": "${format}"}]]. Больше никаких слов.`;
  }
  return "";
}


// ==============================================================================
// ⚙️ БЛОК 2: ОБРАБОТЧИК ТЕГА И СБОРКА ОТЧЕТА
// ==============================================================================

/**
 * [ОБРАБОТЧИК: GET_NEWS]
 * Вызывается ядром, если Арес выдал тег. Собирает данные, пропускает через ИИ и выдает HTML.
 */
function handleNews(aresResponse, payload, input, parsedTags) {
  let newsTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (let i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'GET_NEWS') {
        newsTag = parsedTags[i];
        break;
      }
    }
  }

  let query = "Главные новости";
  let format = "SUMMARY";
  let cleanBase = aresResponse;

  if (payload && typeof payload === 'object' && payload.query) {
    query = payload.query;
    format = payload.format ? payload.format.toUpperCase() : "SUMMARY";
    const match = aresResponse.match(/\[\[GET_NEWS:[\s\S]*?\]\]/i);
    if (match) cleanBase = aresResponse.replace(match[0], "").trim();
  } else if (newsTag) {
    query = newsTag.payload.query || "Главные новости";
    format = newsTag.payload.format ? newsTag.payload.format.toUpperCase() : "SUMMARY";
    cleanBase = aresResponse.replace(newsTag.fullTag, "").trim();
  } else {
    const match = aresResponse.match(/\[\[GET_NEWS:\s*(.*?)(?:\s*\|\s*(.*?))?\s*\]\]/i);
    if (!match) return false;
    
    // Если по ошибке регулярка захватила JSON-строку
    if (match[1].trim().startsWith('{')) {
      try {
        let p = JSON.parse(match[1].trim());
        query = p.query || "Главные новости";
        format = p.format ? p.format.toUpperCase() : "SUMMARY";
      } catch(e) {
        query = match[1].trim();
        format = match[2] ? match[2].trim().toUpperCase() : "SUMMARY";
      }
    } else {
      query = match[1].trim();
      format = match[2] ? match[2].trim().toUpperCase() : "SUMMARY";
    }
    cleanBase = aresResponse.replace(match[0], "").trim();
  }
  
  sendAction(MY_ID, 'typing');
  
  // 1. Получаем реальный ТОП через Google News RSS (с учетом запроса)
  const rawNews = fetchGoogleNews(query);
  
  if (rawNews.includes("Ошибка доступа") || rawNews.includes("Новостей нет")) {
    return cleanBase + "\n\n⚠️ <b>СБОЙ СЕТИ:</b> " + rawNews;
  }

  // 2. Рерайт через ИИ (Gemini)
  const newsJson = rewriteNewsWithOpenRouter(rawNews, query, format);
  
  if (!newsJson) {
    return cleanBase + "\n\n⚠️ <b>ОШИБКА АНАЛИЗА:</b> Поток данных слишком плотный. Попробуй еще раз через минуту.";
  }
  
  // 3. Сборка Premium-отчета
  let finalReport = "";
  let body = "";
  
  if (format === "HEADLINES" && newsJson.news) {
    newsJson.news.forEach(item => {
      let safeTitle = String(item.title).replace(/</g, '«').replace(/>/g, '»');
      let safeText = String(item.text).replace(/</g, '«').replace(/>/g, '»');
      let source = item.source || "Google News";
      
      let rawUrl = item.url ? String(item.url).replace(/["']/g, "").trim().replace(/&/g, "&amp;") : "";
      let linkTag = rawUrl ? `<a href="${rawUrl}">${source}</a>` : source;
      
      body += `🔹 <b>${safeTitle.toUpperCase()}</b> [📰 ${linkTag} | 🕒 <code>${item.time}</code>]\n`;
      if (safeText && safeText.toLowerCase() !== "нет текста") {
        body += `<i>${safeText}</i>\n`;
      }
      body += `\n`;
    });
    
    let safeSummary = String(newsJson.summary || "").replace(/</g, '«').replace(/>/g, '»');
    let footer = safeSummary ? `АНАЛИТИКА АРЕСА: ${safeSummary}` : "";
    
    if (typeof aresFormatMessage === 'function') {
      finalReport = aresFormatMessage(`ИНФО-РАДАР: ${query.toUpperCase()}`, "📡", body, footer);
    } else {
      finalReport = `📡 <b>ИНФО-РАДАР: ${query.toUpperCase()}</b>\n\n${body}<i>${footer}</i>`;
    }
  } else {
    // Режим SUMMARY (полотно текста)
    let rawSummary = String(newsJson.summary || "");
    // Сохраняем разрешенные HTML-теги перед экранированием
    rawSummary = rawSummary.replace(/<b>/gi, '{{B}}').replace(/<\/b>/gi, '{{/B}}')
                           .replace(/<i>/gi, '{{I}}').replace(/<\/i>/gi, '{{/I}}')
                           .replace(/<br\s*\/?>/gi, '\n');
    
    // Экранируем все остальные потенциально опасные теги
    rawSummary = rawSummary.replace(/</g, '«').replace(/>/g, '»');
    
    // Возвращаем разрешенные теги
    let safeSummary = rawSummary.replace(/\{\{B\}\}/g, '<b>').replace(/\{\{\/B\}\}/g, '</b>')
                                .replace(/\{\{I\}\}/g, '<i>').replace(/\{\{\/I\}\}/g, '</i>');

    if (typeof aresFormatMessage === 'function') {
      finalReport = aresFormatMessage(`ИНФО-РАДАР: ${query.toUpperCase()} (СВОДКА)`, "📡", safeSummary, "");
    } else {
      finalReport = `📡 <b>ИНФО-РАДАР: ${query.toUpperCase()} (СВОДКА)</b>\n\n${safeSummary}`;
    }
  }

  return (cleanBase ? cleanBase + "\n\n" : "") + finalReport;
}


// ==============================================================================
// 🧠 БЛОК 3: НЕЙРО-РЕРАЙТЕР (JSON ENGINE)
// ==============================================================================

/**
 * [LLM АНАЛИЗАТОР НОВОСТЕЙ]
 * Превращает сырой текст парсера в структурированный JSON с объективной аналитикой.
 */
function rewriteNewsWithOpenRouter(rawText, query, format) {
  try {
    let prompt = "";
    
    if (format === "HEADLINES") {
      prompt = `
Ты — Арес, строгий цифровой советник. Твой стиль — холодная логика и абсолютная точность.
Прочитай предоставленные ТОП-НОВОСТИ по теме: ${query}.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. ЗАПРЕЩЕНО выдумывать факты, путать имена (например, тренеров) или объединять разные события в одно.
2. Используй ТОЛЬКО факты из сырого текста. Если новость кажется "кликбейтом", опиши реальную суть.
3. Отбери от 10 до 15 самых ВАЖНЫХ новостей. Мелкий инфошум пропускай.
4. Обязательно сохрани URL источника из сырых данных.

Ответь СТРОГО JSON:
{
  "news": [
    {
      "time": "время",
      "source": "источник",
      "url": "ссылка_url",
      "title": "ТОЧНЫЙ ЗАГОЛОВОК (БЕЗ ВЫДУМОК)",
      "text": "Суть (1-2 предложения, только голые факты)."
    }
  ],
  "summary": "Твой итоговый аналитический вывод по картине в целом (1-2 предложения)."
}
Выдай до 15 новостей.
`;
    } else {
      prompt = `
Ты — Арес, строгий цифровой советник. Твой стиль — холодная логика и абсолютная точность.
Прочитай предоставленные ТОП-НОВОСТИ по теме: ${query}.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. ЗАПРЕЩЕНО выдумывать факты, путать имена (например, тренеров) или объединять разные события в одно.
2. Используй ТОЛЬКО факты из сырого текста.

Твоя задача: написать УМНУЮ АНАЛИТИЧЕСКУЮ СВОДКУ по мотивам этих новостей.
Не нужно просто пересказывать события подряд или лепить все в один абзац.
Сделай выжимку: выдели главные тренды и ключевые инсайты.

Формат идеальной сводки:
1. <b>Главный вывод</b> (1-2 предложения об общей картине).
2. <b>Ключевые события:</b> (используй красивые буллиты 🔹 или • для разделения новостей, каждая важная новость — с новой строки).
3. <b>Тенденция/Итог</b> (к чему все идет).

Тебе запрещено выдавать URL ссылки. Только чистая аналитика.
Обязательно используй HTML теги <b>жирный</b> или <i>курсив</i> для выделения главных имен и цифр. НЕ ИСПОЛЬЗУЙ маркдаун (** или *), используй ТОЛЬКО HTML теги <b> и <i>. Переносы строк делай через \\n.

Ответь СТРОГО JSON:
{
  "summary": "Твоя умная сводка (текст с HTML тегами и буллитами)."
}
`;
    }
    
    const payload = {
      "model": MODEL,
      "messages": [
        { "role": "system", "content": "Ты выдаешь чистый JSON. Кратко, строго, профессионально. НИКАКОГО МАРКДАУНА в тексте." },
        { "role": "user", "content": prompt + "\n\nСЫРЫЕ ДАННЫЕ:\n" + rawText }
      ],
      "temperature": 0.2 // Снизили температуру для большей строгости
    };

    const res = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", {
      "method": "post", "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + OR_KEY },
      "payload": JSON.stringify(payload), "muteHttpExceptions": true
    });
    
    const responseText = JSON.parse(res.getContentText()).choices[0].message.content.trim();
    // Защита от того, что ИИ оборачивает JSON в маркдаун блоки
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) { 
    Logger.log("Ошибка JSON-генерации новостей: " + e.message);
    return null; 
  }
}


// ==============================================================================
// 🕸️ БЛОК 4: СКРЕЙПЕР (ПАРСИНГ TELEGRAM)
// ==============================================================================

/**
 * [ГЛУБОКИЙ ПОИСК ТОПА ЗА 24Ч]
 * Парсит канал УНИАН, собирает просмотры и выдает сырой текст.
 */
function fetchGoogleNews(query) {
  try {
    let url = "";
    if (!query || query.toLowerCase() === "украина" || query.toLowerCase() === "мир" || query.toLowerCase() === "общие") {
      url = "https://news.google.com/rss?hl=ru&gl=UA&ceid=UA:ru";
    } else {
      // Добавляем when:7d к запросу, чтобы отсечь новости 2-летней давности
      const safeQuery = encodeURIComponent(query + " when:7d");
      url = `https://news.google.com/rss/search?q=${safeQuery}&hl=ru&gl=UA&ceid=UA:ru`;
    }
    
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const xml = res.getContentText();
    
    const document = XmlService.parse(xml);
    const root = document.getRootElement();
    const channel = root.getChild('channel');
    
    if (!channel) {
      if (typeof sysLog !== 'undefined') sysLog('[NEWS_ERROR] Нет <channel>. XML: ' + xml.substring(0, 500));
      return "Новостей нет. XML: " + xml.substring(0, 200);
    }
    
    const items = channel.getChildren('item');
    if (items.length === 0) {
      if (typeof sysLog !== 'undefined') sysLog('[NEWS_ERROR] Нет <item>. XML: ' + xml.substring(0, 500));
      return "Новостей нет. XML: " + xml.substring(0, 200);
    }
    
    const topItems = items.slice(0, 30);
    let allNews = [];
    
    topItems.forEach(item => {
      const title = item.getChildText('title');
      const pubDateStr = item.getChildText('pubDate');
      const link = item.getChildText('link');
      const pubDate = new Date(pubDateStr);
      
      let source = item.getChildText('source');
      if (!source && title) {
        let parts = title.split(' - ');
        if (parts.length > 1) {
          source = parts.pop().trim();
        } else {
          source = "Google News";
        }
      }
      
      // Генерируем компактный URL для поиска, чтобы не раздувать размер сообщения (лимит Telegram).
      // Берем только первые 7 слов из заголовка и заменяем пробелы на плюсы, убираем спецсимволы.
      let shortTitle = title.split(' ').slice(0, 7).join('+').replace(/[^\wа-яА-ЯёЁїієґЇІЄҐ+]/gi, '');
      const directSearchUrl = "https://www.google.com/search?q=" + shortTitle;
      
      allNews.push({
        title: title,
        source: source,
        url: directSearchUrl,
        timeStr: Utilities.formatDate(pubDate, TIME_ZONE, "HH:mm")
      });
    });
    
    return allNews.map(item => `[🕒 ${item.timeStr} | 📰 ${item.source} | URL: ${item.url}]\n${item.title}`).join("\n\n---\n\n");
  } catch (e) {
    return "Ошибка доступа к ленте новостей: " + e.message;
  }
}


/**
 * [RAW DATA: WEATHER]
 * Вытягивает чистые данные из API погоды.
 */
function getWeatherRaw() {
  try {
    const weatherText = handleWeather("[[GET_WEATHER: Запорожье | NOW]]") || "";
    
    // Очищаем весь текст от HTML-тегов, чтобы они не двоились
    const cleanText = weatherText.replace(/<\/?[^>]+(>|$)/g, "");
    
    const tMatch = cleanText.match(/ТЕМПЕРАТУРА:\s*([+-]?\d+)/i);
    const cMatch = cleanText.match(/ОБСТАНОВКА:\s*([^🌡\n\r|—]+)/i);
    
    return {
      temp: tMatch ? tMatch[1] + "°C" : "6°C",
      condition: cMatch ? cMatch[1].trim() : "Ясно",
      dailyForecast: "днем до +8°C, к вечеру до +2°C, без осадков"
    };
  } catch (e) {
    return { temp: "6°C", condition: "Ясно", dailyForecast: "без изменений" };
  }
}
// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ
// ==============================================================================
function getNewsIntent() {
  return `MODE: NEWS MODULE (новости и сводки)
Ты сейчас в режиме новостной сводки.`;
}

function getNewsProtocols() {
  return `ПРАВИЛА: 
Если данные уже в контексте — суммаризируй их кратко.
ЗАПРЕЩЕНО выдумывать новости.`;
}

// Утренняя карточка новостей
function getNewsMorningCard() {
  try {
    return typeof handleNews === 'function'
      ? handleNews('[[GET_NEWS: {"query": "Украина"}]]', null, null, [{name: 'GET_NEWS', payload: {query: "Украина"}, fullTag: '[[GET_NEWS: {"query": "Украина"}]]'}])
      : null;
  } catch(e) { return null; }
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'news',
  enabled:  true,
  promptIntentFn:  'getNewsIntent',
  promptProtocolsFn: 'getNewsProtocols',
  contextFn: 'getNewsContext',
  protocols: [
    { tag: '[[GET_NEWS:', handler: 'handleNews', desc: 'Получить новости: [[GET_NEWS: {"query": "Украина"}]]' }
  ],
  allowedProtocols: ['[[GET_NEWS:'],
  sessionTimeout: 5,
  priority:       50,
  historyKey:     'history_general',
  morningCard:    'getNewsMorningCard',
  morningOrder:   4
});
