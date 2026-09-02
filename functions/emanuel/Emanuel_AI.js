/**
 * 🧠 Emanuel_AI.js — OpenRouter & Gemini Vision Интеграция (SEX MODE Engine)
 */
const axios = require('axios');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

class EmanuelAI {
    constructor() {
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    /**
     * Генерация рекомендаций и вариантов ответа с определением шагов до табу
     */
    async generateAdvice(params) {
        const apiKey = EMANUEL_CONFIG.OPENROUTER_KEY;
        if (!apiKey) throw new Error('OPENROUTER_KEY не настроен');

        const userSettings = params.userSettings || {};
        const mode = params.mode || userSettings.mode || 'SEX';
        const platform = userSettings.platform || 'Tinder';
        const fastTrack = !!params.fastTrack;

        const systemPrompt = EMANUEL_CONFIG.getSystemPrompt({
            mode,
            platform,
            fastTrack
        });

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Добавляем естественную историю переписки (девушка -> ответ Wingman -> девушка)
        if (params.dialogHistory && Array.isArray(params.dialogHistory) && params.dialogHistory.length > 0) {
            params.dialogHistory.forEach(turn => {
                if (turn.girl) {
                    messages.push({ role: 'user', content: turn.girl });
                }
                if (turn.wingman) {
                    messages.push({ role: 'assistant', content: turn.wingman });
                }
            });
        }

        // Входной контент текущего шага
        const currentContent = [];
        let promptPrefix = `[Режим: ${mode}] [Платформа: ${platform}]\n`;
        if (fastTrack) promptPrefix += `[Команда: ⚡ БЫСТРЕЕ К ВОПРОСУ / СРЕЗАТЬ ПУТЬ]\n`;

        if (params.text) {
            promptPrefix += `[Сообщение девушки]: "${params.text}"`;
        } else {
            promptPrefix += `[Скриншот переписки девушки из дейтинг-приложения]`;
        }

        currentContent.push({ type: 'text', text: promptPrefix });

        if (params.imageBase64) {
            currentContent.push({
                type: 'image_url',
                image_url: { url: params.imageBase64 }
            });
        }

        messages.push({ role: 'user', content: currentContent });

        const payload = {
            model: EMANUEL_CONFIG.AI_MODEL,
            messages: messages,
            temperature: EMANUEL_CONFIG.TEMPERATURE,
            max_tokens: EMANUEL_CONFIG.MAX_TOKENS
        };

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aureliusclients.web.app',
            'X-Title': 'Emanuel Dating OS Wingman'
        };

        const startTime = Date.now();
        try {
            const res = await axios.post(this.apiUrl, payload, { headers, timeout: 25000 });
            const durationMs = Date.now() - startTime;

            if (res.data?.choices && res.data.choices.length > 0) {
                const rawContent = res.data.choices[0].message.content;
                const parsed = this.parseResponse(rawContent);

                return {
                    success: true,
                    mode: mode,
                    content: rawContent,
                    ...parsed,
                    durationMs: durationMs,
                    tokens: res.data.usage || {}
                };
            }
            return {
                success: false,
                content: '⚠️ Не удалось получить ответ от ИИ.',
                durationMs: durationMs
            };
        } catch (err) {
            const durationMs = Date.now() - startTime;
            console.error('Emanuel AI Error:', err.response?.data || err.message);
            const errDetail = err.response?.data?.error?.message || err.message;
            return {
                success: false,
                content: `⚠️ Ошибка генерации через ИИ (${err.response?.status || 'Network'}): ${errDetail}`,
                durationMs: durationMs
            };
        }
    }

    /**
     * Парсинг ответа ИИ в структурированные компоненты
     */
    parseResponse(text) {
        if (!text) return {};

        // 1. Шаги до табу
        let stepsToTaboo = 1;
        if (text.includes('0 шагов') || text.includes('МОЖНО СПРАШИВАТЬ')) {
            stepsToTaboo = 0;
        } else if (text.includes('2 шаг') || text.includes('~2')) {
            stepsToTaboo = 2;
        } else if (text.includes('1 шаг') || text.includes('~1')) {
            stepsToTaboo = 1;
        }

        // 2. Стратегия
        let tactic = 'BUILD';
        if (text.includes('DIRECT') || stepsToTaboo === 0) tactic = 'DIRECT';
        else if (text.includes('RESET')) tactic = 'RESET';

        // 3. Извлечение вариантов в кавычках «...»
        const quotes = [];
        const regex = /«([^»]+)»/g;
        let m;
        while ((m = regex.exec(text)) !== null) {
            quotes.push(m[1].trim());
        }

        const mainReply = quotes[0] || '';
        const softerReply = quotes[1] || '';
        const bolderReply = quotes[2] || '';

        // 4. Анализ Compatibility Radar
        let compatibilityRadar = null;
        if (text.includes('COMPATIBILITY RADAR') || text.includes('Совместимость:')) {
            const isCompatible = text.includes('ВЫСОКАЯ') || text.includes('СОВМЕСТИМ') || text.includes('DATE MODE') || text.includes('встреч');
            const isLow = text.includes('НИЗКАЯ') || text.includes('НЕСОВМЕСТИМ') || text.includes('Стоп');

            compatibilityRadar = {
                active: true,
                isCompatible: isCompatible && !isLow,
                rating: isCompatible && !isLow ? 'Высокая' : 'Низкая (Несовместимы)',
                verdict: isCompatible && !isLow 
                    ? '🔥 Совместимость подтверждена! Закрывай на встречу, хватит переписок.' 
                    : '❄️ Стоп. Совместимость низкая. Не трать время, выходи красиво.'
            };
        }

        return {
            stepsToTaboo,
            tactic,
            mainReply,
            softerReply,
            bolderReply,
            gist: mainReply || (quotes[0] || '').substring(0, 150),
            compatibilityRadar
        };
    }
}

module.exports = new EmanuelAI();
