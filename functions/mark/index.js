/**
 * 🏛️ Mark Cognitive Engine — Главная точка входа
 */
const { MARK_CONFIG } = require('./core/Mark_Config');
const { processMarkUpdate, getClientByTelegramChatId, checkAndIncrementMarkUsage, logTraceToGAS, chatHistoryMemory } = require('./core/Mark_Kernel');
const { routeMessage } = require('./core/Mark_Router');
const { getModuleRegistry, getModule } = require('./core/Mark_Registry');
const { sendTelegramMessage, editTelegramMessage, formatTelegramHtml, sendChatAction, answerCallbackQuery } = require('./core/Mark_Telegram');
const { callMarkLLM } = require('./core/Mark_AI_Bridge');

module.exports = {
    handleMarkUpdate: processMarkUpdate,
    getClientByTelegramChatId,
    checkAndIncrementMarkUsage,
    logTraceToGAS,
    chatHistoryMemory,
    routeMessage,
    getModuleRegistry,
    getModule,
    sendTelegramMessage,
    editTelegramMessage,
    formatTelegramHtml,
    sendChatAction,
    answerCallbackQuery,
    callMarkLLM,
    MARK_CONFIG
};