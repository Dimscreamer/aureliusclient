/**
 * 📦 functions/emanuel/index.js — Главный экспорт модуля Emanuel Dating OS
 */
const { processEmanuelUpdate } = require('./Emanuel_Kernel');
const Database = require('./Emanuel_Database');
const AI = require('./Emanuel_AI');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

module.exports = {
    processEmanuelUpdate,
    Database,
    AI,
    EMANUEL_CONFIG
};
