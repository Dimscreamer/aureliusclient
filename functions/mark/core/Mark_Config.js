/**
 * ⚙️ Mark_Config.js — Конфигурация ядра Марка
 */
const MARK_CONFIG = {
    TELEGRAM_TOKEN: "7811513232:AAEXD882CcrzcW_4if3Grg_nkUgX053ZVBw",
    ADMIN_CHAT_ID: "451682370",
    GAS_URL: "https://script.google.com/macros/s/AKfycbw6Qzxj7DKsKuyODbotFxUnzk4aOz_DOOsdQK8Jf6wMkreWiAmFWSqP3TcGM3TZlZ3S/exec",
    OPENROUTER_KEY: "YOUR_OPENROUTER_KEY_HERE",
    OPENROUTER_MODEL: "google/gemini-2.5-flash-lite",
    MONTHLY_CHAT_LIMIT: 100,
    PRICING: {
        input: 0.000075 / 1000,
        output: 0.0003 / 1000
    }
};

module.exports = { MARK_CONFIG };
