/**
 * 📚 Mark_Registry.js — Реестр модулей Марка
 */
const { Module_GoogleAds } = require('../modules/Module_GoogleAds');
const { Module_Freelancehunt } = require('../modules/Module_Freelancehunt');
const { Module_Automation } = require('../modules/Module_Automation');

const MODULE_REGISTRY = {
    [Module_GoogleAds.key]: Module_GoogleAds,
    [Module_Freelancehunt.key]: Module_Freelancehunt,
    [Module_Automation.key]: Module_Automation
};

function getModuleRegistry() {
    return MODULE_REGISTRY;
}

function getModule(key) {
    return MODULE_REGISTRY[key] || null;
}

module.exports = {
    getModuleRegistry,
    getModule
};
