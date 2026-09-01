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

function getTodayKyiv() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
}

exports.api = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");

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
            if (match) {
                const amountUah = Math.abs(item.amount / 100);
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

        return res.status(400).send("No valid action found");
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).send("Error: " + err.message);
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