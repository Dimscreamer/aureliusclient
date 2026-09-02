/**
 * 🚀 Emanuel_Kernel.js — Ядро диспетчеризации Emanuel Dating OS (State Machine & Single Best Move)
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
 * Главная клавиатура Telegram
 */
async function getMainKeyboard(db, userId) {
    const active = await Database.getActiveSession(db, userId);
    const girlLabel = active ? `👩 ${active.name} ▾` : '👩 Выбрать диалог ▾';

    return {
        keyboard: [
            [{ text: '🔞 SEX MODE' }, { text: girlLabel }],
            [{ text: '🧭 Веди меня' }, { text: '⚡ Быстрее' }],
            [{ text: '➕ Новая девушка' }, { text: '👩 Мои диалоги' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
}

/**
 * Инлайн-клавиатура под единственным лучшим ходом
 */
function getAdviceInlineKeyboard(session, replyText) {
    const sId = session?.id || 'session_default';
    const cleanText = String(replyText || '').trim();
    return {
        inline_keyboard: [
            [
                { text: '📋 Скопировать ответ', copy_text: { text: cleanText } }
            ],
            [
                { text: '🔄 Другой вариант', callback_data: `act_alt_${sId}` },
                { text: '⚡ Быстрее', callback_data: `act_fast_${sId}` }
            ]
        ]
    };
}

/**
 * Меню списка диалогов («👩 Мои диалоги»)
 */
async function sendDialogsMenu(chatId, userId, db, showArchived = false) {
    const status = showArchived ? 'archived' : 'active';
    const sessions = await Database.getSessions(db, userId, status);
    const active = await Database.getActiveSession(db, userId);

    let title = showArchived ? '📦 <b>Архив диалогов:</b>\n\n' : '👩 <b>Твои диалоги:</b>\n\n';
    if (sessions.length === 0) {
        title += showArchived 
            ? 'Архив пуст.\n\n' 
            : 'У тебя пока нет активных диалогов. Нажми <b>➕ Новая девушка</b>!\n\n';
    }

    const inlineKeyboard = [];
    sessions.forEach(s => {
        const isCurrent = active && active.id === s.id;
        const mark = isCurrent ? '🟢' : '⚪️';
        
        let badge = '🟡';
        let statusDesc = `~${s.stepsToTaboo || 1} шага до табу`;
        if (s.stepsToTaboo === 0 || s.state === 'READY_FOR_TABU') {
            badge = '🔥';
            statusDesc = 'МОЖНО СПРАШИВАТЬ О ТАБУ';
        } else if (s.state === 'DATE_CLOSING' || s.state === 'COMPATIBLE') {
            badge = '🎯';
            statusDesc = 'Совместимость подтверждена (Закрывай встречу)';
        } else if (s.state === 'INCOMPATIBLE') {
            badge = '❄️';
            statusDesc = 'Низкая совместимость';
        }

        inlineKeyboard.push([{
            text: `${mark} ${badge} ${s.name} (${s.stepsToTaboo === 0 ? '0 ш.' : `~${s.stepsToTaboo || 1} ш.`})`,
            callback_data: `session_card_${s.id}`
        }]);
    });

    // Навигационные кнопки внизу списка
    const navRow = [];
    if (!showArchived) {
        navRow.push({ text: '➕ Новая девушка', callback_data: 'nav_new_girl' });
        navRow.push({ text: '📦 Архив', callback_data: 'nav_show_archive' });
    } else {
        navRow.push({ text: '↩️ К активным диалогам', callback_data: 'nav_show_active' });
    }
    inlineKeyboard.push(navRow);

    await Telegram.sendMessage(chatId, title + '<i>Нажми на девушку для перехода в диалог или управления:</i>', {
        replyMarkup: { inline_keyboard: inlineKeyboard }
    });
}

/**
 * Карточка конкретной девушки
 */
async function sendSessionCard(chatId, userId, sessionId, db) {
    const session = await Database.switchSession(db, userId, sessionId);
    const kb = await getMainKeyboard(db, userId);

    let statusText = `~${session.stepsToTaboo || 1} шага до проверки совместимости`;
    if (session.stepsToTaboo === 0 || session.state === 'READY_FOR_TABU') {
        statusText = '🔥 <b>0 шагов — МОЖНО СПРАШИВАТЬ О ТАБУ</b>';
    } else if (session.state === 'DATE_CLOSING' || session.state === 'COMPATIBLE') {
        statusText = '🎯 <b>Совместимость подтверждена! Закрывай на встречу.</b>';
    } else if (session.state === 'INCOMPATIBLE') {
        statusText = '❄️ <b>Несовместимы. Не трать время.</b>';
    }

    const cardMsg = 
        `👩 <b>[${session.name}]</b>\n\n` +
        `• Состояние: <b>${session.state || 'BUILD'}</b>\n` +
        `• Дистанция: ${statusText}\n` +
        `• Реплик в истории: <b>${session.turnsCount || 0}</b>\n` +
        (session.reason ? `• Последний анализ: <i>${session.reason}</i>\n` : '') +
        `\n<i>Диалог выбран активным. Все новые сообщения или скриншоты идут сюда.</i>`;

    const actions = {
        inline_keyboard: [
            [
                { text: '⚡ Быстрее к вопросу', callback_data: `act_fast_${session.id}` },
                { text: '⚙️ Управление', callback_data: `session_manage_${session.id}` }
            ],
            [
                { text: '↩️ Все диалоги', callback_data: 'nav_show_active' }
            ]
        ]
    };

    await Telegram.sendMessage(chatId, cardMsg, { replyMarkup: actions });
}

/**
 * Меню управления диалогом (Архив, Переименовать, Удалить)
 */
async function sendManageMenu(chatId, sessionId, db, userId) {
    const sessions = await Database.getSessions(db, userId, null);
    const s = sessions.find(x => x.id === sessionId);
    const name = s?.name || 'Девушка';

    const text = `⚙️ <b>Управление диалогом с «${name}»:</b>\n\nЧто ты хочешь сделать?`;
    const buttons = {
        inline_keyboard: [
            [
                { text: '📦 Архивировать', callback_data: `op_archive_${sessionId}` },
                { text: '✏️ Переименовать', callback_data: `op_rename_${sessionId}` }
            ],
            [
                { text: '🗑 Удалить диалог', callback_data: `op_delete_${sessionId}` }
            ],
            [
                { text: '↩️ Назад в карточку', callback_data: `session_card_${sessionId}` }
            ]
        ]
    };

    await Telegram.sendMessage(chatId, text, { replyMarkup: buttons });
}

/**
 * Сводка «🧭 Веди меня» (Фокусный Топ-3)
 */
async function handleLeadMe(chatId, userId, db) {
    await Telegram.sendChatAction(chatId, 'typing');
    const sessions = await Database.getSessions(db, userId, 'active');

    if (sessions.length === 0) {
        await Telegram.sendMessage(chatId, 'У тебя пока нет активных диалогов. Нажми <b>➕ Новая девушка</b>!');
        return;
    }

    const summary = sessions.map(s => ({
        id: s.id,
        name: s.name,
        state: s.state || 'BUILD',
        stepsToTaboo: s.stepsToTaboo,
        turnsCount: s.turnsCount || 0,
        lastMessage: s.lastMessage || ''
    }));

    const result = await AI.generateLeadMeAnalysis(summary);
    const items = result.items || [];

    let msg = `🧭 <b>Сегодня Emanuel рекомендует обратить внимание на ${items.length} диалога:</b>\n\n`;

    const jumpButtons = [];
    items.forEach(item => {
        msg += `${item.badge || '🔥'} <b>${item.name}</b>\n`;
        msg += `   ${item.statusText || 'Требует внимания'}\n\n`;

        const btnLabel = item.action === 'CLOSE_DATE' 
            ? `🍸 ${item.name} (К встрече)` 
            : `🔞 ${item.name} (Открыть)`;

        jumpButtons.push([{
            text: btnLabel,
            callback_data: `session_card_${item.sessionId}`
        }]);
    });

    if (result.summary) {
        msg += `💡 <i>${result.summary}</i>`;
    }

    await Telegram.sendMessage(chatId, msg, {
        replyMarkup: { inline_keyboard: jumpButtons }
    });
}

/**
 * Главный диспетчер входящих сообщений
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

    // Навигация
    if (data === 'nav_new_girl') {
        await Database.setUserState(db, userId, 'waiting_girl_name');
        await Telegram.sendMessage(chatId, '👩 <b>Как её зовут?</b>\n\n<i>Напиши имя текстом (например: Марина) или просто отправь первый скриншот переписки.</i>');
        return;
    }

    if (data === 'nav_show_archive') {
        await sendDialogsMenu(chatId, userId, db, true);
        return;
    }

    if (data === 'nav_show_active') {
        await sendDialogsMenu(chatId, userId, db, false);
        return;
    }

    // Карточка сессии
    if (data.startsWith('session_card_')) {
        const sId = data.replace('session_card_', '');
        await sendSessionCard(chatId, userId, sId, db);
        return;
    }

    // Управление
    if (data.startsWith('session_manage_')) {
        const sId = data.replace('session_manage_', '');
        await sendManageMenu(chatId, sId, db, userId);
        return;
    }

    if (data.startsWith('op_archive_')) {
        const sId = data.replace('op_archive_', '');
        await Database.archiveSession(db, userId, sId);
        await Telegram.sendMessage(chatId, '📦 Диалог перемещён в архив.');
        await sendDialogsMenu(chatId, userId, db, false);
        return;
    }

    if (data.startsWith('op_delete_')) {
        const sId = data.replace('op_delete_', '');
        await Database.deleteSession(db, userId, sId);
        await Telegram.sendMessage(chatId, '🗑 Диалог удалён.');
        await sendDialogsMenu(chatId, userId, db, false);
        return;
    }

    if (data.startsWith('op_rename_')) {
        const sId = data.replace('op_rename_', '');
        await Database.setUserState(db, userId, `renaming_${sId}`);
        await Telegram.sendMessage(chatId, '✏️ Напиши новое имя для этой девушки:');
        return;
    }

    // Действия под сообщением хода
    if (data.startsWith('act_fast_')) {
        const sId = data.replace('act_fast_', '');
        await handleFastTrack(chatId, userId, sId, db);
        return;
    }

    if (data.startsWith('act_alt_')) {
        const sId = data.replace('act_alt_', '');
        await handleAlternativeMove(chatId, userId, sId, db);
        return;
    }

    if (data.startsWith('act_why_')) {
        const sId = data.replace('act_why_', '');
        const history = await Database.getHistory(db, userId, sId, 1);
        const reason = history[0]?.reason || 'Ход выбран на основе анализа открытости и дистанции до проверки табу.';
        await Telegram.sendMessage(chatId, `🧠 <b>Обоснование хода:</b>\n\n${reason}`);
        return;
    }
}

/**
 * Обработка текстовых и медиа сообщений
 */
async function handleUserMessage(message, db) {
    const chatId = message.chat?.id;
    const user = message.from;
    const userId = user?.id;
    const text = (message.text || message.caption || '').trim();

    if (!chatId || !userId) return;

    const userState = await Database.getUserState(db, userId);

    // 1. Проверяем режим ожидания переименования
    if (userState && userState.startsWith('renaming_')) {
        const sId = userState.replace('renaming_', '');
        await Database.renameSession(db, userId, sId, text);
        await Database.setUserState(db, userId, null);
        await Telegram.sendMessage(chatId, `✅ Имя изменено на <b>«${text}»</b>!`);
        await sendSessionCard(chatId, userId, sId, db);
        return;
    }

    // 2. Проверяем режим естественного создания девушки (без команд /new)
    if (userState === 'waiting_girl_name') {
        if (text && !message.photo) {
            const created = await Database.createSession(db, userId, text);
            const kb = await getMainKeyboard(db, userId);
            await Telegram.sendMessage(chatId, `✨ Новый диалог с <b>«${created.name}»</b> создан и выбран активным!\n\nОтправляй её первое сообщение или скриншот переписки.`, { replyMarkup: kb });
            return;
        }
        if (message.photo) {
            const created = await Database.createSession(db, userId, 'Девушка');
            const fileId = message.photo[message.photo.length - 1].file_id;
            await processMediaInput(chatId, userId, created.id, fileId, message.caption, false, false, db);
            return;
        }
    }

    // 3. Основные кнопки меню
    if (text === '🧭 Веди меня' || text === '/leadme') {
        await handleLeadMe(chatId, userId, db);
        return;
    }

    if (text === '👩 Мои диалоги' || text.startsWith('👩 ') || text === '/dialogs') {
        await sendDialogsMenu(chatId, userId, db, false);
        return;
    }

    if (text === '➕ Новая девушка') {
        await Database.setUserState(db, userId, 'waiting_girl_name');
        await Telegram.sendMessage(chatId, '👩 <b>Как её зовут?</b>\n\n<i>Напиши имя текстом (например: Марина) или отправь первый скриншот переписки.</i>');
        return;
    }

    if (text === '⚡ Быстрее' || text === '⚡ Быстрее к вопросу' || text === '/fast') {
        const active = await Database.getActiveSession(db, userId);
        await handleFastTrack(chatId, userId, active.id, db);
        return;
    }

    if (text === '🔞 SEX MODE' || text === '/sex') {
        const active = await Database.getActiveSession(db, userId);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🔞 <b>SEX MODE активен</b> для диалога с <b>«${active.name}»</b>.\nЦель: честная и быстрая проверка сексуальной совместимости (TIME TO COMPATIBILITY).`, { replyMarkup: kb });
        return;
    }

    if (text === '⚙️ Настройки' || text === '/settings') {
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `⚙️ Панель управления и WebApp:\nhttps://aureliusclients.web.app/emanuel_app.html`, { replyMarkup: kb });
        return;
    }

    if (text === '/start' || text === '/help') {
        const kb = await getMainKeyboard(db, userId);
        const welcome =
            `🔞 <b>Emanuel — персональный AI Wingman мужчины.</b>\n\n` +
            `Моя задача: как можно быстрее и естественнее привести переписку к честной проверке сексуальной совместимости через вопрос о границах и табу (<b>TIME TO COMPATIBILITY</b>).\n\n` +
            `🎯 <b>Как это работает:</b>\n` +
            `• Присылай сюда сообщение девушки или скриншот переписки.\n` +
            `• Emanuel анализирует ситуацию и выдаёт <b>один единственный лучший ход</b>.\n` +
            `• <b>«🧭 Веди меня»</b> — покажет приоритетные диалоги на сегодня.\n` +
            `• <b>«👩 Мои диалоги»</b> — удобное переключение между всеми девушками.`;
        await Telegram.sendMessage(chatId, welcome, { replyMarkup: kb });
        return;
    }

    // 4. СКРИНШОТ
    const active = await Database.getActiveSession(db, userId);
    if (message.photo && message.photo.length > 0) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        const fileId = message.photo[message.photo.length - 1].file_id;
        await processMediaInput(chatId, userId, active.id, fileId, message.caption, false, false, db);
        return;
    }

    if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        await processMediaInput(chatId, userId, active.id, message.document.file_id, message.caption, false, false, db);
        return;
    }

    // 5. ТЕКСТ СООБЩЕНИЯ ДЕВУШКИ
    if (text) {
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, userId, active.id, text, false, false, db);
    }
}

async function handleFastTrack(chatId, userId, sessionId, db) {
    const history = await Database.getHistory(db, userId, sessionId, 4);
    const active = await Database.getActiveSession(db, userId);

    if (history.length === 0) {
        await Telegram.sendMessage(chatId, `⚡ Чтобы срезать путь для <b>«${active.name}»</b>, пришли её последнее сообщение или скриншот!`);
        return;
    }

    const lastTurn = history[history.length - 1];
    await Telegram.sendChatAction(chatId, 'typing');
    await processTextInput(chatId, userId, sessionId, lastTurn.girl || 'Привет', true, false, db);
}

async function handleAlternativeMove(chatId, userId, sessionId, db) {
    const history = await Database.getHistory(db, userId, sessionId, 4);
    const active = await Database.getActiveSession(db, userId);

    if (history.length === 0) {
        await Telegram.sendMessage(chatId, `Сначала отправь сообщение от <b>«${active.name}»</b>.`);
        return;
    }

    const lastTurn = history[history.length - 1];
    await Telegram.sendChatAction(chatId, 'typing');
    await processTextInput(chatId, userId, sessionId, lastTurn.girl || 'Привет', false, true, db);
}

async function processTextInput(chatId, userId, sessionId, text, fastTrack = false, isAlternative = false, db) {
    try {
        const active = await Database.getActiveSession(db, userId);
        const history = await Database.getHistory(db, userId, sessionId, 8);

        const result = await AI.generateAdvice({
            text: text,
            girlName: active.name,
            sessionId: active.id,
            currentState: active.state || 'BUILD',
            fastTrack: fastTrack,
            isAlternative: isAlternative,
            dialogHistory: history
        });

        if (!result.success) {
            await Telegram.sendMessage(chatId, `⚠️ ${result.reply || 'Ошибка генерации ответа.'}`);
            return;
        }

        // Рендерим чистый пользовательский UI с одним лучшим ходом
        let headerLabel = isAlternative ? '🔄 <b>Альтернативный ход:</b>' : '🔞 <b>Следующий ход:</b>';
        if (result.stepsToTaboo === 0 || result.state === 'READY_FOR_TABU') {
            headerLabel = '🔥 <b>Ход: Вопрос о сексуальных табу:</b>';
        } else if (result.state === 'DATE_CLOSING') {
            headerLabel = '🎯 <b>Ход: Закрытие на встречу:</b>';
        }

        const escapedName = Telegram.escapeHtml(active.name);
        const cleanReply = String(result.reply || '').trim();
        const escapedReply = Telegram.escapeHtml(cleanReply);
        const escapedReason = Telegram.escapeHtml(result.reason || 'Оптимальный ход для проверки совместимости.');

        const msgText = 
            `👩 <b>[${escapedName}]</b> • ${headerLabel}\n\n` +
            `<code>${escapedReply}</code>\n\n` +
            `<blockquote expandable>💡 <b>Почему этот ход:</b>\n` +
            `${escapedReason}</blockquote>`;

        const inlineKb = getAdviceInlineKeyboard(active, cleanReply);

        await Telegram.sendMessage(chatId, msgText, { replyMarkup: inlineKb, skipFormat: true });

        // Сохраняем результат в сессию
        await Database.addTurn(db, userId, active.id, text, cleanReply, {
            state: result.state,
            stepsToTaboo: result.stepsToTaboo,
            nextAction: result.nextAction,
            reason: result.reason,
            confidence: result.confidence
        });

        await Database.logAction(db, userId, fastTrack ? 'FAST_TRACK' : 'TEXT', text, cleanReply, result.durationMs);

    } catch (err) {
        console.error('processTextInput error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуй ещё раз.');
    }
}

async function processMediaInput(chatId, userId, sessionId, fileId, caption, fastTrack = false, isAlternative = false, db) {
    try {
        const active = await Database.getActiveSession(db, userId);
        const history = await Database.getHistory(db, userId, sessionId, 8);

        const imageBase64 = await Telegram.getFileAsBase64(fileId);
        if (!imageBase64) {
            await Telegram.sendMessage(chatId, '⚠️ Не удалось загрузить скриншот. Скопируй текст сообщений вручную.');
            return;
        }

        const result = await AI.generateAdvice({
            imageBase64: imageBase64,
            text: caption || '',
            girlName: active.name,
            sessionId: active.id,
            currentState: active.state || 'BUILD',
            fastTrack: fastTrack,
            isAlternative: isAlternative,
            dialogHistory: history
        });

        if (!result.success) {
            await Telegram.sendMessage(chatId, `⚠️ ${result.reply || 'Ошибка анализа скриншота.'}`);
            return;
        }

        let headerLabel = isAlternative ? '🔄 <b>Альтернативный ход:</b>' : '🔞 <b>Следующий ход:</b>';
        if (result.stepsToTaboo === 0 || result.state === 'READY_FOR_TABU') {
            headerLabel = '🔥 <b>Ход: Вопрос о сексуальных табу:</b>';
        } else if (result.state === 'DATE_CLOSING') {
            headerLabel = '🎯 <b>Ход: Закрытие на встречу:</b>';
        }

        const escapedName = Telegram.escapeHtml(active.name);
        const cleanReply = String(result.reply || '').trim();
        const escapedReply = Telegram.escapeHtml(cleanReply);
        const escapedReason = Telegram.escapeHtml(result.reason || 'Оптимальный ход для проверки совместимости.');

        const msgText = 
            `👩 <b>[${escapedName}]</b> • ${headerLabel}\n\n` +
            `<code>${escapedReply}</code>\n\n` +
            `<blockquote expandable>💡 <b>Почему этот ход:</b>\n` +
            `${escapedReason}</blockquote>`;

        const inlineKb = getAdviceInlineKeyboard(active, cleanReply);

        await Telegram.sendMessage(chatId, msgText, { replyMarkup: inlineKb, skipFormat: true });

        await Database.addTurn(db, userId, active.id, caption || '[Скриншот переписки]', cleanReply, {
            state: result.state,
            stepsToTaboo: result.stepsToTaboo,
            nextAction: result.nextAction,
            reason: result.reason,
            confidence: result.confidence
        });

        await Database.logAction(db, userId, 'PHOTO', caption || '[Скриншот]', cleanReply, result.durationMs);

    } catch (err) {
        console.error('processMediaInput error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Сбой при анализе скриншота.');
    }
}

module.exports = {
    processEmanuelUpdate,
    getMainKeyboard,
    sendDialogsMenu
};
