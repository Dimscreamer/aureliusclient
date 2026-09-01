/**
 * ==============================================================================
 * 🚗 Module_TestDrive.js — END-TO-END E2E ТЕСТИРОВАНИЕ
 *
 * Модуль для сквозного тестирования Ареса по ключевым функциям.
 * Вызывается командой "тест драйв" в Telegram.
 * Прогоняет серию запросов, собирает ответы и отправляет JSON-лог.
 * ==============================================================================
 */

function runTestDrive(chatId) {
  var msg = "🚗 <b>Главное меню тестов</b>\n\nТест-драйв разделен на модули во избежание таймаутов. Выберите нужный набор:\n";
  msg += "/test_tasks — Задачи (добавление, удаление, списки)\n";
  msg += "/test_finance — Финансы (баланс, покупки, лимиты)\n";
  msg += "/test_weather — Погода (прогноз, советы)\n";
  msg += "/test_reminders — Напоминания\n";
  msg += "/test_ads — Реклама (лиды, расход, сводки)\n";
  msg += "/test_news — Новости\n";
  msg += "/test_diary — Дневник и Метанойя\n";
  msg += "/test_multi — Мультизадачность (слияние контекстов)\n";
  
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'post', 
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: String(chatId), text: msg, parse_mode: 'HTML' })
    });
  } catch (e) {}
}

function _executeScenarios(chatId, testName, scenarios) {
  if (globalThis.TEST_DRIVE_MODE) {
    if (globalThis.TEST_DRIVE_LOGS) {
      globalThis.TEST_DRIVE_LOGS.push("⚠️ БЛОКИРОВКА РЕКУРСИИ: Попытка запустить тест драйв внутри тест драйва.");
    }
    return;
  }

  UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
    method: 'post', 
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: String(chatId), text: "🚀 Запускаю " + testName + "... Это займет какое-то время.", parse_mode: 'HTML' })
  });
  
  globalThis.TEST_DRIVE_MODE = true;
  globalThis.TEST_DRIVE_LOGS = [];
  
  var results = {
    timestamp: new Date().toISOString(),
    testName: testName,
    totalTests: scenarios.length,
    scenarios: []
  };
  
  var totalTime = 0;
  
  for (var i = 0; i < scenarios.length; i++) {
    var step = scenarios[i];
    globalThis.TEST_DRIVE_LOGS = [];
    
    var start = Date.now();
    var inputObj = { text: step.input, lowerText: step.input.toLowerCase(), hasPhoto: false, photoId: null };
    
    var error = null;
    try {
      processUserMessage(inputObj, chatId);
    } catch(e) {
      error = e.toString();
      globalThis.TEST_DRIVE_LOGS.push("❌ Ошибка выполнения: " + error);
    }
    
    var ms = Date.now() - start;
    totalTime += ms;
    
    var botResponse = globalThis.TEST_DRIVE_LOGS.join('\n---\n');
    
    results.scenarios.push({
      stepId: i + 1,
      name: step.name,
      input: step.input,
      executionTimeMs: ms,
      response: botResponse,
      error: error
    });
  }
  
  globalThis.TEST_DRIVE_MODE = false;
  
  var reportSummary = "🚗 <b>ОТЧЕТ: " + testName + "</b> 🚗\n\n";
  reportSummary += "⏱ Общее время выполнения: <b>" + (totalTime / 1000).toFixed(1) + " сек</b>\n";
  reportSummary += "👉 Подробный лог в формате JSON отправлен файлом.";
  
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'post', 
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: String(chatId), text: reportSummary, parse_mode: 'HTML' })
    });
  } catch (e) {}
  
  var jsonFileName = "Ares_" + testName.replace(/ /g, '_') + "_" + new Date().toISOString().replace(/[:.]/g, '-') + ".json";
  var jsonContent = JSON.stringify(results, null, 2);
  
  try {
    sendDocument(chatId, jsonFileName, jsonContent);
  } catch(e) {
    sendText(chatId, "⚠️ Не удалось отправить JSON файл: " + e.toString());
  }
}

function runTestDrive_Tasks(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Добавить задачу (сегодня)', input: 'Добавь задачу купить хлеб' },
    { name: 'Добавить задачу (завтра)', input: 'Добавь задачу позвонить шефу на завтра' },
    { name: 'Добавить задачу (дата)', input: 'Добавь задачу оплатить интернет 15 июля' },
    { name: 'Добавить сложную задачу', input: 'Поставь задачу написать квартальный отчет до конца дня' },
    { name: 'Мульти-добавление задач', input: 'Добавь задачу купить молоко и еще задачу забрать посылку' },
    { name: 'Считать задачи (все)', input: 'Какие у меня задачи?' },
    { name: 'Считать задачи (завтра)', input: 'Какие планы на завтра?' },
    { name: 'Удалить задачу', input: 'Удали задачу купить хлеб' },
    { name: 'Проверка удаления', input: 'Покажи мои задачи' },
    { name: 'Поиск несуществующей', input: 'Удали задачу полететь на Марс' },
    { name: 'Хард-триггер очистки (очистка)', input: 'Удали все задачи на сегодня' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Tasks', scenarios);
}

function runTestDrive_Finance(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Сводка бюджета', input: 'Мои финансы' },
    { name: 'Анализ мелкой покупки (разрешение)', input: 'Могу я купить кофе за 100 грн?' },
    { name: 'Анализ средней покупки', input: 'Хочу сходить в ресторан на 1500, можно?' },
    { name: 'Анализ крупной покупки (отказ)', input: 'Могу я купить iPhone за 45000?' },
    { name: 'Запрос остатка лимита', input: 'Сколько денег осталось на продукты?' },
    { name: 'Запрос текущего баланса', input: 'Какой у меня сейчас баланс на картах?' },
    { name: 'Повторный анализ', input: 'А могу я купить самокат за 15000?' },
    { name: 'Анализ покупки в долларах', input: 'Могу я купить курс за 500 долларов?' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Finance', scenarios);
}

function runTestDrive_Weather(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Погода по API (Киев)', input: 'Какая погода в Киеве?' },
    { name: 'Погода по API (Лондон)', input: 'Что с погодой в Лондоне?' },
    { name: 'Погода по API (Нью-Йорк)', input: 'Какая погода в Нью-Йорке сейчас?' },
    { name: 'Погода - зонт', input: 'Мне нужен зонт сегодня в Киеве?' },
    { name: 'Погода - одежда', input: 'Что надеть сегодня в Берлине?' },
    { name: 'Погода на выходные', input: 'Какая погода будет на выходных?' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Weather', scenarios);
}

function runTestDrive_Multi(chatId) {
  var coreScenarios = [
    { name: 'Weather + Tasks', input: 'Какая сегодня погода и добавь задачу купить кофе' },
    { name: 'Weather + Reminders', input: 'Какая завтра погода и напомни мне взять куртку' },
    { name: 'Weather + Reminders (условное)', input: 'Если завтра будет дождь, напомни взять зонт' },
    { name: 'Tasks + Finance', input: 'Добавь задачу купить новый макбук и скажи, могу ли я его купить за 80000' },
    { name: 'Tasks + Reminders', input: 'Добавь задачу купить подарок и напомни мне об этом в 17:00' },
    { name: 'News + Weather', input: 'Расскажи новости США и какая сейчас погода в Нью-Йорке' },
    { name: 'Diary + Metanoia', input: 'Разберем ситуацию. Сегодня все пошло не так, я чувствую выгорание.' },
    { name: 'Finance (разрешение) + Task', input: 'Могу ли я купить наушники за 2000? Если да, поставь задачу купить наушники.' },
    { name: 'Три модуля (Weather, Task, Reminder)', input: 'Какая погода, поставь задачу помыть машину и напомни мне об этом завтра' },
    { name: 'Tasks + Reminders 2', input: 'Удали задачу купить хлеб и напомни полить цветы' },
    { name: 'Finance + Weather', input: 'Сколько денег осталось и какая погода в Варшаве?' },
    { name: 'Ads + Finance', input: 'Сколько лидов принес nomad и какой у нас остаток бюджета?' },
    { name: 'News + Ads', input: 'Какие новости IT и покажи сводку по моим кампаниям' },
    { name: 'Diary + Tasks', input: 'Дневник: я устал. Поставь задачу отдохнуть на завтра.' },
    { name: 'Finance + Reminders', input: 'Напомни мне оплатить интернет завтра и какой у меня баланс?' },
    { name: 'Weather + Ads', input: 'Какая погода в Лондоне и как отработала реклама вчера?' }
  ];

  var scenarios = [{ name: 'Сброс кэша', input: '/clear' }];
  
  // Добиваем до 49 запросов (оставляя место для финального сброса)
  var count = 1;
  while (count < 49) {
    for (var i = 0; i < coreScenarios.length; i++) {
      if (count >= 49) break;
      scenarios.push({
        name: coreScenarios[i].name + ' (Iter ' + Math.ceil(count / coreScenarios.length) + ')',
        input: coreScenarios[i].input
      });
      count++;
    }
  }
  
  scenarios.push({ name: 'Финальный сброс', input: '/clear' });
  
  _executeScenarios(chatId, 'TestDrive_Multi', scenarios);
}

function runTestDrive_Ads(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Сводка кампаний (сегодня)', input: 'Покажи мои рекламные кампании' },
    { name: 'Сводка кампаний (вчера)', input: 'Как отработала реклама вчера?' },
    { name: 'Аналитика Nomad (вчера)', input: 'Сколько лидов было по проекту nomad вчера?' },
    { name: 'Аналитика Nomad (30 дней)', input: 'Сколько конверсий у nomad за месяц?' },
    { name: 'Расход конкретного проекта', input: 'Какой расход по проекту Orange за 7 дней?' },
    { name: 'Смена контекста рекламы', input: 'А по проекту MVK что?' },
    { name: 'Несуществующий проект', input: 'Покажи данные по проекту Рога и Копыта' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Ads', scenarios);
}

function runTestDrive_Reminders(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Добавить напоминание (сегодня)', input: 'Напомни мне выключить духовку через 30 минут' },
    { name: 'Добавить напоминание (завтра)', input: 'Напомни завтра утром полить цветы' },
    { name: 'Добавить напоминание (конкретно)', input: 'Напомни мне позвонить юристу сегодня в 18:00' },
    { name: 'Список напоминаний', input: 'Какие у меня есть напоминания?' },
    { name: 'Напоминание с днем недели', input: 'Напомни в пятницу сдать отчет' },
    { name: 'Очистка напоминаний', input: 'Удали все напоминания' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Reminders', scenarios);
}

function runTestDrive_News(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Сводка мировых новостей', input: 'Что в мире?' },
    { name: 'Новости США', input: 'Что нового в США?' },
    { name: 'Технологические новости', input: 'Последние новости IT' },
    { name: 'Новости - follow up', input: 'А что в Европе?' },
    { name: 'Новости науки', input: 'Расскажи новости науки' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_News', scenarios);
}

function runTestDrive_DiaryAndMetanoia(chatId) {
  var scenarios = [
    { name: 'Сброс кэша', input: '/clear' },
    { name: 'Вход в дневник', input: 'Дневник' },
    { name: 'Запись (позитив)', input: 'Сегодня я закрыл крупную сделку, чувствую себя на высоте!' },
    { name: 'Запись (негатив)', input: 'Ужасный день, все валится из рук, я очень устал.' },
    { name: 'Сброс дневника', input: 'Ой, забудь, ничего не пиши.' },
    { name: 'Вход в рефлексию', input: 'Разберём ситуацию' },
    { name: 'Анализ триггера', input: 'Я сорвался на коллегу из-за мелкой ошибки' },
    { name: 'Анализ когнитивного искажения', input: 'Мне кажется, что у меня ничего не получится с этим проектом' },
    { name: 'Выход из метанойи', input: 'Спасибо, мне стало легче' },
    { name: 'Финальный сброс', input: '/clear' }
  ];
  _executeScenarios(chatId, 'TestDrive_Diary_Metanoia', scenarios);
}
