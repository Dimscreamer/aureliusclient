/**
 * 🚀 Emanuel_Kernel.js — Ядро диспетчеризации Emanuel Dating OS (SEX MODE Focus)
 */
const { EMANUEL_CONFIG } = require('./Emanuel_Config');
const Telegram = require('./Emanuel_Telegram');
const Database = require('./Emanuel_Database');
const AI = require('./Emanuel_AI');

const updateCache = new Map();

function isDuplicate(updateId) {
    if (!updateId) return false;
    const now = Date.now();
    for (const [id, time] of updateCache.entries()) {
        if (now - time > 300000) updateCache.delete(id);
    }
    if (updateCache.has(updateId)) return true;
    updateCache.set(updateId, now);
    return false;
}

/**
 * Главная клавиатура Telegram с фокусом на SEX MODE и сокращение пути
 */
async function getMainKeyboard(db, userId) {
    const activeSlot = await Database.getActiveSlot(db, userId);
    const mode = activeSlot?.mode || 'SEX';
    const girlLabel = activeSlot ? `💃 ${activeSlot.name.substring(0, 16)}` : '💃 Мои диалоги';

    let modeIcon = '🔞';
    if (mode === 'NORMAL') modeIcon = '💬';
    if (mode === 'DATE') modeIcon = '🎯';

    return {
        keyboard: [
            [{ text: `${modeIcon} ${mode} MODE` }, { text: girlLabel }],
            [{ text: '⚡ Быстрее к вопросу' }, { text: '🎯 DATE / Встреча' }],
            [{ text: '➕ Новый диалог' }, { text: '⚙️ Режимы' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
}

/**
 * Меню переключения режимов
 */
async function sendModeMenu(chatId, userId, db) {
    const activeSlot = await Database.getActiveSlot(db, userId);
    const msg =
        `⚙️ <b>Выбери режим стратегии для «${activeSlot.name}»:</b>\n\n` +
        `🔞 <b>SEX MODE (По умолчанию)</b> — Минимальное число шагов до вопроса о табу/границах. Быстрая проверка совместимости.\n\n` +
        `💬 <b>NORMAL MODE</b> — Обычный Wingman для свободной беседы.\n\n` +
        `🎯 <b>DATE MODE</b> — Совместимость подтверждена, только закрытие на реальную встречу.`;

    const inlineKeyboard = [
        [{ text: '🔞 SEX MODE (Поиск табу)', callback_data: 'mode_SEX' }],
        [{ text: '💬 NORMAL MODE (Беседа)', callback_data: 'mode_NORMAL' }],
        [{ text: '🎯 DATE MODE (Закрытие)', callback_data: 'mode_DATE' }]
    ];

    await Telegram.sendMessage(chatId, msg, {
        replyMarkup: { inline_keyboard: inlineKeyboard }
    });
}

/**
 * Меню диалогов (девушек)
 */
async function sendDialogsMenu(chatId, userId, db) {
    const slots = await Database.getSlots(db, userId);
    let msg = '💃 <b>Твои диалоги с девушками:</b>\n\n';

    const inlineKeyboard = [];
    slots.forEach(slot => {
        const mark = slot.active ? '🟢' : '⚪️';
        const steps = slot.stepsToTaboo === 0 ? '🔥 МОЖНО СПРАШИВАТЬ' : `~${slot.stepsToTaboo || 1} шага до табу`;
        msg += `${mark} <b>${slot.id}. ${slot.name}</b> (${slot.platform || 'Tinder'})\n`;
        msg += `   🔞 Режим: <b>${slot.mode || 'SEX'}</b> | Дистанция: <b>${steps}</b>\n\n`;

        inlineKeyboard.push([{
            text: `${mark} ${slot.id}. ${slot.name} (${slot.platform || 'Tinder'})`,
            callback_data: `slot_select_${slot.id}`
        }]);
    });

    msg += '<i>Нажми на кнопку ниже, чтобы переключить активную девушку:</i>';

    await Telegram.sendMessage(chatId, msg, {
        replyMarkup: { inline_keyboard: inlineKeyboard }
    });
}

/**
 * Главный процессор входящих Telegram Updates
 */
async function processEmanuelUpdate(update, db) {
    if (!update || typeof update !== 'object') return;

    if (update.update_id && isDuplicate(update.update_id)) {
        return;
    }

    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, db);
        return;
    }

    if (update.message) {
        await handleUserMessage(update.message, db);
    }
}

/**
 * Обработка Callback Query
 */
async function handleCallbackQuery(cb, db) {
    const chatId = cb.message?.chat?.id;
    const userId = cb.from?.id;
    const data = cb.data || '';

    await Telegram.answerCallbackQuery(cb.id);

    // Выбор слота
    if (data.startsWith('slot_select_')) {
        const slotId = data.replace('slot_select_', '');
        const chosen = await Database.switchSlot(db, userId, slotId);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Переключено на: <b>«${chosen.name}»</b> (${chosen.platform || 'Tinder'})\nРежим: <b>${chosen.mode || 'SEX'}</b>`, {
            replyMarkup: kb
        });
        return;
    }

    // Смена режима
    if (data.startsWith('mode_')) {
        const newMode = data.replace('mode_', '');
        const activeSlot = await Database.getActiveSlot(db, userId);
        await Database.setSlotMode(db, userId, activeSlot.id, newMode);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✅ Для <b>«${activeSlot.name}»</b> установлен режим: <b>${newMode} MODE</b>`, {
            replyMarkup: kb
        });
        return;
    }
}

/**
 * Обработка пользовательского сообщения
 */
async function handleUserMessage(message, db) {
    const chatId = message.chat?.id;
    const user   = message.from;
    const userId = user?.id;
    const text   = (message.text || message.caption || '').trim();

    if (!chatId || !userId) return;

    // 1. Кнопка смены режима
    if (text === '⚙️ Режимы' || text === '/modes') {
        await sendModeMenu(chatId, userId, db);
        return;
    }

    // 2. Быстрое переключение режима
    if (text.includes('SEX MODE') || text === '/sex') {
        const activeSlot = await Database.getActiveSlot(db, userId);
        await Database.setSlotMode(db, userId, activeSlot.id, 'SEX');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🔞 Режим для <b>«${activeSlot.name}»</b>: <b>SEX MODE</b> (Ищем кратчайший путь к проверке табу).`, { replyMarkup: kb });
        return;
    }

    if (text === '🎯 DATE / Встреча' || text === '/date') {
        const activeSlot = await Database.getActiveSlot(db, userId);
        await Database.setSlotMode(db, userId, activeSlot.id, 'DATE');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Режим для <b>«${activeSlot.name}»</b>: <b>DATE MODE</b> (Сфокусирован только на закрытии на встречу).`, { replyMarkup: kb });
        return;
    }

    // 3. Кнопка «⚡ Быстрее к вопросу»
    if (text === '⚡ Быстрее к вопросу' || text === '/fast') {
        await handleFastTrackRequest(chatId, user, userId, db);
        return;
    }

    // 4. Кнопка «Мои диалоги»
    if (text.startsWith('💃') || text === '/dialogs' || text === '/girls') {
        await sendDialogsMenu(chatId, userId, db);
        return;
    }

    // 5. Очистить память текущей девушки
    if (text === '➕ Новый диалог' || text === '/new' || text === '/reset' || text === '/clear') {
        const slot = await Database.getActiveSlot(db, userId);
        await Database.clearSlotHistory(db, userId, slot.id);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✨ Память диалога <b>«${slot.name}»</b> очищена. Начинаем с чистого листа!`, { replyMarkup: kb });
        return;
    }

    // 6. Быстрое переключение по номеру: /girl 1..5
    const girlMatch = text.match(/^\/girl\s*(\d)/i);
    if (girlMatch) {
        const slot = await Database.switchSlot(db, userId, girlMatch[1]);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Переключено на: <b>«${slot.name}»</b>`, { replyMarkup: kb });
        return;
    }

    // 7. Переименование: /rename Катя Pure
    if (/^\/(rename|name)\s+\S/i.test(text)) {
        const newName = text.replace(/^\/(rename|name)\s+/, '').trim();
        const slot = await Database.renameActiveSlot(db, userId, newName);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✅ Диалог переименован в: <b>«${slot.name}»</b>`, { replyMarkup: kb });
        return;
    }

    // 8. Системные команды (/start, /help)
    if (text === '/start' || text === '/help') {
        const kb = await getMainKeyboard(db, userId);
        const welcome =
            `🔞 <b>Emanuel Dating OS — AI Wingman для быстрой проверки сексуальной совместимости.</b>\n\n` +
            `Моя задача — избавить тебя от недель пустой переписки и как можно быстрее и естественнее определить совместимость через вопрос о табу/границах.\n\n` +
            `📱 <b>Как со мной работать:</b>\n` +
            `• 💬 <b>Текст:</b> Просто отправь сюда реплику девушки — я сразу посчитаю дистанцию до вопроса о сексе и дам 3 варианта ответа.\n` +
            `• 📸 <b>Скриншот:</b> Пришли скриншот диалога — Gemini Vision распознает контекст.\n` +
            `• ⚡ <b>Кнопка «Быстрее к вопросу»:</b> Заставит меня срезать всю воду и выйти на тему секса прямо сейчас.\n` +
            `• 💃 <b>Слоты девушек:</b> Кнопка внизу переключает между разными девушками.`;
        await Telegram.sendMessage(chatId, welcome, { replyMarkup: kb });
        return;
    }

    // 9. СКРИНШОТ (фото)
    if (message.photo && message.photo.length > 0) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        const fileId = message.photo[message.photo.length - 1].file_id;
        await processMediaInput(chatId, user, userId, fileId, message.caption, false, db);
        return;
    }

    // 10. СКРИНШОТ (файл-изображение)
    if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        await processMediaInput(chatId, user, userId, message.document.file_id, message.caption, false, db);
        return;
    }

    // 11. ПО ДЕФОЛТУ: ЛЮБОЙ ТЕКСТ — ЭТО РЕПЛИКА ДЕВУШКИ
    if (text) {
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, user, userId, text, false, db);
    }
}

/**
 * Обработка запроса «⚡ Быстрее к вопросу»
 */
async function handleFastTrackRequest(chatId, user, userId, db) {
    const activeSlot = await Database.getActiveSlot(db, userId);
    const history = await Database.getHistory(db, userId, activeSlot.id, 6);

    if (history.length === 0) {
        await Telegram.sendMessage(chatId, `⚡ Чтобы срезать путь к вопросу о табу, сначала пришли последнее сообщение девушки (или скриншот диалога с <b>«${activeSlot.name}»</b>)!`);
        return;
    }

    const lastTurn = history[history.length - 1];
    await Telegram.sendChatAction(chatId, 'typing');
    await processTextInput(chatId, user, userId, lastTurn.girl || 'Привет', true, db);
}

/**
 * Обработка текста реплики девушки
 */
async function processTextInput(chatId, user, userId, text, fastTrack = false, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const activeSlot   = await Database.getActiveSlot(db, userId);
        const history      = await Database.getHistory(db, userId, activeSlot.id, 8);

        const result = await AI.generateAdvice({
            text: text,
            mode: activeSlot.mode || 'SEX',
            fastTrack: fastTrack,
            userSettings: userSettings,
            dialogHistory: history
        });

        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, result.content, { replyMarkup: kb });

        if (result.success) {
            await Database.addTurn(db, userId, activeSlot.id, text, result.content, result.gist, {
                stepsToTaboo: result.stepsToTaboo,
                tactic: result.tactic,
                compatibilityRadar: result.compatibilityRadar
            });
        }

        await Database.logAction(db, userId, fastTrack ? 'FAST_TRACK' : 'TEXT', text, result.content, result.durationMs);

    } catch (err) {
        console.error('processTextInput error:', err);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, '⚠️ Не удалось сгенерировать ответ. Попробуй ещё раз.', { replyMarkup: kb });
    }
}

/**
 * Обработка скриншота переписки
 */
async function processMediaInput(chatId, user, userId, fileId, caption, fastTrack = false, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const activeSlot   = await Database.getActiveSlot(db, userId);
        const history      = await Database.getHistory(db, userId, activeSlot.id, 8);

        const imageBase64 = await Telegram.getFileAsBase64(fileId);
        if (!imageBase64) {
            const kb = await getMainKeyboard(db, userId);
            await Telegram.sendMessage(chatId, '⚠️ Не удалось скачать скриншот из Telegram. Попробуй переслать ещё раз или скопируй текст.', { replyMarkup: kb });
            return;
        }

        const result = await AI.generateAdvice({
            imageBase64: imageBase64,
            text: caption || '',
            mode: activeSlot.mode || 'SEX',
            fastTrack: fastTrack,
            userSettings: userSettings,
            dialogHistory: history
        });

        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, result.content, { replyMarkup: kb });

        if (result.success) {
            await Database.addTurn(db, userId, activeSlot.id, caption || '[Скриншот диалога]', result.content, result.gist, {
                stepsToTaboo: result.stepsToTaboo,
                tactic: result.tactic,
                compatibilityRadar: result.compatibilityRadar
            });
        }

        await Database.logAction(db, userId, 'PHOTO', caption || '[Скриншот]', result.content, result.durationMs);

    } catch (err) {
        console.error('processMediaInput error:', err);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, '⚠️ Ошибка анализа скриншота. Попробуй скопировать текст реплики.', { replyMarkup: kb });
    }
}

module.exports = {
    processEmanuelUpdate,
    getMainKeyboard,
    sendDialogsMenu,
    sendModeMenu
};
