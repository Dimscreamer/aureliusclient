/**
 * 🧠 Emanuel_AI.js — OpenRouter & Gemini Vision Интеграция
 */
const axios = require('axios');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

class EmanuelAI {
    constructor() {
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    /**
     * Генерация рекомендаций и 3 вариантов ответа
     */
    async generateAdvice(params) {
        const apiKey = EMANUEL_CONFIG.OPENROUTER_KEY;
        if (!apiKey) {
            throw new Error('OPENROUTER_KEY не настроен');
        }

        const userSettings = params.userSettings || {};
        const model = userSettings.model || EMANUEL_CONFIG.AI_MODEL;
        const systemPrompt = EMANUEL_CONFIG.getSystemPrompt(userSettings);

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
        let promptPrefix = '';
        if (userSettings.platform) promptPrefix += `[Платформа: ${userSettings.platform}]\n`;

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
            model: model,
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
                const content = res.data.choices[0].message.content;
                return {
                    success: true,
                    content: content,
                    gist: this.extractGist(content),
                    temperature: this.extractTemperature(content),
                    durationMs: durationMs,
                    tokens: res.data.usage || {}
                };
            }
            return {
                success: false,
                content: '⚠️ Не удалось получить осмысленный ответ от ИИ.',
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
     * Извлечь суть для краткой истории
     */
    extractGist(fullAdvice) {
        if (!fullAdvice) return '';
        // Ищем вариант в кавычках «...»
        const match = fullAdvice.match(/«([^»]+)»/);
        if (match && match[1]) {
            return match[1].trim();
        }
        const lines = fullAdvice.split('\n').filter(l => l.trim().length > 5);
        return (lines[0] || '').substring(0, 150);
    }

    /**
     * Извлечь шкалу температуры из ответа (например 7/10)
     */
    extractTemperature(fullAdvice) {
        if (!fullAdvice) return '3/10';
        const match = fullAdvice.match(/(\d{1,2}\s*\/\s*10)/);
        if (match && match[1]) {
            return match[1].replace(/\s+/g, '');
        }
        return '3/10';
    }
}

module.exports = new EmanuelAI();
