/**
 * ⚙️ Mark_Config.js — Конфигурация ядра Марка
 */
const _DEFAULT_OR_KEY = Buffer.from('c2stb3ItdjEtODI3NTY1ZGQ4ZjE3MjhlNzJkNDhmOWU5NWM1OWMxNTI4NTNhMjMyMmY4ODc4Y2E4MWUyY2VmOTk5MWExNDBmMA==', 'base64').toString('utf8');

const MARK_CONFIG = {
    TELEGRAM_TOKEN: process.env.MARK_TELEGRAM_TOKEN || "7811513232:AAEXD882CcrzcW_4if3Grg_nkUgX053ZVBw",
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || "451682370",
    GAS_URL: process.env.GAS_URL || "https://script.google.com/macros/s/AKfycbw6Qzxj7DKsKuyODbotFxUnzk4aOz_DOOsdQK8Jf6wMkreWiAmFWSqP3TcGM3TZlZ3S/exec",
    OPENROUTER_KEY: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || _DEFAULT_OR_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite",
    MONTHLY_CHAT_LIMIT: 100,
    PRICING: {
        input: 0.000075 / 1000,
        output: 0.0003 / 1000
    }
};

module.exports = { MARK_CONFIG };
