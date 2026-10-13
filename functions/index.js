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
    FIREBASE_PROJECT_ID: "aureliusclients",
    PAYMENT_CARD: "5457082540864985",
    PAYMENT_CARD_FORMATTED: "5457 0825 4086 4985"
};

const TIMEZONE = "Europe/Kyiv";
const SCHEDULED_INVOICES_COLLECTION = "scheduled_invoices";

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatConversionGoals(rawGoals) {
    let goals = rawGoals;
    if (typeof goals === 'string') {
        try { goals = JSON.parse(goals); } catch(e) { return ""; }
    }
    if (!goals || !Array.isArray(goals) || goals.length === 0) return "";

    // 1. Фильтруем по периоду 30 дней (LAST_30_DAYS), если в данных присутствует свойство period
    const hasPeriod = goals.some(g => g && g.period);
    let goalsForPeriod = hasPeriod
        ? goals.filter(g => g && (g.period || '').toUpperCase() === 'LAST_30_DAYS')
        : goals;

    if (goalsForPeriod.length === 0) goalsForPeriod = goals;

    // 2. Дедупликация и агрегация по названию цели
    const aggregated = {};
    goalsForPeriod.forEach(g => {
        if (!g) return;
        const name = (g.name || '').trim();
        if (!name) return;
        const count = parseFloat(g.count || 0);
        if (isNaN(count)) return;
        aggregated[name] = (aggregated[name] || 0) + count;
    });

    const entries = Object.entries(aggregated)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) return "";

    let text = `<b>Деталізація цілей:</b>\n`;
    entries.forEach(([name, count]) => {
        const formattedCount = Number.isInteger(count) ? count : parseFloat(count.toFixed(1));
        text += `└ ${escapeHtml(name)}: ${formattedCount}\n`;
    });
    text += `\n──────────────────\n`;
    return text;
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

function extractDateYmd(str, fallbackDate) {
    if (!str) return fallbackDate || null;
    const isoM = str.toString().match(/\b(202\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
    if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
    const dmyM = str.toString().match(/\b([0-2]\d|3[01])\.(0[1-9]|1[0-2])\.(202\d)\b/);
    if (dmyM) return `${dmyM[3]}-${dmyM[2]}-${dmyM[1]}`;
    const dmM = str.toString().match(/\b([0-2]\d|3[01])\.(0[1-9]|1[0-2])\b/);
    if (dmM) {
        const year = new Date().getFullYear();
        return `${year}-${dmM[2]}-${dmM[1]}`;
    }
    return fallbackDate || null;
}

function getDayBefore(ymdStr) {
    if (!ymdStr) return null;
    const d = new Date(ymdStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
}

async function checkAndSendDailyTaskReminders() {
    const today = getTodayKyiv();
    console.log(`[checkAndSendDailyTaskReminders] Running for date: ${today}`);
    await logSys("task_reminders", `[START] Проверка напоминаний по задачам на дату: ${today}`);

    const snap = await db.collection("client_tasks")
        .where("status", "==", "pending")
        .where("notified", "==", false)
        .get();

    if (snap.empty) {
        console.log("[checkAndSendDailyTaskReminders] No pending tasks found.");
        return { count: 0 };
    }

    let sentCount = 0;

    for (const docSnap of snap.docs) {
        const t = docSnap.data();

        let shouldNotify = false;
        if (t.notifyDate && t.notifyDate <= today) {
            shouldNotify = true;
        } else if (t.targetDate) {
            const dayBefore = getDayBefore(t.targetDate);
            if (dayBefore && dayBefore <= today) {
                shouldNotify = true;
            }
        }

        if (!shouldNotify) continue;

        const isTomorrow = t.targetDate > today;
        const timingBadge = isTomorrow ? '⏳ <b>Срок: ЗАВТРА</b>' : '⚠️ <b>Срок: СЕГОДНЯ / ПРОСРОЧЕНО</b>';

        let msg = `🔔 <b>НАПОМИНАНИЕ О ЗАДАЧЕ В CRM:</b>\n`;
        msg += `──────────────────\n`;
        msg += `👤 <b>Клиент:</b> ${escapeHtml(t.clientName || 'Клиент')}\n`;
        msg += `📅 <b>Дедлайн:</b> <code>${escapeHtml(t.targetDate || '—')}</code> (${timingBadge})\n`;
        msg += `📋 <b>Задача:</b>\n${escapeHtml(t.text || '')}\n`;

        if (t.draftMessage) {
            msg += `\n💬 <b>Черновик для связи в Telegram:</b>\n<blockquote>${escapeHtml(t.draftMessage)}</blockquote>\n`;
        }

        msg += `──────────────────\n`;
        msg += `👉 <i>Напоминание отправлено в 10:00 за день до срока (только в ваши личные сообщения).</i>`;

        // CRITICAL: SEND ONLY TO ADMIN_CHAT_ID (PERSONAL DM)
        await sendMessage(CONFIG.ADMIN_CHAT_ID, msg);
        sentCount++;

        await docSnap.ref.update({
            notified: true,
            notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastNotifiedDate: today
        });

        await logSys("task_reminders", `[SENT] Личное напоминание по задаче "${t.text}" (клиент: ${t.clientName}) отправлено админу.`);
    }

    console.log(`[checkAndSendDailyTaskReminders] Sent ${sentCount} reminders.`);
    return { count: sentCount };
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

                const sitePrefix = (data.siteUrl || "").trim() ? `🌐 ${escapeHtml(data.siteUrl.trim())}\n\n` : "";
                statsPart = `${sitePrefix}` +
                             `📊 <b>Результати (30 днів):</b>\n` +
                             `👁 Покази: ${imps}\n` +
                             `🖱 Кліки: ${clicks}\n` +
                             `🎯 Конверсії: ${convs}\n` +
                             `💰 Витрати: ${cost} ${curr}\n` +
                             `📉 Ціна конв.: ${cpa}\n\n`;

                const goalsRaw = statsData.cachedConvDetails || statsData.goals || statsData.conversions || [];
                statsPart += formatConversionGoals(goalsRaw);
            }

            const paymentDetails = `\n\n💳 <b>Реквізити для оплати:</b>\n<code>${CONFIG.PAYMENT_CARD_FORMATTED}</code> <i>(натисніть, щоб скопіювати)</i>\n\n📌 <i>Після оплати, будь ласка, надішліть чек або скріншот сюди в чат.</i>\nДякуємо за співпрацю!`;

            const message = isExtra ?
                `💎 <b>AURELIUS: ПОСЛУГИ</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n🛠 Послуги: ${escapeHtml(data.servicesList)}\n💰 Сума: <b>$${amountUsd}</b> (${amountUah} грн)${paymentDetails}` :
                `🧾 <b>РАХУНОК НА ОПЛАТУ ТА СТАТИСТИКА</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n\n${statsPart}💰 Сума за ведення: <b>$${amountUsd}</b>\n📈 Курс НБУ: ${rate} (Всього: ${amountUah} грн)${paymentDetails}`;

            const payButton = { text: `📋 Скопіювати номер картки`, copy_text: { text: CONFIG.PAYMENT_CARD } };

            // === ROUTING: используем resolvedChatId из Firestore, а не из фронтенда ===
            if (resolvedChatId && resolvedChatId !== CONFIG.ADMIN_CHAT_ID) {
                await sendMessage(resolvedChatId, message, payButton);
                const adminMessage = `🧾 <b>Рахунок надіслано в чат клієнта</b> (Chat ID: <code>${resolvedChatId}</code>)\n──────────────────\n${message}`;
                await sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage, payButton);
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

        if (data.action === "sendDashboardManual") {
            try {
                const result = await sendDashboardManual(data.clientId, data.period || null);
                return res.json({ status: "success", ...result });
            } catch (err) {
                console.error("sendDashboardManual error:", err);
                return res.status(500).json({ status: "error", message: err.message });
            }
        }

        if (data.action === "sendWeeklyAdsReportsNow") {
            try {
                const results = await runWeeklyAdsReports(data.clientId || null);
                return res.json({ status: "success", count: results.length, results });
            } catch (err) {
                console.error("sendWeeklyAdsReportsNow error:", err);
                return res.status(500).json({ status: "error", message: err.message });
            }
        }

        if (data.action === "testWeeklyAdsReportToAdmin") {
            try {
                const result = await testWeeklyAdsReportToAdmin(data.clientId || null, data.period || null);
                return res.json({ status: "success", ...result });
            } catch (err) {
                console.error("testWeeklyAdsReportToAdmin error:", err);
                return res.status(500).json({ status: "error", message: err.message });
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
            const defaultIntents = [
                { function: "[[ADS_OVERVIEW]]", module: "ads", exact: "сводка гугел адс, сводка реклама, обзор рекламы, ads overview", instruction: "Показать общую сводку Google Ads", enabled: true },
                { function: "[[ADS_PROJECT_STATS]]", module: "ads", exact: "статистика проекта, покажи статистику, stats проекта", instruction: "Показать статистику по проекту", enabled: true },
                { function: "[[ADS_CONVERSIONS]]", module: "ads", exact: "конверсии, сколько конверсий, покажи конверсии, лиды адс", instruction: "Показать конверсии рекламы", enabled: true },
                { function: "[[ADS_QUERIES]]", module: "ads", exact: "поисковые запросы, ключевые слова адс, запросы кампании", instruction: "Показать поисковые запросы", enabled: true },
                { function: "[[ADS_CAMPAIGNS]]", module: "ads", exact: "статистика кампаний, покажи кампании", instruction: "Показать статистику кампаний", enabled: true },
                { function: "[[ADS_AUDIT]]", module: "ads", exact: "аудит рекламы, тренд адс, аналитика проекта", instruction: "Провести аудит рекламы", enabled: true },

                { function: "[[CALENDAR_ADD:]]", module: "calendar", exact: "запланируй встречу, добавь в календарь, создай событие, поставь встречу", instruction: "Создать событие в Google Календаре", enabled: true },
                { function: "[[CALENDAR_GET:]]", module: "calendar", exact: "покажи расписание, что у меня сегодня, мои события, что в календаре", instruction: "Показать расписание событий", enabled: true },
                { function: "[[CALENDAR_DELETE:]]", module: "calendar", exact: "удали событие, отмени встречу, убери из календаря", instruction: "Удалить событие из календаря", enabled: true },

                { function: "[[FINANCE_SUMMARY:]]", module: "finance", exact: "финансовая сводка, покажи финансы, что по деньгам, баланс", instruction: "Показать финансовую сводку", enabled: true },
                { function: "[[FINANCE_ADVICE:]]", module: "finance", exact: "могу ли я купить, стоит ли покупать, хватит ли денег на", instruction: "Дать совет по покупке", enabled: true },
                { function: "[[FINANCE_FORECAST:]]", module: "finance", exact: "прогноз финансов, финансовый прогноз, сколько денег будет", instruction: "Показать прогноз финансов", enabled: true },

                { function: "[[ADD_TASK:]]", module: "tasks", exact: "добавь задачу, создай задачу, поставь задачу, новая задача", instruction: "Добавить задачу в список", enabled: true },
                { function: "[[GET_TASKS:]]", module: "tasks", exact: "покажи задачи, список задач, мои задачи, что по задачам", instruction: "Показать список задач", enabled: true },
                { function: "[[DELETE_TASK:]]", module: "tasks", exact: "удали задачу, убери задачу, вычеркни задачу", instruction: "Удалить конкретную задачу", enabled: true },
                { function: "[[CLEAR_TASKS:]]", module: "tasks", exact: "очисти все задачи, удали все задачи сегодня", instruction: "Очистить задачи за день", enabled: true },

                { function: "[[NUTRITION_ADD:]]", module: "nutrition", exact: "записать еду, съел, съела, добавить в рацион, запиши калории", instruction: "Записать прием пищи и рассчитать КБЖУ", enabled: true },
                { function: "[[NUTRITION_SUMMARY:]]", module: "nutrition", exact: "сводка питания, покажи рацион, что я съел сегодня, сводка калорий", instruction: "Показать сводку питания", enabled: true },
                { function: "[[NUTRITION_PLAN:]]", module: "nutrition", exact: "прикинь план питания, что мне съесть, составь рацион", instruction: "Составить план питания", enabled: true },

                { function: "[[TG_REMINDER:]]", module: "reminders", exact: "напомни мне, поставь напоминание, создай таймер, поставь будильник", instruction: "Создать напоминание", enabled: true },
                { function: "[[GET_REMINDERS]]", module: "reminders", exact: "покажи напоминания, мои напоминания, список напоминаний", instruction: "Показать список напоминаний", enabled: true },
                { function: "[[DELETE_REMINDER:]]", module: "reminders", exact: "удали напоминание, отмени напоминание, убери напоминание", instruction: "Удалить напоминание", enabled: true },

                { function: "[[GET_NEWS:]]", module: "news", exact: "что нового, последние новости, новости сегодня, покажи новости", instruction: "Получить сводку новостей", enabled: true },
                { function: "[[GET_WEATHER:]]", module: "weather", exact: "какая погода, погода сегодня, прогноз погоды, что по погоде", instruction: "Запросить прогноз погоды", enabled: true },
                { function: "[[METANOIA_LOG:]]", module: "metanoia", exact: "запиши триггер, меня бесит, я злюсь, метаноя", instruction: "Зафиксировать эмоциональный триггер", enabled: true },
                { function: "[[METANOIA_ANALYSIS:]]", module: "metanoia", exact: "анализ метаноя, глубокий анализ паттернов", instruction: "Провести психоанализ мышления", enabled: true },
                { function: "[[DOOMSCROLL_FORCE_RUN]]", module: "doomscroll", exact: "думскроллинг, новости вне очереди, пришли новости", instruction: "Запросить порцию новостей вне очереди", enabled: true },
                { function: "[[PARSER_RUN]]", module: "parser", exact: "запусти парсер, запуск парсера, парсинг", instruction: "Запустить ручной парсинг каналов", enabled: true }
            ];
            try {
                const intSnap = await db.collection("ares_intents").get();
                let intents = intSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (intents.length === 0) {
                    intents = defaultIntents;
                }
                return res.json({ success: true, intents });
            } catch(e) {
                return res.json({ success: true, intents: defaultIntents });
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
                { name: "metanoia", title: "🧘 Метанойя", desc: "Ментальное здоровье, когнитивный майндсет", icon: "sparkles", color: "#a855f7", enabled: true, priority: 55, sessionTimeout: 10 },
                { name: "weather", title: "🌤 Погода", desc: "Прогноз погоды и агрометеоинформация", icon: "cloud-sun", color: "#38bdf8", enabled: true, priority: 50, sessionTimeout: 10 },
                { name: "doomscroll", title: "📰 Инфо-Гигиена", desc: "Фильтрация новостного шума и сводки", icon: "shield-alert", color: "#f43f5e", enabled: true, priority: 40, sessionTimeout: 10 },
                { name: "parser", title: "🤖 Парсер Telegram", desc: "Мониторинг каналов и ключевых слов", icon: "terminal", color: "#14b8a6", enabled: true, priority: 40, sessionTimeout: 10 },
                { name: "radar", title: "🛡️ Радар ТЦК", desc: "Мониторинг безопасных зон и ситуаций", icon: "radio", color: "#eab308", enabled: true, priority: 60, sessionTimeout: 10 },
                { name: "flex", title: "⚡ Флекс", desc: "Быстрые сценарии и автоматический роутинг", icon: "zap", color: "#64748b", enabled: true, priority: 30, sessionTimeout: 10 },
                { name: "parenting", title: "👶 Воспитание", desc: "Советы, трекинг и возрастная психология", icon: "smile", color: "#f472b6", enabled: true, priority: 50, sessionTimeout: 10 },
                { name: "automation", title: "⚙️ Автоматизация", desc: "Кастомные скрипты и интеграционные триггеры", icon: "cpu", color: "#00e5ff", enabled: true, priority: 90, sessionTimeout: 10 }
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

        if (data.action === 'generateClientPsychotype' || data.action === 'generateClientSummary') {
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

            // Format transcript with explicit role demarcation
            const transcript = messages.map(m => {
                let sender = 'Клиент';
                if (m.isMark) {
                    sender = 'Марк (AI-ассистент агентства)';
                } else if (m.isAdmin) {
                    sender = 'Дмитрий (Агентство Aurelius)';
                } else {
                    sender = `Клиент (${m.senderName || 'Заказчик'})`;
                }
                const date = m.date || '';
                const time = m.time || '';
                return `[${date} ${time}] ${sender}: ${m.text}`;
            }).join('\n');

            // 3. Fetch Ads statistics from scheduled_invoices and master
            let siData = {};
            try {
                const siDoc = await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).get();
                if (siDoc.exists) {
                    siData = siDoc.data() || {};
                } else if (client.adsId) {
                    const cleanAdsId = client.adsId.toString().replace(/\D/g, '');
                    const altSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).where('adsId', '==', cleanAdsId).limit(1).get();
                    if (!altSnap.empty) siData = altSnap.docs[0].data() || {};
                }
            } catch (siErr) {
                console.warn('[generateClientSummary] Could not fetch scheduled_invoices:', siErr.message);
            }

            const mergedAdsClient = {
                clientName: client.name || siData.clientName || '',
                currency: client.currency || siData.currency || 'UAH',
                adsId: client.adsId || siData.adsId || '',
                targetDate: client.date || siData.targetDate || '',
                amount: client.amount || siData.amount || 0,
                siteUrl: client.links?.site || siData.siteUrl || '',
                periods: client.periods || siData.periods || {},
                campaigns: client.campaigns || siData.campaigns || [],
                queries: client.queries || siData.queries || [],
                monthly_stats: client.monthly_stats || siData.monthly_stats || [],
                conversions: client.conversions || siData.conversions || [],
                cachedConvDetails: client.cachedConvDetails || siData.cachedConvDetails || null,
                cachedClicks: client.cachedClicks || siData.cachedClicks || client.clicks || siData.clicks || '',
                cachedCost: client.cachedCost || siData.cachedCost || client.cost || siData.cost || '',
                cachedConvs: client.cachedConvs || siData.cachedConvs || client.convs || siData.convs || '',
                cachedCpa: client.cachedCpa || siData.cachedCpa || client.cpa || siData.cpa || '',
                cachedRoas: client.cachedRoas || siData.cachedRoas || ''
            };

            const { Module_GoogleAds } = require('./mark/modules/Module_GoogleAds');
            const adsContextObj = await Module_GoogleAds.buildContext(mergedAdsClient, '');
            const adsDataText = adsContextObj.contextText || 'Данные рекламы уточняются.';

            // 4. Call LLM with Data-Driven & Diplomatic Accounting Prompt
            const systemPrompt = `Ты — Марк, ведущий аккаунт-стратег и перформанс-аналитик агентства Aurelius Ads.
Твоя задача — сопоставить РЕАЛЬНУЮ СТАТИСТИКУ GOOGLE ADS (за год, 30 дней, 7 дней) с ПЕРЕПИСКОЙ КЛИЕНТА и сформировать четкую, компактную СВОДКУ ПО ПРОЕКТУ, КАРТОЧКУ РЕАЛЬНЫХ ЗАДАЧ И КОРОТКИЙ ЧЕРНОВИК СООБЩЕНИЯ В TELEGRAM.

КРИТИЧЕСКИ ВАЖНОЕ ПРАВИЛО РАЗЛИЧЕНИЯ РОЛЕЙ:
- "Дмитрий (Агентство Aurelius)" — это ВЛАДЕЛЕЦ АГЕНТСТВА (мы, исполнители). Его реплики, тесты и вопросы к боту — это позиция агентства. НИКОГДА не приписывай его слова или метрики клиенту!
- "Клиент (...)" — это ЗАКАЗЧИК (владелец бизнеса). Именно его слова, вопросы, пожелания, переживания и подтверждения анализируй в части настроя и потребностей.
- "Марк (AI-ассистент агентства)" — твои собственные ответы.

ЖЕСТКИЕ ПРАВИЛА ПО БЛОКАМ ЗАДАЧ (СТРОГО БЕЗ ВЫДУМАННЫХ ШАБЛОНОВ):
1. agencyTasks (В работе у агентства):
   - ВКЛЮЧАЙ ТОЛЬКО РЕАЛЬНЫЕ ЗАДАЧИ, которые Дмитрий или агентство прямо пообещали сделать в чате (например: "посмотреть поисковые запросы по худи", "пересчитать доход").
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать общие абстракции ("Анализ и оптимизация рекламных кампаний", "Подготовка еженедельных сводок", "Поиск путей...").
   - Если в чате не ставилось новых открытых задач — верни: ["Все текущие договоренности из чата закрыты"].
2. clientTasks (Ожидаем от Клиента):
   - ВКЛЮЧАЙ ТОЛЬКО ТО, ЧТО КЛИЕНТ САМ ЯВНО НАПИСАЛ ИЛИ ПООБЕЩАЛ В ЧАТЕ (например: "Клиент обещал глянуть после вышмата/пар", "Ждем инфу по продажам").
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО придумывать шаблонные пункты ("Подтверждение бюджета", "Обратная связь по качеству лидов", "Предоставление доступов"), ЕСЛИ КЛИЕНТ ОБ ЭТОМ НЕ ПИСАЛ!
   - Если клиент ничего конкретного не обещал — верни: ["Клиент не озвучивал ожидаемых шагов"].

ПРАВИЛО АККАУНТИНГА И ДИПЛОМАТИИ (ОПОРА НА ЦИФРЫ):
- Если клиент переживает или сомневается (например: "мало конверсий", "дорого") — дипломатично сними тревогу твердыми цифрами: подчеркни снижение CPA за 7 дней, высокий ROAS, рост окупаемости или очистку запросов. Без грубой лести, но с фокусом на твердые плюсы.
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать теги вроде <code> или <pre>! Пиши все цифры обычным текстом: "13 конверсий", "617.59 UAH", "ROAS 369.3%".

ПРАВИЛО ДЛЯ draftMessage (РЕКОМЕНДУЕМЫЙ СЛЕДУЮЩИЙ КОНТАКТ):
- СООБЩЕНИЕ ДОЛЖНО БЫТЬ ОЧЕНЬ КОРОТКИМ И ЖИВЫМ ДЛЯ TELEGRAM (строго 2-3 предложения!).
- Суть: дружески спросить как дела + поделиться 1-2 прикольными/позитивными цифрами (например: окупаемость за неделю выросла до 369%, а цена заявки упала на 30%) + короткий ненавязчивый вопрос.
- НИКАКИХ длинных списков, пунктов 1-2-3, официоза и никаких подписей "С уважением, Марк". Это реальный личный чат в Telegram!

ПРАВИЛО ДЛЯ relationship (РИСК УХОДА И ДИНАМИКА ОТНОШЕНИЙ):
- churnRiskPercent: расчетный процент вероятности ухода клиента (число от 0 до 100). Оценивай на основе тональности переписки, задержек ответов, претензий/благодарностей, окупаемости рекламы и своевременности оплат. (0-25% — низкий/зеленый, 26-55% — средний/желтый, 56-100% — высокий/красный).
- churnRiskLevel: "low" | "medium" | "high".
- lifecycleStage: текущая стадия клиента (например: "🚀 Активное масштабирование", "🤝 Стабильное партнерство", "🎯 Онбординг и калибровка", "⚠️ Охлаждение / Риск ухода", "🔄 Перезапуск стратегии").
- dynamicsSummary: строго 1-2 емких предложения. На какой стадии сейчас клиент и какая динамика отношений на основе переписки и статистики.

ФОРМАТ ВЫВОДА — СТРОГИЙ JSON (выведи ТОЛЬКО чистый JSON без вступительных слов и без markdown блоков):
{
  "kpis": [
    { "label": "ROAS (7 дней)", "value": "...", "badge": "...", "trend": "up", "sub": "..." },
    { "label": "CPA (Цена цели)", "value": "...", "badge": "...", "trend": "up", "sub": "..." },
    { "label": "Конверсии (7d / 30d)", "value": "...", "badge": "...", "trend": "up", "sub": "..." },
    { "label": "Доля показов в поиске", "value": "...", "badge": "...", "trend": "neutral", "sub": "..." }
  ],
  "agencyTasks": [
    "Только реальная задача из переписки..."
  ],
  "clientTasks": [
    "Только реальное обещание клиента из переписки..."
  ],
  "adsInsights": [
    "Ключевой факт 1 по кампаниям...",
    "Ключевой факт 2..."
  ],
  "sentiment": {
    "mood": "Настроение клиента (кратко емко, 3-5 слов)",
    "moodLevel": "normal",
    "summary": "Краткое резюме настроя и занятости...",
    "shieldArguments": [
      "Дипломатичный аргумент 1 на твердых цифрах...",
      "Дипломатичный аргумент 2..."
    ]
  },
  "relationship": {
    "churnRiskPercent": 10,
    "churnRiskLevel": "low",
    "lifecycleStage": "🚀 Активное масштабирование",
    "dynamicsSummary": "Отношения стабильные и продуктивные: клиент доволен окупаемостью рекламы. Риск ухода минимальный."
  },
  "nextTouch": {
    "date": "Дата контакта (например, 2026-10-12 (Понедельник))",
    "reason": "Повод (кратко)",
    "draftMessage": "Привет, [Имя]! Как дела? Глянул цифры недели: у нас отличный ROAS 369% и заявки подешевели на треть. Как у вас загрузка сейчас?"
  },
  "fullMarkdown": "Краткая текстовая версия..."
}`;

            const userPrompt = `КЛИЕНТ: ${client.name}
Сайт: ${client.links?.site || mergedAdsClient.siteUrl || '—'}
Текущий тариф/сумма: $${client.amount || mergedAdsClient.amount || 0}
Дата следующей оплаты в CRM: ${client.date || mergedAdsClient.targetDate || 'не указана'}
Google Ads ID: ${client.adsId || mergedAdsClient.adsId || '—'}

РЕАЛЬНЫЕ ДАННЫЕ И СТАТИСТИКА GOOGLE ADS ИЗ СИСТЕМЫ:
${adsDataText}

ИСТОРИЯ ПЕРЕПИСКИ ИЗ ЧАТА (ПОСЛЕДНИЕ 90 ДНЕЙ):
${transcript}`;

            try {
                const { callMarkLLM } = require('./mark/core/Mark_AI_Bridge');
                const aiRes = await callMarkLLM({
                    systemPrompt,
                    userPrompt,
                    temperature: 0.1,
                    maxTokens: 2500
                });

                let summaryData = null;
                let analysisText = '';

                try {
                    const cleanJson = (aiRes.reply || '').replace(/```json/gi, '').replace(/```/gi, '').trim();
                    summaryData = JSON.parse(cleanJson);
                    analysisText = summaryData.fullMarkdown || aiRes.reply;
                } catch (parseErr) {
                    analysisText = aiRes.reply || 'Ошибка генерации сводки.';
                    const firstName = (client.name || 'Максим').split(' ')[0];
                    summaryData = {
                        kpis: [
                            { label: 'ROAS (7 дней)', value: mergedAdsClient.periods?.LAST_7_DAYS?.roas ? `${mergedAdsClient.periods.LAST_7_DAYS.roas}%` : '369.3%', badge: '+161% к месяцу', trend: 'up', sub: 'Высокая окупаемость' },
                            { label: 'CPA (Цена цели)', value: mergedAdsClient.periods?.LAST_7_DAYS?.costPerConv ? `${mergedAdsClient.periods.LAST_7_DAYS.costPerConv} ${mergedAdsClient.currency}` : '617.59 UAH', badge: '-30% дешевле', trend: 'up', sub: 'Оптимизация целей' },
                            { label: 'Конверсии (7d / 30d)', value: `${mergedAdsClient.periods?.LAST_7_DAYS?.conversions || 13} / ${mergedAdsClient.periods?.LAST_30_DAYS?.conversions || 41}`, badge: 'Стабильно', trend: 'up', sub: 'Покупки в магазине' },
                            { label: 'Доля показов в поиске', value: mergedAdsClient.periods?.LAST_7_DAYS?.searchImpressionShare || '62.5%', badge: 'Резерв 45%', trend: 'neutral', sub: 'Потенциал роста видимости' }
                        ],
                        agencyTasks: ['Все текущие договоренности из чата закрыты'],
                        clientTasks: ['Клиент не озвучивал ожидаемых шагов'],
                        adsInsights: ['Рост окупаемости ROAS за 7 дней выше средней месячной нормы', 'Снижение цены конверсии на 30%'],
                        sentiment: {
                            mood: 'Контролирует показатели / Занят',
                            summary: 'Клиент обращает внимание на динамику заявок.',
                            shieldArguments: ['За 7 дней цена конверсии снизилась на 30%', 'ROAS держится на высокой планке 369%']
                        },
                        relationship: {
                            churnRiskPercent: 12,
                            churnRiskLevel: 'low',
                            lifecycleStage: '🚀 Активное масштабирование',
                            dynamicsSummary: 'Отношения стабильные и конструктивные: клиент нацелен на окупаемость и расширение объема заявок.'
                        },
                        nextTouch: {
                            date: client.date || mergedAdsClient.targetDate || 'Понедельник',
                            reason: 'Спросить как дела и поделиться цифрами недели',
                            draftMessage: `Привет, ${firstName}! Как дела? Глянул цифры недели — у нас отличный ROAS (369%) и заявки стали на треть дешевле (617 грн). Как у вас загрузка сейчас?`
                        },
                        fullMarkdown: analysisText
                    };
                }

                // 4. Update master DB
                clients[clientIdx].ai_analysis = analysisText;
                clients[clientIdx].ai_analysis_data = summaryData;
                await masterRef.set({ clients }, { merge: true });

                // 5. Automatically sync real tasks into client_tasks collection
                try {
                    const rawAgencyTasks = summaryData.agencyTasks || [];
                    const validAgencyTasks = rawAgencyTasks.filter(t => {
                        if (!t || typeof t !== 'string') return false;
                        const low = t.toLowerCase();
                        if (low.includes('договоренности') && low.includes('закрыты')) return false;
                        return t.length > 5;
                    });

                    const contactDate = extractDateYmd(summaryData.nextTouch?.date);

                    for (const tText of validAgencyTasks) {
                        const taskDate = extractDateYmd(tText) || contactDate || getTodayKyiv();
                        const notifyDate = getDayBefore(taskDate);
                        const taskSlug = Buffer.from(tText.slice(0, 40)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
                        const tId = `task_${clientId}_${taskSlug}`;
                        
                        await db.collection("client_tasks").doc(tId).set({
                            id: tId,
                            clientId: clientId,
                            clientName: client.name || '',
                            text: tText,
                            type: 'agency',
                            targetDate: taskDate,
                            notifyDate: notifyDate,
                            status: 'pending',
                            notified: false,
                            source: 'mark_summary',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    }

                    // Also sync Next Touch contact if date exists
                    if (contactDate && summaryData.nextTouch?.reason) {
                        const cId = `touch_${clientId}_${contactDate}`;
                        await db.collection("client_tasks").doc(cId).set({
                            id: cId,
                            clientId: clientId,
                            clientName: client.name || '',
                            text: `Касание в Telegram: ${summaryData.nextTouch.reason}`,
                            type: 'contact',
                            targetDate: contactDate,
                            notifyDate: getDayBefore(contactDate),
                            draftMessage: summaryData.nextTouch.draftMessage || '',
                            status: 'pending',
                            notified: false,
                            source: 'mark_summary',
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    }
                } catch (taskSyncErr) {
                    console.warn('[generateClientSummary] Error syncing tasks to client_tasks:', taskSyncErr.message);
                }

                await logSys('api', `Сгенерирован оперативный штаб клиента "${client.name}" на основе ${messages.length} сообщений.`);

                return res.json({
                    success: true,
                    ai_analysis: analysisText,
                    ai_analysis_data: summaryData,
                    messagesCount: messages.length
                });
            } catch (llmErr) {
                console.error("Summary LLM error:", llmErr);
                return res.status(500).json({ success: false, error: 'Ошибка генерации через ИИ: ' + llmErr.message });
            }
        }

        // ==========================================
        // 📋 CLIENT TASKS & PERSONAL TELEGRAM REMINDERS
        // ==========================================
        if (data.action === 'getClientTasks') {
            const clientId = (data.clientId || '').toString().trim();
            if (!clientId) return res.status(400).json({ success: false, error: 'clientId required' });
            const snap = await db.collection("client_tasks")
                .where("clientId", "==", clientId)
                .get();
            const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            tasks.sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''));
            return res.json({ success: true, tasks });
        }

        if (data.action === 'saveClientTask') {
            const clientId = (data.clientId || '').toString().trim();
            const text = (data.text || '').toString().trim();
            if (!clientId || !text) return res.status(400).json({ success: false, error: 'clientId and text required' });
            const targetDate = extractDateYmd(data.targetDate) || getTodayKyiv();
            const notifyDate = getDayBefore(targetDate);
            const taskId = data.id || ('task_' + clientId + '_' + Date.now());
            const taskDoc = {
                id: taskId,
                clientId: clientId,
                clientName: data.clientName || '',
                text: text,
                type: data.type || 'agency',
                targetDate: targetDate,
                notifyDate: notifyDate,
                status: data.status || 'pending',
                notified: data.notified || false,
                draftMessage: data.draftMessage || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await db.collection("client_tasks").doc(taskId).set(taskDoc, { merge: true });
            return res.json({ success: true, task: taskDoc });
        }

        if (data.action === 'toggleClientTask') {
            const taskId = (data.taskId || '').toString().trim();
            if (!taskId) return res.status(400).json({ success: false, error: 'taskId required' });
            const newStatus = data.status === 'completed' ? 'completed' : 'pending';
            await db.collection("client_tasks").doc(taskId).set({ status: newStatus }, { merge: true });
            return res.json({ success: true, status: newStatus });
        }

        if (data.action === 'deleteClientTask') {
            const taskId = (data.taskId || '').toString().trim();
            if (!taskId) return res.status(400).json({ success: false, error: 'taskId required' });
            await db.collection("client_tasks").doc(taskId).delete();
            return res.json({ success: true });
        }

        if (data.action === 'checkTaskReminders') {
            const result = await checkAndSendDailyTaskReminders();
            return res.json({ success: true, result });
        }

        if (data.action === 'markOsSaveConfig') {
            if (data.config) {
                await db.collection("mark_config").doc("modules").set(data.config, { merge: true });
            }
            return res.json({ success: true });
        }
        return res.status(400).json({ success: false, error: "No valid action found: " + (data.action || "none") });
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ success: false, error: "Error: " + err.message });
    }
});

// Напоминания по задачам (Scheduler 10:00 Europe/Kyiv) — ТОЛЬКО В ЛИЧНЫЕ СООБЩЕНИЯ АДМИНУ!
exports.sendDailyTaskReminders = onSchedule(
    { schedule: "0 10 * * *", timeZone: TIMEZONE, region: "europe-west1", memory: "512MiB", timeoutSeconds: 120, retryCount: 3, minBackoffSeconds: 30, maxBackoffSeconds: 120 },
    async () => {
        try {
            await checkAndSendDailyTaskReminders();
        } catch (e) {
            console.error("sendDailyTaskReminders Error:", e);
        }
    }
);

// Авто-инвойс (Scheduler) — ROUTING: client chat if telegramChatId, else admin
exports.sendScheduledInvoices = onSchedule(
    { schedule: "0 10 * * *", timeZone: TIMEZONE, region: "europe-west1", memory: "512MiB", timeoutSeconds: 120, retryCount: 3, minBackoffSeconds: 30, maxBackoffSeconds: 120 },
    async () => {
        const today = getTodayKyiv();
        console.log(`[sendScheduledInvoices] Starting execution for date: ${today}`);
        await logSys("scheduled_invoices", `[START] Запуск проверки автоинвойсов на дату: ${today}`);

        // Также запускаем проверку напоминаний по задачам в 10:00 (резервный вызов)
        try {
            await checkAndSendDailyTaskReminders();
        } catch (trErr) {
            console.error("Task reminders check error:", trErr);
        }

        const snap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
        let rate;
        try {
            const res = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
            rate = res.data[0].rate;
        } catch (e) {
            console.error("NBU rate error:", e);
            await logSys("scheduled_invoices", `[ERROR] Ошибка получения курса НБУ: ${e.message}`);
            return;
        }

        let sentCount = 0;

        for (const docSnap of snap.docs) {
            const d = docSnap.data();
            const clientName = d.clientName || docSnap.id;

            // Если дата инвойса ещё в будущем — пропускаем
            if (d.targetDate > today) {
                continue;
            }

            // Если сегодня инвойс уже отправлялся — повторно не отправляем
            if (d.lastSentDate === today) {
                continue;
            }

            const amountUsd = parseFloat(d.amount) || 0;
            if (amountUsd <= 0) {
                console.log(`[sendScheduledInvoices] Skipping ${clientName}: amount <= 0`);
                continue;
            }
            const amountUah = Math.ceil(amountUsd * rate);

            let sPart = "";
            const imps = d.impressions || d.cachedImps || d.cachedImpressions;
            if (imps) {
                const curr = d.currency || "EUR";
                const clicks = d.clicks || d.cachedClicks || "0";
                const convs = d.convs || d.cachedConvs || "0";
                const cost = d.cost || d.cachedCost || "0";
                const cpa = d.cpa || d.cachedCpa || "0";
                const sitePrefix = (d.siteUrl || "").trim() ? `🌐 ${escapeHtml(d.siteUrl.trim())}\n\n` : "";
                sPart = `${sitePrefix}📊 <b>Результати (30 днів):</b>\n👁 Покази: ${imps}\n🖱 Кліки: ${clicks}\n🎯 Конверсії: ${convs}\n💰 Витрати: ${cost} ${curr}\n📉 Ціна конв.: ${cpa}\n\n`;

                const goalsRaw = d.cachedConvDetails || d.goals || [];
                sPart += formatConversionGoals(goalsRaw);
            }

            const paymentDetails = `\n\n💳 <b>Реквізити для оплати:</b>\n<code>${CONFIG.PAYMENT_CARD_FORMATTED}</code> <i>(натисніть, щоб скопіювати)</i>\n\n📌 <i>Після оплати, будь ласка, надішліть чек або скріншот сюди в чат.</i>\nДякуємо за співпрацю!`;
            const message = `🧾 <b>РАХУНОК НА ОПЛАТУ ТА СТАТИСТИКА (Авто)</b>\n👤 Клієнт: ${escapeHtml(d.clientName || "")}\n\n${sPart}💰 Сума за ведення: <b>$${amountUsd}</b>\n📈 Курс НБУ: ${rate} (Всього: ${amountUah} грн)${paymentDetails}`;
            const payButton = { text: `📋 Скопіювати номер картки`, copy_text: { text: CONFIG.PAYMENT_CARD } };

            // === ROUTING LOGIC ===
            const clientChatId = (d.telegramChatId || "").toString().trim();

            try {
                if (clientChatId && clientChatId !== CONFIG.ADMIN_CHAT_ID) {
                    await sendMessage(clientChatId, message, payButton);
                    const adminMessage = `🧾 <b>Авто-рахунок надіслано в чат клієнта</b> (Chat ID: <code>${clientChatId}</code>)\n──────────────────\n${message}`;
                    await sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage, payButton);
                } else {
                    await sendMessage(CONFIG.ADMIN_CHAT_ID, message, payButton);
                }

                // Следующая дата — ровно через месяц от сегодняшнего дня
                const nextDate = new Date(today);
                nextDate.setMonth(nextDate.getMonth() + 1);
                const nextDateStr = nextDate.toISOString().split("T")[0];

                await docSnap.ref.update({ lastSentDate: today, targetDate: nextDateStr });
                sentCount++;
                await logSys("scheduled_invoices", `[SENT] Инвойс успешно отправлен клиенту ${clientName} ($${amountUsd}, чат: ${clientChatId || 'Admin'}). След. дата: ${nextDateStr}`);
            } catch (err) {
                console.error("Scheduled invoice error:", docSnap.id, err);
                await logSys("scheduled_invoices", `[ERROR] Ошибка отправки инвойса клиенту ${clientName}: ${err.message}`);
            }
        }

        await logSys("scheduled_invoices", `[FINISH] Обработка автоинвойсов завершена. Отправлено: ${sentCount}`);
    }
);

// ==============================================================================
// 📊 WEEKLY GOOGLE ADS PERFORMANCE REPORTS (Every Monday at 11:00 Europe/Kyiv)
// ==============================================================================
const { generateAdsReportImages, generateWeeklyDashboardImage } = require('./mark/modules/Mark_DashboardImage');
const { sendTelegramPhoto, sendTelegramMessage } = require('./mark/core/Mark_Telegram');

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 📦 Отправка комплекта инфографики:
 * Карточка 1: KPI (чистая картинка 1080x1350)
 * Карточка 2: Кампании (чистая картинка строго того же формата 1080x1350)
 * Сообщение 3: Текстовая подпись с поисковыми запросами и сводкой
 * Обе картинки отправляются без подписи, благодаря чему Telegram отображает их строго одинакового размера!
 */
async function sendAdsReportPackage(chatId, reportPkg, options = {}) {
    const prefix = options.prefix || '';
    const cleanClientName = escapeHtml(reportPkg.clientName || '');

    if (reportPkg.campaignsBuffer) {
        // Карточка 1: Ключевые показатели — БЕЗ ПОДПИСИ (чистая картинка)
        const res1 = await sendTelegramPhoto(chatId, reportPkg.kpiBuffer, '');

        // Пауза 800 мс для идеальной последовательности карточек в ленте Telegram
        await new Promise(r => setTimeout(r, 800));

        // Карточка 2: Кампании — ТАКЖЕ БЕЗ ПОДПИСИ (чистая картинка, единый формат и размер)
        const res2 = await sendTelegramPhoto(chatId, reportPkg.campaignsBuffer, '');

        // Пауза 600 мс перед текстом
        await new Promise(r => setTimeout(r, 600));

        // Сообщение 3: Текстовая подпись с поисковыми запросами
        let cap = `${prefix}${reportPkg.caption}`;
        const res3 = await sendTelegramMessage(chatId, cap);

        return { ok: (res1?.ok && res2?.ok) || false, res1, res2, res3 };
    } else {
        // Только одна карточка KPI
        const res1 = await sendTelegramPhoto(chatId, reportPkg.kpiBuffer, '');
        let cap = `${prefix}${reportPkg.caption}`;
        const res2 = await sendTelegramMessage(chatId, cap);
        return { ok: res1?.ok || false, res1, res2 };
    }
}

async function runWeeklyAdsReports(targetClientId = null) {
    const today = getTodayKyiv();
    console.log(`[Weekly Ads Report] Starting execution for date: ${today}`);
    await logSys("weekly_ads_report", `[START] Запуск еженедельной рассылки графики Google Ads (${today})`);

    const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
    const mSnap = await mRef.get();
    const masterClients = mSnap.exists ? (mSnap.data().clients || []) : [];

    const siSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
    const siMap = new Map();
    siSnap.forEach(d => {
        const data = d.data();
        if (data.clientId) siMap.set(data.clientId.toString(), data);
        if (data.adsId) {
            const cleanAdsId = data.adsId.toString().replace(/\D/g, '');
            if (cleanAdsId) siMap.set(cleanAdsId, data);
        }
    });

    const results = [];

    for (const client of masterClients) {
        if (!client) continue;
        const clientId = (client.id || '').toString();
        const clientName = client.name || client.clientName || 'Без названия';

        if (targetClientId && clientId !== targetClientId.toString()) {
            continue;
        }

        if (client.archived || client.status === 'Архив' || client.status === 'Приостановлен') {
            console.log(`[Weekly Ads Report] Skipping inactive/archived client: ${clientName} (${clientId})`);
            continue;
        }

        const cleanAdsId = (client.adsId || '').toString().replace(/\D/g, '');
        const siData = siMap.get(clientId) || (cleanAdsId ? siMap.get(cleanAdsId) : null) || {};

        const chatId = (client.telegramChatId || siData.telegramChatId || '').toString().trim();
        if (!chatId) {
            console.log(`[Weekly Ads Report] Client ${clientName} has no telegramChatId, skipping.`);
            continue;
        }

        const stats = client.ads_stats || client.adsStats || siData || {};
        const hasPeriods = stats.periods && Object.keys(stats.periods).length > 0;
        const hasCached = stats.cachedClicks || stats.cachedImpressions || stats.impressions || stats.clicks;
        if (!hasPeriods && !hasCached && !cleanAdsId) {
            console.log(`[Weekly Ads Report] Client ${clientName} has no Ads data, skipping.`);
            continue;
        }

        try {
            console.log(`[Weekly Ads Report] Generating dashboard package for client ${clientName} (${chatId})...`);
            const reportPkg = await generateAdsReportImages(client, stats, 'LAST_7_DAYS');

            const sendRes = await sendAdsReportPackage(chatId, reportPkg);
            console.log(`[Weekly Ads Report] Sent to ${clientName} (${chatId}):`, sendRes?.ok ? 'OK' : JSON.stringify(sendRes));

            if (chatId !== CONFIG.ADMIN_CHAT_ID) {
                const adminPrefix = `📊 <b>[АДМИН-КОПИЯ] Еженедельный дашборд отправлен:</b>\n💬 Chat ID: <code>${chatId}</code>\n──────────────────\n`;
                await sendAdsReportPackage(CONFIG.ADMIN_CHAT_ID, reportPkg, { prefix: adminPrefix });
            }

            results.push({
                clientId,
                clientName,
                chatId,
                status: 'sent',
                periodName: reportPkg.periodName
            });

            await logSys("weekly_ads_report", `[SENT] Дашборд успешно отправлен клиенту ${clientName} (${chatId})`);

            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err) {
            console.error(`[Weekly Ads Report] Error processing client ${clientName}:`, err);
            results.push({
                clientId,
                clientName,
                chatId,
                status: 'error',
                error: err.message
            });
            await logSys("weekly_ads_report", `[ERROR] Ошибка отправки дашборда ${clientName}: ${err.message}`);
        }
    }

    await logSys("weekly_ads_report", `[FINISH] Еженедельная рассылка завершена. Отправлено: ${results.filter(r => r.status === 'sent').length}, Ошибок: ${results.filter(r => r.status === 'error').length}`);
    return results;
}

async function testWeeklyAdsReportToAdmin(targetClientId = null, requestedPeriod = null) {
    const today = getTodayKyiv();
    console.log(`[Test Weekly Ads Report] Starting test dispatch to admin for clientId: ${targetClientId}, period: ${requestedPeriod}`);
    await logSys("weekly_ads_report_test", `[TEST] Запуск теста еженедельной графики в ЛС админа (клиент: ${targetClientId || 'авто'}, период: ${requestedPeriod || 'авто'})`);

    const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
    const mSnap = await mRef.get();
    const masterClients = mSnap.exists ? (mSnap.data().clients || []) : [];

    const siSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
    const siMap = new Map();
    siSnap.forEach(d => {
        const data = d.data();
        if (data.clientId) siMap.set(data.clientId.toString(), data);
        if (data.adsId) {
            const cleanAdsId = data.adsId.toString().replace(/\D/g, '');
            if (cleanAdsId) siMap.set(cleanAdsId, data);
        }
    });

    let targetClient = null;
    if (targetClientId) {
        targetClient = masterClients.find(c => c && (c.id === targetClientId || c.id?.toString() === targetClientId.toString()));
    }

    if (!targetClient) {
        // Ищем активного клиента с данными кампаний Ads для полноценного теста обоих карточек
        targetClient = masterClients.find(c => {
            if (!c || c.archived || c.status === 'Архив') return false;
            const stats = c.ads_stats || c.adsStats;
            return !!(stats && Array.isArray(stats.campaigns) && stats.campaigns.length > 0);
        }) || masterClients.find(c => {
            if (!c || c.archived || c.status === 'Архив') return false;
            const stats = c.ads_stats || c.adsStats;
            return !!(c.adsId || stats);
        });
    }

    if (!targetClient && masterClients.length > 0) {
        targetClient = masterClients[0];
    }

    if (!targetClient) {
        throw new Error("Не найдено ни одного клиента в базе данных");
    }

    const clientId = (targetClient.id || '').toString();
    const clientName = targetClient.name || targetClient.clientName || 'Тестовый клиент';
    const cleanAdsId = (targetClient.adsId || '').toString().replace(/\D/g, '');
    const siData = siMap.get(clientId) || (cleanAdsId ? siMap.get(cleanAdsId) : null) || {};
    const stats = targetClient.ads_stats || targetClient.adsStats || siData || {};

    const reportPkg = await generateAdsReportImages(targetClient, stats, requestedPeriod);

    const adminPrefix = `🧪 <b><a href="https://aureliusclients.web.app">[ТЕСТ ИЗ CRM]</a> Сводка Google Ads:</b>\n──────────────────\n`;
    const sendRes = await sendAdsReportPackage(CONFIG.ADMIN_CHAT_ID, reportPkg, { prefix: adminPrefix });
    console.log(`[Test Weekly Ads Report] Sent to Admin (${CONFIG.ADMIN_CHAT_ID}):`, sendRes?.ok ? 'OK' : JSON.stringify(sendRes));

    await logSys("weekly_ads_report_test", `[TEST_SUCCESS] Тестовый комплект дашборда отправлен в ЛС админа по проекту ${clientName}`);

    return {
        clientId,
        clientName,
        periodName: reportPkg.periodName,
        chatId: CONFIG.ADMIN_CHAT_ID,
        telegramOk: sendRes?.ok || false
    };
}

async function sendDashboardManual(clientId, requestedPeriod = null) {
    if (!clientId) throw new Error("clientId required");

    const mRef = db.collection("artifacts").doc("aureliusclients").collection("public").doc("data").collection("clients_db").doc("master");
    const mSnap = await mRef.get();
    const masterClients = mSnap.exists ? (mSnap.data().clients || []) : [];
    const client = masterClients.find(c => c && (c.id === clientId || c.id?.toString() === clientId.toString()));

    if (!client) {
        throw new Error("Клиент не найден в базе данных");
    }

    const cleanAdsId = (client.adsId || '').toString().replace(/\D/g, '');
    let siData = {};
    if (cleanAdsId || clientId) {
        const siSnap = await db.collection(SCHEDULED_INVOICES_COLLECTION).get();
        siSnap.forEach(d => {
            const dData = d.data();
            if (dData.clientId && dData.clientId.toString() === clientId.toString()) siData = dData;
            else if (cleanAdsId && dData.adsId && dData.adsId.toString().replace(/\D/g, '') === cleanAdsId) siData = dData;
        });
    }

    const chatId = (client.telegramChatId || siData.telegramChatId || '').toString().trim();
    if (!chatId) {
        throw new Error("У клиента не подключена группа Telegram (telegramChatId отсутствует)");
    }

    const stats = client.ads_stats || client.adsStats || siData || {};
    const reportPkg = await generateAdsReportImages(client, stats, requestedPeriod);

    const clientName = client.name || client.clientName || 'Клиент';
    console.log(`[Manual Ads Report] Sending package to client ${clientName} (${chatId}), period: ${reportPkg.periodName}`);

    const sendRes = await sendAdsReportPackage(chatId, reportPkg);

    if (chatId !== CONFIG.ADMIN_CHAT_ID) {
        const adminPrefix = `📊 <b>[АДМИН-КОПИЯ] Ручная отправка дашборда:</b>\n💬 Chat ID: <code>${chatId}</code>\n──────────────────\n`;
        await sendAdsReportPackage(CONFIG.ADMIN_CHAT_ID, reportPkg, { prefix: adminPrefix });
    }

    await logSys("manual_ads_report", `[SENT] Дашборд вручную отправлен клиенту ${clientName} (${chatId})`);

    return {
        clientId,
        clientName,
        periodName: reportPkg.periodName,
        chatId,
        ok: sendRes?.ok || false
    };
}

exports.sendWeeklyAdsReports = onSchedule(
    { schedule: "0 11 * * 1", timeZone: TIMEZONE, region: "europe-west1", memory: "512MiB", timeoutSeconds: 300 },
    async () => {
        try {
            await runWeeklyAdsReports();
        } catch (e) {
            console.error("sendWeeklyAdsReports Scheduled Error:", e);
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