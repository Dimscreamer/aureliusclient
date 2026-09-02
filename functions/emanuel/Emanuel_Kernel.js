/**
 * 🚀 Emanuel_Kernel.js — Ядро диспетчеризации Emanuel Dating OS
 */
const { EMANUEL_CONFIG } = require('./Emanuel_Config');
const Telegram = require('./Emanuel_Telegram');
const Database = require('./Emanuel_Database');
const AI = require('./Emanuel_AI');

// In-memory кэш для дедупликации update_id
const updateCache = new Map();

function isDuplicate(updateId) {
    if (!updateId) return false;
    const now = Date.now();
    // Очистка старых (> 5 минут)
    for (const [id, time] of updateCache.entries()) {
        if (now - time > 300000) updateCache.delete(id);
    }
    if (updateCache.has(updateId)) return true;
    updateCache.set(updateId, now);
    return false;
}

/**
 * Получить главную клавиатуру внизу чата
 */
async function getMainKeyboard(db, userId) {
    const activeSlot = await Database.getActiveSlot(db, userId);
    const label = activeSlot ? `💃 ${activeSlot.name.substring(0, 18)}` : '💃 Мои диалоги';

    return {
        keyboard: [
            [{ text: label }, { text: '➕ Новый диалог' }],
            [
                { text: '🔥 Emanuel OS (Настройки)', web_app: { url: EMANUEL_CONFIG.WEB_APP_URL } },
                { text: '🎯 Платформа' }
            ]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
}

/**
 * Отправить меню выбора диалога (слотов)
 */
async function sendDialogsMenu(chatId, userId, db) {
    const slots = await Database.getSlots(db, userId);
    let msg = '💃 <b>Твои диалоги с девушками:</b>\n\n';

    const inlineKeyboard = [];
    slots.forEach(slot => {
        const mark = slot.active ? '🟢' : '⚪️';
        const temp = slot.temperature || '1/10';
        msg += `${mark} <b>${slot.id}. ${slot.name}</b> (${slot.platform || 'Tinder'})\n`;
        msg += `   🌡 Температура: <b>${temp}</b> | Реплик: ${slot.turnsCount || 0}\n\n`;

        inlineKeyboard.push([{
            text: `${mark} ${slot.id}. ${slot.name}`,
            callback_data: `slot_select_${slot.id}`
        }]);
    });

    msg += '<i>Нажми на кнопку ниже, чтобы переключить активную девушку:</i>';

    await Telegram.sendMessage(chatId, msg, {
        replyMarkup: { inline_keyboard: inlineKeyboard }
    });
}

/**
 * Отправить выбор платформы
 */
async function sendPlatformMenu(chatId) {
    const platforms = ['Tinder', 'Pure', 'Bumble', 'Mamba', 'Telegram'];
    const buttons = platforms.map(p => [{
        text: `📱 ${p}`,
        callback_data: `platform_${p}`
    }]);

    await Telegram.sendMessage(chatId, '🎯 <b>Выбери платформу текущей переписки:</b>', {
        replyMarkup: { inline_keyboard: buttons }
    });
}

/**
 * Главный процессор входящих Telegram Updates
 */
async function processEmanuelUpdate(update, db) {
    if (!update || typeof update !== 'object') return;

    // Дедупликация
    if (update.update_id && isDuplicate(update.update_id)) {
        return;
    }

    // 1. Callback Query (Inline кнопки)
    if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, db);
        return;
    }

    // 2. Обычное сообщение
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

    // Выбор слота: slot_select_1
    if (data.startsWith('slot_select_')) {
        const slotId = data.replace('slot_select_', '');
        const chosen = await Database.switchSlot(db, userId, slotId);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Активный диалог переключен на: <b>«${chosen.name}»</b> (${chosen.platform || 'Tinder'})\nВсе новые реплики и скриншоты идут в её контекст.`, {
            replyMarkup: kb
        });
        return;
    }

    // Выбор платформы: platform_Tinder
    if (data.startsWith('platform_')) {
        const platform = data.replace('platform_', '');
        const active = await Database.getActiveSlot(db, userId);
        await Database.renameActiveSlot(db, userId, active.name, platform);
        const settings = await Database.getUserSettings(db, userId);
        settings.platform = platform;
        await Database.setUserSettings(db, userId, settings);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✅ Платформа для <b>«${active.name}»</b> установлена: <b>${platform}</b>`, {
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

    // 1. Настройки из WebApp
    if (message.web_app_data && message.web_app_data.data) {
        try {
            const data = JSON.parse(message.web_app_data.data);
            if (data.action === 'save_settings' && data.settings) {
                await Database.setUserSettings(db, userId, data.settings);
                const kb = await getMainKeyboard(db, userId);
                const confirmMsg =
                    `⚙️ <b>Настройки Emanuel OS обновлены!</b>\n\n` +
                    `🎯 <b>Цель:</b> ${data.settings.goal || 'hookup'}\n` +
                    `📱 <b>Платформа:</b> ${data.settings.platform || 'Tinder'}\n` +
                    `⚡ <b>Тональность:</b> ${data.settings.tone || 'confident'}\n` +
                    `🚀 <b>Эскалация:</b> ${data.settings.escalation || 'optimal'}`;
                await Telegram.sendMessage(chatId, confirmMsg, { replyMarkup: kb });
                return;
            }
        } catch(e) {}
    }

    // 2. Кнопка «Мои диалоги»
    if (text.startsWith('💃') || text === '/dialogs' || text === '/girls') {
        await sendDialogsMenu(chatId, userId, db);
        return;
    }

    // 3. Очистить память текущей девушки
    if (text === '➕ Новый диалог' || text === '/new' || text === '/reset' || text === '/clear') {
        const slot = await Database.getActiveSlot(db, userId);
        await Database.clearSlotHistory(db, userId, slot.id);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✨ Память диалога <b>«${slot.name}»</b> очищена. Начинаем общение с чистого листа!`, { replyMarkup: kb });
        return;
    }

    // 4. Смена платформы
    if (text === '🎯 Платформа') {
        await sendPlatformMenu(chatId);
        return;
    }

    // 5. Быстрое переключение по номеру: /girl 1, /girl 2
    const girlMatch = text.match(/^\/girl\s*(\d)/i);
    if (girlMatch) {
        const slot = await Database.switchSlot(db, userId, girlMatch[1]);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Переключено на: <b>«${slot.name}»</b>`, { replyMarkup: kb });
        return;
    }

    // 6. Переименование: /rename Катя Pure
    if (/^\/(rename|name)\s+\S/i.test(text)) {
        const newName = text.replace(/^\/(rename|name)\s+/, '').trim();
        const slot = await Database.renameActiveSlot(db, userId, newName);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✅ Диалог переименован в: <b>«${slot.name}»</b>`, { replyMarkup: kb });
        return;
    }

    // 7. Системные команды (/start, /help)
    if (text === '/start' || text === '/help') {
        const kb = await getMainKeyboard(db, userId);
        const welcome =
            `🔥 <b>Привет, ${user.first_name || 'Дмитрий'}! Я твой цифровой Wingman (Emanuel Dating OS).</b>\n\n` +
            `Я анализирую реплики девушек и даю 3 выверенных варианта ответа (Мягкий, Уверенный, Дерзкий) с органичной эскалацией к табу и встрече.\n\n` +
            `📱 <b>Как со мной работать:</b>\n` +
            `• 💬 <b>Текст:</b> Просто отправь сюда реплику девушки (я воспринимаю любой текст как её слова).\n` +
            `• 📸 <b>Скриншот:</b> Пришли скриншот переписки из Tinder/Pure/Bumble/TG — я распознаю его через Gemini Vision.\n` +
            `• 💃 <b>Слоты девушек:</b> Кнопка внизу переключает контекст между разными девушками.\n` +
            `• ⚙️ <b>Emanuel OS:</b> Нажми кнопку для тонкой настройки целей и дерзости.`;
        await Telegram.sendMessage(chatId, welcome, { replyMarkup: kb });
        return;
    }

    // 8. СКРИНШОТ (фото)
    if (message.photo && message.photo.length > 0) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        const fileId = message.photo[message.photo.length - 1].file_id;
        await processMediaInput(chatId, user, userId, fileId, message.caption, db);
        return;
    }

    // 9. СКРИНШОТ (файл-изображение)
    if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        await processMediaInput(chatId, user, userId, message.document.file_id, message.caption, db);
        return;
    }

    // 10. ПО ДЕФОЛТУ: ЛЮБОЙ ТЕКСТ — ЭТО РЕПЛИКА ДЕВУШКИ
    if (text) {
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, user, userId, text, db);
    }
}

/**
 * Обработка текста реплики девушки
 */
async function processTextInput(chatId, user, userId, text, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const activeSlot   = await Database.getActiveSlot(db, userId);
        const history      = await Database.getHistory(db, userId, activeSlot.id, 8);

        // Генерация ответа через ИИ
        const result = await AI.generateAdvice({
            text: text,
            userSettings: userSettings,
            dialogHistory: history
        });

        // Клавиатура
        const kb = await getMainKeyboard(db, userId);

        // Отправляем ответ пользователю в Telegram
        await Telegram.sendMessage(chatId, result.content, { replyMarkup: kb });

        // Сохраняем шаг в историю
        if (result.success) {
            await Database.addTurn(db, userId, activeSlot.id, text, result.content, result.gist, result.temperature);
        }

        // Логирование
        await Database.logAction(db, userId, 'TEXT', text, result.content, result.durationMs);

    } catch (err) {
        console.error('processTextInput error:', err);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, '⚠️ Не удалось сгенерировать ответ. Попробуй ещё раз.', { replyMarkup: kb });
    }
}

/**
 * Обработка скриншота переписки
 */
async function processMediaInput(chatId, user, userId, fileId, caption, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const activeSlot   = await Database.getActiveSlot(db, userId);
        const history      = await Database.getHistory(db, userId, activeSlot.id, 8);

        // Скачиваем фото из Telegram
        const imageBase64 = await Telegram.getFileAsBase64(fileId);
        if (!imageBase64) {
            const kb = await getMainKeyboard(db, userId);
            await Telegram.sendMessage(chatId, '⚠️ Не удалось скачать скриншот из Telegram. Попробуй переслать ещё раз или скопируй текст.', { replyMarkup: kb });
            return;
        }

        // Генерация ответа через Gemini Vision
        const result = await AI.generateAdvice({
            imageBase64: imageBase64,
            text: caption || '',
            userSettings: userSettings,
            dialogHistory: history
        });

        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, result.content, { replyMarkup: kb });

        if (result.success) {
            await Database.addTurn(db, userId, activeSlot.id, caption || '[Скриншот диалога]', result.content, result.gist, result.temperature);
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
    sendDialogsMenu
};
