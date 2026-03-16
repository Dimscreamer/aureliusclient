const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// v2.0.1 - Fixed manual payment clearing
admin.initializeApp();
const db = admin.firestore();

// Твои актуальные данные
const CONFIG = {
    TELEGRAM_TOKEN: "7320490740:AAGnAnW_tXF6j4oI5I8mUeN9lX5S-A0vM1w", 
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

exports.api = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }
    if (req.method === "GET") {
        return res.send("Aurelius API v1.0 Online");
    }

    let data = req.body;
    if (!data || typeof data !== "object") {
        try {
            const raw = req.rawBody || (req.body && typeof req.body === "string" ? req.body : null);
            if (raw) data = JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : raw);
            else data = {};
        } catch (e) {
            return res.status(400).send("Invalid JSON body");
        }
    }

    try {
        // 1. Mono Webhook (Приход денег)
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

        // 2. Тест из CRM
        if (data.action === 'test') {
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `🔔 <b>Тест Firebase API</b>\n<pre>${escapeHtml(data.message)}</pre>`);
            return res.send("success");
        }

        // 3. Отправка инвойса
        if (data.action === 'manualInvoice') {
            const response = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
            const rate = response.data[0].rate;
            
            const amountUsd = parseFloat(data.amount) || 0;
            const amountUah = Math.ceil(amountUsd * rate);
            const id = (data.adsId || data.clientId || "0").toString().replace(/\D/g, '');
            
            const isExtra = data.invoiceType === 'extra';
            const comment = `ID:${id}${isExtra ? '-EXTRA' : ''}`;
            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=${encodeURIComponent(comment)}`;

            const message = isExtra ? 
                `💎 <b>AURELIUS: ПОСЛУГИ</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n🛠 Послуги: ${escapeHtml(data.servicesList)}\n💰 Сума: <b>$${amountUsd}</b> (${amountUah} грн)` :
                `🧾 <b>РАХУНОК НА ОПЛАТУ</b>\n👤 Клієнт: ${escapeHtml(data.clientName)}\n💰 Сума: <b>$${amountUsd}</b> (${amountUah} грн)`;

            await sendMessage(CONFIG.ADMIN_CHAT_ID, message, { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl });
            return res.send("success");
        }

        // 4. Синхронизация даты оплаты (для авто-инвойса в день оплаты)
        if (data.action === "syncPayment") {
            const clientId = (data.clientId || "").toString();
            if (!clientId) return res.status(400).send("clientId required");
            const targetDate = (data.targetDate || "").toString().trim();
            if (!targetDate) {
                await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).delete();
                return res.send("success");
            }
            await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).set({
                clientId,
                clientName: data.clientName || "",
                amount: parseFloat(data.amount) || 0,
                targetDate,
                adsId: (data.adsId || "").toString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return res.send("success");
        }

        // 5. Уведомление о ручной оплате
        if (data.action === "notifyManualPayment") {
            const name = escapeHtml(data.clientName || "Клиент");
            const amount = parseFloat(data.amount) || 0;
            const clientId = (data.clientId || "").toString();
            
            await sendMessage(CONFIG.ADMIN_CHAT_ID, `✅ <b>Оплата подтверждена вручную</b>\n👤 ${name}\n💰 $${amount}`);
            
            // Удаляем запланированный инвойс после подтверждения ручной оплаты
            if (clientId) {
                await db.collection(SCHEDULED_INVOICES_COLLECTION).doc(clientId).delete();
            }
            
            return res.send("success");
        }

        return res.status(400).send("No valid action found");
    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).send("Error");
    }
});

async function sendMessage(chatId, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true };
    if (keyboard) payload.reply_markup = { inline_keyboard: [[keyboard]] };
    await axios.post(url, payload);
}

function getTodayKyiv() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
}

// Авто-инвойс: каждый день в 10:00 по Киеву — отправка счетов клиентам с датой оплаты сегодня
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
            const targetDateStr = (d.targetDate || "").toString().trim();
            if (targetDateStr !== today) {
                // If targetDate is in the past, update it to today to avoid re-sending indefinitely
                if (new Date(targetDateStr) < new Date(today)) {
                    await docSnap.ref.update({ targetDate: today });
                }
                continue;
            }

            const lastSent = (d.lastSentDate || "").toString();
            if (lastSent === today) continue;

            const amountUsd = parseFloat(d.amount) || 0;
            if (amountUsd <= 0) continue;
            const amountUah = Math.ceil(amountUsd * rate);
            const id = (d.adsId || d.clientId || "0").toString().replace(/\D/g, "");
            const comment = `ID:${id}`;
            const paymentUrl = `https://send.monobank.ua/jar/${CONFIG.MONO_JAR_ID}?a=${amountUah}&t=${encodeURIComponent(comment)}`;
            const message = `🧾 <b>РАХУНОК НА ОПЛАТУ</b> (авто)\n👤 Клієнт: ${escapeHtml(d.clientName || "")}\n💰 Сума: <b>$${amountUsd}</b> (${amountUah} грн)`;
            try {
                await sendMessage(CONFIG.ADMIN_CHAT_ID, message, { text: `💳 Сплатити ${amountUah} грн`, url: paymentUrl });

                // ЛОГИКА АВТОПЕРЕНОСА НА СЛЕДУЮЩИЙ МЕСЯЦ (якорный день + 1 месяц: 15 марта → 15 апреля)
                const currentDate = new Date(d.targetDate);
                currentDate.setMonth(currentDate.getMonth() + 1);
                const nextDateStr = currentDate.toISOString().split("T")[0];

                await docSnap.ref.update({
                    lastSentDate: today,
                    targetDate: nextDateStr
                });

                console.log(`Инвойс отправлен для ${d.clientName}. Следующая дата: ${nextDateStr}`);
            } catch (err) {
                console.error("Scheduled invoice send error:", docSnap.id, err);
            }
        }
    }
);