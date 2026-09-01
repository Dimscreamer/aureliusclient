/**
 * ==============================================================================
 * 📱 6_Telegram.js — TELEGRAM TRANSPORT LAYER
 *
 * Все операции с Telegram Bot API в одном месте:
 * отправка сообщений, получение файлов, медиа-хелперы.
 *
 * Web-версия: этот слой заменяется на WebSocket/REST API канал.
 *             Интерфейс функций остаётся тем же — меняется только транспорт.
 * ==============================================================================
 */

// ==============================================================================
// 📤 ОТПРАВКА СООБЩЕНИЙ
// ==============================================================================

/**
 * Отправка текстового сообщения в Telegram.
 * Поддерживает HTML-разметку. Автоматически разбивает длинные сообщения.
 *
 * @param {number|string} id       — chat_id получателя
 * @param {string}        txt      — текст сообщения (HTML)
 * @param {boolean}       isSilent — тихое уведомление (без звука)
 * @param {Object}        keyboard — inline keyboard (опционально)
 */
function sendText(id, txt, isSilent, keyboard) {
  if (globalThis.TEST_DRIVE_MODE) {
    if (globalThis.TEST_DRIVE_LOGS) {
      globalThis.TEST_DRIVE_LOGS.push(txt);
    }
    return;
  }

  if (!txt) return;

  if (typeof txt === 'object' && txt !== null) {
    keyboard = keyboard || txt.keyboard;
    txt = txt.text || JSON.stringify(txt);
  }

  // ==============================================================================
  // 🛡 GLOBAL HTML SANITIZATION
  // Гарантируем, что ИИ не сломает Telegram API плохим HTML или Markdown.
  // Применяется КО ВСЕМ исходящим сообщениям.
  // ==============================================================================
  txt = String(txt);

  // 1. Сохраняем блоки кода
  const codeBlocks = [];
  txt = txt.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function(match, lang, code) {
    const idx = codeBlocks.length;
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    codeBlocks.push('<pre><code>' + escapedCode.trim() + '</code></pre>');
    return 'XYZCODEBLOCK' + idx + 'XYZ';
  });

  // 2. Сохраняем инлайн-код
  const inlineCodes = [];
  txt = txt.replace(/`([^`\n]+)`/g, function(match, code) {
    const idx = inlineCodes.length;
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    inlineCodes.push('<code>' + escapedCode + '</code>');
    return 'XYZINLINECODE' + idx + 'XYZ';
  });

  // 3. Заменяем амперсанды, не являющиеся HTML-сущностями
  txt = txt.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');

  // 4. Экранируем сырые < и >, если они не образуют разрешенные теги
  const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tg-spoiler', 'blockquote', 'a'];
  txt = txt.replace(/<(\/?[a-zA-Z0-9-]+)(\s+href="[^"]*")?\s*\/?>/g, function(match, tag) {
    const cleanTag = tag.replace('/', '').toLowerCase();
    if (ALLOWED_TAGS.indexOf(cleanTag) !== -1) {
      return match;
    }
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });

  txt = txt.replace(/<(?![a-zA-Z0-9_\/])/g, '&lt;');
  txt = txt.replace(/(?<![a-zA-Z0-9_"']|\/|-)>/g, '&gt;');

  // 5. Преобразуем Markdown в HTML
  txt = txt.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  txt = txt.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  txt = txt.replace(/__([^_]+)__/g, '<b>$1</b>');
  txt = txt.replace(/^[ \t]*[\*\-\+][ \t]+/gm, '• ');
  txt = txt.replace(/(^|\s)_([^_]+)_(\s|$|[.,!?:;])/g, '$1<i>$2</i>$3');
  txt = txt.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  txt = txt.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2">$1</a>');

  // 6. Очищаем мусорные теги (p, div, ul, ol, li, br)
  txt = txt.replace(/<br\s*\/?>/gi, '\n');
  txt = txt.replace(/<\/?(p|div|ul|ol|li|span|h[1-6])[^>]*>/gi, '\n');

  // 7. Восстанавливаем сохраненные блоки кода
  inlineCodes.forEach(function(code, idx) {
    txt = txt.replace('XYZINLINECODE' + idx + 'XYZ', code);
  });
  codeBlocks.forEach(function(code, idx) {
    txt = txt.replace('XYZCODEBLOCK' + idx + 'XYZ', code);
  });

  // 8. Балансировка тегов (автоматически закрываем незакрытые теги)
  const tagRegex = /<\/?([a-zA-Z0-9-]+)(\s+[^>]*)?>/g;
  const stack = [];
  const selfClosing = ['br', 'img', 'hr'];
  let match;

  while ((match = tagRegex.exec(txt)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.indexOf('</') === 0;

    if (selfClosing.indexOf(tagName) !== -1) continue;

    if (!isClosing) {
      stack.push(tagName);
    } else {
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) {
        stack.splice(idx, 1);
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop();
    txt += '</' + unclosed + '>';
  }

  // 9. Сжимаем чрезмерные пустые строки
  txt = txt.replace(/\n{3,}/g, '\n\n');
  txt = txt.trim();

  var MAX_LEN = 4000;
  var parts = [];

  if (txt.length <= MAX_LEN) {
    parts.push(txt);
  } else {
    // Разбивка по 4000 символов, стараясь не рвать HTML теги (ищем переносы)
    var currentTxt = txt;
    while (currentTxt.length > 0) {
      if (currentTxt.length <= MAX_LEN) {
        parts.push(currentTxt);
        break;
      }
      // Ищем двойной перенос (конец абзаца)
      var sliceIdx = currentTxt.lastIndexOf('\n\n', MAX_LEN);
      if (sliceIdx === -1 || sliceIdx < MAX_LEN - 1500) {
        // Иначе одинарный перенос
        sliceIdx = currentTxt.lastIndexOf('\n', MAX_LEN);
      }
      if (sliceIdx === -1 || sliceIdx < MAX_LEN - 2000) {
        // Если совсем всё плохо (нет переносов), ищем конец предложения
        sliceIdx = currentTxt.lastIndexOf('. ', MAX_LEN);
        if (sliceIdx !== -1) sliceIdx += 1; 
      }
      if (sliceIdx === -1 || sliceIdx < MAX_LEN - 2500) {
        sliceIdx = MAX_LEN; // Жесткий разрыв
      }
      parts.push(currentTxt.substring(0, sliceIdx));
      currentTxt = currentTxt.substring(sliceIdx).trim();
    }
  }

  var res;
  for (var i = 0; i < parts.length; i++) {
    var body = {
      chat_id:                  String(id),
      text:                     parts[i],
      parse_mode:               'HTML',
      disable_web_page_preview: true,
      disable_notification:     !!isSilent
    };

    // Клавиатуру цепляем только к последнему куску
    if (keyboard && i === parts.length - 1) {
      body.reply_markup = JSON.stringify(keyboard);
    }

    var options = {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify(body),
      muteHttpExceptions: true
    };

    if (typeof sysLog !== 'undefined') {
      sysLog("📤 [OUTGOING_TG_MSG] -> \n" + parts[i]);
    }

    res = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage',
      options
    );

    if (typeof sysLog !== 'undefined') {
      try {
        var resData = JSON.parse(res.getContentText());
        if (!resData.ok) {
          sysLog("⚠️ [ERROR]: Telegram API Error: " + resData.description);
          
          // Если ошибка парсинга HTML (например, тег разорван), пробуем отправить как простой текст
          if (resData.description && resData.description.indexOf('parse') !== -1) {
             sysLog("🔄 [RETRY]: Повторная отправка куска без HTML-форматирования...");
             body.parse_mode = '';
             options.payload = JSON.stringify(body);
             res = UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', options);
          }
        }
      } catch (e) {}
    }
    
    // Небольшая задержка между отправкой кусков, чтобы сохранить порядок
    if (parts.length > 1 && i < parts.length - 1) {
      Utilities.sleep(500);
    }
  }

  return res;
}

/**
 * Регистрация команд бота (меню со слешем /)
 * Эту функцию достаточно вызвать один раз вручную из консоли Apps Script.
 */
function registerTelegramCommands() {
  var commands = [];

  var payload = {
    commands: commands
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };

  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/setMyCommands', options);
  Logger.log(response.getContentText());
}

/**
 * Отправка документа (текстового файла/json)
 * @param {number|string} id       — chat_id
 * @param {string}        filename — имя файла
 * @param {string}        content  — содержимое файла
 */
function sendDocument(id, filename, content) {
  var blob = Utilities.newBlob(content, 'application/json', filename);
  var payload = {
    chat_id: String(id),
    document: blob
  };
  var options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };
  return UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendDocument', options);
}

/**
 * Отправить "статус" действия (typing, upload_photo и т.д.)
 * @param {number|string} id  — chat_id
 * @param {string}        act — действие: 'typing', 'upload_photo', 'record_audio'
 */
function sendAction(id, act) {
  try {
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + TG_TOKEN +
      '/sendChatAction?chat_id=' + id + '&action=' + act
    );
  } catch (e) {
    Logger.log('⚠️ sendAction failed: ' + e.message);
  }
}

/**
 * Отправить фото в Telegram (по URL или file_id)
 * @param {number|string} id      — chat_id
 * @param {string}        photo   — URL или file_id
 * @param {string}        caption — подпись (HTML)
 */
function sendPhoto(id, photo, caption) {
  var body = {
    chat_id:   String(id),
    photo:     photo,
    parse_mode: 'HTML'
  };
  if (caption) body.caption = caption;

  UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TG_TOKEN + '/sendPhoto',
    {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify(body),
      muteHttpExceptions: true
    }
  );
}

// ==============================================================================
// 📥 ПОЛУЧЕНИЕ МЕДИА-ФАЙЛОВ
// ==============================================================================

/**
 * Получить файл из Telegram по file_id и вернуть как base64.
 * Работает для фото, голосовых, документов.
 *
 * @param {string} fileId — идентификатор файла из update
 * @returns {string} — base64 строка
 */
function getTelegramFileAsBase64(fileId) {
  var fileInfo = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TG_TOKEN + '/getFile?file_id=' + fileId
  );
  var filePath = JSON.parse(fileInfo.getContentText()).result.file_path;
  var blob = UrlFetchApp.fetch(
    'https://api.telegram.org/file/bot' + TG_TOKEN + '/' + filePath
  ).getBlob();
  return Utilities.base64Encode(blob.getBytes());
}

/**
 * Получить голосовое сообщение как base64.
 * Алиас для getTelegramFileAsBase64 (совместимость с Core_Engine.js).
 */
function getVoiceData(fileId) {
  return getTelegramFileAsBase64(fileId);
}

// ==============================================================================
// 🔧 СИСТЕМНЫЕ КОМАНДЫ (webhook)
// ==============================================================================

/**
 * Установить или обновить webhook для бота.
 * @param {string} url — URL веб-приложения GAS
 */
function setWebhook(url) {
  var webhookUrl = url || WEB_APP_URL;
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TG_TOKEN +
    '/setWebhook?url=' + webhookUrl + '&drop_pending_updates=true'
  );
  Logger.log('[WEBHOOK] Установлен: ' + webhookUrl + ' → ' + res.getContentText());
  return res;
}

/**
 * Получить информацию о текущем webhook.
 */
function getWebhookInfo() {
  var res = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TG_TOKEN + '/getWebhookInfo'
  );
  return JSON.parse(res.getContentText());
}

/**
 * ⚡ Принудительная переустановка вебхука.
 * Сбрасывает кеш LAST_WEBHOOK_URL и заново регистрирует вебхук.
 * Запускать вручную из IDE или через: clasp run resetWebhookNow
 */
function resetWebhookNow() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_WEBHOOK_URL');
  var res = setWebhook(WEB_APP_URL);
  var info = getWebhookInfo();
  Logger.log('[RESET WEBHOOK] Результат: ' + JSON.stringify(info));
  return info;
}

// ==============================================================================
// 🔧 НАСТРОЙКИ UI TELEGRAM
// ==============================================================================

/**
 * Устанавливает кнопку "Меню" (MenuButton) в Telegram для запуска ARES Hub.
 * Запускать вручную из редактора Apps Script.
 */
function ARES_setMenuButton() {
  var url = "https://api.telegram.org/bot" + TG_TOKEN + "/setChatMenuButton";
  
  // Добавляем кэш-бастер к URL
  var hubUrl = WEB_APP_URL + "?page=hub&t=" + new Date().getTime();
  
  var payload = {
    menu_button: {
      type: "web_app",
      text: "ARES Hub",
      web_app: {
        url: hubUrl
      }
    }
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("Ответ от Telegram API: " + response.getContentText());
  } catch (e) {
    Logger.log("Ошибка: " + e.message);
  }
}
