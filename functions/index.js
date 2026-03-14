const { onRequest } = require("firebase-functions/v2/https");
const axios = require("axios");

const OPENROUTER_API_KEY = "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"

";
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzsMoYoNqBUoA5g0nbLy5g-tfhdb5J6h9zGr1nNKF3WG2_zMlZJuptBTPEsbP3nTmfmKg/exec";

exports.analyzeClient = onRequest({ cors: true, region: "europe-west3" }, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.end();
    return;
  }

  const chatHistory = req.body.text || "Нет текста";

  try {
    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: "Ты эксперт CRM Aurelius. Проанализируй переписку. Выдели имя клиента, даты оплат и психологический портрет."
        },
        {
          role: "user",
          content: `Проанализируй этот текст: ${chatHistory}`
        }
      ]
    }, {
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const analysis = response.data.choices[0].message.content;
    res.status(200).json({ success: true, analysis: analysis });

  } catch (error) {
    console.error("Ошибка OpenRouter:", error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: "Ошибка при связи с ИИ" });
  }
});

exports.telegramProxy = onRequest({ cors: true, region: "europe-west3" }, async (req, res) => {
  try {
    const response = await axios.post(GAS_API_URL, req.body, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error("Error proxying to Google Apps Script:", error.message);
    res.status(500).json({ success: false, error: "Proxy Error: " + error.message });
  }
});