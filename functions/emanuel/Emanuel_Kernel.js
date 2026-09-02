/**
 * 🚀 Emanuel_Kernel.js — Ядро диспетчеризации Emanuel Dating OS
 * Функции: State Machine, Single Best Move, Multi-screenshot Batching, Profile Vision, Timing & Red Flags
 */
const { EMANUEL_CONFIG } = require('./Emanuel_Config');
const Telegram = require('./Emanuel_Telegram');
const Database = require('./Emanuel_Database');
const AI = require('./Emanuel_AI');

const updateCache = new Map();
const photoBatchQueue = new Map();

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
        if (s.stepsToTaboo === 0 || s.state === 'READY_FOR_TABU') {
            badge = '🔥';
        } else if (s.state === 'DATE_CLOSING' || s.state === 'COMPATIBLE') {
            badge = '🎯';
        } else if (s.state === 'INCOMPATIBLE') {
            badge = '❄️';
        }

        inlineKeyboard.push([{
            text: `${mark} ${badge} ${s.name} (${s.stepsToTaboo === 0 ? '0 ш.' : `~${s.stepsToTaboo || 1} ш.`})`,
            callback_data: `session_card_${s.id}`
        }]);
    });

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
 * Карточка конкретной девушки (с данными профиля и досье)
 */
async function sendSessionCard(chatId, userId, sessionId, db) {
    const session = await Database.switchSession(db, userId, sessionId);

    let statusText = `~${session.stepsToTaboo || 1} шага до проверки совместимости`;
    if (session.stepsToTaboo === 0 || session.state === 'READY_FOR_TABU') {
        statusText = '🔥 <b>0 шагов — МОЖНО СПРАШИВАТЬ О ТАБУ</b>';
    } else if (session.state === 'DATE_CLOSING' || session.state === 'COMPATIBLE') {
        statusText = '🎯 <b>Совместимость подтверждена! Закрывай на встречу.</b>';
    } else if (session.state === 'INCOMPATIBLE') {
        statusText = '❄️ <b>Несовместимы. Не трать время.</b>';
    }

    let profileBlock = '';
    if (session.profile) {
        profileBlock = 
            `\n📝 <b>Анкета:</b> ${session.profile.statedGoal || 'Профиль загружен'}\n` +
            `🧠 <b>Вайб анкеты:</b> <i>${session.profile.psychotype || 'Обычный'}</i>\n`;
    }

    let dossierBlock = '';
    if (session.dossier) {
        const taboos = session.dossier.taboos?.length ? session.dossier.taboos.join(', ') : 'ещё не выявлены';
        const greenFlags = session.dossier.greenFlags?.length ? session.dossier.greenFlags.join(', ') : 'ещё не выявлены';
        dossierBlock = 
            `\n🗂 <b>Досье сексуальной совместимости:</b>\n` +
            `• Табу: <i>${taboos}</i>\n` +
            `• Зеленые зоны: <i>${greenFlags}</i>\n`;
    }

    const cardMsg = 
        `👩 <b>[${session.name}]</b>\n\n` +
        `• Состояние: <b>${session.state || 'BUILD'}</b>\n` +
        `• Дистанция: ${statusText}\n` +
        `• Реплик в истории: <b>${session.turnsCount || 0}</b>\n` +
        profileBlock +
        dossierBlock +
        `\n<i>Диалог выбран активным. Все входящие сообщения и скриншоты идут сюда.</i>`;

    const actions = {
        inline_keyboard: [
            [
                { text: '⚡ Быстрее к вопросу', callback_data: `act_fast_${session.id}` },
                { text: '📸 Добавить анкету', callback_data: `session_profile_${session.id}` }
            ],
            [
                { text: '⚙️ Управление', callback_data: `session_manage_${session.id}` },
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

    // Запрос загрузки анкеты
    if (data.startsWith('session_profile_')) {
        const sId = data.replace('session_profile_', '');
        await Database.setUserState(db, userId, `waiting_profile_for_${sId}`);
        await Telegram.sendMessage(chatId, '📸 <b>Отправь скриншот(ы) анкеты девушки из Tinder/Pure/Instagram:</b>\n\n<i>Emanuel проанализирует био, интересы, социальный щит и сохранит скрытые зацепки в досье.</i>');
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

    // 2. Обработка загрузки скриншота анкеты девушки
    if (userState && userState.startsWith('waiting_profile_for_')) {
        const sId = userState.replace('waiting_profile_for_', '');
        if (message.photo && message.photo.length > 0) {
            await Telegram.sendChatAction(chatId, 'typing');
            const fileId = message.photo[message.photo.length - 1].file_id;
            await processProfilePhotoInput(chatId, userId, sId, fileId, db);
            return;
        }
    }

    // 3. Проверяем режим естественного создания девушки (без команд /new)
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
            enqueuePhotoBatch(chatId, userId, created.id, fileId, message.caption, db);
            return;
        }
    }

    // 4. Основные кнопки меню
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
            `🔞 <b>Emanuel — персональный тактический AI Wingman мужчины.</b>\n\n` +
            `Моя задача: как можно быстрее и естественнее привести переписку к честной проверке сексуальной совместимости через вопрос о границах и табу (<b>TIME TO COMPATIBILITY</b>).\n\n` +
            `🎯 <b>Фишки системы:</b>\n` +
            `• <b>Без смайликов и машинного пафоса</b> — живой, уверенный мужской язык.\n` +
            `• <b>Один лучший ход</b> + копирование в 1 касание.\n` +
            `• <b>Тайминг ответа</b> — подскажу, когда отправить, чтобы не уронить значимость.\n` +
            `• <b>Детекция Red Flags</b> — сразу предупрежу, если девушка просто тянет внимание («динамо»).\n` +
            `• <b>Пакетные скриншоты</b> — присылай сразу несколько скринов переписки альбомом!\n` +
            `• <b>Анализ анкеты</b> — распознаю био и скрытый подтекст из Tinder/Pure.`;
        await Telegram.sendMessage(chatId, welcome, { replyMarkup: kb });
        return;
    }

    // 5. СКРИНШОТ (С поддержкой пакетного сбора / альбомов)
    const active = await Database.getActiveSession(db, userId);
    if (message.photo && message.photo.length > 0) {
        const fileId = message.photo[message.photo.length - 1].file_id;
        enqueuePhotoBatch(chatId, userId, active.id, fileId, message.caption, db);
        return;
    }

    if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        enqueuePhotoBatch(chatId, userId, active.id, message.document.file_id, message.caption, db);
        return;
    }

    // 6. ТЕКСТ СООБЩЕНИЯ ДЕВУШКИ
    if (text) {
        await Telegram.sendChatAction(chatId, 'typing');
        await processTextInput(chatId, userId, active.id, text, false, false, db);
    }
}

/**
 * Пакетная очередь для скриншотов (Debounce 2.8 секунды на склейку альбома)
 */
function enqueuePhotoBatch(chatId, userId, sessionId, fileId, caption, db) {
    const queueKey = `${chatId}_${userId}`;
    let item = photoBatchQueue.get(queueKey);

    Telegram.sendChatAction(chatId, 'upload_photo').catch(() => {});

    if (!item) {
        item = {
            chatId,
            userId,
            sessionId,
            fileIds: [fileId],
            caption: caption || '',
            timer: null
        };
        photoBatchQueue.set(queueKey, item);
    } else {
        item.fileIds.push(fileId);
        if (caption && !item.caption) item.caption = caption;
        if (item.timer) clearTimeout(item.timer);
    }

    item.timer = setTimeout(async () => {
        photoBatchQueue.delete(queueKey);
        await processBatchPhotos(item.chatId, item.userId, item.sessionId, item.fileIds, item.caption, db);
    }, 2800);
}

/**
 * Обработка пакета скриншотов диалога
 */
async function processBatchPhotos(chatId, userId, sessionId, fileIds, caption, db) {
    try {
        await Telegram.sendChatAction(chatId, 'typing');
        const active = await Database.getActiveSession(db, userId);
        const history = await Database.getHistory(db, userId, sessionId, 8);

        // Загружаем все скриншоты в base64 параллельно
        const imagesBase64 = await Promise.all(
            fileIds.map(fid => Telegram.getFileAsBase64(fid))
        );
        const validImages = imagesBase64.filter(Boolean);

        if (validImages.length === 0) {
            await Telegram.sendMessage(chatId, '⚠️ Не удалось загрузить скриншоты. Скопируй текст сообщений вручную.');
            return;
        }

        const result = await AI.generateAdvice({
            images: validImages,
            text: caption || '',
            girlName: active.name,
            sessionId: active.id,
            currentState: active.state || 'BUILD',
            fastTrack: false,
            isAlternative: false,
            profile: active.profile,
            dossier: active.dossier,
            dialogHistory: history
        });

        if (!result.success) {
            await Telegram.sendMessage(chatId, `⚠️ ${result.reply || 'Ошибка анализа скриншотов.'}`);
            return;
        }

        await sendAdviceToUser(chatId, userId, active, result, caption || `[${validImages.length} скриншота]`, db);
        await Database.logAction(db, userId, 'BATCH_PHOTOS', caption || `[${validImages.length} фото]`, result.reply, result.durationMs);

    } catch (err) {
        console.error('processBatchPhotos error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Сбой при анализе скриншотов.');
    }
}

/**
 * Обработка анализа профиля девушки
 */
async function processProfilePhotoInput(chatId, userId, sessionId, fileId, db) {
    try {
        const sessions = await Database.getSessions(db, userId, null);
        const session = sessions.find(s => s.id === sessionId) || (await Database.getActiveSession(db, userId));

        const base64 = await Telegram.getFileAsBase64(fileId);
        if (!base64) {
            await Telegram.sendMessage(chatId, '⚠️ Не удалось загрузить фото анкеты.');
            return;
        }

        const res = await AI.analyzeProfileScreenshots([base64], session.name);
        await Database.setUserState(db, userId, null);

        if (res && res.success && res.profile) {
            await Database.updateSessionProfile(db, userId, session.id, res.profile);

            const p = res.profile;
            let msg = 
                `👩 <b>Анкета «${session.name}» проанализирована!</b>\n\n` +
                (p.statedGoal ? `🎯 <b>Что пишет:</b> «${Telegram.escapeHtml(p.statedGoal)}»\n` : '') +
                (p.bioText ? `📝 <b>Био:</b> <i>«${Telegram.escapeHtml(p.bioText)}»</i>\n` : '') +
                (p.psychotype ? `🧠 <b>Скрытый вайб:</b> <i>${Telegram.escapeHtml(p.psychotype)}</i>\n` : '') +
                (Array.isArray(p.interests) && p.interests.length ? `✨ <b>Интересы:</b> ${p.interests.map(Telegram.escapeHtml).join(', ')}\n` : '') +
                (Array.isArray(p.hooks) && p.hooks.length ? `\n🎣 <b>Крючки для темы:</b>\n` + p.hooks.map(h => `• <i>${Telegram.escapeHtml(h)}</i>`).join('\n') + '\n' : '') +
                (p.initialRedFlags ? `\n⚠️ <b>Потенциальный Red Flag:</b> <i>${Telegram.escapeHtml(p.initialRedFlags)}</i>\n` : '');

            msg += `\n💡 <i>Данные сохранены в досье сессии. Emanuel будет тонко использовать эти зацепки в ответах.</i>`;

            await Telegram.sendMessage(chatId, msg);
            await sendSessionCard(chatId, userId, session.id, db);
        } else {
            await Telegram.sendMessage(chatId, '⚠️ Не удалось извлечь данные анкеты. Попробуй сделать более четкий скриншот.');
        }
    } catch (e) {
        console.error('processProfilePhotoInput error:', e);
        await Telegram.sendMessage(chatId, '⚠️ Ошибка анализа анкеты.');
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
            profile: active.profile,
            dossier: active.dossier,
            dialogHistory: history
        });

        if (!result.success) {
            await Telegram.sendMessage(chatId, `⚠️ ${result.reply || 'Ошибка генерации ответа.'}`);
            return;
        }

        await sendAdviceToUser(chatId, userId, active, result, text, db, fastTrack, isAlternative);
        await Database.logAction(db, userId, fastTrack ? 'FAST_TRACK' : 'TEXT', text, result.reply, result.durationMs);

    } catch (err) {
        console.error('processTextInput error:', err);
        await Telegram.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуй ещё раз.');
    }
}

/**
 * Единый рендеринг хода с таймингом, Red Flags и 1-тап копированием
 */
async function sendAdviceToUser(chatId, userId, active, result, inputText, db, fastTrack = false, isAlternative = false) {
    let headerLabel = isAlternative ? '🔄 <b>Альтернативный ход:</b>' : '🔞 <b>Следующий ход:</b>';
    if (result.stepsToTaboo === 0 || result.state === 'READY_FOR_TABU') {
        headerLabel = '🔥 <b>Ход: Вопрос о сексуальных табу:</b>';
    } else if (result.state === 'DATE_CLOSING') {
        headerLabel = '🎯 <b>Ход: Закрытие на встречу:</b>';
    }

    const escapedName = Telegram.escapeHtml(active.name);
    const cleanReply = String(result.reply || '').trim();
    const escapedReply = Telegram.escapeHtml(cleanReply);
    const escapedReason = Telegram.escapeHtml(result.reason || 'Оптимальный шаг для проверки совместимости.');
    const escapedTiming = Telegram.escapeHtml(result.timingAdvice || 'Пауза: 25-40 минут');

    let redFlagBlock = '';
    if (result.redFlags) {
        redFlagBlock = `\n⚠️ <b>RED FLAG:</b> <i>${Telegram.escapeHtml(result.redFlags)}</i>\n`;
    }

    const msgText = 
        `👩 <b>[${escapedName}]</b> • ${headerLabel}\n` +
        `⏳ <b>${escapedTiming}</b>\n` +
        redFlagBlock +
        `\n<code>${escapedReply}</code>\n\n` +
        `<blockquote expandable>💡 <b>Почему этот ход:</b>\n` +
        `${escapedReason}</blockquote>`;

    const inlineKb = getAdviceInlineKeyboard(active, cleanReply);

    await Telegram.sendMessage(chatId, msgText, { replyMarkup: inlineKb, skipFormat: true });

    // Сохраняем в сессию
    await Database.addTurn(db, userId, active.id, inputText, cleanReply, {
        state: result.state,
        stepsToTaboo: result.stepsToTaboo,
        nextAction: result.nextAction,
        reason: result.reason,
        timingAdvice: result.timingAdvice,
        redFlags: result.redFlags,
        dossierUpdates: result.dossierUpdates,
        confidence: result.confidence
    });
}

module.exports = {
    processEmanuelUpdate,
    getMainKeyboard,
    sendDialogsMenu,
    handleLeadMe
};
