/**
 * ==============================================================================
 * 📈 MODULE ADS v6.1 (INTENT-BASED, SMART CONTEXT, AI AUDITS, ANTI-HALLUCINATION)
 * Маркетинговый радар Ареса. Вывод статистики, конверсий, кампаний и ИИ-аудит.
 * ==============================================================================
 */

// ==============================================================================
// 👁️ БЛОК 1: ГЛАЗА АРЕСА (ОПРЕДЕЛЕНИЕ ИНТЕНТА БЕЗ ЗАГРУЗКИ ТАБЛИЦ)
// ==============================================================================

function getAdsContext(userText, history) {
  try {
    let lowerText = userText.toLowerCase();

    // 1. ИЩЕМ ENTITIES (Проекты) из ГЛОБАЛЬНОГО РЕЕСТРА
    let searchWords = [];
    const normalizedText = lowerText
      .replace(/ё/g, 'е')
      .replace(/[«»"'.,;:!?()\[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    function normalizeKeywords(text) {
      return text.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-z0-9а-я\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isEntityTokenMatch(token, aliasToken) {
      if (token === aliasToken) return true;
      if (token.startsWith(aliasToken) && token.length > aliasToken.length && token.length - aliasToken.length <= 5) {
        return /^[а-я]+$/.test(token.slice(aliasToken.length));
      }
      return false;
    }

    function matchAdsEntity(text, alias) {
      const normalizedAlias = normalizeKeywords(alias);
      const textTokens = text.split(' ').filter(Boolean);
      const aliasTokens = normalizedAlias.split(' ').filter(Boolean);

      if (aliasTokens.length === 0) return false;

      for (let i = 0; i <= textTokens.length - aliasTokens.length; i++) {
        let matched = true;
        for (let j = 0; j < aliasTokens.length; j++) {
          const token = textTokens[i + j];
          const aliasToken = aliasTokens[j];
          if (j === aliasTokens.length - 1) {
            if (!isEntityTokenMatch(token, aliasToken)) {
              matched = false;
              break;
            }
          } else {
            if (token !== aliasToken) {
              matched = false;
              break;
            }
          }
        }
        if (matched) return true;
      }
      return false;
    }

    if (typeof getEntityRegistry === 'function') {
      var entityRegistry = getEntityRegistry();
      if (entityRegistry && entityRegistry['ads']) {
        var adsEntities = entityRegistry['ads'] || [];
        searchWords = adsEntities.filter(function(k) { return matchAdsEntity(normalizedText, k); });

        // Память: ищем проект в 3-х последних сообщениях
        if (searchWords.length === 0 && history && history.length) {
          var recent = history.slice(-3).map(function(h) { return h.content.toLowerCase(); }).join(' ');
          var normalizedRecent = recent
            .replace(/ё/g, 'е')
            .replace(/[«»"'.,;:!?()\[\]{}]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          searchWords = adsEntities.filter(function(k) { return matchAdsEntity(normalizedRecent, k); });
        }
      }
    }

    // Проверка на запрос общей сводки (без проекта)
    const isGeneralAds = lowerText.match(/(сводк|реклам|адс|ads|трафик|статистик|аналитик|показатели|маркетинг)/);

    // Спим, если нет явного фокуса
    if (searchWords.length === 0 && !isGeneralAds) return "";

    let projectStr = searchWords.length > 0 ? searchWords[0] : "ALL";
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [ADS_CONTEXT] Распознан проект: ' + projectStr);

    return `\n\n[СИСТЕМНАЯ ИНСТРУКЦИЯ ДЛЯ ADS]:
Пользователь обращается к рекламной аналитике.
ПРОЕКТ В ФОКУСЕ: ${projectStr}
Используй это название проекта (или ALL) в качестве параметра ПРОЕКТ при вызове тегов.
Твой ответ должен содержать ТОЛЬКО тег и ничего больше!`;

  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: [ADS_CONTEXT] Краш в getAdsContext: ' + e.message + ' | Stack: ' + e.stack);
    Logger.log("Ошибка Глаз ADS: " + e.message);
    return "\n[ДАННЫЕ ADS]: Ошибка доступа к базе данных.";
  }
}

// ==============================================================================
// 🧠 БЛОК 2: ПРАВИЛА ДЛЯ ПРОМПТА
// ==============================================================================

function getAdsIntent() {
  return `MODE: ADS MODULE (Маркетинг)
Ты Аналитик Google Ads Ареса.`;
}

function getAdsProtocols() {
  return `// МОДУЛЬ: GOOGLE ADS (МАРКЕТИНГ)
— ОТВЕЧАЙ СТРОГО ОДНИМ ТЕГОМ В ФОРМАТЕ [[TAG_NAME: ПРОЕКТ | ПЕРИОД | ДОП_ПАРАМЕТР]].
— Не отвечай текстом вместе с тегом, только тег.
— Не выдумывай названия тегов (например, не пиши ADS_AUDIT_Viktoria_MONTH, используй |).`;
}


// ==============================================================================
// 🛠️ БЛОК 3: ХЕЛПЕРЫ ДЛЯ РАБОТЫ С ТАБЛИЦЕЙ
// ==============================================================================

function _fetchAdsTab(tabName) {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    return ss.getSheetByName(tabName).getDataRange().getDisplayValues();
  } catch(e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: [ADS_API] Ошибка доступа к вкладке ' + tabName);
    return [];
  }
}

function _resolveAdsAccountName(alias) {
  if (!alias || alias === "ALL") return "ALL";
  const aliasLower = alias.toLowerCase();
  const mapping = {
    "номад": "Nomad-Office.kz Orange",
    "nomad": "Nomad-Office.kz Orange",
    "nomad office": "Nomad-Office.kz Orange",
    "nomd": "Nomad-Office.kz Orange",
    "виктория": "Viktoria Seidenberg",
    "viktoria": "Viktoria Seidenberg",
    "вика": "Viktoria Seidenberg",
    "victoria": "Viktoria Seidenberg",
    "асай": "Asay",
    "asay": "Asay",
    "eurostyle": "Eurostyle",
    "euro": "Eurostyle",
    "кобландин": "Koblandinclinic.kz",
    "koblandinclinic": "Koblandinclinic.kz",
    "alarm": "alarm.in.ua",
    "alarm.in.ua": "alarm.in.ua",
    "dress": "dress-course.online",
    "dress-course.online": "dress-course.online",
    "stelio": "stelio.com.ua",
    "барбер": "Барбер_ЗП",
    "window bau": "Window Bau | Premium Montage von Fenstern, Glas & Schiebesystemen in Österreich",
    "гид амстердам": "New_Гид_Амстердам"
  };
  
  for (let key in mapping) {
    if (aliasLower.includes(key)) {
      return mapping[key];
    }
  }
  return alias; // Fallback
}


// ==============================================================================
// ⚙️ БЛОК 4: ОБРАБОТЧИКИ (HANDLERS)
// ==============================================================================

function parseAdsTag(aresResponse, parsedTags, tagName) {
  let period = "LAST_30_DAYS"; // default
  let filter = "ALL";
  let project = "ALL";
  let cleanBase = aresResponse;
  let tagFound = false;

  if (parsedTags && parsedTags.length > 0) {
    for (var i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === tagName) {
        tagFound = true;
        cleanBase = aresResponse.replace(parsedTags[i].fullTag, "").trim();
        period = parsedTags[i].payload.period || "LAST_30_DAYS";
        project = parsedTags[i].payload.project || "ALL";
        if (parsedTags[i].payload.filter) filter = parsedTags[i].payload.filter;
        break;
      }
    }
  }

  // Fallback
  if (!tagFound) {
    const prefixRegex = "\\[\\[" + tagName.replace(/\[/g, '\\[');
    const regex = new RegExp(`${prefixRegex}[_:\\s]*(.*?)\\]\\]`, 'i');
    const match = aresResponse.match(regex);
    if (!match) return null;
    
    cleanBase = aresResponse.replace(match[0], "").trim();
    let innerContent = match[1]; // e.g. "CONVERSIONS_MONTH_BARBER" or "Viktoria | LAST_30_DAYS"
    
    const periods = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "90_DAYS"];
    for (let p of periods) {
      if (innerContent.toUpperCase().includes(p)) {
        period = p;
        innerContent = innerContent.replace(new RegExp(`[|_\\s]*${p}[|_\\s]*`, 'i'), '');
        break;
      } else if (p === "LAST_30_DAYS" && innerContent.toUpperCase().includes("MONTH")) {
        period = p;
        innerContent = innerContent.replace(/[|_\s]*MONTH[|_\s]*/i, '');
        break;
      } else if (p === "LAST_7_DAYS" && innerContent.toUpperCase().includes("WEEK")) {
        period = p;
        innerContent = innerContent.replace(/[|_\s]*WEEK[|_\s]*/i, '');
        break;
      }
    }
    
    if (innerContent.toUpperCase().includes("CONVERSION")) {
      filter = "ONLY_CONVERSIONS";
      innerContent = innerContent.replace(/[|_\s]*ONLY_CONVERSIONS[|_\s]*/i, '');
      innerContent = innerContent.replace(/[|_\s]*CONVERSIONS?[|_\s]*/i, '');
    } else if (innerContent.toUpperCase().includes("ALL")) {
      innerContent = innerContent.replace(/[|_\s]*ALL[|_\s]*/i, '');
    }
    
    let proj = innerContent.replace(/^[|_\s]+|[|_\s]+$/g, '');
    if (proj) project = proj;
  }
  
  return {
    cleanBase: cleanBase,
    project: project,
    period: period,
    filter: filter
  };
}

function handleAdsOverview(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_OVERVIEW");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  let param = parsed.period;

  if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [ADS_INTENT] → Общая сводка: ' + param);
  sendAction(MY_ID, 'typing');

  const data = _fetchAdsTab('Stats');
  if (data.length < 2) return cleanBase + "\n\n⚠️ <b>ОШИБКА БАЗЫ ADS:</b> Данных нет.";

  let report = `📊 <b>СВОДКА ВСЕХ АККАУНТОВ (${param}):</b>\n\n`;
  let found = false;

  data.slice(1).forEach(r => {
    if (r[1] === param && parseFloat((r[4]||"0").replace(',','.')) > 0) {
      report += `🏢 <b>${r[0]}</b>\n`;
      report += `💰 Расход: <code>${r[4]} ${r[9]}</code> | 🎯 Лиды: <code>${r[5]}</code> | 💎 CPA: <code>${r[8]}</code>\n\n`;
      found = true;
    }
  });

  const footer = "💡 <i>Чтобы увидеть конверсии, ключи или аудит, назови проект.</i>";
  let finalMsg = found ? report + footer : `📊 <b>ADS РАДАР:</b> Трафика за ${param} не обнаружено.`;
  return (cleanBase ? cleanBase + "\n\n" : "") + finalMsg;
}

function handleAdsProjectStats(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_PROJECT_STATS");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  const accName = _resolveAdsAccountName(parsed.project);
  const param = parsed.period;

  if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [ADS_INTENT] → Статистика проекта ${accName} за ${param}`);
  sendAction(MY_ID, 'typing');

  const data = _fetchAdsTab('Stats');
  const rows = data.slice(1).filter(r => r[0] === accName && r[1] === param);
  
  if (rows.length === 0) return cleanBase + `\n\n📉 <b>ОТЧЕТ ПО ПРОЕКТУ ${accName} (${param})</b>\nДанных в таблице Stats нет.`;

  const r = rows[0];
  let report = `📉 <b>ОТЧЕТ ПО ПРОЕКТУ: ${accName} (${param})</b>\n───\n`;
  report += `💰 <b>Расход:</b> <code>${r[4]} ${r[9]}</code>\n`;
  report += `🎯 <b>Конверсии (Лиды):</b> <code>${r[5]}</code>\n`;
  report += `💎 <b>CPA (Цена лида):</b> <code>${r[8]}</code>\n`;
  report += `🖱 <b>Клики:</b> <code>${r[3]}</code> | <b>CTR:</b> <code>${r[6]}</code> | <b>CPC:</b> <code>${r[7]}</code>\n`;

  return (cleanBase ? cleanBase + "\n\n" : "") + report;
}

function handleAdsConversions(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_CONVERSIONS");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  const accName = _resolveAdsAccountName(parsed.project);
  const param = parsed.period;

  if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [ADS_INTENT] → Конверсии ${accName} за ${param}`);
  sendAction(MY_ID, 'typing');

  const data = _fetchAdsTab('conversions');
  if (data.length < 2) return cleanBase + "\n\n⚠️ Вкладка conversions пуста или недоступна.";

  const rows = data.slice(1).filter(r => r[0] === accName && r[1] === param);
  
  let report = `🎯 <b>ИСТОЧНИКИ КОНВЕРСИЙ: ${accName} (${param})</b>\n───\n`;
  if (rows.length === 0) {
    report += "Конверсий за этот период не зафиксировано (либо они еще не загружены в таблицу).";
  } else {
    rows.forEach(r => {
      report += `🔹 ${r[2]}: <b>${r[3]}</b>\n`;
    });
  }

  return (cleanBase ? cleanBase + "\n\n" : "") + report;
}

function handleAdsQueries(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_QUERIES");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  const accName = _resolveAdsAccountName(parsed.project);
  const param = parsed.period;
  const filter = parsed.filter;

  if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [ADS_INTENT] → Поисковые запросы ${accName} за ${param} (Filter: ${filter})`);
  sendAction(MY_ID, 'typing');

  const data = _fetchAdsTab('Queries');
  let rows = data.slice(1).filter(r => r[0] === accName && r[1] === param);

  if (filter === "ONLY_CONVERSIONS") {
    rows = rows.filter(r => parseFloat((r[6]||"0").replace(',','.')) > 0);
  } else {
    // Сортировка по расходу
    rows.sort((a, b) => parseFloat((b[5]||"0").replace(',','.')) - parseFloat((a[5]||"0").replace(',','.')));
  }

  let report = `🔍 <b>ПОИСКОВЫЕ ЗАПРОСЫ: ${accName} (${param})</b>\n───\n`;
  if (rows.length === 0) {
    report += "Запросов по заданному фильтру нет.";
  } else {
    // Берем топ 15
    rows.slice(0, 15).forEach(r => {
      let icon = parseFloat((r[6]||"0").replace(',','.')) > 0 ? "🔥" : "➖";
      report += `${icon} <b>${r[2]}</b> (Клики: ${r[3]}, Расход: ${r[5]}, Конв: ${r[6]})\n`;
    });
  }

  return (cleanBase ? cleanBase + "\n\n" : "") + report;
}

function handleAdsCampaigns(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_CAMPAIGNS");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  const accName = _resolveAdsAccountName(parsed.project);
  const param = parsed.period;

  if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [ADS_INTENT] → Кампании ${accName} за ${param}`);
  sendAction(MY_ID, 'typing');

  const data = _fetchAdsTab('Campaigns');
  const rows = data.slice(1).filter(r => r[0] === accName && r[1] === param);

  let report = `📈 <b>КАМПАНИИ: ${accName} (${param})</b>\n───\n`;
  if (rows.length === 0) {
    report += "Нет данных по кампаниям за этот период.";
  } else {
    rows.forEach(r => {
      report += `🔹 <b>${r[1]}</b> (${r[3]})\n`;
      report += `   Расход: ${r[5]} | Лиды: ${r[6]} | CPA: ${r[7]} | Пот. показов: ${r[8]}\n`;
    });
  }

  return (cleanBase ? cleanBase + "\n\n" : "") + report;
}

function handleAdsAudit(aresResponse, parsedTags) {
  const parsed = parseAdsTag(aresResponse, parsedTags, "ADS_AUDIT");
  if (!parsed) return aresResponse;

  const cleanBase = parsed.cleanBase;
  const accName = _resolveAdsAccountName(parsed.project);
  const param = parsed.period;

  if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [ADS_INTENT] → ГЛУБОКИЙ АУДИТ ИИ ${accName} за ${param}`);
  sendAction(MY_ID, 'typing');

  // Собираем ВСЕ данные
  const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  
  const stats = ss.getSheetByName('Stats').getDataRange().getDisplayValues().slice(1).filter(r => r[0] === accName);
  const convs = ss.getSheetByName('conversions').getDataRange().getDisplayValues().slice(1).filter(r => r[0] === accName && r[1] === param);
  
  // Берем топ 20 ключей
  const queries = ss.getSheetByName('Queries').getDataRange().getDisplayValues().slice(1).filter(r => r[0] === accName && r[1] === param);
  queries.sort((a,b) => parseFloat((b[5]||"0").replace(',','.')) - parseFloat((a[5]||"0").replace(',','.')));
  const topQueries = queries.slice(0,20);
  
  const camps = ss.getSheetByName('Campaigns').getDataRange().getDisplayValues().slice(1).filter(r => r[0] === accName && r[1] === param);

  let dataStr = `ОТЧЕТ ПО АУДИТУ ДЛЯ ${accName} (ПЕРИОД: ${param})\n\n`;
  dataStr += `1. ОБЩАЯ СТАТИСТИКА (ИСТОРИЯ):\n`;
  stats.forEach(r => { dataStr += `[${r[1]}] Расход: ${r[4]}, Лиды: ${r[5]}, CPA: ${r[8]}, CTR: ${r[6]}\n`; });
  
  dataStr += `\n2. КОНВЕРСИИ (${param}):\n`;
  convs.forEach(r => { dataStr += `- ${r[2]}: ${r[3]}\n`; });

  dataStr += `\n3. КАМПАНИИ (${param}):\n`;
  camps.forEach(r => { dataStr += `- ${r[1]} (${r[3]}): Расход ${r[5]}, Лиды ${r[6]}, CPA ${r[7]}, Пот.показов ${r[8]}\n`; });

  dataStr += `\n4. ТОП-20 ПОИСКОВЫХ ЗАПРОСОВ ПО РАСХОДУ (${param}):\n`;
  topQueries.forEach(r => { dataStr += `- "${r[2]}": Клики ${r[3]}, Расход ${r[5]}, Лиды ${r[6]}\n`; });

  const aiPrompt = `
Ты — Senior PPC Media Buyer. Твоя задача провести профессиональный аудит проекта.
У тебя есть сырые данные из базы по проекту ${accName} за период ${param}.
ДАННЫЕ (ВЗЯТЫ ИЗ ТАБЛИЦЫ):
${dataStr}

НАПИШИ АУДИТ. Структура:
1. КРАТКИЙ СТАТУС: (все ок, падение, рост - в 1-2 предложениях).
2. АНОМАЛИИ: (Например, какая-то кампания сжирает бюджет без лидов, ключ жрет деньги, или упали конверсии. Укажи конкретные цифры).
3. ЖЕСТКИЕ РЕКОМЕНДАЦИИ. Что нужно сделать прямо сейчас (отключить ключ, перераспределить бюджет и т.д.).

КРИТИЧЕСКИЕ ПРАВИЛА:
- Пиши по делу, без "воды", как профи.
- Оперируй ТОЛЬКО ТОЧНЫМИ ЦИФРАМИ из данных. ЗАПРЕЩЕНО писать "приблизительно" или "~".
- СТРОГО ЗАПРЕЩЕНО выдумывать профессию, бизнес или гео проекта, если этого нет в данных. Если не уверен в нише — не пиши.
- Используй HTML-теги <b> и <code> для форматирования. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ МАРКДАУН (**).
- Если данных нет (например, 0 лидов) — так и скажи "Лидов нет", не выдумывай их!
`;

  try {
    if (typeof sysLog !== 'undefined') sysLog('🐛 [DEBUG]: [ADS_API] Отправка данных на ИИ аудит (askAres)...');
    
    // Вместо прямого UrlFetchApp лучше использовать функцию askAres, если она доступна в глобальном скоупе.
    // Но так как у нас в askAres зашита логика session/history, для чистого вызова лучше сделать прямой запрос к OpenRouter
    // с нужным промптом, чтобы не зациклить систему.
    
    const payload = {
      "model": MODEL,
      "messages": [
        { "role": "system", "content": "Ты Senior Google Ads Expert. Выдаешь мощные, структурированные и точные аудиты. Для форматирования используй ТОЛЬКО разрешенные теги Telegram HTML: <b>, <i>, <u>, <code>. Категорически запрещено использовать разметку веб-страниц (h1, h2, p, ul, li), а также оборачивать весь текст в блоки кода (три обратных апострофа)." },
        { "role": "user", "content": aiPrompt }
      ],
      "temperature": 0.3 
    };

    const startTime = new Date().getTime();
    const res = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", {
      "method": "post", 
      "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + OR_KEY },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });
    const endTime = new Date().getTime();
    
    if (typeof sysLog !== 'undefined') sysLog(`🐛 [DEBUG]: [AI_BRIDGE] (Deep Audit) Ответ от ИИ получен за ${endTime - startTime} мс.`);

    const responseText = JSON.parse(res.getContentText()).choices[0].message.content.trim();
    
    let report = `🧠 <b>ГЛУБОКИЙ AI-АУДИТ: ${accName} (${param})</b>\n───\n`;
    report += responseText;

    return (cleanBase ? cleanBase + "\n\n" : "") + report;

  } catch (e) {
    if (typeof sysLog !== 'undefined') sysLog('⚠️ [ERROR]: [ADS_API] Сбой при генерации аудита: ' + e.message);
    return cleanBase + "\n\n⚠️ <b>ОШИБКА ГЕНЕРАЦИИ АУДИТА:</b> " + e.message;
  }
}

// Утренняя сводка Ads
function getAdsMorningCard() {
  try {
    return handleAdsOverview("[[ADS_OVERVIEW: YESTERDAY]]", []);
  } catch(e) { return null; }
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'ads',
  enabled:  true,
  promptIntentFn:  'getAdsIntent',
  promptProtocolsFn: 'getAdsProtocols',
  contextFn: 'getAdsContext',
  protocols: [
    { tag: '[[ADS_OVERVIEW:', handler: 'handleAdsOverview', desc: 'Общая сводка: [[ADS_OVERVIEW: {"period": "TODAY/LAST_30_DAYS"}]]' },
    { tag: '[[ADS_PROJECT_STATS:', handler: 'handleAdsProjectStats', desc: 'Статистика проекта: [[ADS_PROJECT_STATS: {"project": "Проект", "period": "TODAY"}]]' },
    { tag: '[[ADS_CONVERSIONS:', handler: 'handleAdsConversions', desc: 'Если просят конверсии: [[ADS_CONVERSIONS: {"project": "Проект", "period": "TODAY"}]]' },
    { tag: '[[ADS_QUERIES:', handler: 'handleAdsQueries', desc: 'Если просят запросы (ключи): [[ADS_QUERIES: {"project": "Проект", "period": "TODAY"}]]' },
    { tag: '[[ADS_CAMPAIGNS:', handler: 'handleAdsCampaigns', desc: 'Статистика кампаний: [[ADS_CAMPAIGNS: {"project": "Проект", "period": "TODAY"}]]' },
    { tag: '[[ADS_AUDIT:', handler: 'handleAdsAudit', desc: 'Если просят тренд, аудит, общую аналитику по проекту: [[ADS_AUDIT: {"project": "Проект", "period": "TODAY"}]]' }
  ],
  allowedProtocols: [
    '[[ADS_OVERVIEW:', 
    '[[ADS_PROJECT_STATS:', 
    '[[ADS_CONVERSIONS:', 
    '[[ADS_QUERIES:', 
    '[[ADS_CAMPAIGNS:', 
    '[[ADS_AUDIT:'
  ],
  sessionTimeout: 2,
  priority:       75,
  historyKey:     'history_general',
  entities:       ['номад', 'nomad', 'nomd', 'nomad office', 'nomad-office', 'виктория', 'victoria', 'viktoria', 'vika', 'вика', 'асай', 'asay', 'eurostyle', 'euro', 'кобландин', 'koblandinclinic', 'alarm.in.ua', 'alarm', 'dress-course.online', 'dress', 'stelio', 'барбер', 'insurance', 'номад реклама', 'сша парагвай', 'window bau', 'гид амстердам'],
  morningCard:    'getAdsMorningCard',
  morningOrder:   5
});
