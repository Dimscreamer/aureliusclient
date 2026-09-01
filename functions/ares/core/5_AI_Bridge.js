/**
 * ==============================================================================
 * 🤖 5_AI_Bridge.js — ЕДИНЫЙ МОСТ К LLM (OpenRouter / Gemini)
 *
 * Единственная точка вызова языковой модели во всём проекте.
 * Поддерживает: текст, фото (vision), история диалога, параметры генерации.
 *
 * Web-версия: здесь можно подключить другие провайдеры (Anthropic, Mistral)
 *             или переключать модели через конфиг без изменения логики.
 * ==============================================================================
 */

// ==============================================================================
// 🧠 ГЛАВНАЯ ФУНКЦИЯ ВЫЗОВА LLM
// Использовать везде вместо прямых вызовов UrlFetchApp к OpenRouter.
// ==============================================================================

/**
 * Вызов LLM через OpenRouter.
 *
 * @param {Array}  history      — массив { role, content } предыдущих сообщений
 * @param {string} currentPrompt — текущий запрос пользователя (с контекстом)
 * @param {string} systemPrompt  — системный промпт (personality + module rules)
 * @param {string} mediaBase64   — (опционально) медиа в base64
 * @param {string} mimeType      — MIME-тип фото (опционально)
 * @param {Object} ctx           — ExecutionContext (trace)
 * @returns {string}            — Ответ нейросети (или текст с ошибкой)
 */
function askAres(history, currentPrompt, systemPrompt, mediaBase64, mimeType, ctx) {
  if (!systemPrompt) systemPrompt = getPersonalityPrompt();
  var opts = ctx && ctx.opts ? ctx.opts : {};

  var temperature = opts.temperature !== undefined ? opts.temperature : 0.4;
  var max_tokens  = opts.max_tokens  !== undefined ? opts.max_tokens  : 4000;

  // Собираем сообщения: system + история (последние 8) + текущий запрос
  var messages = [{ role: 'system', content: systemPrompt }];

  var historySlice = (history || []).slice(-8);
  for (var i = 0; i < historySlice.length; i++) {
    messages.push(historySlice[i]);
  }

  // Формируем контент пользователя (текст + медиа если есть)
  var userContent = [{ type: 'text', text: currentPrompt }];
  if (mediaBase64 && mimeType) {
    userContent.push({
      type: 'image_url',
      image_url: { url: 'data:' + mimeType + ';base64,' + mediaBase64 }
    });
  }
  messages.push({ role: 'user', content: userContent });

  var payload = {
    model:       MODEL,
    messages:    messages,
    temperature: temperature,
    max_tokens:  max_tokens
  };

  // JSON-режим (для SYNC и аналитических задач)
  if (opts.json_mode) {
    payload.response_format = { type: 'json_object' };
  }

  if (typeof sysLog !== 'undefined') {
    var totalChars = systemPrompt.length + currentPrompt.length + JSON.stringify(historySlice).length;
    sysLog('🐛 [DEBUG]: [AI_BRIDGE] Отправка запроса к ИИ. Объем контекста: ~' + totalChars + ' симв.');
    sysLog('🐛 [DEBUG_PROMPT]:\n' + systemPrompt.substring(0, 1000) + '\n...\n' + systemPrompt.substring(systemPrompt.length - 1000));
  }

  var startTime = Date.now();

  var options = {
    method:   'post',
    headers: {
      'Authorization': 'Bearer ' + OR_KEY,
      'Content-Type':  'application/json',
      'X-Title':       'ARES Cognitive Core'
    },
    payload:           JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var resultObj = _llmFetchWithRetry('https://openrouter.ai/api/v1/chat/completions', options, 3);
  var result = typeof resultObj === 'string' ? resultObj : resultObj.text;
  
  if (typeof sysLog !== 'undefined') {
    sysLog('🐛 [DEBUG]: [AI_BRIDGE] Ответ от ИИ получен за ' + (Date.now() - startTime) + ' мс.');
  }

  var thoughtSize = 0;
  if (typeof result === 'string') {
    var thoughtRegex = /<thought>([\s\S]*?)<\/thought>/gi;
    var match = result.match(thoughtRegex);
      var thoughtText = '';
      if (match && match.length > 0) {
        thoughtSize = match[0].length;
        thoughtText = match[0].replace(/<\/?thought>/gi, '').trim();
        if (typeof sysLog !== 'undefined' && typeof LOG_LEVEL !== 'undefined' && LOG_LEVEL === 'TRACE') {
          sysLog('🧠 [THOUGHT]:\n' + thoughtText);
        }
        result = result.replace(thoughtRegex, '').trim();
      }
      
      // Удаляем любые оставшиеся открытые или закрытые теги thought, если ИИ сошел с ума
      result = result.replace(/<\/?thought>/gi, '').trim();
      
      if (!result) {
        result = "⚠️ ИИ оборвал размышления и не выдал ответ (возможно, превышен лимит или сбой API). Попробуй переформулировать или повторить.";
      }
    }
  
    if (typeof result === 'string' && !result.startsWith('⚠️ Ошибка моста')) {
      if (ctx && ctx.trace) {
        ctx.trace.stage('AI_BRIDGE', {
          model: resultObj.model || MODEL,
          tokensIn: resultObj.tokensIn || 0,
          tokensOut: resultObj.tokensOut || 0,
          thoughtSize: thoughtSize,
          thoughtText: thoughtText,
          timeMs: Date.now() - startTime,
          temperature: payload.temperature,
          finishReason: resultObj.finishReason,
          rawResponse: result // Уже без thought
        });
    } else if (typeof sysLog === 'function' && typeof LOG_LEVEL !== 'undefined' && LOG_LEVEL === 'TRACE') {
      sysLog('💬 СЫРОЙ ОТВЕТ ИИ:\n\n' + result);
    }
  }

  return result;
}

// ==============================================================================
// 🎙️ ТРАНСКРИБАЦИЯ ГОЛОСА
// ==============================================================================

/**
 * Расшифровка голосового сообщения через LLM (vision-audio).
 * @param {string} base64Audio — аудио в base64 (ogg формат)
 * @returns {string} — расшифрованный текст
 */
function quickTranscribeVoice(base64Audio) {
  if (!base64Audio) return '';

  var payload = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Расшифруй это голосовое сообщение максимально точно. Верни ТОЛЬКО текст расшифровки, без лишних слов и комментариев.' },
        { type: 'image_url', image_url: { url: 'data:audio/ogg;base64,' + base64Audio } }
      ]
    }],
    temperature: 0.0
  };

  var options = {
    method:   'post',
    headers: {
      'Authorization': 'Bearer ' + OR_KEY,
      'Content-Type':  'application/json'
    },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res  = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', options);
    var json = JSON.parse(res.getContentText());
    if (json.choices && json.choices[0]) {
      return json.choices[0].message.content.trim();
    }
    Logger.log('❌ QuickTranscribe: неожиданный ответ — ' + res.getContentText());
  } catch (e) {
    Logger.log('❌ quickTranscribeVoice: ' + e.message);
  }
  return '[Ошибка расшифровки]';
}

// ==============================================================================
// 🔁 ВНУТРЕННИЙ ХЕЛПЕР: запрос с повторными попытками (Exponential Backoff)
// ==============================================================================
function _llmFetchWithRetry(url, options, retries) {
  retries = retries || 3;
  for (var i = 0; i < retries; i++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code     = response.getResponseCode();
      var content  = response.getContentText();

      if (code === 200) {
        var json = JSON.parse(content);
        if (json.choices && json.choices[0]) {
          var responseText = json.choices[0].message ? json.choices[0].message.content : '';
          var finishReason = json.choices[0].finish_reason || 'stop';
          if (!responseText) {
            responseText = '⚠️ Ошибка моста: ИИ вернул пустой текст. Причина завершения: ' + finishReason;
          }
          var metrics = {
            text: responseText,
            model: json.model || 'unknown',
            tokensIn: json.usage ? json.usage.prompt_tokens : 0,
            tokensOut: json.usage ? json.usage.completion_tokens : 0,
            finishReason: finishReason
          };
          return metrics;
        } else if (json.error) {
          Logger.log('❌ OpenRouter Error: ' + JSON.stringify(json.error));
          return '⚠️ Ошибка моста: ' + (json.error.message || JSON.stringify(json.error));
        } else {
          Logger.log('❌ OpenRouter: неизвестный формат ответа — ' + content);
          return '⚠️ Ошибка моста: Пустой ответ или неверный формат.';
        }
      } else {
        Logger.log('⚠️ LLM попытка ' + (i + 1) + ' неудачна. Код: ' + code);
        if (code === 429) Utilities.sleep(2000 * (i + 1));
      }
    } catch (e) {
      Logger.log('❌ LLM запрос ошибка: ' + e.message);
      if (i === retries - 1) return '⚠️ Ошибка моста: ' + e.message;
      Utilities.sleep(1000);
    }
  }
  return '⚠️ Ошибка моста: Превышено количество попыток.';
}

// ==============================================================================
// 🔄 СОВМЕСТИМОСТЬ: старый callGeminiAPI (из Ares_Engine.js)
// Делегирует в askAres. Можно удалить после полного перехода.
// ==============================================================================
function callGeminiAPI(systemPrompt, userText, base64Image, mimeType) {
  return askAres([], userText, systemPrompt, base64Image || null, mimeType || null);
}
// ==============================================================================
// 🛠️ BACKWARD COMPATIBILITY SHIM (Для когнитивных модулей: Hippocampus, Metanoia и др.)
// Старые модули ожидают вызов `geminiCall(messages, isJson)`.
// ==============================================================================
function geminiCall(messages, isJson) {
  var sysPrompt = "";
  var userPrompt = "";
  var history = [];

  if (Array.isArray(messages)) {
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        sysPrompt += messages[i].content + "\n";
      } else if (messages[i].role === 'user' && i === messages.length - 1) {
        userPrompt = messages[i].content;
      } else {
        history.push(messages[i]);
      }
    }
  }

  // Перенаправляем вызов в актуальный пайплайн
  var ctx = isJson ? { opts: { response_format: { type: "json_object" } } } : null;
  return askAres(history, userPrompt, sysPrompt, null, null, ctx);
}
