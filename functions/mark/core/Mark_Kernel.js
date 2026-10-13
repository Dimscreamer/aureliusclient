const admin = require('firebase-admin');
/**
 * ��️ Mark_Kernel.js — Главное ядро обработки и оркестрации Марка
 */
const axios = require('axios');
const { MARK_CONFIG } = require('./Mark_Config');
const { sendTelegramMessage, editTelegramMessage, sendChatAction, answerCallbackQuery, getTelegramFileAsBase64 } = require('./Mark_Telegram');
const { callMarkLLM, transcribeVoiceAudio } = require('./Mark_AI_Bridge');
const { routeMessage } = require('./Mark_Router');
const { getModule } = require('./Mark_Registry');
const { Module_Freelancehunt } = require('../modules/Module_Freelancehunt');
const { Module_GoogleAds } = require('../modules/Module_GoogleAds');
const { Module_Automation } = require('../modules/Module_Automation');

// Память сессий и истории
const processedUpdatesCache = new Set();
const chatHistoryMemory = new Map();

/**
 * Сохранение сообщения в Firestore (история переписки клиента)
 */
async function saveClientMessage(db, client, msgData) {
    if (!db || !client || !client.id) return;
    try {
        const msgId = (msgData.messageId || Date.now()).toString();
        const dateObj = new Date();
        const nowIso = dateObj.toISOString();
        const dateStr = nowIso.split('T')[0];
        const timeStr = dateObj.toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });

        await db.collection('client_chats')
            .doc(client.id.toString())
            .collection('messages')
            .doc(msgId)
            .set({
                messageId: msgId,
                chatId: (msgData.chatId || '').toString(),
                clientId: client.id.toString(),
                senderId: msgData.senderId || null,
                senderName: msgData.senderName || 'Участник',
                senderUsername: msgData.senderUsername || '',
                isClient: !!msgData.isClient,
                isAdmin: !!msgData.isAdmin,
                isMark: !!msgData.isMark,
                isBot: !!msgData.isBot,
                text: msgData.text || '',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                date: dateStr,
                time: timeStr
            }, { merge: true });
    } catch (err) {
        console.error('[Mark_Kernel] saveClientMessage error:', err.message);
    }
}

/**
 * Вспомогательное экранирование HTML для Telegram сообщений
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Вычисление дня накануне даты (YYYY-MM-DD)
 */
function getDayBefore(ymdStr) {
    if (!ymdStr) return null;
    const d = new Date(ymdStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
}

/**
 * Эвристическая быстрая проверка наличия намерений задач/дедлайнов
 */
function shouldCheckMessageForTasks(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (clean.length < 10) return false;
    if (clean.startsWith('/')) return false;

    // Регулярное выражение для поиска обещаний, договоренностей, дедлайнов и задач
    const TRIGGER_REGEX = /(договор|сдела|глян|посмотр|провер|скин|отправ|дедлайн|срок|задач|настро|подключ|согласован|к пятниц|к понедельник|к вторник|к сред|к четверг|к суббот|к воскресень|до завтра|до конца|к концу|на следующ|на этой недел|до \d{1,2}|к \d{1,2}|план|исправ|передел|напомн|оплат|счет|инвойс|бюджет|правк|реклам|кампани|запуст|отключ|пауз|аудит|отчет|отчёт|свер|пересчит|созвон|встреч|зум|zoom|meet|task|deadline|погоджен|домовил|зробл|перевір|надішл)/i;

    return TRIGGER_REGEX.test(clean);
}

/**
 * Авто-распознавание задач из чата на лету (Webhook Trigger)
 * Извлекает дедлайны/задачи, сохраняет в client_tasks и шлет alert в ЛС Дмитрию
 */
async function detectAndScheduleChatTask(db, client, msgData) {
    if (!db || !client || !client.id || !msgData || !msgData.text) return null;
    if (!shouldCheckMessageForTasks(msgData.text)) return null;

    try {
        const todayKyiv = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
        const tObj = new Date(todayKyiv + "T12:00:00Z");
        tObj.setUTCDate(tObj.getUTCDate() + 1);
        const tomorrowKyiv = tObj.toISOString().split('T')[0];

        const systemPrompt = `Ты — аналитический AI-ассистент маркетингового агентства Aurelius (руководитель — Дмитрий).
Твоя задача — извлечь из сообщения в рабочем чате с клиентом конкретную ДОГОВОРЕННОСТЬ, ЗАДАЧУ, ДЕДЛАЙН или ОБЕЩАНИЕ на будущее.

Контекст:
- Клиент: "${client.name || 'Клиент'}"
- Автор сообщения: "${msgData.senderName}" (${msgData.isAdmin ? 'Дмитрий / Агентство' : 'Клиент'})
- Сегодняшняя дата (Киев): ${todayKyiv} (завтра: ${tomorrowKyiv})

Правила:
1. Если сообщение — просто обсуждение, вопрос без обязательств, отчет о прошлом ("я вчера сделал"), спам, благодарность ("спасибо") или согласие без новой задачи — верни строго:
{"isTask": false}

2. Если сообщение содержит обещание сделать что-то в будущем, конкретную задачу или дедлайн (например: "гляну сайт к вечеру", "договорились, к среде сделаем", "скину доступы завтра", "нужно пересобрать кампанию к 15 октября", "отключу рекламу до пятницы", "созвонимся в четверг в 14:00") — верни:
{
  "isTask": true,
  "taskText": "Краткая формулировка задачи (до 90 символов, четкое действие, например: Подготовить аудит кампаний)",
  "targetDate": "YYYY-MM-DD" (рассчитай календарную дату исходя из ${todayKyiv}, например завтра -> ${tomorrowKyiv}, или точный день недели; если дата не определена, поставь "${todayKyiv}"),
  "responsible": "agency" или "client" (agency если делает Дмитрий/агентство, client если обещает клиент)
}

Отвечай ИСКЛЮЧИТЕЛЬНО валидным JSON без markdown, без кавычек \`\`\`json, без лишних слов.`;

        const userPrompt = `Сообщение: "${msgData.text}"`;

        const llmRes = await callMarkLLM({
            systemPrompt,
            userPrompt,
            temperature: 0.1,
            maxTokens: 250
        });

        if (!llmRes || !llmRes.reply) return null;

        let jsonStr = llmRes.reply.trim();
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim();

        let parsed = null;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (pe) {
            const m = jsonStr.match(/\{[\s\S]*\}/);
            if (m) {
                try { parsed = JSON.parse(m[0]); } catch (e) {}
            }
        }

        if (!parsed || !parsed.isTask || !parsed.taskText) {
            return null;
        }

        const taskText = parsed.taskText.trim();
        let targetDate = parsed.targetDate;
        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
            targetDate = todayKyiv;
        }

        const notifyDate = getDayBefore(targetDate) || todayKyiv;
        const taskId = `task_${client.id}_msg${msgData.messageId || Date.now()}`;

        const taskDoc = {
            id: taskId,
            clientId: client.id.toString(),
            clientName: client.name || '',
            text: taskText,
            type: parsed.responsible === 'client' ? 'client' : 'agency',
            targetDate: targetDate,
            notifyDate: notifyDate,
            status: 'pending',
            notified: false,
            source: 'chat_webhook',
            detectedFromMsgId: (msgData.messageId || '').toString(),
            detectedFromSender: msgData.senderName || '',
            originalSnippet: msgData.text.slice(0, 250),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("client_tasks").doc(taskId).set(taskDoc, { merge: true });
        console.log(`[Mark_Kernel] Auto-task detected & saved: "${taskText}" for ${client.name} (target: ${targetDate})`);

        // Запись в лог событий клиента в CRM (clients_db/master)
        try {
            const masterRef = db.collection('artifacts').doc('aureliusclients')
                .collection('public').doc('data')
                .collection('clients_db').doc('master');
            const snap = await masterRef.get();
            if (snap.exists) {
                const data = snap.data() || {};
                const clients = data.clients || [];
                const idx = clients.findIndex(c => String(c.id) === String(client.id));
                if (idx !== -1) {
                    if (!clients[idx].history) clients[idx].history = [];
                    clients[idx].history.unshift({
                        date: todayKyiv,
                        text: `🤖 Задача из чата: ${taskText} (до ${targetDate})`
                    });
                    if (clients[idx].history.length > 50) clients[idx].history = clients[idx].history.slice(0, 50);
                    await masterRef.set({ clients }, { merge: true });
                }
            }
        } catch (hErr) {
            console.warn('[Mark_Kernel] Could not append to client history:', hErr.message);
        }

        // Мгновенное личное уведомление Дмитрию в Telegram
        try {
            const roleBadge = parsed.responsible === 'client' ? '👤 Клиент' : '👔 Агентство (Дмитрий)';
            const snippet = msgData.text.length > 140 ? msgData.text.slice(0, 140) + '...' : msgData.text;
            const pmText = `📌 <b>АВТО-ЗАДАЧА ЗАФИКСИРОВАНА ИЗ ЧАТА</b>\n\n` +
                `🏢 <b>Клиент:</b> ${escapeHtml(client.name || 'Клиент')}\n` +
                `🎯 <b>Задача:</b> <b>${escapeHtml(taskText)}</b>\n` +
                `⏳ <b>Дедлайн:</b> <code>${targetDate}</code> (${roleBadge})\n` +
                `✍️ <b>Автор:</b> ${escapeHtml(msgData.senderName || 'Участник')}\n` +
                `💬 <i>«${escapeHtml(snippet)}»</i>\n\n` +
                `<i>Задача сохранена в карточке клиента и поставлена в расписание CRM.</i>`;

            await sendTelegramMessage(MARK_CONFIG.ADMIN_CHAT_ID, pmText);
        } catch (tgErr) {
            console.error('[Mark_Kernel] Failed to send Telegram alert for auto-task:', tgErr.message);
        }

        return taskDoc;
    } catch (err) {
        console.error('[Mark_Kernel] detectAndScheduleChatTask error:', err.message);
        return null;
    }
}

/**
 * Загрузка актуального пула задач клиента из Firestore
 */
async function getClientTasksFromDb(db, projectId) {
    if (!db || !projectId) return [];
    try {
        const snap = await db.collection("client_tasks")
            .where("clientId", "==", projectId.toString())
            .get();
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        tasks.sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''));
        return tasks;
    } catch (e) {
        console.error('[getClientTasksFromDb] Error:', e.message);
        return [];
    }
}

/**
 * Эталонная сборка карточки трекера задач (Next-Gen UI Terminal HTML)
 */
function renderTaskTrackerTemplate(projectId, tasks, client = null) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Europe/Kyiv' });
    const timeStr = now.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
    const todayIso = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });

    const clientTitle = client?.name || client?.clientName ? `${escapeHtml(client.name || client.clientName)} ` : '';
    const headerLine = `📋 <b>ШТАБ МАРКА | АКТУАЛЬНЫЙ ТРЕКЕР ЗАДАЧ</b>\n` +
        `Проект: ${clientTitle}<code>#${escapeHtml(projectId)}</code> • Обновлено: <code>${dateStr} ${timeStr}</code>`;

    const inProgressTasks = (tasks || []).filter(t => t.status !== 'completed');
    const completedTasks = (tasks || []).filter(t => t.status === 'completed');

    let inProgressSection = '<b>В работе (In Progress):</b>\n';
    if (inProgressTasks.length > 0) {
        const items = inProgressTasks.map((t, idx) => {
            const assignee = t.type === 'client' ? 'Клиент' : 'Агентство (Дмитрий)';
            let statusDesc = 'В графике спринта';
            if (t.targetDate) {
                if (t.targetDate < todayIso) {
                    statusDesc = '⚠️ Просрочено';
                } else if (t.targetDate === todayIso) {
                    statusDesc = '🔥 Дедлайн сегодня';
                }
            }
            return `⏳ ${idx + 1}. <b>${escapeHtml(t.text || t.title || 'Задача')}</b>\n` +
                   `   • Дедлайн: <code>${t.targetDate || 'Не указан'}</code>\n` +
                   `   • Ответственный: <code>${assignee}</code>\n` +
                   `   • Статус: <code>${statusDesc}</code>`;
        });
        inProgressSection += items.join('\n\n');
    } else {
        inProgressSection += `<i>Все запланированные задачи выполнены. Активных задач в работе нет.</i>`;
    }

    let archiveSection = '';
    if (completedTasks.length > 0) {
        const completedItems = completedTasks.slice(0, 10).map(t => {
            const cDate = t.completedDate || t.targetDate || dateStr;
            return `✅ ${cDate} — ${escapeHtml(t.text || t.title || 'Задача')}`;
        }).join('\n');
        archiveSection = `<blockquote expandable><b>Выполнено за последние 7 дней (Archive):</b>\n${completedItems}</blockquote>`;
    } else {
        archiveSection = `<blockquote expandable><b>Выполнено за последние 7 дней (Archive):</b>\n<i>Завершённых задач в архиве пока нет.</i></blockquote>`;
    }

    const overdueCount = inProgressTasks.filter(t => t.targetDate && t.targetDate < todayIso).length;
    let verdictSection = '';
    if (overdueCount === 0) {
        verdictSection = `<blockquote>⚡ <b>Темп спринта:</b>\nВсе ключевые дедлайны соблюдаются. Просроченных задач: <code>0</code>.</blockquote>`;
    } else {
        verdictSection = `<blockquote>⚡ <b>Темп спринта:</b>\nВнимание: обнаружено просроченных задач: <code>${overdueCount}</code>. Требуется актуализация сроков.</blockquote>`;
    }

    return `${headerLine}\n\n${inProgressSection}\n\n${archiveSection}\n\n${verdictSection}`;
}

/**
 * Логирование трейса в Mark_SysLogs (в формате Ареса)
 */
async function logTraceToGAS(compactLog, dateStr) {
    try {
        await axios.post(MARK_CONFIG.GAS_URL, {
            action: 'logTrace',
            log: compactLog,
            date: dateStr
        }, { timeout: 8000 });
    } catch (e) {
        console.error('[Mark_Kernel] logTraceToGAS error:', e.message);
    }
}

/**
 * Получить клиента из CRM по Telegram Chat ID.
 * Единственный источник правды — clients_db/master.
 * scheduled_invoices используется только для обогащения ads-статистикой.
 */
async function getClientByTelegramChatId(chatId, db) {
    if (!chatId || !db) return null;
    const cleanChatId = chatId.toString();

    try {
        // === ШАГ 1: Ищем в master (единственный источник правды для CRM) ===
        const masterRef = db.collection('artifacts')
            .doc('aureliusclients')
            .collection('public').doc('data')
            .collection('clients_db').doc('master');

        const masterSnap = await masterRef.get();
        if (masterSnap.exists) {
            const cls = masterSnap.data().clients || [];
            const mc = cls.find(c => (c.telegramChatId || '').toString() === cleanChatId);
            if (mc) {
                // Базовый объект из master
                const client = {
                    id: mc.id,
                    clientId: mc.id,
                    clientName: mc.name || '',
                    telegramChatId: cleanChatId,
                    adsId: (mc.adsId || '').replace(/\D/g, '').trim(),
                    siteUrl: mc.links?.site || '',
                    amount: mc.amount || '0',
                    currency: mc.ads_currency || 'EUR',
                    monthly_stats: mc.monthly_stats || [],
                    // Берём кэшированные данные из master (обновляются скриптом Ads)
                    clicks: mc.cachedClicks || '0',
                    cost: mc.cachedCost || '0',
                    convs: mc.cachedConvs || '0',
                    cpa: mc.cachedCpa || '0',
                    cachedConvDetails: mc.cachedConvDetails || null,
                    cachedConvValue: mc.cachedConvValue || '0',
                    cachedRoas: mc.cachedRoas || '0',
                    cachedAov: mc.cachedAov || '0',
                    cachedImps: mc.cachedImps || mc.cachedImpressions || '0',
                    periods: null,
                    campaigns: [],
                    queries: [],
                    conversions: []
                };

                // === ШАГ 2: Обогащаем детальными ads-данными из scheduled_invoices ===
                if (client.adsId) {
                    try {
                        const siSnap = await db.collection('scheduled_invoices')
                            .where('adsId', '==', client.adsId).limit(1).get();
                        if (!siSnap.empty) {
                            const si = siSnap.docs[0].data();
                            client.periods     = si.periods     || null;
                            client.campaigns   = si.campaigns   || [];
                            client.queries     = si.queries     || [];
                            client.conversions = si.conversions || [];
                            // Перезаписываем свежими данными если они есть
                            if (si.cachedClicks)       client.clicks   = si.cachedClicks;
                            if (si.cachedCost)         client.cost     = si.cachedCost;
                            if (si.cachedConvs)        client.convs    = si.cachedConvs;
                            if (si.cachedCpa)          client.cpa      = si.cachedCpa;
                            if (si.cachedConvDetails)  client.cachedConvDetails = si.cachedConvDetails;
                            if (si.cachedConvValue)    client.cachedConvValue   = si.cachedConvValue;
                            if (si.cachedRoas)         client.cachedRoas        = si.cachedRoas;
                            if (si.cachedAov)          client.cachedAov         = si.cachedAov;
                            if (si.cachedImpressions || si.cachedImps) {
                                client.cachedImps = si.cachedImpressions || si.cachedImps;
                            }
                        }
                    } catch (siErr) {
                        console.error('[Mark_Kernel] scheduled_invoices enrich error:', siErr.message);
                    }
                }

                console.log(`[Mark_Kernel] getClientByTelegramChatId: found "${client.clientName}" (id=${client.id}) via master`);
                return client;
            }
        }

        // === ШАГ 3 (legacy): scheduled_invoices для старых клиентов без telegramChatId в master ===
        const siSnap = await db.collection('scheduled_invoices')
            .where('telegramChatId', '==', cleanChatId).limit(1).get();
        if (!siSnap.empty) {
            const d = siSnap.docs[0].data();
            // Пропускаем заглушки (новые клиенты без имени)
            if (d.clientName && !d.clientName.includes('Ожидает синхронизации')) {
                console.log(`[Mark_Kernel] getClientByTelegramChatId: found "${d.clientName}" via legacy scheduled_invoices`);
                return {
                    id: siSnap.docs[0].id,
                    clientId: d.clientId || siSnap.docs[0].id,
                    clientName: d.clientName || '',
                    telegramChatId: cleanChatId,
                    adsId: d.adsId || '',
                    siteUrl: d.siteUrl || '',
                    amount: d.amount || '0',
                    currency: d.currency || 'EUR',
                    monthly_stats: [],
                    clicks: d.cachedClicks || '0',
                    cost: d.cachedCost || '0',
                    convs: d.cachedConvs || '0',
                    cpa: d.cachedCpa || '0',
                    cachedConvDetails: d.cachedConvDetails || null,
                    cachedConvValue: d.cachedConvValue || '0',
                    cachedRoas: d.cachedRoas || '0',
                    cachedAov: d.cachedAov || '0',
                    cachedImps: d.cachedImpressions || d.cachedImps || '0',
                    periods: d.periods || null,
                    campaigns: d.campaigns || [],
                    queries: d.queries || [],
                    conversions: d.conversions || []
                };
            }
        }

        console.log(`[Mark_Kernel] getClientByTelegramChatId: NOT FOUND for chatId=${cleanChatId}`);
    } catch (e) {
        console.error('[Mark_Kernel] getClientByTelegramChatId error:', e.message);
    }
    return null;
}

/**
 * Получить клиента из CRM по его clientId (для запросов по ID проекта)
 */
async function getClientById(clientId, db) {
    if (!clientId || !db) return null;
    const cleanId = clientId.toString().trim();

    try {
        const masterRef = db.collection('artifacts')
            .doc('aureliusclients')
            .collection('public').doc('data')
            .collection('clients_db').doc('master');

        const masterSnap = await masterRef.get();
        if (masterSnap.exists) {
            const cls = masterSnap.data().clients || [];
            const mc = cls.find(c => (c.id || '').toString() === cleanId);
            if (mc) {
                const client = {
                    id: mc.id,
                    clientId: mc.id,
                    clientName: mc.name || '',
                    telegramChatId: (mc.telegramChatId || '').toString(),
                    adsId: (mc.adsId || '').replace(/\D/g, '').trim(),
                    siteUrl: mc.links?.site || '',
                    amount: mc.amount || '0',
                    currency: mc.ads_currency || 'EUR',
                    monthly_stats: mc.monthly_stats || [],
                    clicks: mc.cachedClicks || '0',
                    cost: mc.cachedCost || '0',
                    convs: mc.cachedConvs || '0',
                    cpa: mc.cachedCpa || '0',
                    cachedConvDetails: mc.cachedConvDetails || null,
                    cachedConvValue: mc.cachedConvValue || '0',
                    cachedRoas: mc.cachedRoas || '0',
                    cachedAov: mc.cachedAov || '0',
                    cachedImps: mc.cachedImps || mc.cachedImpressions || '0',
                    periods: null,
                    campaigns: [],
                    queries: [],
                    conversions: []
                };

                if (client.adsId) {
                    try {
                        const siSnap = await db.collection('scheduled_invoices')
                            .where('adsId', '==', client.adsId).limit(1).get();
                        if (!siSnap.empty) {
                            const si = siSnap.docs[0].data();
                            client.periods     = si.periods     || null;
                            client.campaigns   = si.campaigns   || [];
                            client.queries     = si.queries     || [];
                            client.conversions = si.conversions || [];
                            if (si.cachedClicks)       client.clicks   = si.cachedClicks;
                            if (si.cachedCost)         client.cost     = si.cachedCost;
                            if (si.cachedConvs)        client.convs    = si.cachedConvs;
                            if (si.cachedCpa)          client.cpa      = si.cachedCpa;
                            if (si.cachedConvDetails)  client.cachedConvDetails = si.cachedConvDetails;
                            if (si.cachedConvValue)    client.cachedConvValue   = si.cachedConvValue;
                            if (si.cachedRoas)         client.cachedRoas        = si.cachedRoas;
                            if (si.cachedAov)          client.cachedAov         = si.cachedAov;
                            if (si.cachedImpressions || si.cachedImps) {
                                client.cachedImps = si.cachedImpressions || si.cachedImps;
                            }
                        }
                    } catch (siErr) {
                        console.error('[Mark_Kernel] scheduled_invoices enrich error in getClientById:', siErr.message);
                    }
                }
                return client;
            }
        }

        const siDoc = await db.collection('scheduled_invoices').doc(cleanId).get();
        if (siDoc.exists) {
            const d = siDoc.data();
            return {
                id: siDoc.id,
                clientId: d.clientId || siDoc.id,
                clientName: d.clientName || '',
                telegramChatId: (d.telegramChatId || '').toString(),
                adsId: d.adsId || '',
                siteUrl: d.siteUrl || '',
                amount: d.amount || '0',
                currency: d.currency || 'EUR',
                monthly_stats: [],
                clicks: d.cachedClicks || '0',
                cost: d.cachedCost || '0',
                convs: d.cachedConvs || '0',
                cpa: d.cachedCpa || '0',
                cachedConvDetails: d.cachedConvDetails || null,
                cachedConvValue: d.cachedConvValue || '0',
                cachedRoas: d.cachedRoas || '0',
                cachedAov: d.cachedAov || '0',
                cachedImps: d.cachedImpressions || d.cachedImps || '0',
                periods: d.periods || null,
                campaigns: d.campaigns || [],
                queries: d.queries || [],
                conversions: d.conversions || []
            };
        }
    } catch (e) {
        console.error('[Mark_Kernel] getClientById error:', e.message);
    }
    return null;
}

/**
 * Проверка и инкремент лимита сообщений в месяц
 */
async function checkAndIncrementMarkUsage(chatId, db) {
    if (!chatId || !db) return { allowed: true, count: 1 };
    const monthKey = new Date().toISOString().slice(0, 7);
    const usageDocRef = db.collection('mark_chat_usage').doc(`${chatId}_${monthKey}`);

    try {
        const doc = await usageDocRef.get();
        let count = 0;
        if (doc.exists) {
            count = doc.data().count || 0;
        }

        if (count >= MARK_CONFIG.MONTHLY_CHAT_LIMIT) {
            return { allowed: false, count };
        }

        await usageDocRef.set({
            chatId: chatId.toString(),
            month: monthKey,
            count: count + 1,
            lastUsedAt: new Date()
        }, { merge: true });

        return { allowed: true, count: count + 1 };
    } catch (e) {
        console.error('[Mark_Kernel] checkAndIncrementMarkUsage error:', e.message);
        return { allowed: true, count: 1 };
    }
}

/**
 * Главный обработчик входящих апдейтов Telegram
 */
async function processMarkUpdate(update, db) {
    if (!update) return { status: 'NO_UPDATE' };

    // =========================================================================
    // 1. ОБРАБОТКА CALLBACK QUERY (КНОПКИ МОДИФИКАТОРОВ FREELANCEHUNT)
    // =========================================================================
    if (update.callback_query) {
        const cb = update.callback_query;
        const data = cb.data || '';
        const cbMsg = cb.message;

        if (data.startsWith('fl:')) {
            await answerCallbackQuery(cb.id, 'Генерирую новый вариант...');
            const parts = data.split(':');
            const modifier = parts[1];
            const token = parts[2];

            const session = Module_Freelancehunt.freelanceSessionsMemory.get(token);
            if (!session) {
                await sendTelegramMessage(cbMsg.chat.id, '⚠️ Время сессии истекло. Отправьте команду заново.');
                return { status: 'SESSION_EXPIRED' };
            }

            try {
                sendChatAction(cbMsg.chat.id, 'typing');
                const newReply = await Module_Freelancehunt.generateFreelancehuntResponse(
                    session.promptText,
                    session.mode,
                    session.siteAnalysis,
                    modifier
                );
                const newKeyboard = Module_Freelancehunt.createFreelanceKeyboard(token, session.mode);
                await editTelegramMessage(cbMsg.chat.id, cbMsg.message_id, newReply, newKeyboard);
                return { status: 'CALLBACK_HANDLED', modifier };
            } catch (err) {
                console.error('[Mark_Kernel] Callback error:', err.message);
                await sendTelegramMessage(cbMsg.chat.id, `❌ Ошибка: ${err.message}`, cbMsg.message_id);
                return { status: 'ERROR', error: err.message };
            }
        }
        return { status: 'UNKNOWN_CALLBACK' };
    }

    const msg = update.message;
    if (!msg) return { status: 'NO_MESSAGE' };

    const hasVoice = !!(msg.voice || msg.audio);
    const rawVoice = msg.voice || msg.audio;
    let text = (msg.text || msg.caption || '').trim();

    if (!text && !hasVoice) return { status: 'NO_TEXT_OR_VOICE' };

    // Дедупликация апдейтов Telegram
    if (processedUpdatesCache.has(msg.message_id)) {
        return { status: 'DUPLICATE' };
    }
    processedUpdatesCache.add(msg.message_id);
    if (processedUpdatesCache.size > 200) {
        const first = processedUpdatesCache.values().next().value;
        processedUpdatesCache.delete(first);
    }

    const startTime = Date.now();
    const chat = msg.chat;
    const from = msg.from || {};
    const senderName = from.first_name || from.username || 'Клиент';
    const isPrivate = chat.type === 'private';
    const isAdmin = String(from.id) === String(MARK_CONFIG.ADMIN_CHAT_ID) ||
                    String(from.username || '').toLowerCase() === 'dimscreamer' ||
                    String(from.username || '').toLowerCase() === 'aurelius_admin';
    const isBot = !!from.is_bot;
    const isClient = !isBot && !isAdmin;

    // Проверяем: отвечает ли пользователь напрямую на сообщение Марка (через функцию «Ответить» / Reply)
    const myBotId = String(MARK_CONFIG.TELEGRAM_TOKEN.split(':')[0] || '7811513232');
    const replyTo = msg.reply_to_message;
    const isReplyToMark = !!(
        replyTo &&
        replyTo.from &&
        (
            String(replyTo.from.id) === myBotId ||
            (replyTo.from.is_bot && String(replyTo.from.username || '').toLowerCase() === 'myconversionsbotppcdmitrobot') ||
            (replyTo.from.username && replyTo.from.username.toLowerCase().includes('conversionsbot'))
        )
    );

    // === ОБРАБОТКА ГОЛОСОВОГО СООБЩЕНИЯ (VOICE / AUDIO) ===
    if (hasVoice) {
        sendChatAction(chat.id, 'record_audio');
        try {
            console.log(`[Mark_Kernel] Voice message received in chat ${chat.id} (file_id: ${rawVoice.file_id}, duration: ${rawVoice.duration || 0}s). Downloading...`);
            const fileData = await getTelegramFileAsBase64(rawVoice.file_id);
            if (fileData && fileData.base64) {
                const transcribed = await transcribeVoiceAudio(fileData.base64, fileData.format);
                if (transcribed && transcribed.trim()) {
                    text = transcribed.trim();
                    console.log(`[Mark_Kernel] Voice successfully transcribed: "${text}"`);
                } else {
                    console.warn('[Mark_Kernel] Voice transcription returned empty text.');
                }
            }
        } catch (vErr) {
            console.error('[Mark_Kernel] Voice transcription error:', vErr.message);
        }

        // Если голос не удалось расшифровать
        if (!text) {
            if (isPrivate || isReplyToMark) {
                await sendTelegramMessage(chat.id, "🎙️ <i>Не удалось разобрать голосовое сообщение (слишком тихо или помехи). Пожалуйста, повторите или напишите текстом.</i>", msg.message_id);
                return { status: 'VOICE_TRANSCRIBE_EMPTY' };
            }
            return { status: 'VOICE_IGNORED_NOT_ADDRESSED' };
        }
    }

    // === 1. СОХРАНЕНИЕ СООБЩЕНИЯ В FIRESTORE ДЛЯ АРХИВА И ПСИХОТИПА ===
    const client = await getClientByTelegramChatId(chat.id, db);
    if (client) {
        await saveClientMessage(db, client, {
            messageId: msg.message_id,
            chatId: chat.id,
            senderId: from.id,
            senderName: senderName,
            senderUsername: from.username || '',
            isClient: isClient,
            isAdmin: isAdmin,
            isMark: false,
            text: hasVoice ? `🎙️ [Голосовое]: ${text}` : text
        });

        // === 1.1 АВТО-РАСПОЗНАВАНИЕ ЗАДАЧ ИЗ ЧАТА НА ЛЕТУ (WEBHOOK TRIGGER) ===
        if (!isBot && text) {
            await detectAndScheduleChatTask(db, client, {
                messageId: msg.message_id,
                chatId: chat.id,
                senderName: senderName,
                isAdmin: isAdmin,
                isClient: isClient,
                text: text
            });
        }
    }

    // В группах Марк отвечает если:
    // 1. Это личный чат (isPrivate)
    // 2. Или ответ на сообщение Марка через функцию «Ответить» (isReplyToMark) -> ключевое слово НЕ НУЖНО!
    // 3. Или в тексте/голосовом есть упоминание бота (@myconversionsbotppcdmitrobot)
    // 4. Или в тексте/голосовом есть ключевое слово Марк (isNameCall)
    // 5. Или это команда (/start, /os, /stats и т.д.)
    const botMention = /@myconversionsbotppcdmitrobot/i.test(text);
    const isNameCall = /(марк|марку|марке|марком|mark|маркус|marcus|аурелиус|aurelius)/i.test(text);
    const isCommand = text.startsWith('/');

    if (!isPrivate && !isReplyToMark && !botMention && !isNameCall && !isCommand) {
        return { status: 'IGNORED_GROUP_MSG' };
    }

    const now = new Date();
    const traceId = `${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 1000000)}`;
    const nowStr = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }) + ' ' +
                   now.toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv' });

    // =========================================================================
    // 2. МАРШРУТИЗАЦИЯ (L0 / L1 / L2)
    // =========================================================================
    
    let markOsConfig = null;
    if (db) {
        try {
            const doc = await db.collection("mark_system").doc("os_config").get();
            if (doc.exists) markOsConfig = doc.data();
        } catch(e) {
            console.error("mark_system config fetch error:", e);
        }
    }

    
    // MARK OS QUICK COMMAND
    if (text === '/os' || text === '/settings' || text.toLowerCase() === 'настройки') {
        await sendTelegramMessage(chat.id, "⚙️ <b>Панель управления Mark OS</b>", msg.message_id, {
            inline_keyboard: [[{
                text: "Отрыть Mark OS",
                web_app: { url: "https://aureliusclients.web.app/mark_os.html" }
            }]]
        });
        return { status: 'L0_OS_OPENED' };
    }

    const route = routeMessage(text, { chat, from, isPrivate, markOsConfig });



    // ⚡ L0: ПРЯМЫЕ КОМАНДЫ МОДУЛЕЙ
    if (route.layer === 'L0') {
        const cmd = route.command;
        const payload = route.payload;

        // Команды Freelancehunt
        if (cmd === '/fl' || cmd === 'фл' || cmd === '/fl_chat') {
            const isChatMode = cmd === '/fl_chat';
            if (!payload) {
                const guideText = isChatMode
                    ? `💬 <b>FREELANCEHUNT: ОТВЕТ В ЧАТЕ</b>\n\nОтправьте сообщение заказчика после команды:\n<code>/fl_chat Клиент пишет: какая стоимость ведения?</code>`
                    : `💼 <b>FREELANCEHUNT: ГЕНЕРАТОР СТАВОК</b>\n\nОтправьте описание проекта, ТЗ или ссылку после команды:\n<code>/fl https://freelancehunt.com/project/... Настроить Google Shopping...</code>`;
                await sendTelegramMessage(chat.id, guideText, msg.message_id);
                return { status: 'L0_HELP_SENT' };
            }

            sendChatAction(chat.id, 'typing');
            try {
                const sessionToken = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                let siteAnalysis = null;
                const extractedUrl = Module_Freelancehunt.extractUrlFromText(payload);
                if (extractedUrl) {
                    siteAnalysis = await Module_Freelancehunt.fetchSiteQuickAnalysis(extractedUrl);
                }

                const replyText = await Module_Freelancehunt.generateFreelancehuntResponse(
                    payload,
                    isChatMode ? 'chat' : 'bid',
                    siteAnalysis,
                    null
                );

                Module_Freelancehunt.freelanceSessionsMemory.set(sessionToken, {
                    promptText: payload,
                    mode: isChatMode ? 'chat' : 'bid',
                    siteAnalysis,
                    createdAt: Date.now()
                });

                const keyboard = Module_Freelancehunt.createFreelanceKeyboard(sessionToken, isChatMode ? 'chat' : 'bid');
                await sendTelegramMessage(chat.id, replyText, msg.message_id, keyboard);
                return { status: 'L0_FREELANCE_DONE' };
            } catch (e) {
                await sendTelegramMessage(chat.id, `❌ Ошибка генерации: ${e.message}`, msg.message_id);
                return { status: 'L0_FREELANCE_ERROR', error: e.message };
            }
        }

        // Команда /id
        if (cmd === '/id' || cmd === 'мой id' || cmd === 'чат id') {
            await sendTelegramMessage(chat.id, `ℹ️ <b>ПАРАМЕТРЫ ЧАТА</b>\n\n🔹 ID этого чата: <code>${chat.id}</code>\n🔹 Тип чата: <code>${chat.type}</code>`, msg.message_id);
            return { status: 'L0_ID_SENT' };
        }

        
        // Привязка группы к клиенту (/start bind_CLIENTID или /startgroup bind_CLIENTID)
        // Telegram может слать как "/start bind_ID" так и "/start@BotName bind_ID" — обрабатываем оба варианта
        const bindMatch = text.match(/^\/start(?:@\S+)?\s+bind_(\S+)/i) || text.match(/^\/startgroup(?:@\S+)?\s+bind_(\S+)/i);
        const bindPayload = (payload && payload.startsWith('bind_')) ? payload : (bindMatch ? `bind_${bindMatch[1]}` : null);
        if (bindPayload) {
            const rawId = bindPayload.replace('bind_', '').trim();
            if (rawId && db) {
                try {
                    // 1. Ищем и обновляем в scheduled_invoices
                    let updatedName = rawId;
                    const siDoc = await db.collection('scheduled_invoices').doc(rawId).get();
                    if (siDoc.exists) {
                        updatedName = siDoc.data().clientName || rawId;
                        await siDoc.ref.update({ telegramChatId: chat.id.toString() });
                    } else {
                        const q = await db.collection('scheduled_invoices').where('clientId', '==', rawId).get();
                        if (!q.empty) {
                            updatedName = q.docs[0].data().clientName || rawId;
                            await q.docs[0].ref.update({ telegramChatId: chat.id.toString() });
                        } else {
                            // Клиент совершенно новый, еще не имеет записей об оплатах/инвойсах
                            await db.collection('scheduled_invoices').doc(rawId).set({
                                clientId: rawId,
                                clientName: "Новый клиент (Ожидает синхронизации)",
                                telegramChatId: chat.id.toString(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    }

                    // 2. Обновляем в master clients_db
                    const masterRef = db.collection('artifacts').doc('aureliusclients').collection('public').doc('data').collection('clients_db').doc('master');
                    const mSnap = await masterRef.get();
                    if (mSnap.exists) {
                        let cls = mSnap.data().clients || [];
                        cls = cls.map(c => c.id.toString() === rawId.toString() ? { ...c, telegramChatId: chat.id.toString() } : c);
                        await masterRef.set({ clients: cls }, { merge: true });
                    }

                    await sendTelegramMessage(chat.id, `✅ <b>[МАРК] ПРИВ'ЯЗКА УСПІШНА</b>\n\n🔹 Клієнт: <b>${escapeHtml(updatedName)}</b>\n🔹 ID чату: <code>${chat.id}</code>\n\n<i>Тепер інвойси та аналітика надходитимуть прямо в цей чат.</i>`, msg.message_id);
                    return { status: 'L0_BIND_SUCCESS' };
                } catch (e) {
                    console.error('Bind error:', e);
                }
            }
        }

        // Интерактивный трекер задач по Deep-Link ссылке (/start tasks_PROJECTID)
        const tasksMatch = text.match(/^\/start(?:@\S+)?\s+tasks_(\S+)/i) || 
                           text.match(/^\/startgroup(?:@\S+)?\s+tasks_(\S+)/i) || 
                           text.match(/^\/tasks_(\S+)/i);
        const tasksProjectId = (payload && payload.startsWith('tasks_')) ? payload.replace('tasks_', '').trim() : (tasksMatch ? tasksMatch[1].trim() : null);
        if (tasksProjectId) {
            sendChatAction(chat.id, 'typing');
            try {
                const tasks = await getClientTasksFromDb(db, tasksProjectId);
                const trackerHtml = renderTaskTrackerTemplate(tasksProjectId, tasks, client);
                await sendTelegramMessage(chat.id, trackerHtml, msg.message_id);
                return { status: 'L0_TASKS_TRACKER_SENT', projectId: tasksProjectId, taskCount: tasks.length };
            } catch (e) {
                console.error('[Mark_Kernel] tasks_ deeplink error:', e.message);
                await sendTelegramMessage(chat.id, `❌ <i>Ошибка загрузки задач проекта #${escapeHtml(tasksProjectId)}: ${escapeHtml(e.message)}</i>`, msg.message_id);
                return { status: 'L0_TASKS_TRACKER_ERROR', error: e.message };
            }
        }

        // Команда /help или /start
        if (cmd === '/help' || cmd === '/start') {
            await sendTelegramMessage(chat.id, Module_Automation.getHelpMessage(), msg.message_id);
            return { status: 'L0_HELP_SENT' };
        }
    }

    // =========================================================================
    // 3. ПРОВЕРКА КЛИЕНТА В CRM И ЛИМИТОВ
    // =========================================================================
    let targetClient = client;
    if (!targetClient && db) {
        // Проверяем, упоминается ли в тексте конкретный ID проекта (например: "проект 55", "проекту 55", "#55")
        const pidMatch = text.match(/(?:проект|проекту|проекта|#)\s*([0-9a-zA-Z_-]+)/i);
        if (pidMatch && pidMatch[1]) {
            targetClient = await getClientById(pidMatch[1], db);
            if (targetClient) {
                console.log(`[Mark_Kernel] Resolved client #${targetClient.id} directly from prompt reference`);
            }
        }
    }

    const clientName = targetClient?.clientName || senderName;

    if (!targetClient && !isPrivate) {
        await sendTelegramMessage(chat.id, `⚠️ <b>[МАРК] ЧАТ НЕ ПРИВЯЗАН</b>\n\n🔹 ID чата: <code>${chat.id}</code>\n\n<i>Этот чат еще не привязан к клиенту в CRM. Привяжите его в панели управления.</i>`, msg.message_id);
        return { status: 'UNBOUND_CHAT' };
    }

    const usage = await checkAndIncrementMarkUsage(chat.id, db);
    if (!usage.allowed) {
        await sendTelegramMessage(chat.id, `⚠️ <b>ЛИМИТ СООБЩЕНИЙ</b>\n\n🔹 Месячный лимит: <code>${MARK_CONFIG.MONTHLY_CHAT_LIMIT}</code>\n\n<i>Напишите Дмитрию (@aureliusmarketingai) для расширения лимита.</i>`, msg.message_id);
        return { status: 'RATE_LIMIT_EXCEEDED' };
    }

    // =========================================================================
    // 4. ОЧИСТКА ТЕКСТА И ПОДГОТОВКА КОНТЕКСТА (L1 & L2)
    // =========================================================================
    sendChatAction(chat.id, 'typing');

    const cleanUserPrompt = text.replace(/(^|[^а-яА-ЯёЁa-zA-Z0-9_])(марк|марку|марке|марком|mark|маркус|marcus|аурелиус|aurelius|бот|bot)[,:\s]*/gi, '')
                                .replace(/@myconversionsbotppcdmitrobot/gi, '').trim() || text;

    // Если сообщение является ответом на конкретную реплику (Reply to Message), обогащаем контекст цитатой
    let promptWithReplyContext = cleanUserPrompt;
    if (replyTo && (replyTo.text || replyTo.caption)) {
        const repliedSnippet = (replyTo.text || replyTo.caption || '').trim().slice(0, 300);
        const repliedAuthor = replyTo.from?.is_bot ? 'Марк' : (replyTo.from?.first_name || 'Собеседник');
        promptWithReplyContext = `[Ответ на реплику (${repliedAuthor}): "${repliedSnippet}"]\n${cleanUserPrompt}`;
    }

    let history = chatHistoryMemory.get(chat.id.toString()) || [];

    // Собираем контекст активного модуля
    const adsContext = await Module_GoogleAds.buildContext(targetClient, cleanUserPrompt);
    const activeProjectId = targetClient?.id || '55';

    const systemPrompt = `ТЫ — «МАРК», ИНТЕЛЛЕКТУАЛЬНЫЙ ОПЕРАЦИОННЫЙ ЦЕНТР И ПЕРФОРМАНС-АНАЛИТИК АГЕНТСТВА AURELIUS ADS (aurelius.marketing).
Твой создатель и старший партнер — Дмитрий (@aureliusmarketingai), основатель агентства Aurelius Ads.
Ты работаешь в общем Telegram-чате с клиентом и Дмитрием.

${adsContext.contextText}

АРХИТЕКТУРА СООБЩЕНИЯ (NEXT-GEN UI TERMINAL):
1. Заголовок: Всегда начинается со статусного индикатора и названия модуля в <b>...</b>.
   Примеры: 🟢 <b>ШТАБ МАРКА | СВОДКА</b>, ⚡ <b>RADAR | АЛЕРТ</b>, 💼 <b>ADS ENGINE | ОТЧЁТ</b>, 💡 <b>АНАЛИЗ СИТУАЦИИ</b>.
2. Воздух: Между каждым блоком — ровно ДВОЙНОЙ перенос строки (\\n\\n). Никаких слипшихся абзацев.
3. Цифры и факты: Любые суммы, проценты, даты, ID, ключевые фразы оборачивай ТОЛЬКО в <code>...</code>.
   Пример: Бюджет: <code>$450.00</code>, Конверсии: <code>18</code>, CPA: <code>$4.20</code>, ID: <code>#7392</code>, ROAS: <code>385%</code>.
4. Вывод / Резюме: Финальный вердикт или рекомендация ВСЕГДА упаковывается в <blockquote>...</blockquote>.
5. Детализация: Второстепенные списки или длинные технические логи прячь в <blockquote expandable>...</blockquote>.
6. Чистота кода: Строго закрывай все HTML-теги. Никаких символов < и >, кроме как в тегах Telegram.
   СТРОГИЙ ЗАПРЕТ НА MARKDOWN (*, _, \`\`\`, #) и неподдерживаемые теги (<div>, <p>, <span>, <br>). Переносы строк только через \\n.
8. ПРАВИЛА ГЕНЕРАЦИИ ПУБЛИЧНОЙ СВОДКИ (ДИНАМИЧЕСКИЙ БАЛАНС):
   - ЖИВАЯ ПРИВЯЗКА К ПЕРИОДАМ: Обязательно используй временные привязки (вчера, за последние 7 дней, по итогам месяца / 30 дней), но органично вплетай их в текст метрик, а НЕ нумерованным списком («1. Вчера, 2. Неделя»).
   - ПУЛ ПОЗИТИВНЫХ МЕТРИК: Подсвечивай ВСЕ сильные стороны из доступных данных — объем лидов, окупаемость, снижение стоимости заявки, удержание доли показов (Search IS). Не ограничивайся 1-2 цифрами, покажи реальный массив побед.
   - КОНТРОЛИРУЕМЫЕ МИКРО-ПРОСАДКИ (НЕЙТРАЛЬНО-ПЛОХИЕ МОМЕНТЫ): Обязательно укажи 1-2 реальные небольшие просадки или шероховатости для 100% честности и доверия:
     * Локальное удорожание CPA в отдельной кампании за последние дни.
     * Небольшая просадка показов в утренние часы из-за активности конкурентов.
     * Временный всплеск цены клика по общим ключевым фразам.
   - РЕШЕНИЕ И ЗАДАЧИ: Сразу после описания просадки покажи, что ситуация под контролем, и свяжи её с задачами:
     * «Данную просадку уже локализовали. Правки по ставкам и минусации внесены в плановые <a href="https://t.me/AureliusMarketingAI_bot?start=tasks_${activeProjectId}">задачи</a> спринта.»
     * «Ситуация штатная, общий баланс юнит-экономики в плюсе. Корректировка ставок по времени и фильтрация нецелевых площадок уже зафиксированы в <a href="https://t.me/AureliusMarketingAI_bot?start=tasks_${activeProjectId}">задачи</a> текущего спринта.»
9. ПРАВИЛА ИНЛАЙН-РАЗМЕТКИ ДЛЯ TELEGRAM MOBILE (iOS & Android):
   - Разделяй заголовок сообщения и строку с ID проекта переносом строки \\n, а после проекта — ровно \\n\\n:
     📊 <b>ШТАБ МАРКА | СВОДКА ПО ПРОЕКТУ</b>\\nПроект: <code>#${activeProjectId}</code> • <i>Аналитический срез</i>\\n\\n
   - Тег <code>...</code> используется ТОЛЬКО для коротких значений (цифры, %, суммы, ID, статусы).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вставлять символы перевода строки (\\n) внутрь тега <code>.
     Правильно: Расход: <code>$84.20</code> / Лимит: <code>$150.00</code>
     Неправильно: <code>Расход:\\n$84.20</code>
   - Тег должен плотно облегать значение БЕЗ лишних пробелов: <code>390%</code>, а не <code> 390% </code>.
10. ПРАВИЛО РЕЛЕВАНТНОСТИ ДИПЛИНКОВ НА ЗАДАЧИ:
   НЕ вставляй ссылку на задачи в каждое сообщение! Это инструмент точечного действия, а не спам.
   Используй ссылку <a href="https://t.me/AureliusMarketingAI_bot?start=tasks_${activeProjectId}">задачи</a> ТОЛЬКО в следующих случаях:
   1. Прямой вопрос клиента или Дмитрия о текущем плане, спринте или статусе выполнения работ.
   2. Когда в диалоге зафиксирована новая договоренность или обнаружена проблема, требующая постановки новой задачи.
   3. В финале аналитической сводки при предложении следующего шага («Плановые корректировки по ставкам уже внесены в <a href="https://t.me/AureliusMarketingAI_bot?start=tasks_${activeProjectId}">задачи</a> спринта»).
   В обычных коротких ответах, приветствиях, уточнениях или дежурных репликах ссылки на задачи СТРОГО ЗАПРЕЩЕНЫ.
`;


    const messages = [];
    if (history.length > 0) {
        history.slice(-4).forEach(h => messages.push(h));
    }

    // =========================================================================
    // 5. ЛОГИЧЕСКИЙ СЛОЙ МАРКА (OPENROUTER LLM)
    // =========================================================================
    let aiRes;
    try {
        aiRes = await callMarkLLM({
            systemPrompt,
            messages,
            userPrompt: promptWithReplyContext,
            senderName,
            temperature: 0.7,
            maxTokens: 2500
        });
    } catch (err) {
        console.error('[Mark_Kernel] OpenRouter error:', err.message);
        aiRes = {
            reply: 'Вибачте, виникла невелика затримка при зверненні до сервера аналітики. Дмитро вже бачить ваше повідомлення та відповість найближчим часом.',
            thought: err.message,
            tokensIn: 0,
            tokensOut: 0,
            latencyMs: 0,
            costUSD: 0,
            model: MARK_CONFIG.OPENROUTER_MODEL
        };
    }

    // Отправка ответа в Telegram (Публичный контур)
    const sentResp = await sendTelegramMessage(chat.id, aiRes.reply, msg.message_id);

    // =========================================================================
    // 5.1 ТЕНЕВОЙ КОНТУР (DUAL-LOOP PROTOCOL / GHOST TELEMETRY)
    // =========================================================================
    // Срабатывает при запросах статуса/сводки/анализа рекламы («как дела», «что там», «какие результаты», «дай сводку»)
    const statusQueryRegex = /(как\s+(у\s+нас\s+)?дела|что\s+там|какие\s+результаты|дай\s+сводку|что\s+(там\s+)?по\s+(проекту|рекламе)|сделай\s+(срез|сводку)|сводка|срез|как\s+успехи|отчет|статистика|стата)/i;
    const isStatusQuery = statusQueryRegex.test(cleanUserPrompt) || statusQueryRegex.test(text);

    if (isStatusQuery && (targetClient || client)) {
        const reportingClient = targetClient || client;
        try {
            const adminChatId = MARK_CONFIG.ADMIN_CHAT_ID;
            // Генерируем хирургический Ghost Report без цензуры (Снайперский дайджест)
            const ghostPrompt = `ТЫ — ТЕНЕВОЙ МОНИТОР МАРКА (GHOST TELEMETRY).
Ты формируешь закрытый инженерный дайджест лично администратору агентства Дмитрию (@aureliusmarketingai) в ответ на публичный статус-запрос клиента.

ПРОЕКТ: #${activeProjectId} (${reportingClient.clientName || 'Клиент'})
ДАННЫЕ ПО АККАУНТУ GOOGLE ADS:
${adsContext.contextText}

ПУБЛИЧНЫЙ ОТВЕТ МАРКА КЛИЕНТУ:
"${aiRes.reply}"

ПРАВИЛА И СТРОГИЙ РЕГЛАМЕНТ GHOST TELEMETRY:
1. ЗАПРЕЩЕНО писать длинные простыни текста более чем на 3-4 ключевые проблемы!
2. Выдели ТОЛЬКО 2-3 критические аномалии (худшая кампания, главная потеря бюджета/рейтинга, слив CPA).
3. Подсвети лучшую кампанию (донор эффективности / рекордный ROAS).
4. Блок «Quick Fix» упакуй строго в <blockquote expandable> ровно до 3 конкретных шагов руками на 10 минут.

ЭТАЛОННЫЙ ФОРМАТ СООБЩЕНИЯ (TELEGRAM HTML):
🛰️ <b>GHOST TELEMETRY | СРЕЗ ДЛЯ ДМИТРИЯ</b>
Проект: <code>#${activeProjectId}-${escapeHtml(reportingClient.clientName || 'Project')}</code> • <i>Истинная телеметрия</i>

🔴 <b>Главные утечки:</b>
• <b>[Название_кампании]:</b> [слив бюджета / высокий CPA] — CPA <b><code>{cpa}</code></b> при ROAS <b>{roas}%</b>.
• <b>Потери из-за рейтинга:</b> <b><code>{lostISRank}%</code></b> (слабый Quality Score объявлений / посадочной).
• <b>Потери бюджета:</b> <b><code>{lostISBudget}%</code></b> срезано лимитом.

🟢 <b>Точка роста:</b>
• Кампания <b>[Кампания_донор]</b> даёт рекордный ROAS <b><code>{roas}%</code></b>.

<blockquote expandable>🔧 <b>Quick Fix (План на 10 минут):</b>
1. [Действие 1: срезать бюджет или перелить в кампанию-донор].
2. [Действие 2: заминусовать пустые запросы без конверсий].
3. [Действие 3: проверить ставки / релевантность].</blockquote>

Строго соблюдай валидный Telegram HTML: <b>, <code>, <blockquote expandable>. Никакого Markdown.
`;

            const ghostRes = await callMarkLLM({
                systemPrompt: ghostPrompt,
                messages: [],
                userPrompt: `Сформируй Ghost Telemetry для проекта #${activeProjectId} по текущему состоянию аккаунта.`,
                senderName: 'System',
                temperature: 0.3,
                maxTokens: 1500
            });

            if (ghostRes && ghostRes.reply) {
                // Если запрос пришел из публичного чата, отправляем скрыто в личку Дмитрия.
                // Если запрос пришел прямо из лички Дмитрия, отправляем следом в личку, чтобы он видел оба слоя.
                await sendTelegramMessage(adminChatId, ghostRes.reply);
                console.log(`[Mark_Kernel] Dual-loop Ghost Telemetry sent to admin (${adminChatId}) for project #${activeProjectId}`);
            }
        } catch (ghostErr) {
            console.error('[Mark_Kernel] Dual-loop Ghost Telemetry error:', ghostErr.message);
        }
    }

    // Сохраняем ответ Марка в историю чата
    if (client && aiRes && aiRes.reply) {
        const markMsgId = sentResp?.data?.result?.message_id || Date.now();
        await saveClientMessage(db, client, {
            messageId: markMsgId,
            chatId: chat.id,
            senderId: 'mark_ai',
            senderName: 'Марк (AI)',
            senderUsername: 'mark',
            isClient: false,
            isAdmin: false,
            isMark: true,
            isBot: true,
            text: aiRes.reply
        });
    }

    // Обновляем память истории
    history.push({ role: 'user', content: `${senderName}: ${cleanUserPrompt}` });
    history.push({ role: 'assistant', content: aiRes.reply });
    if (history.length > 8) history = history.slice(-8);
    chatHistoryMemory.set(chat.id.toString(), history);

    const totalDuration = Date.now() - startTime;

    // =========================================================================
    // 6. ФОРМИРОВАНИЕ СКВОЗНОГО ТРЕЙСА (ФОРМАТ АРЕСА)
    // =========================================================================
    function padDots(label, val) {
        const d = '...................................';
        return (label + d).substring(0, 20) + val + '\n';
    }

    let logOutput = `[TRACE_START] [${traceId}] | Duration: ${totalDuration}ms\n`;
    logOutput += `\n═══════════════\nREQUEST\n═══════════════\n\n`;
    logOutput += `User........... ${from.id || 'Unknown'}\n`;
    logOutput += `Chat........... ${chat.title || 'Telegram'}\n`;
    logOutput += `Type........... ${hasVoice ? 'VOICE' : 'TEXT'}${isReplyToMark ? ' (REPLY_TO_MARK)' : ''}\n`;
    logOutput += `Message........ ${text}\n`;
    logOutput += `Received....... ${nowStr.split(' ')[1] || '00:00:00'}\n`;

    logOutput += `\n═══════════════\nKERNEL & ROUTER\n═══════════════\n\n`;
    logOutput += `[0ms] ✅ [KERNEL] processMarkUpdate сработал.\n`;
    logOutput += `[${aiRes.latencyMs}ms] �� [ROUTER] Layer: ${route.layer} | Module: ${route.moduleKey} | Trigger: "${route.trigger}"\n`;

    logOutput += `\n═══════════════\nOPENROUTER AI\n═══════════════\n\n`;
    logOutput += `[${totalDuration}ms] �� [AI_RESPONSE] Model: ${aiRes.model}\n`;
    logOutput += padDots('Thinking', aiRes.thought ? aiRes.thought.substring(0, 100) + '...' : '(none)');
    logOutput += padDots('Tokens In', aiRes.tokensIn);
    logOutput += padDots('Tokens Out', aiRes.tokensOut);
    logOutput += padDots('Cost (USD)', `$${aiRes.costUSD.toFixed(6)}`);
    logOutput += padDots('Latency', `${aiRes.latencyMs}ms`);

    logOutput += `\n═══════════════\nRESPONSE\n═══════════════\n\n`;
    logOutput += `${aiRes.reply}\n\n`;
    logOutput += `[TRACE_END] [${traceId}] | Status: SUCCESS | Total: ${totalDuration}ms\n`;

    logTraceToGAS(logOutput, nowStr.split(' ')[0]).catch(() => {});

    return {
        status: 'SUCCESS',
        traceId,
        route,
        aiRes
    };
}

module.exports = {
    saveClientMessage,
    detectAndScheduleChatTask,
    processMarkUpdate,
    getClientByTelegramChatId,
    checkAndIncrementMarkUsage,
    logTraceToGAS,
    chatHistoryMemory
};