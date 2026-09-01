/**
 * ==============================================================================
 * 🌤 MODULE WEATHER v5.1 (MODULAR EYES, OPEN-METEO API, AI DRESS-CODE)
 * Атмосферный радар Ареса. Выдает погоду на сейчас + сводку на день + одежду.
 * - FIX: Убран военный сленг, тон изменен на аналитический (Джарвис).
 * - FIX: Добавлен дневной перепад температур (Min/Max) для утреннего протокола.
 * ==============================================================================
 */

// ==============================================================================
// 👁️ БЛОК 1: "ГЛАЗА АРЕСА" И ПРАВИЛА (СИСТЕМНЫЙ КОНТЕКСТ)
// ==============================================================================

/**
 * [ГЛАЗА АРЕСА: ПОГОДА]
 * Автономная функция. Проверяет, спрашивает ли Дима про погоду или одежду.
 */
function getWeatherContext(userText, history) {
  const lowerText = userText.toLowerCase();
  
  // Проверяем, есть ли уже данные о погоде в истории (чтобы не зацикливать Two-Pass)
  let hasWeatherData = false;
  if (history && history.length > 0) {
    const lastMsg = history[history.length - 1].content || "";
    if (lastMsg.includes("SYSTEM_DATA") && lastMsg.includes("МЕТЕО-РАДАР")) {
      hasWeatherData = true;
    }
  }

  if (lowerText.match(/(погода|какая.*температур|будет.*дождь|прогноз.*метео|что.*надеть.*погод)/) || 
     (lowerText.includes("завтра") && lowerText.includes("погод"))) {
    
    if (hasWeatherData) {
      return "\n\n[ИНСТРУКЦИЯ ПОГОДА]: Данные о погоде уже получены в SYSTEM_DATA. Проанализируй их и ответь текстом. НЕ вызывай теги повторно!";
    } else {
      return "\n\n[ИНСТРУКЦИЯ ПОГОДА]: Пользователь спрашивает про погоду или что надеть. ТЫ ОБЯЗАН ответить СТРОГО тегом [[GET_WEATHER: {\"city\": \"Город\", \"time\": \"NOW\"}]]. Город по умолчанию Запорожье. Время: NOW или YYYY-MM-DDTHH:00 (вычисли на основе текущего времени сервера).";
    }
  }
  return "";
}


// ==============================================================================
// ⚙️ БЛОК 2: ОБРАБОТЧИК ТЕГА И СБОРКА ОТЧЕТА
// ==============================================================================

/**
 * [ОБРАБОТЧИК: GET_WEATHER]
 * Парсит город и время, качает данные, запрашивает совет ИИ и выдает HTML.
 */
function handleWeather(aresResponse, payload, input, parsedTags) {
  let weatherTag = null;
  if (parsedTags && parsedTags.length > 0) {
    for (var i = 0; i < parsedTags.length; i++) {
      if (parsedTags[i].name === 'GET_WEATHER') {
        weatherTag = parsedTags[i];
        break;
      }
    }
  }
  
  let city = "Запорожье";
  let timeTarget = "NOW";
  let cleanBase = aresResponse;

  if (weatherTag) {
    city = weatherTag.payload.city || "Запорожье";
    timeTarget = weatherTag.payload.time || "NOW";
    cleanBase = aresResponse.replace(weatherTag.fullTag, "").trim();
  } else {
    // Резервный вариант
    const match = aresResponse.match(/\[\[GET_WEATHER:\s*(.*?)\s*\|\s*(.*?)\s*\]\]/i);
    if (match) {
      city = match[1].trim();
      timeTarget = match[2].trim();
      cleanBase = aresResponse.replace(match[0], "").trim();
    } else {
      const oldMatch = aresResponse.match(/\[\[GET_WEATHER:\s*(.*?)\s*\]\]/i);
      if (oldMatch) {
        city = oldMatch[1].trim();
        cleanBase = aresResponse.replace(oldMatch[0], "").trim();
      } else {
        return false;
      }
    }
  }
  
  sendAction(MY_ID, 'typing');
  const weatherData = fetchWeatherData(city, timeTarget);
  
  if (weatherData.error) {
    return cleanBase + "\n\n⚠️ <b>СБОЙ СЕНСОРОВ:</b> Не удалось получить атмосферные данные (" + city + ").";
  }

  const aresComment = getWeatherCommentary(weatherData, city, timeTarget);
  
  // Красивое форматирование времени для вывода
  let timeLabel = (timeTarget === "NOW" || timeTarget === "TODAY") ? "СВОДКА НА ДЕНЬ" : timeTarget.replace("T", " ");
  
  let finalReport = `📡 <b>МЕТЕО-РАДАР: ${city.toUpperCase()} (${timeLabel})</b>\n`;
  finalReport += `───\n`;
  finalReport += `${weatherData.emoji} <b>ОБСТАНОВКА:</b> <code>${weatherData.desc}</code>\n`;
  finalReport += `🌡 <b>ТЕМПЕРАТУРА СЕЙЧАС:</b> <code>${weatherData.temp}°C</code> (Ощущается: <code>${weatherData.feels_like}°C</code>)\n`;
  finalReport += `📉 <b>ДИАПАЗОН ДНЯ:</b> <code>от ${weatherData.temp_min}°C до ${weatherData.temp_max}°C</code>\n`;
  finalReport += `💧 <b>ВЛАЖНОСТЬ:</b> <code>${weatherData.humidity}%</code>\n`;
  finalReport += `💨 <b>ВЕТЕР:</b> <code>${weatherData.wind} м/с</code>\n`;
  
  if (weatherData.precip > 0 || weatherData.daily_precip > 0) {
    let precStr = weatherData.precip > 0 ? `${weatherData.precip} мм прямо сейчас` : `${weatherData.daily_precip} мм ожидается за день`;
    finalReport += `☔ <b>ОСАДКИ:</b> <code>${precStr}</code>\n`;
  } else {
    finalReport += `☔ <b>ОСАДКИ:</b> <code>Без осадков</code>\n`;
  }
  
  if (weatherData.hourly && weatherData.hourly.length > 0) {
    finalReport += `\n🕒 <b>ПРОГНОЗ ПО ЧАСАМ:</b>\n`;
    weatherData.hourly.forEach(h => {
      let precStr = h.prob > 0 ? ` 💧 ${h.precip}мм (${h.prob}%)` : '';
      let tempStr = h.temp > 0 ? `+${h.temp}` : `${h.temp}`;
      let uvStr = h.uv > 3 ? ` ☀️ UV:${Math.round(h.uv)}` : '';
      finalReport += `• <code>${h.time}</code>: ${h.desc} <code>${tempStr}°C</code> | 💨 ${h.wind}м/с${precStr}${uvStr}\n`;
    });
  }

  finalReport += `───\n`;
  finalReport += `💡 <b>СОВЕТ АРЕСА:</b> <i>${aresComment}</i>`;

  return (cleanBase ? cleanBase + "\n\n" : "") + finalReport;
}


// ==============================================================================
// 🧠 БЛОК 3: НЕЙРО-ГЕНЕРАТОР (ДРЕСС-КОД)
// ==============================================================================

/**
 * [ГЕНЕРАТОР ДРЕСС-КОДА ЧЕРЕЗ LLM]
 * Получает сухие данные погоды и выдает аналитическую рекомендацию по экипировке.
 */
function getWeatherCommentary(data, city, timeTarget) {
  try {
    const timeStr = (timeTarget === "NOW" || timeTarget === "TODAY") ? "на сегодня" : "на " + timeTarget;
    
    let rainInfo = data.precip > 0 ? `${data.precip} мм сейчас` : (data.daily_precip > 0 ? `ожидается ${data.daily_precip} мм за день` : `нет`);

    const prompt = `
Ты — Арес, продвинутый аналитический ИИ-ассистент Димы (стиль общения как у Джарвиса). 
Данные погоды для города ${city} (${timeStr}):
Сейчас: ${data.temp}°C (ощущается как ${data.feels_like}°C). 
Ожидается за день: от ${data.temp_min}°C до ${data.temp_max}°C.
Обстановка: ${data.desc}. Ветер: ${data.wind} м/с. Осадки: ${rainInfo}.

Напиши лаконичный комментарий (2-3 предложения). 
ЗАДАЧА: Дай точный, прагматичный совет по одежде на весь день, учитывая перепады температур от минимума к максимуму, силу ветра и наличие осадков (какую куртку надеть, нужны ли шапка, зонт, многослойность и т.д.).
ЗАПРЕТЫ:
1. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕН военный сленг (никаких "боец", "выполнять", "сэр", "приказ"). Общайся профессионально и по-деловому.
2. ЗАПРЕЩЕНО использовать маркдаун (звездочки **).
3. НЕ выдумывай погоду, опирайся строго на переданные цифры (если дождя нет по цифрам, зонт не бери).
`;

    const payload = {
      "model": MODEL,
      "messages": [
        { "role": "system", "content": "Ты Арес. Аналитический ИИ. Выдаешь четкий и прагматичный дресс-код под погоду. Формат: чистый текст." },
        { "role": "user", "content": prompt }
      ],
      "temperature": 0.3 
    };

    const res = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", {
      "method": "post", 
      "contentType": "application/json",
      "headers": { "Authorization": "Bearer " + OR_KEY },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    });
    
    const responseText = JSON.parse(res.getContentText()).choices[0].message.content.trim();
    // Очистка от случайных кавычек или маркдауна
    return responseText.replace(/^"|"$/g, '').replace(/\*/g, '');
  } catch (e) { 
    return "Сенсоры недоступны. Рекомендую одеться по сезону и учитывать возможный перепад температур."; 
  }
}


// ==============================================================================
// 🕸️ БЛОК 4: ВНЕШНИЙ API (OPEN-METEO)
// ==============================================================================

/**
 * [ПОЛУЧЕНИЕ ДАННЫХ ИЗ OPEN-METEO]
 * Качает текущую погоду, почасовой прогноз и дневные Min/Max (для сводки).
 */
function fetchWeatherData(city, timeTarget) {
  try {
    let lat = 47.83, lon = 35.14; // Запорожье по умолчанию
    const cityLower = city.toLowerCase();
    if (cityLower.includes("киев")) { lat = 50.45; lon = 30.52; }
    else if (cityLower.includes("львов")) { lat = 49.83; lon = 24.02; }
    else if (cityLower.includes("одесс")) { lat = 46.48; lon = 30.73; }
    else if (cityLower.includes("днепр")) { lat = 48.46; lon = 35.04; }
    
    // Добавлен блок &daily=... для получения Min/Max температур и общей суммы осадков за день
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FKiev&forecast_days=3`;
    
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { error: true };
    
    const data = JSON.parse(res.getContentText());
    let targetData = {};
    
    // Получаем дневные показатели (Min/Max). По умолчанию для "сегодня" берем index 0
    let dayIndex = 0;
    if (timeTarget !== "NOW" && timeTarget !== "TODAY" && timeTarget.length > 10) {
      let targetDate = timeTarget.substring(0, 10);
      if (data.daily && data.daily.time) {
        if (targetDate === data.daily.time[1]) dayIndex = 1;
        if (targetDate === data.daily.time[2]) dayIndex = 2;
      }
    }

    let dailyData = {
      temp_max: data.daily ? data.daily.temperature_2m_max[dayIndex] : 0,
      temp_min: data.daily ? data.daily.temperature_2m_min[dayIndex] : 0,
      precip_sum: data.daily ? data.daily.precipitation_sum[dayIndex] : 0
    };

    if (timeTarget === "NOW" || timeTarget === "TODAY" || !data.hourly) {
      const current = data.current;
      targetData = {
        temp: current.temperature_2m,
        feels_like: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        precip: current.precipitation,
        wind: current.wind_speed_10m,
        code: current.weather_code
      };
    } else {
      // Ищем нужный час в массиве будущего времени
      const times = data.hourly.time;
      let targetIndex = -1;
      
      for (let i = 0; i < times.length; i++) {
        if (times[i].startsWith(timeTarget) || times[i] === timeTarget) {
          targetIndex = i;
          break;
        }
      }
      
      if (targetIndex === -1) {
        const current = data.current;
        targetData = {
          temp: current.temperature_2m,
          feels_like: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          precip: current.precipitation,
          wind: current.wind_speed_10m,
          code: current.weather_code
        };
      } else {
        targetData = {
          temp: data.hourly.temperature_2m[targetIndex],
          feels_like: data.hourly.apparent_temperature[targetIndex],
          humidity: data.hourly.relative_humidity_2m[targetIndex],
          precip: data.hourly.precipitation[targetIndex],
          wind: data.hourly.wind_speed_10m[targetIndex],
          code: data.hourly.weather_code[targetIndex]
        };
      }
    }
    
    let wmo = getWmoDescription(targetData.code);
    
    let hourlyForecast = [];
    if (data.hourly && data.hourly.time) {
      let startIndex = 0;
      let nowStr = new Date().toISOString().substring(0, 14) + "00"; 
      
      // Если запрос на конкретный день (например, завтра)
      if (timeTarget !== "NOW" && timeTarget !== "TODAY" && timeTarget.length >= 10) {
        nowStr = timeTarget.substring(0, 10) + "T08:00"; // Начнем с 8 утра
      }
      
      for (let i = 0; i < data.hourly.time.length; i++) {
        if (data.hourly.time[i] >= nowStr) {
          startIndex = i;
          break;
        }
      }
      // Берем 24 часа с шагом в 2 часа = 12 записей
      for (let i = startIndex; i < startIndex + 25; i += 2) {
        if (i < data.hourly.time.length) {
          hourlyForecast.push({
            time: data.hourly.time[i].substring(11, 16),
            temp: Math.round(data.hourly.temperature_2m[i]),
            precip: data.hourly.precipitation[i],
            prob: data.hourly.precipitation_probability ? data.hourly.precipitation_probability[i] : 0,
            wind: Math.round(data.hourly.wind_speed_10m[i]),
            uv: data.hourly.uv_index ? data.hourly.uv_index[i] : 0,
            desc: getWmoDescription(data.hourly.weather_code[i]).emoji
          });
        }
      }
    }

    return {
      error: false,
      temp: Math.round(targetData.temp),
      feels_like: Math.round(targetData.feels_like),
      temp_max: Math.round(dailyData.temp_max),
      temp_min: Math.round(dailyData.temp_min),
      humidity: Math.round(targetData.humidity),
      precip: targetData.precip || 0,
      daily_precip: dailyData.precip_sum || 0,
      wind: Math.round(targetData.wind),
      desc: wmo.text,
      emoji: wmo.emoji,
      hourly: hourlyForecast
    };
  } catch (e) { 
    return { error: true }; 
  }
}

/**
 * [РАСШИФРОВКА КОДОВ ПОГОДЫ WMO]
 */
function getWmoDescription(code) {
  if (code === 0) return { text: "Ясно", emoji: "☀️" };
  if (code === 1 || code === 2 || code === 3) return { text: "Переменная облачность / Пасмурно", emoji: "⛅" };
  if (code === 45 || code === 48) return { text: "Туман", emoji: "🌫️" };
  if (code >= 51 && code <= 67) return { text: "Дождь", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { text: "Снег", emoji: "❄️" };
  if (code >= 80 && code <= 82) return { text: "Ливень", emoji: "🌧️" };
  if (code >= 95 && code <= 99) return { text: "Гроза", emoji: "⛈️" };
  return { text: "Нестабильная атмосфера", emoji: "🌪️" };
}


function getTasksRaw() {
  try {
    const ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    const sheet = ss.getSheetByName('Tasks');
    const values = sheet.getDataRange().getValues();
    
    // Берем текущую дату в формате строки, как она лежит в таблице
    const todayStr = Utilities.formatDate(new Date(), "GMT+2", "yyyy-MM-dd");
    
    const todayTasks = values.slice(1).filter(row => {
      if (!row[1]) return false;
      const taskDate = Utilities.formatDate(new Date(row[1]), "GMT+2", "yyyy-MM-dd");
      return taskDate === todayStr && row[2] !== "Done";
    });

    return todayTasks.map(t => t[0]); 
  } catch (e) {
    return [];
  }
}
// ==============================================================================
// 💬 ПРОМПТ МОДУЛЯ
// ==============================================================================
function getWeatherIntent() {
  return `MODE: WEATHER MODULE (погода и одежда)
Ты сейчас в режиме метеоролога.`;
}

function getWeatherProtocols() {
  return `Данные о погоде уже получены системой и переданы в контексте.

ПРАВИЛА:
— Используй данные из [WEATHER DATA] и [DRESS CODE].
— Формат ответа: краткая сводка + рекомендация одежды.
— ЗАПРЕЩЕНО выдумывать погодные данные.`;
}

// Утренняя карточка погоды
function getWeatherMorningCard() {
  try {
    return typeof handleWeather === 'function'
      ? handleWeather('[[GET_WEATHER: {"city": "Запорожье", "time": "NOW"}]]', null, null, [{name: 'GET_WEATHER', payload: {city: "Запорожье", time: "NOW"}, fullTag: '[[GET_WEATHER: {"city": "Запорожье", "time": "NOW"}]]'}])
      : null;
  } catch(e) { return null; }
}

// ==============================================================================
// 🔌 SELF-REGISTRATION
// ==============================================================================
registerModule({
  name:     'weather',
  enabled:  true,
  triggers: ['погода', 'погоду', 'дождь', 'температура', 'градус', 'зонтик'],
  promptIntentFn:  'getWeatherIntent',
  promptProtocolsFn: 'getWeatherProtocols',
  contextFn: 'getWeatherContext',
  allowTextFallback: true,
  protocols: [
    { tag: '[[GET_WEATHER:', handler: 'handleWeather', desc: 'Получить погоду: [[GET_WEATHER: {"city": "Город", "time": "NOW"}]]' }
  ],
  allowedProtocols: ['[[GET_WEATHER:'],
  sessionTimeout: 5,
  priority:       60,
  historyKey:     'history_general',
  morningCard:    'getWeatherMorningCard',
  morningOrder:   1
});
