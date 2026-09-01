/**
 * ��️ Mark_Kernel.js — Главное ядро обработки и оркестрации Марка
 */
const axios = require('axios');
const { MARK_CONFIG } = require('./Mark_Config');
const { sendTelegramMessage, editTelegramMessage, sendChatAction, answerCallbackQuery } = require('./Mark_Telegram');
const { callMarkLLM } = require('./Mark_AI_Bridge');
const { routeMessage } = require('./Mark_Router');
const { getModule } = require('./Mark_Registry');
const { Module_Freelancehunt } = require('../modules/Module_Freelancehunt');
const { Module_GoogleAds } = require('../modules/Module_GoogleAds');
const { Module_Automation } = require('../modules/Module_Automation');

// Память сессий и истории
const processedUpdatesCache = new Set();
const chatHistoryMemory = new Map();

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
    if (!msg || !msg.text) return { status: 'NO_TEXT' };

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
    const text = msg.text.trim();
    const senderName = from.first_name || from.username || 'Клиент';
    const isPrivate = chat.type === 'private';
    const botMention = /@myconversionsbotppcdmitrobot/i.test(text);

    // В группах Марк отвечает только при упоминании имени или команды
    const isNameCall = /(марк|марку|марке|марком|mark|маркус|marcus|аурелиус|aurelius)/i.test(text);
    const isCommand = text.startsWith('/');

    if (!isPrivate && !botMention && !isNameCall && !isCommand) {
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
                    ? `�� <b>Freelancehunt: Ответ клиенту в чате (Alpha-Freelance)</b>\n\nОтправьте сообщение заказчика после команды:\n<code>/fl_chat Клиент пишет: какая стоимость ведения и какие гарантии вы даете?</code>`
                    : `�� <b>Freelancehunt: Генератор ставок (Alpha-Freelance)</b>\n\nОтправьте описание проекта, ТЗ или ссылку после команды:\n<code>/fl https://freelancehunt.com/project/... Настроить Google Shopping для интернет-магазина...</code>`;
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
            await sendTelegramMessage(chat.id, `�� <b>ID этого чата:</b> <code>${chat.id}</code>\n�� <b>Тип:</b> ${chat.type}`, msg.message_id);
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

                    await sendTelegramMessage(chat.id, `✅ <b>[Марк] Чат успішно прив'язано до клієнта "${updatedName}"!</b>\nТепер інвойси та аналітика надходитимуть прямо в цей чат.`, msg.message_id);
                    return { status: 'L0_BIND_SUCCESS' };
                } catch (e) {
                    console.error('Bind error:', e);
                }
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
    const client = await getClientByTelegramChatId(chat.id, db);
    const clientName = client?.clientName || senderName;

    if (!client && !isPrivate) {
        await sendTelegramMessage(chat.id, `⚠️ <b>[Марк]</b> Этот чат (<code>${chat.id}</code>) еще не привязан к клиенту в CRM. Привяжите его в панели CRM.`, msg.message_id);
        return { status: 'UNBOUND_CHAT' };
    }

    const usage = await checkAndIncrementMarkUsage(chat.id, db);
    if (!usage.allowed) {
        await sendTelegramMessage(chat.id, `⚠️ Достигнут месячный лимит сообщений (${MARK_CONFIG.MONTHLY_CHAT_LIMIT}). Напишите Дмитрию (@aureliusmarketingai) для расширения лимита.`, msg.message_id);
        return { status: 'RATE_LIMIT_EXCEEDED' };
    }

    // =========================================================================
    // 4. ОЧИСТКА ТЕКСТА И ПОДГОТОВКА КОНТЕКСТА (L1 & L2)
    // =========================================================================
    sendChatAction(chat.id, 'typing');

    const cleanUserPrompt = text.replace(/(^|[^а-яА-ЯёЁa-zA-Z0-9_])(марк|марку|марке|марком|mark|маркус|marcus|аурелиус|aurelius|бот|bot)[,:\s]*/gi, '')
                                .replace(/@myconversionsbotppcdmitrobot/gi, '').trim() || text;

    let history = chatHistoryMemory.get(chat.id.toString()) || [];

    // Собираем контекст активного модуля
    const adsContext = await Module_GoogleAds.buildContext(client, cleanUserPrompt);

    const systemPrompt = `Ты — Марк (Mark), персональный AI-аналитик и перформанс-маркетолог агентства Aurelius Ads (aurelius.marketing).
Твой создатель и старший партнер — Дмитрий (@aureliusmarketingai), основатель агентства Aurelius Ads.
Ты работаешь в общем Telegram-чате с клиентом и Дмитрием.

${adsContext.contextText}

ОБЩИЕ ПРАВИЛА:
1. Язык: Отвечай на языке собеседника (Украинский или Русский).
2. Субординация: Изменение бюджетов и стратегические решения согласует Дмитрий.
3. ОБЯЗАТЕЛЬНО соблюдай ВСЕ правила форматирования из контекста выше (HTML-теги <code>...</code> для ВСЕХ цифр, <b>...</b> для заголовков).
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
            userPrompt: cleanUserPrompt,
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

    // Отправка ответа в Telegram
    await sendTelegramMessage(chat.id, aiRes.reply, msg.message_id);

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
    processMarkUpdate,
    getClientByTelegramChatId,
    checkAndIncrementMarkUsage,
    logTraceToGAS,
    chatHistoryMemory
};