/**
 * 🚀 Emanuel_Kernel.js — Ядро диспетчеризации Emanuel Dating OS (Multi-Session & Lead Me)
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
    const mode = active?.mode || 'SEX';
    const girlLabel = active ? `👩 ${active.name}` : '👩 Мои диалоги';

    let modeIcon = '🔞';
    if (mode === 'NORMAL') modeIcon = '💬';
    if (mode === 'DATE') modeIcon = '🎯';

    return {
        keyboard: [
            [{ text: `${modeIcon} ${mode} MODE` }, { text: girlLabel }],
            [{ text: '👩 Мои диалоги' }, { text: '🧭 Веди меня' }],
            [{ text: '➕ Новая девушка' }, { text: '⚡ Быстрее к вопросу' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
}

/**
 * Инлайн-клавиатура для ответа Emanuel
 */
function getAdviceInlineKeyboard(session) {
    const sId = session?.id || 'session_1';
    return {
        inline_keyboard: [
            [
                { text: '🔞 К вопросу', callback_data: `act_taboo_${sId}` },
                { text: '⚡ Быстрее', callback_data: `act_fast_${sId}` },
                { text: '🎯 К встрече', callback_data: `act_date_${sId}` }
            ],
            [
                { text: '🔥 Смелее', callback_data: `act_bolder_${sId}` },
                { text: '🎩 Мягче', callback_data: `act_softer_${sId}` },
                { text: '🔄 Другой', callback_data: `act_regen_${sId}` }
            ]
        ]
    };
}

/**
 * Меню списка диалогов («👩 Мои диалоги»)
 */
async function sendDialogsMenu(chatId, userId, db) {
    const sessions = await Database.getSessions(db, userId);
    let msg = '👩 <b>Твои активные диалоги:</b>\n\n';

    const inlineKeyboard = [];
    sessions.forEach((s, idx) => {
        const mark = s.active ? '🟢' : '⚪️';
        const steps = s.stepsToTaboo === 0 
            ? '🔥 <b>МОЖНО СПРАШИВАТЬ</b>' 
            : `~${s.stepsToTaboo || 1} шага до табу`;

        msg += `${mark} <b>${idx + 1}. ${s.name}</b>\n`;
        msg += `   🔞 Режим: <b>${s.mode || 'SEX'}</b> | Дистанция: ${steps}\n`;
        if (s.lastGist) {
            msg += `   💬 <i>${s.lastGist.substring(0, 60)}...</i>\n`;
        }
        msg += `\n`;

        inlineKeyboard.push([{
            text: `${mark} ${s.name} (${s.stepsToTaboo === 0 ? '🔥 0 ш.' : `~${s.stepsToTaboo || 1} ш.`})`,
            callback_data: `session_switch_${s.id}`
        }]);
    });

    inlineKeyboard.push([{
        text: '➕ Добавить новую девушку',
        callback_data: 'session_new'
    }]);

    msg += '<i>Нажми на девушку, чтобы сделать её диалог активным:</i>';

    await Telegram.sendMessage(chatId, msg, {
        replyMarkup: { inline_keyboard: inlineKeyboard }
    });
}

/**
 * Обработка функции «🧭 Веди меня»
 */
async function handleLeadMe(chatId, userId, db) {
    await Telegram.sendChatAction(chatId, 'typing');
    const sessions = await Database.getSessions(db, userId);

    if (sessions.length === 0) {
        await Telegram.sendMessage(chatId, 'У тебя пока нет активных диалогов. Нажми <b>➕ Новая девушка</b>!');
        return;
    }

    const sessionsSummary = sessions.map(s => ({
        name: s.name,
        mode: s.mode || 'SEX',
        stepsToTaboo: s.stepsToTaboo,
        tactic: s.tactic,
        lastGist: s.lastGist || '',
        turnsCount: s.turnsCount || 0
    }));

    const result = await AI.generateLeadMeAnalysis(sessionsSummary);
    const kb = await getMainKeyboard(db, userId);

    const jumpButtons = sessions.slice(0, 5).map(s => [{
        text: `👩 Перейти к «${s.name}»`,
        callback_data: `session_switch_${s.id}`
    }]);

    await Telegram.sendMessage(chatId, `🧭 <b>Сводка Emanuel «Веди меня» на сегодня:</b>\n\n${result.analysis}`, {
        replyMarkup: { inline_keyboard: jumpButtons }
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

    // Переключение сессии
    if (data.startsWith('session_switch_')) {
        const sId = data.replace('session_switch_', '');
        const chosen = await Database.switchSession(db, userId, sId);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `👩 Активный диалог переключен на: <b>«${chosen.name}»</b>\nРежим: <b>${chosen.mode || 'SEX'}</b>`, {
            replyMarkup: kb
        });
        return;
    }

    // Создание новой сессии
    if (data === 'session_new') {
        await Telegram.sendMessage(chatId, 'Введи имя новой девушки (или напиши команду:\n<code>/new Алина</code>)');
        return;
    }

    // Действия под сообщением
    if (data.startsWith('act_fast_')) {
        const sId = data.replace('act_fast_', '');
        await handleFastTrack(chatId, userId, sId, db);
        return;
    }

    if (data.startsWith('act_taboo_')) {
        const sId = data.replace('act_taboo_', '');
        const active = await Database.getActiveSession(db, userId);
        await Database.setSessionMode(db, userId, sId, 'SEX');
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, userId, 'Переходи к прямому вопросу о табу и сексуальных границах прямо сейчас!', true, db);
        return;
    }

    if (data.startsWith('act_date_')) {
        const sId = data.replace('act_date_', '');
        await Database.setSessionMode(db, userId, sId, 'DATE');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Для диалога включен режим <b>DATE MODE</b> (Закрытие на встречу). Кидай следующее сообщение!`, {
            replyMarkup: kb
        });
        return;
    }
}

/**
 * Обработка сообщений пользователя
 */
async function handleUserMessage(message, db) {
    const chatId = message.chat?.id;
    const user   = message.from;
    const userId = user?.id;
    const text   = (message.text || message.caption || '').trim();

    if (!chatId || !userId) return;

    // 1. Кнопка «🧭 Веди меня»
    if (text === '🧭 Веди меня' || text === '/leadme') {
        await handleLeadMe(chatId, userId, db);
        return;
    }

    // 2. Кнопка «👩 Мои диалоги»
    if (text === '👩 Мои диалоги' || text.startsWith('👩 ') || text === '/dialogs') {
        await sendDialogsMenu(chatId, userId, db);
        return;
    }

    // 3. Кнопка «➕ Новая девушка»
    if (text === '➕ Новая девушка') {
        await Telegram.sendMessage(chatId, 'Напиши имя девушки, например:\n<code>/new Марина</code>');
        return;
    }

    const newMatch = text.match(/^\/(new|add)\s+(.+)/i);
    if (newMatch) {
        const name = newMatch[2].trim();
        const created = await Database.createSession(db, userId, name);
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `✨ Новый диалог с <b>«${created.name}»</b> создан и выбран активным! Отправляй её первое сообщение или скриншот.`, {
            replyMarkup: kb
        });
        return;
    }

    // 4. Кнопка «⚡ Быстрее к вопросу»
    if (text === '⚡ Быстрее к вопросу' || text === '/fast') {
        const active = await Database.getActiveSession(db, userId);
        await handleFastTrack(chatId, userId, active.id, db);
        return;
    }

    // 5. Переключение режимов
    if (text.includes('SEX MODE') || text === '/sex') {
        const active = await Database.getActiveSession(db, userId);
        await Database.setSessionMode(db, userId, active.id, 'SEX');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🔞 Режим для <b>«${active.name}»</b>: <b>SEX MODE</b> (TIME TO COMPATIBILITY).`, { replyMarkup: kb });
        return;
    }

    if (text.includes('NORMAL MODE') || text === '💬 Обычный режим' || text === '/normal') {
        const active = await Database.getActiveSession(db, userId);
        await Database.setSessionMode(db, userId, active.id, 'NORMAL');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `💬 Режим для <b>«${active.name}»</b>: <b>NORMAL MODE</b> (Свободный диалог).`, { replyMarkup: kb });
        return;
    }

    if (text.includes('DATE MODE') || text === '🎯 DATE / Встреча' || text === '/date') {
        const active = await Database.getActiveSession(db, userId);
        await Database.setSessionMode(db, userId, active.id, 'DATE');
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `🎯 Режим для <b>«${active.name}»</b>: <b>DATE MODE</b> (Закрытие на встречу).`, { replyMarkup: kb });
        return;
    }

    // 6. Настройки
    if (text === '⚙️ Настройки' || text === '/settings') {
        const kb = await getMainKeyboard(db, userId);
        await Telegram.sendMessage(chatId, `⚙️ Настройки стиля и стратегии доступны через WebApp:\nhttps://aureliusclients.web.app/emanuel_app.html`, { replyMarkup: kb });
        return;
    }

    // 7. /start или /help
    if (text === '/start' || text === '/help') {
        const kb = await getMainKeyboard(db, userId);
        const welcome =
            `🔞 <b>Emanuel — персональный AI Wingman мужчины.</b>\n\n` +
            `Моя цель: как можно быстрее и естественнее привести переписку к честной проверке сексуальной совместимости через вопрос о границах и табу (<b>TIME TO COMPATIBILITY</b>).\n\n` +
            `📱 <b>Как работать:</b>\n` +
            `• Отправляй сюда сообщение девушки или скриншот переписки.\n` +
            `• <b>«🧭 Веди меня»</b> — покажет сводку по всем твоим девушкам.\n` +
            `• <b>«👩 Мои диалоги»</b> — переключение между девушками.\n` +
            `• <b>«⚡ Быстрее к вопросу»</b> — срезать путь к теме секса прямо сейчас.`;
        await Telegram.sendMessage(chatId, welcome, { replyMarkup: kb });
        return;
    }

    // 8. СКРИНШОТ
    if (message.photo && message.photo.length > 0) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        const fileId = message.photo[message.photo.length - 1].file_id;
        await processMediaInput(chatId, userId, fileId, message.caption, false, db);
        return;
    }

    if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        await Telegram.sendChatAction(chatId, 'upload_photo');
        await processMediaInput(chatId, userId, message.document.file_id, message.caption, false, db);
        return;
    }

    // 9. ТЕКСТ РЕПЛИКИ ДЕВУШКИ
    if (text) {
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, userId, text, false, db);
    }
}

async function handleFastTrack(chatId, userId, sessionId, db) {
    const history = await Database.getHistory(db, userId, sessionId, 6);
    const active = await Database.getActiveSession(db, userId);

    if (history.length === 0) {
        await Telegram.sendMessage(chatId, `⚡ Чтобы срезать путь для <b>«${active.name}»</b>, сначала пришли её последнее сообщение или скриншот!`);
        return;
    }

    const lastTurn = history[history.length - 1];
    await Telegram.sendChatAction(chatId, 'typing');
    await processTextInput(chatId, userId, lastTurn.girl || 'Привет', true, db);
}

async function processTextInput(chatId, userId, text, fastTrack = false, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const active = await Database.getActiveSession(db, userId);
        const history = await Database.getHistory(db, userId, active.id, 8);

        const result = await AI.generateAdvice({
            text: text,
            girlName: active.name,
            mode: active.mode || 'SEX',
            fastTrack: fastTrack,
            userSettings: userSettings,
            dialogHistory: history
        });

        const replyKb = await getMainKeyboard(db, userId);
        const inlineKb = getAdviceInlineKeyboard(active);

        // Отправляем ответ с инлайн кнопками
        await Telegram.sendMessage(chatId, `👩 <b>[${active.name}]</b>\n\n${result.content}`, {
            replyMarkup: inlineKb
        });

        if (result.success) {
            await Database.addTurn(db, userId, active.id, text, result.content, result.gist, {
                stepsToTaboo: result.stepsToTaboo,
                tactic: result.tactic,
                compatibilityRadar: result.compatibilityRadar
            });
        }

        await Database.logAction(db, userId, fastTrack ? 'FAST_TRACK' : 'TEXT', text, result.content, result.durationMs);

    } catch (err) {
        console.error('processTextInput error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Не удалось сгенерировать ответ. Попробуй ещё раз.');
    }
}

async function processMediaInput(chatId, userId, fileId, caption, fastTrack = false, db) {
    try {
        const userSettings = await Database.getUserSettings(db, userId);
        const active = await Database.getActiveSession(db, userId);
        const history = await Database.getHistory(db, userId, active.id, 8);

        const imageBase64 = await Telegram.getFileAsBase64(fileId);
        if (!imageBase64) {
            await Telegram.sendMessage(chatId, '⚠️ Не удалось скачать скриншот. Попробуй скопировать текст реплики.');
            return;
        }

        const result = await AI.generateAdvice({
            imageBase64: imageBase64,
            girlName: active.name,
            text: caption || '',
            mode: active.mode || 'SEX',
            fastTrack: fastTrack,
            userSettings: userSettings,
            dialogHistory: history
        });

        const inlineKb = getAdviceInlineKeyboard(active);
        await Telegram.sendMessage(chatId, `👩 <b>[${active.name}]</b>\n\n${result.content}`, {
            replyMarkup: inlineKb
        });

        if (result.success) {
            await Database.addTurn(db, userId, active.id, caption || '[Скриншот диалога]', result.content, result.gist, {
                stepsToTaboo: result.stepsToTaboo,
                tactic: result.tactic,
                compatibilityRadar: result.compatibilityRadar
            });
        }

        await Database.logAction(db, userId, 'PHOTO', caption || '[Скриншот]', result.content, result.durationMs);

    } catch (err) {
        console.error('processMediaInput error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Ошибка анализа скриншота.');
    }
}

module.exports = {
    processEmanuelUpdate,
    getMainKeyboard,
    sendDialogsMenu
};
