/**
 * ==============================================================================
 * 📡 MODULE RADAR TCK v7.9 (RED ALERT ONLY & SAFE HTML)
 * Оптимизировано: Автоматическая отправка только для КРАСНЫХ зон.
 * Оранжевые зоны сохраняются в истории для сводок, но не спамят в ЛС.
 * ==============================================================================
 */

function runRadarScanner() {
  try {
    const response = UrlFetchApp.fetch(RADAR_CHANNEL_URL);
    let html = response.getContentText();
    
    // Чистим базовый HTML
    html = html.replace(/&#33;/g, '!').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
    
    // Захватываем блоки сообщений
    const msgBlocks = html.match(/<div class="tgme_widget_message_wrap[\s\S]*?<\/time>/g) || [];
    
    const props = PropertiesService.getScriptProperties();
    let sentHashes = JSON.parse(props.getProperty('radar_hashes') || "[]");
    let history = JSON.parse(props.getProperty('radar_history') || "[]");
    
    const now = new Date();
    const twoHoursAgo = now.getTime() - 7200000;
    
    // Чистим старую историю (оставляем только за последние 2 часа)
    history = history.filter(item => item.ts > twoHoursAgo);
    
    let currentHashes = [];

    msgBlocks.slice(-12).forEach(block => {
      // 1. ПАРСИНГ ВРЕМЕНИ
      let msgTime = "⏳";
      const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/i);
      
      if (timeMatch) {
        try {
          const dateObj = new Date(timeMatch[1]);
          msgTime = Utilities.formatDate(dateObj, "Europe/Kiev", "HH:mm");
        } catch(e) {
          msgTime = "⏳";
        }
      }

      // 2. ПАРСИНГ ТЕКСТА
      const textMatch = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
      if (!textMatch) return;
      
      const text = textMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
      const msgHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text));
      currentHashes.push(msgHash);

      // Если это новое сообщение
      if (sentHashes.indexOf(msgHash) === -1) {
        const lowerText = text.toLowerCase();
        const isClearlyClean = lowerText.match(/(чисто|пусто|никого|поехали|уехали)/);
        
        // Зоны берутся из Global_Config
        const redHits = RED_ZONE.filter(word => lowerText.includes(word));
        const orangeHits = ORANGE_ZONE.filter(word => lowerText.includes(word));

        let zoneType = null;

        if (redHits.length > 0) {
          zoneType = 'RED';
          // АВТОМАТИЧЕСКАЯ ОТПРАВКА: Только для КРАСНОЙ зоны
          if (!isClearlyClean) {
            sendText(MY_ID, `🚨 <b>КРАСНАЯ ЗОНА [${msgTime}]:</b>\n\n<i>"${text}"</i>`, false);
          }
        } 
        else if (orangeHits.length > 0) {
          zoneType = 'ORANGE';
          // СПАМ ОТКЛЮЧЕН: Оранжевая зона только записывается в историю без вызова sendText
        }

        // Записываем в память (и красные, и оранжевые для команды /радар)
        if (zoneType) {
          history.push({ 
            ts: now.getTime(), 
            time: msgTime, 
            text: text, 
            type: zoneType, 
            clean: !!isClearlyClean 
          });
        }
      }
    });
    
    // Сохраняем стейт
    props.setProperty('radar_hashes', JSON.stringify(currentHashes.slice(-30)));
    props.setProperty('radar_history', JSON.stringify(history));
    
  } catch (e) { 
    Logger.log("⚠️ Ошибка радара: " + e.message); 
  }
}

/**
 * РУЧНАЯ СВОДКА ДЛЯ АРЕСА (вызывается через [[CHECK_PATROLS]])
 */
function handlePatrols(aresResponse, payload, input, parsedTags) {
  let patrolTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (let i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'CHECK_PATROLS') {
        patrolTag = parsedTags[i];
        break;
      }
    }
  }

  let cleanBase = aresResponse;
  if (patrolTag) {
    cleanBase = aresResponse.replace(patrolTag.fullTag, "").trim();
  } else {
    const match = aresResponse.match(/\[\[CHECK_PATROLS\]\]/i);
    if (!match) return false;
    cleanBase = aresResponse.replace(match[0], "").trim();
  }
  
  const historyRaw = PropertiesService.getScriptProperties().getProperty('radar_history');
  let history = historyRaw ? JSON.parse(historyRaw) : [];
  const nowTs = new Date().getTime();
  history = history.filter(item => (nowTs - item.ts) < 7200000); 
  
  let report = `📡 <b>ОТЧЕТ ПО ЗАПОРОЖЬЮ (2ч)</b>\n─────────────────────\n`;
  
  if (history.length === 0) {
    report += `✅ В приоритетных зонах подозрительной активности не обнаружено.`;
  } else {
    const reds = history.filter(h => h.type === 'RED');
    const oranges = history.filter(h => h.type === 'ORANGE');
    
    if (reds.length > 0) {
      report += `🚨 <b>КРАСНАЯ ЗОНА:</b>\n`;
      reds.forEach(h => {
        report += `[${h.time}] ${h.clean ? '✅' : '⚠️'} <i>${h.text}</i>\n`;
      });
    }
    if (oranges.length > 0) {
      if (reds.length > 0) report += `\n`;
      report += `⚠️ <b>ОРАНЖЕВАЯ ЗОНА:</b>\n`;
      oranges.forEach(h => {
        report += `[${h.time}] ${h.clean ? '✅' : '👀'} <i>${h.text}</i>\n`;
      });
    }
  }
  return cleanBase + "\n\n" + report.trim();
}

function getRadarContext(userText, history) {
  if (userText.toLowerCase().match(/(район|радар|тцк|патрул|обстановк|выход|чисто)/)) {
    return `\n\n[ИНСТРУКЦИЯ РАДАР]: Пользователь спрашивает про обстановку. Используй тег [[CHECK_PATROLS: {}]].`;
  }
  return "";
}

function getRadarRules() {
  return "— Радар: Если спрашивают про район или ТЦК — используй [[CHECK_PATROLS: {}]].\n";
}
// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ
// ==============================================================================
function getRadarIntent() {
  return `MODE: RADAR MODULE (ситуационная осведомлённость)
Ты сейчас в режиме радара обстановки.`;
}

function getRadarProtocols() {
  return `ПРАВИЛО: ЗАПРЕЩЕНО выдумывать данные о патрулях или обстановке.`;
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'radar',
  enabled:  true,
  promptIntentFn:  'getRadarIntent',
  promptProtocolsFn: 'getRadarProtocols',
  contextFn: 'getRadarContext',
  protocols: [
    { tag: '[[CHECK_PATROLS:', handler: 'handlePatrols', desc: 'Проверить обстановку: [[CHECK_PATROLS: {}]]' }
  ],
  allowedProtocols: ['[[CHECK_PATROLS:'],
  sessionTimeout: 5,
  priority:       85,
  historyKey:     'history_general'
});
