/**
 * ==============================================================================
 * 🧪 MODULE: WEB APP PREVIEW TRIGGER
 * - ROLE: Отправка тестового сообщения с кнопкой запуска Web App.
 * - ИНСТРУКЦИЯ: 
 * 1. Убедись, что проект опубликован (Deploy -> Manage Deployments).
 * 2. Запусти функцию sendAresLabPreview().
 * 3. В Telegram появится сообщение с кнопкой запуска Лаборатории.
 * ==============================================================================
 */

function sendAresLabPreview() {
  // Получаем URL опубликованного Web App автоматически
  const webAppUrl = ScriptApp.getService().getUrl();
  
  const payload = {
    "method": "sendMessage",
    "chat_id": MY_ID,
    "text": "🧬 <b>ARES | Cognitive Lab Preview</b>\n\nТестовый запуск нейронной лаборатории. Нажми кнопку ниже, чтобы открыть интерфейс во встроенном окне Telegram.",
    "parse_mode": "HTML",
    "reply_markup": JSON.stringify({
      "inline_keyboard": [[
        {
          "text": "🚀 ЗАПУСТИТЬ ЛАБОРАТОРИЮ",
          "web_app": { "url": webAppUrl }
        }
      ]]
    })
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/', options);
    Logger.log("✅ Сообщение отправлено: " + response.getContentText());
  } catch (e) {
    Logger.log("❌ Ошибка отправки: " + e.message);
  }
}