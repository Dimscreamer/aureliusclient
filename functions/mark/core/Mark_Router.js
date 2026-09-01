/**
 * 🔀 Mark_Router.js — 3-уровневый маршрутизатор запросов Марка
 *
 * Уровни маршрутизации:
 *   L0: Exact Match (Команды и точные фразы)
 *   L1: Broad Match (Широкие соответствия, регулярки, ключевые паттерны)
 *   L2: Logical Layer (Базовый маркетинговый диалог с инжекцией контекста)
 */
const { getModuleRegistry } = require('./Mark_Registry');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesTrigger(input, trigger) {
    const t = trigger.toLowerCase().trim();
    if (!t) return false;
    if (t.length < 4) {
        const regex = new RegExp('(^|[^a-zA-Z0-9а-яА-ЯёЁ])' + escapeRegExp(t) + '($|[^a-zA-Z0-9а-яА-ЯёЁ])');
        return regex.test(input);
    }
    return input.includes(t);
}

/**
 * Определение маршрута для входящего сообщения
 * @param {string} rawText - Текст сообщения
 * @param {Object} context - Дополнительный контекст (пользователь, чат, CRM)
 * @returns {Object} { layer: 'L0'|'L1'|'L2', moduleKey: string|null, trigger: string|null, command: string|null }
 */

function routeMessage(rawText, context = {}) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();
    const registry = getModuleRegistry();
    const dynamicConfig = context.markOsConfig?.modules || {};

    // =========================================================================
    // L0: EXACT MATCHES
    // =========================================================================
    for (const [key, mod] of Object.entries(registry)) {
        // Use dynamic exact matches if provided, otherwise fallback to registry defaults
        const exact = dynamicConfig[key]?.exactMatches || mod.exactTriggers || [];
        const isEnabled = dynamicConfig[key]?.enabled !== false;
        
        if (isEnabled && Array.isArray(exact)) {
            for (const trigger of exact) {
                const tr = trigger.toLowerCase().trim();
                if (lower === tr || lower.startsWith(tr + ' ') || lower.startsWith(tr + '@')) {
                    return {
                        layer: 'L0',
                        moduleKey: key,
                        trigger: trigger,
                        command: tr,
                        payload: text.slice(trigger.length).trim()
                    };
                }
            }
        }
    }

    // Specific logic for freelancehunt links
    if (text.includes('freelancehunt.com/project/')) {
        return {
            layer: 'L0',
            moduleKey: 'freelancehunt',
            trigger: 'freelancehunt.com/project/',
            command: '/fl',
            payload: text
        };
    }

    // =========================================================================
    // L1: BROAD MATCHES
    // =========================================================================
    const matchedModules = [];

    for (const [key, mod] of Object.entries(registry)) {
        const broad = dynamicConfig[key]?.broadMatches || mod.broadTriggers || [];
        const isEnabled = dynamicConfig[key]?.enabled !== false;

        if (isEnabled && Array.isArray(broad)) {
            for (const trigger of broad) {
                if (matchesTrigger(lower, trigger)) {
                    matchedModules.push({
                        key,
                        trigger,
                        priority: key === 'google_ads' ? 80 : 50
                    });
                    break;
                }
            }
        }
    }

    if (matchedModules.length > 0) {
        matchedModules.sort((a, b) => b.priority - a.priority);
        const topMatch = matchedModules[0];
        return {
            layer: 'L1',
            moduleKey: topMatch.key,
            trigger: topMatch.trigger,
            allMatches: matchedModules.map(m => m.key)
        };
    }

    // =========================================================================
    // L2: COGNITIVE (LLM) LAYER
    // =========================================================================
    return {
        layer: 'L2',
        moduleKey: 'google_ads',
        trigger: 'DEFAULT_MARKETING_FALLBACK'
    };
}

module.exports = {
    routeMessage,
    matchesTrigger
};
