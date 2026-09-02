const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// v2.2.0 - Invoice routing to client chat
admin.initializeApp();
const db = admin.firestore();

const CONFIG = {
    TELEGRAM_TOKEN: "7811513232:AAEXD882CcrzcW_4if3Grg_nkUgX053ZVBw",
    ADMIN_CHAT_ID: "451682370",
    MONO_TOKEN: "umKnV6RfQ1kFqncxiIydN6uYM9-TiDljGXAaATxdhqoo",
    MONO_JAR_ID: "6NSwcFhjnX",
    FIREBASE_PROJECT_ID: "aureliusclients"
};

const TIMEZONE = "Europe/Kyiv";
const SCHEDULED_INVOICES_COLLECTION = "scheduled_invoices";

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setCors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
}

async function sendMessage(chatId, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true };
    if (keyboard) payload.reply_markup = { inline_keyboard: [[keyboard]] };
    try {
        await axios.post(url, payload, { timeout: 10000 });
    } catch (err) {
        console.error("TG Send Error:", err.response?.data || err.message);
    }
}

async function logSys(type, message) {
    try {
        await db.collection("system_logs").add({
            type: type || "api",
            message: message ? message.toString() : "",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {
        console.error("logSys error:", e);
    }
}

function getTodayKyiv() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
}

exports.api = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method === "GET" || req.method === "HEAD") return res.status(200).send("OK");

    let data = req.body;
    if (Buffer.isBuffer(req.rawBody)) {
        try { data = JSON.parse(req.rawBody.toString()); } catch(e) {}
    } else if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
    }
    if (!data || typeof data !== "object") {
        data = {};
    }

    try {
        // 1. Mono Webhook
        if (data.type === "StatementItem") {
            const item = data.data.statementItem;
            const comment = item.comment || item.description || "";
            const match = comment.match(/ID\s*[:\-\s]?\s*(\d+)/i);
            const amountUah = Math.abs(item.amount / 100);

            try {
                await db.collection("webhook_history").add({
                    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    item: item
                });
                await logSys("webhook", `Входящая транзакция Mono: ${amountUah} грн (${comment || 'Без комментария'})`);
            } catch(we) { console.error("Webhook save error:", we); }

            if (match) {
                await sendMessage(CONFIG.ADMIN_CHAT_ID, `✅ <b>Оплата получена:</b> ${amountUah} грн (ID: ${match[1]})`);
            }
            return res.send("ok");
        }

        // 2. Тест
        if (data.action === 'test') {
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `🔔 <b>Тест API</b>\n<pre>${escapeHtml(data.message)}</pre>`);
            return res.send("success");
        }

        // 3. Ручной инвойс — ROUTING: client chat if telegramChatId, else admin
        if (data.action === 'manualInvoice') {
            const response = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
            const rate = response.data[0].rate;
            const amountUsd = parseFloat(data.amount) || 0;
            const amountUah = Math.ceil(amountUsd * rate);
            const id = (data.adsId || data.clientId || "0").toString().replace(/\D/g, '');
            const isExtra = data.invoiceType === 'extra';
            const comment = `ID:${id}${isExtra ? '-EXTRA' : ''}`;
            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=${encodeURIComponent(comment)}`;

            // Получаем telegramChatId из Firestore (не доверяем фронтенду — он может не знать об изменениях в БД)
            let resolvedChatId = (data.telegramChatId || "").toString().trim();
            if (!resolvedChatId && data.clientId) {
                const siDoc = await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(data.clientId.toString()).get();
                if (siDoc.exists) resolvedChatId = (siDoc.data().telegramChatId || "").toString().trim();
                
                // ФУНДАМЕНТАЛЬНЫЙ ФИКС ДЛЯ НОВЫХ КЛИЕНТОВ: если в scheduled_invoices еще нет записи (клиент новый), смотрим напрямую в master DB
                if (!resolvedChatId) {
                    try {
                        const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
                        const mSnap = await mRef.get();
                        if (mSnap.exists) {
                            const cls = mSnap.data().clients || [];
                            const c = cls.find(x => x.id.toString() === data.clientId.toString());
                            if (c && c.telegramChatId) resolvedChatId = c.telegramChatId.toString().trim();
                        }
                    } catch (err) { console.error("Master fallback error:", err); }
                }
            }
            console.log(`manualInvoice clientId="${data.clientId}" resolvedChatId="${resolvedChatId}" fromFrontend="${data.telegramChatId || 'none'}"`);

            // ФИКС: если фронтенд прислал пустую статистику (страница открыта до запуска скрипта),
            // подтягиваем свежие данные напрямую из Firestore
            let statsData = { ...data };
            const frontendHasStats = !!(data.impressions || data.cachedImps || data.cachedImpressions);
            if (!isExtra && !frontendHasStats && data.clientId) {
                try {
                    // Сначала ищем в scheduled_invoices
                    const siSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(data.clientId.toString()).get();
                    if (siSnap.exists) {
                        const si = siSnap.data();
                        if (si.cachedClicks || si.cachedCost || si.cachedImpressions) {
                            statsData = { ...statsData, ...si };
                            console.log(`manualInvoice: подтянули статистику из scheduled_invoices для clientId=${data.clientId}`);
                        }
                    }
                    // Если там нет — смотрим в master по adsId
                    if (!(statsData.cachedClicks || statsData.cachedCost) && data.adsId) {
                        const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
                        const mSnap = await mRef.get();
                        if (mSnap.exists) {
                            const adsId = (data.adsId || "").toString().replace(/\D/g, '').trim();
                            const cls = mSnap.data().clients || [];
                            const mc = cls.find(x => (x.adsId || "").toString().replace(/\D/g, '').trim() === adsId);
                            if (mc && mc.ads_stats) {
                                statsData = { ...statsData, ...mc.ads_stats };
                                console.log(`manualInvoice: подтянули статистику из master для adsId=${adsId}`);
                            }
                        }
                    }
                } catch (sErr) { console.error("Stats fetch error:", sErr); }
            }

            // Сборка статистики
            let statsPart = "";
            const impsVal = statsData.impressions || statsData.cachedImps || statsData.cachedImpressions;
            if (!isExtra && impsVal) {
                const imps = impsVal;
                const clicks = statsData.clicks || statsData.cachedClicks || "0";
                const convs = statsData.convs || statsData.cachedConvs || "0";
                const cost = statsData.cost || statsData.cachedCost || "0";
                const cpa = statsData.cpa || statsData.cachedCpa || "0";
                const curr = statsData.currency || statsData.ads_currency || "EUR";

                statsPart = `🌐 ${escapeHtml(data.siteUrl || "")}\n\n` +
                             `📊 <b>Результати (30 днів):</b>\n` +
                             `👁 Покази: ${imps}\n` +
                             `🖱 Кліки: ${clicks}\n` +
                             `🎯 Конверсії: ${convs}\n` +
                             `💰 Витрати: ${cost} ${curr}\n` +
                             `📉 Ціна конв.: ${cpa}\n\n`;

                let goals = statsData.goals || statsData.conversions || [];
                if (typeof statsData.cachedConvDetails === 'string') {
                    try { goals = JSON.parse(statsData.cachedConvDetails); } catch(e){}
                } else if (Array.isArray(statsData.cachedConvDetails)) {
                    goals = statsData.cachedConvDetails;
                }

                if (goals && Array.isArray(goals) && goals.length > 0) {
                    statsPart += `<b>Деталізація цілей:</b>\n`;
                    goals.forEach(g => {
                        statsPart += `└ ${escapeHtml(g.name)}: ${g.count}\n`;
                    });
                    statsPart += `\n──────────────────\n`;
                }
            }

            const message = isExtra ?
                `💎 <b>AURELIUS: ПОСЛУГИ</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n🛠 Послуги: ${escapeHtml(data.servicesList)}\n💰 Сума: <b>$${amountUsd}</b> (${amountUah} грн)` :
                `🧾 <b>РАХУНОК НА ОПЛАТУ ТА СТАТИСТИКА</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n\n${statsPart}💰 Сума за ведення: <b>$${amountUsd}</b>\n📈 Курс НБУ: ${rate} (Всього: ${amountUah} грн)\n\nДякуємо за співпрацю.`;

            const payButton = { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl };

            // === ROUTING: используем resolvedChatId из Firestore, а не из фронтенда ===
            if (resolvedChatId && resolvedChatId !== CONFIG.ADMIN_CHAT_ID) {
                await sendMessage(resolvedChatId, message, payButton);
                await sendMessage(CONFIG.ADMIN_CHAT_ID, `🧾 <b>Рахунок надіслано в чат клієнта</b>\n👤 ${escapeHtml(data.clientName)}\n💰 <b>$${amountUsd}</b> (${amountUah} грн)\n💬 Chat ID: <code>${resolvedChatId}</code>`);
            } else {
                await sendMessage(CONFIG.ADMIN_CHAT_ID, message, payButton);
            }

            return res.send("success");
        }

        // 4. Синхронизация
        if (data.action === "syncPayment") {
            const clientId = (data.clientId || "").toString();
            if (!clientId) return res.status(400).send("clientId required");
            const targetDate = (data.targetDate || "").toString().trim();
            if (!targetDate) {
                await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).delete();
                return res.send("success");
            }
            await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).set({
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return res.send("success");
        }

        // 5. Уведомление о ручной оплате
        if (data.action === "notifyManualPayment") {
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `✅ <b>Оплата подтверждена вручную</b>\n👤 ${escapeHtml(data.clientName)}\n💰 $${data.amount}`);
            if (data.clientId) {
                await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(data.clientId.toString()).delete();
            }
            return res.send("success");
        }

        // 6. ПРИЕМ ДАННЫХ GOOGLE ADS (HARVESTER v4.0)
        if (data.action === "adsReport") {
            const adsId = (data.adsId || "").toString().replace(/\D/g, '').trim();
            if (!adsId) return res.status(400).send("adsId required");

            const today = getTodayKyiv();
            const accountName = data.accountName || "";
            const currency = data.currency || "EUR";
            const periods = data.periods || {};
            const campaigns = data.campaigns || [];
            const queries = data.queries || [];
            const conversions = data.conversions || [];

            const m30 = periods.LAST_30_DAYS || data.metrics || {};
            const payloadToSave = {
                adsId, accountName, currency,
                lastSync: new Date().toISOString(),
                syncDate: today,
                periods, campaigns, queries, conversions,
                cachedClicks: m30.clicks || "0",
                cachedCost: m30.cost || "0",
                cachedConvs: m30.conversions || "0",
                cachedCpa: m30.costPerConv || m30.cpa || "0",
                cachedRoas: m30.roas || "0",
                cachedAov: m30.aov || "0",
                cachedConvValue: m30.conversionValue || "0",
                cachedImpressions: m30.impressions || "0",
                cachedConvDetails: conversions
            };

            const siQuery = await db.collection(SCHEDULED_INVOICES_COLLECTION).where("adsId", "==", adsId).get();
            if (!siQuery.empty) {
                for (const docSnap of siQuery.docs) {
                    await docSnap.ref.set({ ...payloadToSave, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            } else {
                const directDoc = await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(adsId).get();
                if (directDoc.exists) {
                    await directDoc.ref.set({ ...payloadToSave, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            }

            try {
                const masterRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
                const masterSnap = await masterRef.get();
                if (masterSnap.exists) {
                    let clients = (masterSnap.data().clients || []).map(c => {
                        const cAdsId = (c.adsId || "").toString().replace(/\D/g, '').trim();
                        if (cAdsId === adsId || c.id === adsId) {
                            return { ...c, ads_stats: payloadToSave, ads_currency: currency, ads_last_sync: new Date().toISOString() };
                        }
                        return c;
                    });
                    await masterRef.set({ clients }, { merge: true });
                }
            } catch (mErr) { console.error("Master update error:", mErr); }

            try {
                await db.collection("ads_history").doc(`${adsId}_${today}`).set({
                    adsId, accountName, date: today, currency, periods, campaigns, queries, conversions,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (hErr) { console.error("History save error:", hErr); }

            return res.json({ status: "success", message: "Ads report processed", adsId, date: today });
        }

        // 7. ИСТОРИЯ ЗА ГОД (ПО МЕСЯЦАМ)
        
        // === SEND DASHBOARD ENDPOINT ===
        if (data.action === "sendDashboardPhoto") {
            try {
                const { sendTelegramPhoto } = require('./mark/core/Mark_Telegram');
                const { chatId, image, clientName, period, queriesText } = data;
                if (!chatId || !image) {
                    return res.status(400).send("chatId and image required");
                }
                
                let caption = `📊 Сводка Google Ads (${period || 'За все время'}) по проекту ${clientName || ''} готова!\n\n`;
                if (queriesText) {
                    caption += `🔍 <b>Поисковые запросы с конверсиями:</b>\n${queriesText}\n\n`;
                }
                caption += `Все ключевые показатели на экране. Если есть вопросы по цифрам — я на связи.`;
                
                await sendTelegramPhoto(chatId, image, caption);
                return res.json({ status: "success", message: "Dashboard sent" });
            } catch (err) {
                console.error("sendDashboardPhoto error:", err);
                return res.status(500).send("Error sending dashboard");
            }
        }

        if (data.action === "adsMonthlyHistory") {
            const adsId = (data.adsId || "").toString().replace(/\D/g, '').trim();
            if (!adsId) return res.status(400).send("adsId required");
            
            const monthlyStats = data.monthly_stats || [];
            
            try {
                const masterRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
                const masterSnap = await masterRef.get();
                if (masterSnap.exists) {
                    let clients = (masterSnap.data().clients || []).map(c => {
                        const cAdsId = (c.adsId || "").toString().replace(/\D/g, '').trim();
                        if (cAdsId === adsId || c.id === adsId) {
                            return { ...c, monthly_stats: monthlyStats };
                        }
                        return c;
                    });
                    await masterRef.set({ clients }, { merge: true });
                }
            } catch (mErr) { console.error("Master update error:", mErr); }
            
            return res.json({ status: "success", message: "Monthly history processed", adsId, count: monthlyStats.length });
        }

        // === DIAGNOSTICS ENDPOINTS ===
        if (data.action === 'getScheduledQueue') {
            const snap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return res.json({ success: true, docs });
        }

        if (data.action === 'getSystemLogs') {
            let logs = [];
            try {
                const snap = await db.collection("system_logs").orderBy("createdAt", "desc").limit(60).get();
                logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) {
                try {
                    const snap2 = await db.collection("system_logs").limit(60).get();
                    logs = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
                } catch(e2) {}
            }
            return res.json({ success: true, logs });
        }

        if (data.action === 'getWebhookHistory') {
            let history = [];
            try {
                const snap = await db.collection("webhook_history").orderBy("receivedAt", "desc").limit(30).get();
                history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) {
                try {
                    const snap2 = await db.collection("webhook_history").limit(30).get();
                    history = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
                } catch(e2) {}
            }
            return res.json({ success: true, history });
        }

        if (data.action === 'clearTestInvoices') {
            const snap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
            let deleted = 0;
            for (const doc of snap.docs) {
                const d = doc.data();
                if (doc.id.startsWith("TEST") || d.isDiagnostic || (d.id && d.id.toString().startsWith("TEST"))) {
                    await doc.ref.delete();
                    deleted++;
                }
            }
            await logSys("api", `Удалено тестовых записей из очереди: ${deleted}`);
            return res.json({ success: true, deleted });
        }

        if (data.action === 'triggerTestInvoice') {
            const testDocId = "TEST_" + Date.now();
            const today = getTodayKyiv();
            const testData = {
                id: testDocId,
                clientId: testDocId,
                clientName: "Тестовый Клиент (Диагностика)",
                amount: "1",
                targetDate: today,
                status: "test-sent",
                isDiagnostic: true,
                lastSentDate: today,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(testDocId).set(testData);
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `🧪 <b>Тестовый автоинвойс создан</b>\nID: <code>${testDocId}</code>\nСумма: $1\nОчередь: запланировано на ${today}`);
            await logSys("scheduler", `Запуск теста автоинвойса (ID: ${testDocId})`);
            return res.json({
                success: true,
                testDocId,
                logs: [
                    "Подключение к базе Firestore: OK",
                    `Создан тестовый инвойс ${testDocId} в коллекции ${SCHEDULED_INVOICES_COLLECTION}`,
                    "Отправлено сервисное уведомление в Telegram",
                    "Статус проверки: УСПЕШНО"
                ]
            });
        }

        if (data.action === 'setWebhook') {
            try {
                const monoUrl = "https://api.monobank.ua/personal/webhook";
                const webhookUrl = "https://api-lzh3pje5pa-uc.a.run.app/api";
                const monoResp = await axios.post(monoUrl, { webHookUrl: webhookUrl }, {
                    headers: { "X-Token": CONFIG.MONO_TOKEN },
                    timeout: 10000
                });
                await logSys("webhook", `Установка вебхука Monobank: ${JSON.stringify(monoResp.data || "OK")}`);
                return res.send(typeof monoResp.data === 'object' ? JSON.stringify(monoResp.data) : (monoResp.data || "OK"));
            } catch(mErr) {
                const errDetail = mErr.response?.data?.errorDescription || mErr.message;
                await logSys("webhook", `Ошибка установки вебхука: ${errDetail}`);
                return res.status(500).send("Ошибка Monobank: " + errDetail);
            }
        }

        if (data.action === 'syncAllExpectedIncomeToAres') {
            const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
            const mSnap = await mRef.get();
            const cls = mSnap.exists ? (mSnap.data().clients || []) : [];
            let count = 0;
            for (const c of cls) {
                if (c.status === 'Активен' && !c.archived && c.recurring !== false && c.date) {
                    await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(c.id.toString()).set({
                        clientId: c.id,
                        clientName: c.name,
                        amount: c.amount || "0",
                        targetDate: c.date,
                        telegramChatId: c.telegramChatId || "",
                        siteUrl: (c.links && c.links.site) || "",
                        adsId: c.adsId || "",
                        recurring: true,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    count++;
                }
            }
            await logSys("api", `Синхронизация с Ares: обновлено ${count} клиентов`);
            return res.json({ success: true, count });
        }

        if (data.action === 'syncAndCleanScheduledInvoices') {
            const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
            const mSnap = await mRef.get();
            const cls = mSnap.exists ? (mSnap.data().clients || []) : [];
            const activeMap = new Map();
            cls.forEach(c => {
                if (c.status === 'Активен' && !c.archived) {
                    activeMap.set(c.id.toString(), c);
                }
            });
            const siSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
            let deleted = 0;
            let synced = 0;
            for (const doc of siSnap.docs) {
                if (doc.id.startsWith("TEST") || doc.data().isDiagnostic) continue;
                if (!activeMap.has(doc.id)) {
                    await doc.ref.delete();
                    deleted++;
                }
            }
            for (const [id, c] of activeMap.entries()) {
                if (c.recurring !== false && c.date) {
                    await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(id).set({
                        clientId: c.id,
                        clientName: c.name,
                        amount: c.amount || "0",
                        targetDate: c.date,
                        telegramChatId: c.telegramChatId || "",
                        siteUrl: (c.links && c.links.site) || "",
                        adsId: c.adsId || "",
                        recurring: true,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    synced++;
                }
            }
            await logSys("scheduler", `Очистка очереди: удалено ${deleted}, синхронизировано ${synced}`);
            return res.json({ success: true, deleted, synced });
        }

        if (data.action === 'runDiagnostic') {
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `🔍 <b>Диагностика:</b> ${escapeHtml(data.clientName || data.clientId)}\nID: <code>${data.clientId}</code>\nAds ID: <code>${data.adsId || '—'}</code>\nСистема: OK`);
            await logSys("api", `Запуск диагностики клиента ${data.clientName || data.clientId}`);
            return res.json({ success: true });
        }

        // === ARES CALENDAR ===
        if (data.action === 'ares_getCalendarMonth') {
            const year = parseInt(data.year);
            const month = parseInt(data.month);
            const monthStr = String(month + 1).padStart(2, '0');
            const prefix = `${year}-${monthStr}`;
            try {
                const calSnap = await db.collection("calendar_events")
                    .where("date", ">=", `${prefix}-01`)
                    .where("date", "<=", `${prefix}-31`)
                    .get();
                const datesSet = new Set();
                calSnap.docs.forEach(doc => {
                    const d = doc.data().date;
                    if (d) datesSet.add(d);
                });
                return res.json({ success: true, dates: Array.from(datesSet) });
            } catch (err) {
                console.error("ares_getCalendarMonth error:", err);
                return res.json({ success: true, dates: [] });
            }
        }

        if (data.action === 'ares_getCalendarDay') {
            const dateStr = (data.date || "").toString().trim();
            try {
                const calSnap = await db.collection("calendar_events")
                    .where("date", "==", dateStr)
                    .get();
                const events = calSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                events.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
                return res.json({ success: true, events });
            } catch (err) {
                console.error("ares_getCalendarDay error:", err);
                return res.json({ success: true, events: [] });
            }
        }

        if (data.action === 'ares_saveCalendarEvent') {
            const eventId = data.id || ("ev_" + Date.now());
            const dateStr = (data.date || "").toString().trim();
            const title = (data.title || "Событие").toString().trim();
            const start = data.start || "";
            const end = data.end || "";
            
            let startTime = "";
            let endTime = "";
            if (start.includes('T')) startTime = start.split('T')[1].substring(0, 5);
            else if (start.includes(':')) startTime = start.substring(0, 5);
            if (end.includes('T')) endTime = end.split('T')[1].substring(0, 5);
            else if (end.includes(':')) endTime = end.substring(0, 5);

            const evData = {
                id: eventId,
                title,
                start: startTime || "09:00",
                end: endTime || "10:00",
                startRaw: start,
                endRaw: end,
                date: dateStr,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await db.collection("calendar_events").doc(eventId).set(evData, { merge: true });
            await logSys("api", `Календарь: сохранено "${title}" на ${dateStr} (${evData.start}-${evData.end})`);
            return res.json({ success: true, id: eventId, event: evData });
        }

        if (data.action === 'ares_deleteCalendarEvent') {
            const eventId = (data.id || "").toString().trim();
            if (eventId) {
                await db.collection("calendar_events").doc(eventId).delete();
                await logSys("api", `Календарь: удалено событие ${eventId}`);
            }
            return res.json({ success: true });
        }

        // === ARES INTENTS, MODULES & SETTINGS ===
        if (data.action === 'ares_getIntents') {
            try {
                const intSnap = await db.collection("ares_intents").get();
                let intents = intSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (intents.length === 0) {
                    intents = [
                        { function: "add_event", module: "calendar", exact: "запиши, встреча, создай встречу", instruction: "Создать событие в календаре", enabled: true },
                        { function: "get_schedule", module: "calendar", exact: "какие планы, расписание, что на сегодня", instruction: "Показать расписание на день", enabled: true },
                        { function: "add_expense", module: "finance", exact: "потратил, расход, купил", instruction: "Записать расход", enabled: true },
                        { function: "check_balance", module: "finance", exact: "баланс, сколько денег", instruction: "Показать текущий баланс", enabled: true },
                        { function: "ads_summary", module: "ads", exact: "статистика рекламы, google ads, расход рекламы", instruction: "Показать аналитику рекламы", enabled: true }
                    ];
                }
                return res.json({ success: true, intents });
            } catch(e) {
                return res.json({ success: true, intents: [] });
            }
        }

        if (data.action === 'ares_saveIntent') {
            const intent = data.intent || {};
            if (intent.function) {
                await db.collection("ares_intents").doc(intent.function).set({
                    ...intent,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            const intSnap = await db.collection("ares_intents").get();
            const intents = intSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            return res.json({ success: true, intents });
        }

        if (data.action === 'ares_syncIntents') {
            const intSnap = await db.collection("ares_intents").get();
            return res.json({ success: true, count: intSnap.size });
        }

        if (data.action === 'ares_getModules') {
            const defaultModules = [
                { name: "ads", title: "📊 Google Ads & CRM", desc: "Управление кампаниями, KPI и аналитикой", icon: "trending-up", color: "#06b6d4", enabled: true, priority: 90, sessionTimeout: 10 },
                { name: "calendar", title: "📅 Календарь", desc: "События и расписание Google Calendar", icon: "calendar", color: "#10b981", enabled: true, priority: 88, sessionTimeout: 10 },
                { name: "finance", title: "💰 Финансы", desc: "Учет доходов, расходов и платежей", icon: "dollar-sign", color: "#f59e0b", enabled: true, priority: 85, sessionTimeout: 10 },
                { name: "tasks", title: "✅ Задачи", desc: "Трекер операционных задач и проектов", icon: "check-square", color: "#8b5cf6", enabled: true, priority: 80, sessionTimeout: 10 },
                { name: "nutrition", title: "🍎 Питание", desc: "Дневник питания, расчет калорий и БЖУ", icon: "apple", color: "#ef4444", enabled: true, priority: 75, sessionTimeout: 10 },
                { name: "diary", title: "📝 Дневник", desc: "Заметки, вечерняя рефлексия и мысли", icon: "book-open", color: "#ec4899", enabled: true, priority: 70, sessionTimeout: 10 },
                { name: "reminders", title: "⏰ Напоминания", desc: "Уведомления и запланированные сигналы", icon: "bell", color: "#3b82f6", enabled: true, priority: 65, sessionTimeout: 10 },
                { name: "news", title: "📰 Новости", desc: "Интеллектуальная сводка новостей и трендов", icon: "newspaper", color: "#6366f1", enabled: true, priority: 60, sessionTimeout: 10 },
                { name: "metanoia", title: "🧘 Метанойя", desc: "Ментальное здоровье, когнитивный майндсет", icon: "sparkles", color: "#a855f7", enabled: true, priority: 55, sessionTimeout: 10 }
            ];
            try {
                const cfgDoc = await db.collection("ares_config").doc("modules").get();
                if (cfgDoc.exists) {
                    const saved = cfgDoc.data().modules || [];
                    const merged = defaultModules.map(dm => {
                        const f = saved.find(s => s.name === dm.name);
                        return f ? { ...dm, ...f } : dm;
                    });
                    return res.json({ success: true, modules: merged });
                }
            } catch(e) {}
            return res.json({ success: true, modules: defaultModules });
        }

        if (data.action === 'ares_saveModuleConfig') {
            const { moduleName, config } = data;
            if (moduleName) {
                const cfgRef = db.collection("ares_config").doc("modules");
                const doc = await cfgRef.get();
                let list = doc.exists ? (doc.data().modules || []) : [];
                const idx = list.findIndex(m => m.name === moduleName);
                if (idx >= 0) list[idx] = { ...list[idx], ...config };
                else list.push({ name: moduleName, ...config });
                await cfgRef.set({ modules: list }, { merge: true });
            }
            return res.json({ success: true });
        }

        if (data.action === 'ares_getSettings') {
            let settings = { model: "google/gemini-2.5-flash-lite", debug: false };
            try {
                const sDoc = await db.collection("ares_config").doc("settings").get();
                if (sDoc.exists) settings = { ...settings, ...sDoc.data() };
            } catch(e) {}
            return res.json({ success: true, settings });
        }

        if (data.action === 'ares_saveSettings') {
            const settings = data.settings || {};
            await db.collection("ares_config").doc("settings").set(settings, { merge: true });
            return res.json({ success: true });
        }

        if (data.action === 'ares_testPrompt') {
            const startTime = Date.now();
            const prompt = (data.prompt || "").toString().trim();
            let reply = `⚡ <b>Ares Cognitive Engine:</b>\nЗапрос обработан: <i>"${escapeHtml(prompt)}"</i>\nКонтекст: OK. Протоколы синхронизированы.`;
            try {
                const { callMarkLLM } = require('./mark/core/Mark_AI_Bridge');
                const aiRes = await callMarkLLM({
                    systemPrompt: "Ты — Ares OS, персональная когнитивная операционная система. Отвечай емко, профессионально и по делу.",
                    userPrompt: prompt
                });
                if (aiRes && aiRes.reply) {
                    reply = aiRes.reply;
                }
            } catch(aiErr) {
                console.error("ares_testPrompt AI error:", aiErr.message);
            }
            const duration = Date.now() - startTime;
            return res.json({ success: true, reply, duration });
        }

        // === MARK OS MINI APP CONFIG ===
        if (data.action === 'markOsGetConfig') {
            let cfg = {
                modules: {
                    google_ads: { enabled: true, exactMatches: ["ads", "кампании", "статистика", "реклама"], broadMatches: ["ads", "трафик", "клик"] },
                    freelancehunt: { enabled: true, exactMatches: ["фриланс", "проекты", "fh"], broadMatches: ["заказ", "ставка"] },
                    automation: { enabled: true, exactMatches: ["статус", "лог", "очередь"], broadMatches: ["сервер", "система"] }
                }
            };
            try {
                const doc = await db.collection("mark_config").doc("modules").get();
                if (doc.exists) cfg = doc.data();
            } catch(e) {}
            return res.json(cfg);
        }

        
        // === CLIENT TELEGRAM CHAT HISTORY & AI PSYCHOTYPE ===
        if (data.action === 'getClientChatHistory') {
            const clientId = (data.clientId || '').toString().trim();
            if (!clientId) return res.status(400).json({ success: false, error: 'clientId required' });

            const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
            try {
                const snap = await db.collection('client_chats')
                    .doc(clientId)
                    .collection('messages')
                    .where('timestamp', '>=', cutoffDate)
                    .orderBy('timestamp', 'asc')
                    .get();

                const messages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                return res.json({ success: true, messages });
            } catch (err) {
                console.error("getClientChatHistory error:", err);
                try {
                    const snap2 = await db.collection('client_chats')
                        .doc(clientId)
                        .collection('messages')
                        .limit(200)
                        .get();
                    const messages = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    messages.sort((a, b) => {
                        const tA = a.timestamp?._seconds || 0;
                        const tB = b.timestamp?._seconds || 0;
                        return tA - tB;
                    });
                    return res.json({ success: true, messages });
                } catch (err2) {
                    return res.json({ success: true, messages: [] });
                }
            }
        }

        if (data.action === 'generateClientPsychotype') {
            const clientId = (data.clientId || '').toString().trim();
            if (!clientId) return res.status(400).json({ success: false, error: 'clientId required' });

            // 1. Fetch client from master
            const masterRef = db.collection('artifacts').doc('aureliusclients').collection('public').doc('data').collection('clients_db').doc('master');
            const masterSnap = await masterRef.get();
            const clients = masterSnap.exists ? (masterSnap.data().clients || []) : [];
            const clientIdx = clients.findIndex(c => c.id.toString() === clientId);
            const client = clientIdx >= 0 ? clients[clientIdx] : null;

            if (!client) {
                return res.status(404).json({ success: false, error: 'Клиент не найден в базе' });
            }

            // 2. Fetch last 90 days messages
            const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            let messages = [];
            try {
                const snap = await db.collection('client_chats')
                    .doc(clientId)
                    .collection('messages')
                    .where('timestamp', '>=', cutoffDate)
                    .orderBy('timestamp', 'asc')
                    .get();
                messages = snap.docs.map(d => d.data());
            } catch (e) {
                const snap = await db.collection('client_chats').doc(clientId).collection('messages').limit(300).get();
                messages = snap.docs.map(d => d.data());
            }

            if (!messages || messages.length === 0) {
                return res.json({
                    success: false,
                    error: 'За последние 90 дней нет сохраненной переписки в Telegram-чате этого клиента. Подключите чат через кнопку "Подключить чат" и напишите в группу.'
                });
            }

            // Format transcript
            const transcript = messages.map(m => {
                const sender = m.isMark ? 'Марк (AI)' : (m.isAdmin ? 'Дмитрий (Агентство)' : (m.senderName || 'Клиент'));
                const date = m.date || '';
                const time = m.time || '';
                return `[${date} ${time}] ${sender}: ${m.text}`;
            }).join('\n');

            // 3. Call LLM
            const systemPrompt = `Ты — Марк, ведущий аналитик и стратег агентства Aurelius Ads.
Твоя задача — провести глубокий психологический, операционный и стратегический анализ клиента на основе РЕАЛЬНОЙ переписки за последние 3 месяца (90 дней).

СФОРМУЛИРУЙ АНАЛИЗ ПО СЛЕДУЮЩЕЙ ЧЕТКОЙ СТРУКТУРЕ (пиши четко, емко, без воды, используя списки):

1. 🧠 ПСИХОТИП И СТИЛЬ КОММУНИКАЦИИ
- Темперамент и скорость принятия решений (быстрый/взвешенный/тревожный/доверчивый).
- Предпочитаемый формат отчетов (язык цифр и KPI, емкие голосовые, детальные таблицы или краткие выжимки).
- Отношение к инициативе и экспериментам.

2. 📊 УРОВЕНЬ УДОВЛЕТВОРЕННОСТИ И ТОНАЛЬНОСТЬ
- Общая эмоциональная тональность диалога.
- Текущий уровень доверия к агентству и результатам.

3. 🎯 КЛЮЧЕВЫЕ БОЛИ, СТРАХИ И ФОКУСЫ
- За что клиент больше всего переживает (окупаемость, спад лидов, бюджет, сезонность).
- Что для него является главным фактором успеха (ROAS, CPA, объем продаж).

4. 🛠 ТЕКУЩИЕ ЗАДАЧИ И ДОГОВОРЕННОСТИ
- О чем договаривались в последних сообщениях.
- Открытые вопросы или задачи, требующие контроля.

5. 💡 СТРАТЕГИЯ ВЕДЕНИЯ И РЕКОМЕНДАЦИИ
- Как лучше подавать результаты и закрывать возражения.
- Какие триггеры не использовать.
- Потенциал расширения бюджета или апсейла.`;

            const userPrompt = `Клиент: ${client.name}
Сайт: ${client.links?.site || '—'}
Бюджет / Оплата: ${client.amount || 0}
Google Ads ID: ${client.adsId || '—'}

ИСТОРИЯ ПЕРЕПИСКИ ИЗ ЧАТА (ПОСЛЕДНИЕ 90 ДНЕЙ):
${transcript}`;

            try {
                const { callMarkLLM } = require('./mark/core/Mark_AI_Bridge');
                const aiRes = await callMarkLLM({
                    systemPrompt,
                    userPrompt,
                    temperature: 0.2,
                    maxTokens: 2500
                });

                const analysisText = aiRes.reply || 'Ошибка генерации психотипа.';

                // 4. Update master DB
                clients[clientIdx].ai_analysis = analysisText;
                await masterRef.set({ clients }, { merge: true });

                await logSys('api', `Сгенерирован психотип клиента "${client.name}" на основе ${messages.length} сообщений.`);

                return res.json({
                    success: true,
                    ai_analysis: analysisText,
                    messagesCount: messages.length
                });
            } catch (llmErr) {
                console.error("Psychotype LLM error:", llmErr);
                return res.status(500).json({ success: false, error: 'Ошибка генерации через ИИ: ' + llmErr.message });
            }
        }

        if (data.action === 'markOsSaveConfig') {
            if (data.config) {
                await db.collection("mark_config").doc("modules").set(data.config, { merge: true });
            }
            return res.json({ success: true });
        }

        // ==============================================================================
        // 🔥 EMANUEL DATING OS (WINGMAN) ACTIONS
        // ==============================================================================
        if (data.action === 'emanuel_getSessions' || data.action === 'emanuel_getSlots') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessions = await Database.getSessions(db, userId);
            const activeSession = await Database.getActiveSession(db, userId);
            const settings = await Database.getUserSettings(db, userId);
            return res.json({ success: true, sessions, activeSession, settings, slots: sessions, activeSlot: activeSession });
        }

        if (data.action === 'emanuel_createSession') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const session = await Database.createSession(db, userId, data.name);
            return res.json({ success: true, session });
        }

        if (data.action === 'emanuel_switchSession' || data.action === 'emanuel_switchSlot') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessionId = data.sessionId || data.slotId;
            const session = await Database.switchSession(db, userId, sessionId);
            return res.json({ success: true, session, slot: session });
        }

        if (data.action === 'emanuel_renameSession' || data.action === 'emanuel_renameSlot') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessionId = data.sessionId || data.slotId;
            await Database.renameSession(db, userId, sessionId, data.name);
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_archiveSession') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            await Database.archiveSession(db, userId, data.sessionId);
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_restoreSession') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            await Database.restoreSession(db, userId, data.sessionId);
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_deleteSession') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            await Database.deleteSession(db, userId, data.sessionId);
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_clearSession' || data.action === 'emanuel_clearSlot') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessionId = data.sessionId || data.slotId;
            const historySnap = await db.collection('emanuel_users').doc(String(userId))
                .collection('sessions').doc(String(sessionId)).collection('turns').get();
            const batch = db.batch();
            historySnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_getHistory') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessionId = data.sessionId || data.slotId;
            const history = await Database.getHistory(db, userId, sessionId, data.limit || 15);
            return res.json({ success: true, history });
        }

        if (data.action === 'emanuel_leadMe') {
            const { AI, Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const sessions = await Database.getSessions(db, userId, 'active');
            const summary = sessions.map(s => ({
                id: s.id,
                name: s.name,
                state: s.state || 'BUILD',
                stepsToTaboo: s.stepsToTaboo,
                turnsCount: s.turnsCount || 0,
                lastMessage: s.lastMessage || ''
            }));
            const analysis = await AI.generateLeadMeAnalysis(summary);
            return res.json(analysis);
        }

        if (data.action === 'emanuel_getSettings') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const settings = await Database.getUserSettings(db, userId);
            return res.json({ success: true, settings });
        }

        if (data.action === 'emanuel_saveSettings') {
            const { Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            await Database.setUserSettings(db, userId, data.settings);
            return res.json({ success: true });
        }

        if (data.action === 'emanuel_generateAdvice') {
            const { AI, Database } = require('./emanuel');
            const userId = data.userId || CONFIG.ADMIN_CHAT_ID;
            const activeSession = await Database.getActiveSession(db, userId);
            const userSettings = data.settings || (await Database.getUserSettings(db, userId));
            const sessionId = data.sessionId || activeSession.id;
            const history = await Database.getHistory(db, userId, sessionId, 8);

            const result = await AI.generateAdvice({
                text: data.text || '',
                girlName: activeSession.name,
                sessionId: activeSession.id,
                currentState: activeSession.state || 'BUILD',
                imageBase64: data.imageBase64 || null,
                fastTrack: !!data.fastTrack,
                isAlternative: !!data.isAlternative,
                userSettings: userSettings,
                dialogHistory: history
            });

            if (result.success && data.saveToHistory) {
                await Database.addTurn(db, userId, sessionId, data.text || '[Скриншот]', result.reply, {
                    state: result.state,
                    stepsToTaboo: result.stepsToTaboo,
                    nextAction: result.nextAction,
                    reason: result.reason,
                    confidence: result.confidence
                });
            }

            await Database.logAction(db, userId, data.fastTrack ? 'CRM_FAST' : (data.imageBase64 ? 'CRM_PHOTO' : 'CRM_TEXT'), data.text || '[Скриншот]', result.reply, result.durationMs);

            return res.json(result);
        }

        return res.status(400).json({ success: false, error: "No valid action found: " + (data.action || "none") });
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ success: false, error: "Error: " + err.message });
    }
});

// Авто-инвойс (Scheduler) — ROUTING: client chat if telegramChatId, else admin
exports.sendScheduledInvoices = onSchedule(
    { schedule: "0 10 * * *", timeZone: TIMEZONE, region: "europe-west1" },
    async () => {
        const today = getTodayKyiv();
        const snap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
        let rate;
        try {
            const res = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
            rate = res.data[0].rate;
        } catch (e) {
            console.error("NBU rate error:", e);
            return;
        }
        for (const docSnap of snap.docs) {
            const d = docSnap.data();
            if (d.targetDate !== today) {
                if (new Date(d.targetDate) < new Date(today)) await docSnap.ref.update({ targetDate: today });
                continue;
            }
            if (d.lastSentDate === today) continue;

            const amountUsd = parseFloat(d.amount) || 0;
            if (amountUsd <= 0) continue;
            const amountUah = Math.ceil(amountUsd * rate);

            let sPart = "";
            const imps = d.impressions || d.cachedImps || d.cachedImpressions;
            if (imps) {
                const clicks = d.clicks || d.cachedClicks || "0";
                const convs = d.convs || d.cachedConvs || "0";
                const cost = d.cost || d.cachedCost || "0";
                const cpa = d.cpa || d.cachedCpa || "0";
                const curr = d.currency || d.cachedCurr || "UAH";
                sPart = `🌐 ${escapeHtml(d.siteUrl || "")}\n\n📊 <b>Результати (30 днів):</b>\n👁 Покази: ${imps}\n🖱 Кліки: ${clicks}\n🎯 Конверсії: ${convs}\n💰 Витрати: ${cost} ${curr}\n📉 Ціна конв.: ${cpa}\n\n`;

                let goals = d.goals || [];
                if (typeof d.cachedConvDetails === 'string') {
                    try { goals = JSON.parse(d.cachedConvDetails); } catch(e){}
                }
                if (goals && Array.isArray(goals) && goals.length > 0) {
                    sPart += `<b>Деталізація цілей:</b>\n`;
                    goals.forEach(g => { sPart += `└ ${escapeHtml(g.name)}: ${g.count}\n`; });
                    sPart += `\n──────────────────\n`;
                }
            }

            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=ID:${d.adsId || d.clientId}`;
            const message = `🧾 <b>РАХУНОК НА ОПЛАТУ ТА СТАТИСТИКА (Авто)</b>\n👤 Клієнт: ${escapeHtml(d.clientName || "")}\n\n${sPart}💰 Сума за ведення: <b>$${amountUsd}</b>\n📈 Курс НБУ: ${rate} (Всього: ${amountUah} грн)\n\nДякуємо за співпрацю.`;
            const payButton = { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl };

            // === ROUTING LOGIC ===
            const clientChatId = (d.telegramChatId || "").toString().trim();

            try {
                if (clientChatId && clientChatId !== CONFIG.ADMIN_CHAT_ID) {
                    await sendMessage(clientChatId, message, payButton);
                    await sendMessage(CONFIG.ADMIN_CHAT_ID, `🧾 <b>Авто-рахунок надіслано в чат клієнта</b>\n👤 ${escapeHtml(d.clientName || "")}\n💰 <b>$${amountUsd}</b> (${amountUah} грн)\n💬 Chat ID: <code>${clientChatId}</code>`);
                } else {
                    await sendMessage(CONFIG.ADMIN_CHAT_ID, message, payButton);
                }
                const nextDate = new Date(d.targetDate);
                nextDate.setMonth(nextDate.getMonth() + 1);
                await docSnap.ref.update({ lastSentDate: today, targetDate: nextDate.toISOString().split("T")[0] });
            } catch (err) {
                console.error("Scheduled invoice error:", docSnap.id, err);
            }
        }
    }
);

// ==============================================================================
// 🏛️ MARK AI COGNITIVE PERFORMANCE ENGINE (v2.0 Modular Architecture)
// ==============================================================================
const { handleMarkUpdate } = require("./mark");

exports.markWebhook = onRequest({ cors: true, maxInstances: 10, memory: '512MiB' }, async (req, res) => {
    try {
        if (req.method === 'POST') {
            await handleMarkUpdate(req.body, db);
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error("Mark Webhook Error:", e);
        res.status(500).send('Error');
    }
});

// ==============================================================================
// 🏛️ ARES AI COGNITIVE OS ENGINE (v10.0 Modular Architecture)
// ==============================================================================
const { handleAresUpdate } = require("./ares/ares_entry");

exports.aresWebhook = onRequest({ cors: true, maxInstances: 10, memory: '512MiB' }, async (req, res) => {
    try {
        if (req.method === 'POST') {
            await handleAresUpdate(req.body);
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error("Ares Webhook Error:", e);
        res.status(500).send('Error');
    }
});

// ==============================================================================
// 🔥 EMANUEL DATING ASSISTANT OS (Modular Wingman Engine)
// ==============================================================================
const { processEmanuelUpdate } = require("./emanuel");

exports.emanuelWebhook = onRequest({ cors: true, maxInstances: 10, memory: '512MiB' }, async (req, res) => {
    try {
        if (req.method === 'POST') {
            await processEmanuelUpdate(req.body, db);
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error("Emanuel Webhook Error:", e);
        res.status(500).send('Error');
    }
});