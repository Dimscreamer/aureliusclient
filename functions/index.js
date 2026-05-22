const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// v2.1.1 - Stable Hybrid (Classic Stats + Analytics Support + New Token)
admin.initializeApp();
const db = admin.firestore();

// Актуальные данные с НОВЫМ ТОКЕНОМ
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
    // Обработка preflight-запросов браузера
    if (req.method === "OPTIONS") return res.status(204).send("");

    // Железобетонный парсинг данных (Защита от ошибки 400)
    let data = req.body;
    if (Buffer.isBuffer(req.rawBody)) {
        try { data = JSON.parse(req.rawBody.toString()); } catch(e) {}
    } else if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
    }
    if (!data || typeof data !== "object") {
        data = {}; // Если пришел мусор, делаем пустой объект, чтобы не падал код
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

        // 3. Ручной инвойс (СТАРАЯ ЛОГИКА СО СТАТИСТИКОЙ)
        if (data.action === 'manualInvoice') {
            const response = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
            const rate = response.data[0].rate;
            const amountUsd = parseFloat(data.amount) || 0;
            const amountUah = Math.ceil(amountUsd * rate);
            const id = (data.adsId || data.clientId || "0").toString().replace(/\D/g, '');
            const isExtra = data.invoiceType === 'extra';
            const comment = `ID:${id}${isExtra ? '-EXTRA' : ''}`;
            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=${encodeURIComponent(comment)}`;

            // Сборка статистики
            let statsPart = "";
            if (!isExtra && (data.impressions || data.cachedImps || data.cachedImpressions)) {
                const imps = data.impressions || data.cachedImps || data.cachedImpressions;
                const clicks = data.clicks || data.cachedClicks || "0";
                const convs = data.convs || data.cachedConvs || "0";
                const cost = data.cost || data.cachedCost || "0";
                const cpa = data.cpa || data.cachedCpa || "0";
                const curr = data.currency || "UAH";

                statsPart = `🌐 ${escapeHtml(data.siteUrl || "")}\n\n` +
                             `📊 <b>Результати (30 днів):</b>\n` +
                             `👁 Покази: ${imps}\n` +
                             `🖱 Кліки: ${clicks}\n` +
                             `🎯 Конверсії: ${convs}\n` +
                             `💰 Витрати: ${cost} ${curr}\n` +
                             `📉 Ціна конв.: ${cpa}\n\n`;
                
                let goals = data.goals || [];
                // На случай если цели прилетели в виде строки JSON
                if (typeof data.cachedConvDetails === 'string') {
                    try { goals = JSON.parse(data.cachedConvDetails); } catch(e){}
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

            await sendMessage(CONFIG.ADMIN_CHAT_ID, message, { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl });
            return res.send("success");
        }

        // 4. Синхронизация (ПОДДЕРЖКА НОВОЙ АНАЛИТИКИ)
        if (data.action === "syncPayment") {
            const clientId = (data.clientId || "").toString();
            if (!clientId) return res.status(400).send("clientId required");
            const targetDate = (data.targetDate || "").toString().trim();
            if (!targetDate) {
                await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).delete();
                return res.send("success");
            }
            // Сохраняем ВЕСЬ объект data (магия для новой аналитики и авто-инвойсов)
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

        return res.status(400).send("No valid action found");
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).send("Error: " + err.message);
    }
});

// Авто-инвойс (Scheduler) с восстановленной статистикой
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
            
            try {
                await sendMessage(CONFIG.ADMIN_CHAT_ID, message, { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl });
                const nextDate = new Date(d.targetDate);
                nextDate.setMonth(nextDate.getMonth() + 1);
                await docSnap.ref.update({ lastSentDate: today, targetDate: nextDate.toISOString().split("T")[0] });
            } catch (err) {
                console.error("Scheduled invoice error:", docSnap.id, err);
            }
        }
    }
);