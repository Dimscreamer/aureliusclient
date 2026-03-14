const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// --- Configuration ---
// It's recommended to store these in environment variables for security.
// Use `firebase functions:config:set aurelius.telegram_token="YOUR_TOKEN"`
// and access via `functions.config().aurelius.telegram_token`
const TELEGRAM_TOKEN = "7228834927:AAHVXyC4J_n0n46KzK7sNjw24R7L3zX1sA4";
const ADMIN_CHAT_ID = "451682370";
const MONO_JAR_ID = "6NSwcFhjnX";
const FIREBASE_PROJECT_ID = "aureliusclients";
const TIMEZONE = "Europe/Kiev";

// Firestore reference
const db = admin.firestore();
const clientsDocRef = db.collection('artifacts').doc(FIREBASE_PROJECT_ID).collection('public').doc('data').collection('clients_db').doc('master');


// --- Utility Functions ---

function escapeHtml(text) {
  if (text === undefined || text === null) return "";
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    logger.info("Telegram message sent successfully to", chatId);
  } catch (error) {
    logger.error("Error sending Telegram message:", error.response ? error.response.data : error.message);
  }
}

async function sendMessageWithButton(chatId, text, btnText, btnUrl) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: btnText, url: btnUrl }]]
      }
    };
    await axios.post(url, payload);
    logger.info("Telegram message with button sent successfully to", chatId);
  } catch (error) {
    logger.error("Error sending Telegram message with button:", error.response ? error.response.data : error.message);
    // Fallback to sending a plain text message if the button fails
    sendMessage(chatId, text + `\n\n[Кнопка недоступна: ${btnUrl}]`);
  }
}


async function fetchUSDRate() {
  try {
    const response = await axios.get("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
    return response.data[0].rate;
  } catch (e) {
    logger.error("Failed to fetch USD rate, using default.", { error: e });
    return 41.5; // Fallback rate
  }
}

// --- Main API Endpoint ---

exports.api = onRequest({ cors: true, region: "europe-west3" }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send('');
    return;
  }
  
  const { action, ...data } = req.body;
  logger.info(`Received action: ${action}`, { data });

  try {
    switch (action) {
      case 'test':
        await sendMessage(ADMIN_CHAT_ID, `🔔 <b>Тест системы</b>\n<pre>${escapeHtml(data.message)}</pre>`);
        res.status(200).json({ success: true, message: "Test signal sent." });
        break;
      
      case 'notifyManualPayment':
        const rate = await fetchUSDRate();
        const amountUah = Math.ceil((parseFloat(data.amount) || 0) * rate);
        const cleanName = (data.clientName || "Клиент").replace(" (Доп. услуги)", "");
        await sendMessage(ADMIN_CHAT_ID, `✅ <b>Ручное подтверждение:</b> ${escapeHtml(cleanName)} на сумму ${amountUah} грн.\nБазу CRM обновлено.`);
        res.status(200).json({ success: true, message: "Manual payment notification sent." });
        break;

      case 'manualInvoice':
      case 'extraInvoice':
        await handleInvoiceRequest(data, action);
        res.status(200).json({ success: true, message: "Invoice sent." });
        break;
        
      default:
        logger.warn("Unknown action:", action);
        res.status(400).send("Unknown action");
    }
  } catch (error) {
    logger.error("Error processing request:", { action, error, data });
    res.status(500).send("Internal Server Error");
  }
});

// --- Invoice Logic ---
async function handleInvoiceRequest(data, invoiceType) {
  const rate = await fetchUSDRate();
  const amountUsd = parseFloat(data.amount) || 0;
  const amountUah = Math.ceil(amountUsd * rate);

  if (!MONO_JAR_ID) {
    logger.error("MONO_JAR_ID is not set!");
    await sendMessage(ADMIN_CHAT_ID, `⚠️ <b>Ошибка:</b> Не задан MONO_JAR_ID в настройках.`);
    return;
  }
  
  const clientData = await getClientData(data.clientId, data.adsId);
  const clientName = data.clientName || (clientData ? clientData.name : "Клієнт");
  const searchId = (data.adsId || data.clientId || "").toString().replace(/\D/g, '').trim();

  let message;
  let comment;
  let btnText = `💳 Сплатити ${amountUah} грн`;

  if (invoiceType === 'extraInvoice') {
    comment = encodeURIComponent(`ID:${searchId}-EXTRA`);
    const siteLine = (clientData && clientData.links && clientData.links.site) ? `🌐 <code>${escapeHtml(clientData.links.site.replace(/https?:\/\//, ''))}</code>` : '';
    message = `💎 <b>AURELIUS: ПОСЛУГИ</b>\n` +
              `──────────────────\n` +
              `👤 Замовник: <b>${escapeHtml(clientName.replace(" (Доп. услуги)", ""))}</b>\n` +
              `${siteLine}\n` +
              `🛠 Послуги: ${escapeHtml(data.servicesList || "Проектні роботи")}\n` +
              `🤖 Виконавець: <b>${escapeHtml(data.executor || "AureliusMarketingAI")}</b>\n` +
              `──────────────────\n` +
              `💰 Сума: <b>$${amountUsd}</b>\n` +
              `📉 Курс: ${rate.toFixed(2)} (До сплати: <b>${amountUah} грн</b>)\n\n` +
              `Дякуємо за співпрацю.`;
  } else { // 'manualInvoice'
    comment = encodeURIComponent(`ID:${searchId}`);
    const siteLine = (clientData && clientData.links && clientData.links.site) ? `🌐 <code>${escapeHtml(clientData.links.site.replace(/https?:\/\//, ''))}</code>` : '';
    const statsText = await getClientStatsText(clientData);

    message = `🧾 <b>РАХУНОК НА ОПЛАТУ ТА СТАТИСТИКА</b>\n` +
              `${siteLine}\n` +
              `${statsText}\n` +
              `──────────────────\n` +
              `💰 Сума за ведення: <b>$${amountUsd}</b>\n` +
              `📈 Курс НБУ: ${rate.toFixed(2)} (Всього: <b>${amountUah}</b> грн)\n\n` +
              `${escapeHtml(clientName)}, дякуємо за співпрацю.`;
  }

  const paymentUrl = `https://send.monobank.ua/jar/${MONO_JAR_ID}?a=${amountUah}&t=${comment}`;
  await sendMessageWithButton(ADMIN_CHAT_ID, message, btnText, paymentUrl);
}

// --- Data Fetching and Manipulation ---

async function getClientData(clientId, adsId) {
    const docSnap = await clientsDocRef.get();
    if (!docSnap.exists) return null;

    const clients = docSnap.data().clients || [];
    const searchId = (adsId || clientId || "").toString().replace(/\D/g, '').trim();

    if (!searchId) return null;

    const client = clients.find(c => {
        const dbId = (c.id || "").toString().replace(/\D/g, '').trim();
        const dbAdsId = (c.adsId || "").toString().replace(/\D/g, '').trim();
        return dbId === searchId || (dbAdsId && dbAdsId === searchId);
    });

    return client || null;
}

async function getClientStatsText(clientInfo) {
    if (!clientInfo) return "";
    
    // The stats are now directly on the client object, not a nested 'stats' object
    const s = clientInfo; 
    let detailsText = "";
    
    // Check if cachedConvDetails exists and is a string
    if (s.cachedConvDetails && typeof s.cachedConvDetails === 'string') {
        try {
            const details = JSON.parse(s.cachedConvDetails);
            if (details && details.length > 0) {
                detailsText = "\\n<b>Деталізація цілей:</b>\\n";
                details.forEach(c => {
                    detailsText += `└ <i>${escapeHtml(c.name)}: ${c.count}</i>\\n`;
                });
            }
        } catch(e) {
            logger.warn("Could not parse cachedConvDetails for client:", clientInfo.id, e);
            detailsText = "";
        }
    }
    
    // Check if any stats data is available
    if (s.cachedImps === undefined && s.cachedClicks === undefined && s.cachedConvs === undefined) {
      return "";
    }
    
    return `\\n📊 <b>Результати (30 днів):</b>\\n` +
           `👁 Покази: <b>${parseInt(s.cachedImps || 0).toLocaleString()}</b>\\n` +
           `🖱 Кліки: <b>${parseInt(s.cachedClicks || 0).toLocaleString()}</b>\\n` +
           `🎯 Конверсії: <b>${escapeHtml(s.cachedConvs)}</b>\\n` +
           `💰 Витрати: <b>${escapeHtml(s.cachedCost)} ${escapeHtml(s.cachedCurr)}</b>\\n` +
           `📉 Ціна конв.: <b>${escapeHtml(s.cachedCPA)} ${escapeHtml(s.cachedCurr)}</b>` +
           detailsText + `\\n`;
}


// --- Webhook Handler (for Monobank) ---

exports.monobankWebhook = onRequest({ region: "europe-west3" }, async (req, res) => {
    // You should add a secret to your webhook URL for security
    // e.g., https://your-function-url?secret=YOUR_SECRET
    // if (req.query.secret !== "YOUR_SECRET") {
    //   return res.status(401).send("Unauthorized");
    // }
    
    const data = req.body;
    
    if (data && data.type === "StatementItem") {
        logger.info("Received Monobank statement item.");
        await handleMonoTransaction(data.data.statementItem);
        res.status(200).send("OK");
    } else {
        logger.warn("Received a webhook that was not a StatementItem:", data);
        res.status(200).send("OK, but not a statement item.");
    }
});

async function handleMonoTransaction(item) {
    const transId = item.id;
    // Use Firestore to prevent duplicate processing
    const processedRef = db.collection('processed_transactions').doc(transId);
    const processedSnap = await processedRef.get();

    if (processedSnap.exists) {
        logger.info(`Transaction ${transId} already processed.`);
        return;
    }

    const comment = item.comment || item.description || "";
    const match = comment.match(/ID\s*[:\\-\\s]?\s*(\\d+)(?:-(EXTRA))?/i);

    if (match) {
        const extractedId = match[1];
        const isExtra = !!match[2];
        const amountUah = Math.abs(item.amount / 100);
        
        const { client, clientIndex, clients } = await findClient(extractedId);

        if (client) {
            let histText = "";
            if (isExtra) {
                const rate = await fetchUSDRate();
                const approxUsd = Math.round(amountUah / rate);
                histText = `Платеж получен (Доп): $${approxUsd}.`;
            } else {
                client.status = "Активен";
                let nextDateStr = "";
                const oldDateStr = client.date || "";

                if (oldDateStr && oldDateStr.includes('-')) {
                    let anchorDate = new Date(oldDateStr);
                    anchorDate.setMonth(anchorDate.getMonth() + 1);
                    let now = new Date();
                    now.setHours(0, 0, 0, 0);
                    while (anchorDate < now) {
                        anchorDate.setMonth(anchorDate.getMonth() + 1);
                    }
                    nextDateStr = anchorDate.toISOString().split('T')[0];
                } else {
                    let d = new Date();
                    d.setMonth(d.getMonth() + 1);
                    nextDateStr = d.toISOString().split('T')[0];
                }
                client.date = nextDateStr;
                const amountUsd = client.amount || "0";
                histText = `Платеж получен: $${amountUsd}. След. оплата: ${nextDateStr}`;
            }
            
            const histDate = new Date().toLocaleString("ru-RU", { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            if (!client.history) client.history = [];
            client.history.unshift({ date: histDate, text: histText });
            client.history = client.history.slice(0, 30);
            
            clients[clientIndex] = client;
            await clientsDocRef.update({ clients: clients });

            const name = client.name || extractedId;
            const typeLabel = isExtra ? " (Послуги)" : "";
            const site = (client.links && client.links.site) ? ` (${client.links.site})` : "";
            
            await sendMessage(ADMIN_CHAT_ID, `✅ <b>Оплату підтверджено:</b> ${escapeHtml(name)}${escapeHtml(site)}${typeLabel} на суму ${amountUah} грн.\nБазу CRM оновлено автоматично.`);
            
        } else {
            await sendMessage(ADMIN_CHAT_ID, `⚠️ <b>Увага:</b> Отримано оплату (${amountUah} грн), але ID <code>${extractedId}</code> не знайдено в базі CRM.\nКоментар: <code>${escapeHtml(comment)}</code>`);
        }
        // Mark transaction as processed
        await processedRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
    }
}


// --- Scheduled Payment Checker ---
exports.checkScheduledPayments = onSchedule({
    schedule: "every day 10:00", // Runs at 10:00 AM every day
    timeZone: "Europe/Kiev",
}, async (event) => {
    logger.info("Running scheduled payment check...");
    try {
        const docSnap = await clientsDocRef.get();
        if (!docSnap.exists) {
            logger.error("Clients collection document not found for scheduled check.");
            return null;
        }

        const clients = docSnap.data().clients || [];
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        
        let sentInvoicesCount = 0;
        let clientsToUpdate = [];

        for (const client of clients) {
             const isRecurring = client.recurring !== false;
             // Check if recurring is enabled, client is active, and payment is due today
             if (isRecurring && client.status === 'Активен' && client.date === todayString) {
                
                // Avoid re-sending if it has already been sent today
                const alreadySentToday = client.history && client.history.some(h => {
                    // Convert "DD.MM.YYYY, HH:mm" to a Date object for comparison
                    const dateParts = h.date.split(', ')[0].split('.');
                    const histDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);

                    return h.text.startsWith("Счет отправлен") &&
                           histDate.getFullYear() === today.getFullYear() &&
                           histDate.getMonth() === today.getMonth() &&
                           histDate.getDate() === today.getDate();
                });
                
                if (!alreadySentToday) {
                    logger.info(`Sending scheduled invoice for client ID: ${client.id}`);
                    await handleInvoiceRequest(client, 'manualInvoice');
                    sentInvoicesCount++;

                    // Add history record for sending the invoice
                    const histDate = new Date().toLocaleString("ru-RU", { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    if (!client.history) client.history = [];
                    client.history.unshift({ date: histDate, text: `Счет отправлен: $${client.amount}` });
                    client.history = client.history.slice(0, 30);
                    clientsToUpdate.push(client);
                }
            }
        }
        
        // Batch update clients that had invoices sent
        if (clientsToUpdate.length > 0) {
            const allClients = docSnap.data().clients || [];
            const updatedClients = allClients.map(c => {
                const updatedClient = clientsToUpdate.find(u => u.id === c.id);
                return updatedClient || c;
            });
            await clientsDocRef.update({ clients: updatedClients });
        }

        logger.info(`Scheduled check complete. Sent ${sentInvoicesCount} invoices.`);
        return null;

    } catch (error) {
        logger.error("Error in scheduled payment check:", error);
        return null;
    }
});


// Helper to find a client in the array
async function findClient(searchId) {
    const cleanSearchId = searchId.toString().replace(/\D/g, '').trim();
    const docSnap = await clientsDocRef.get();
    if (!docSnap.exists) {
        return { client: null, clientIndex: -1, clients: [] };
    }
    const clients = docSnap.data().clients || [];
    const clientIndex = clients.findIndex(c => {
        const dbId = (c.id || "").toString().replace(/\D/g, '').trim();
        const dbAdsId = (c.adsId || "").toString().replace(/\D/g, '').trim();
        return dbId === cleanSearchId || (dbAdsId && dbAdsId === cleanSearchId);
    });
    
    if (clientIndex !== -1) {
        return { client: clients[clientIndex], clientIndex, clients };
    }
    
    return { client: null, clientIndex: -1, clients };
}
