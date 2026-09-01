/**
 * ares_entry.js — Главная точка входа Ареса в Firebase Functions (Global VM Context)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Подключаем базовый адаптер
require('./gas_adapter');

function loadInGlobalContext(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: path.basename(filePath) });
}

// 2. Порядок загрузки ядра (в точности как в Apps Script)
const aresDir = __dirname;

// Core
loadInGlobalContext(path.join(aresDir, 'core', 'Config.js'));
loadInGlobalContext(path.join(aresDir, 'core', '1_Registry.js'));
loadInGlobalContext(path.join(aresDir, 'core', '8_UI_Formatter.js'));
loadInGlobalContext(path.join(aresDir, 'core', '7_Prompt_Base.js'));
loadInGlobalContext(path.join(aresDir, 'data', 'DataEngine.js'));
loadInGlobalContext(path.join(aresDir, 'core', '5_AI_Bridge.js'));
loadInGlobalContext(path.join(aresDir, 'core', '6_Telegram.js'));
loadInGlobalContext(path.join(aresDir, 'core', '4_Session.js'));
loadInGlobalContext(path.join(aresDir, 'core', '3_Router.js'));

// Cognition
const cogDir = path.join(aresDir, 'cognition');
if (fs.existsSync(cogDir)) {
  const cogFiles = fs.readdirSync(cogDir).filter(f => f.endsWith('.js'));
  cogFiles.forEach(f => {
    try {
      loadInGlobalContext(path.join(cogDir, f));
    } catch(e) {
      console.error(`[ARES_LOAD] Error in cognition ${f}:`, e.message);
    }
  });
}

// Modules
const modulesDir = path.join(aresDir, 'modules');
if (fs.existsSync(modulesDir)) {
  const modFiles = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js'));
  modFiles.forEach(f => {
    try {
      loadInGlobalContext(path.join(modulesDir, f));
    } catch(e) {
      console.error(`[ARES_LOAD] Error in module ${f}:`, e.message);
    }
  });
}

// Kernel (Entry Point)
loadInGlobalContext(path.join(aresDir, 'core', '0_Kernel.js'));

/**
 * Обработчик вебхука для Firebase Cloud Functions
 */
function handleAresUpdate(update) {
  const e = {
    postData: {
      contents: JSON.stringify(update)
    }
  };
  return globalThis.doPost(e);
}

module.exports = {
  handleAresUpdate
};
