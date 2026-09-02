/**
 * 🧠 Emanuel_AI.js — OpenRouter & Gemini Integration с JSON-контрактом
 */
const axios = require('axios');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

class EmanuelAI {
    constructor() {
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    /**
     * Генерация одного лучшего хода со строгим JSON-контрактом
     */
    async generateAdvice(params) {
        const apiKey = EMANUEL_CONFIG.OPENROUTER_KEY;
        if (!apiKey) throw new Error('OPENROUTER_KEY не настроен');

        const girlName = params.girlName || 'Девушка';
        const sessionId = params.sessionId || 'session_default';
        const currentState = params.currentState || 'BUILD';
        const fastTrack = !!params.fastTrack;
        const isAlternative = !!params.isAlternative;

        const systemPrompt = EMANUEL_CONFIG.getSystemPrompt({
            girlName,
            sessionId,
            currentState,
            fastTrack,
            isAlternative
        });

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // История диалога
        if (params.dialogHistory && Array.isArray(params.dialogHistory) && params.dialogHistory.length > 0) {
            params.dialogHistory.forEach(turn => {
                if (turn.girl) messages.push({ role: 'user', content: turn.girl });
                if (turn.wingman) messages.push({ role: 'assistant', content: turn.wingman });
            });
        }

        // Вход текущего шага
        const currentContent = [];
        let promptPrefix = `[Сессия девушки: ${girlName}] [ID: ${sessionId}] [Текущее состояние: ${currentState}]\n`;
        if (fastTrack) promptPrefix += `[РУЧНОЙ OVERRIDE: ⚡ БЫСТРЕЕ К ВОПРОСУ]\n`;
        if (isAlternative) promptPrefix += `[РУЧНОЙ ЗАПРОС: 🔄 ДРУГОЙ ВАРИАНТ]\n`;

        if (params.text) {
            promptPrefix += `[Сообщение девушки]: "${params.text}"`;
        } else {
            promptPrefix += `[Скриншот переписки девушки]`;
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
            max_tokens: EMANUEL_CONFIG.MAX_TOKENS,
            response_format: { type: "json_object" }
        };

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aureliusclients.web.app',
            'X-Title': 'Emanuel Dating OS Core'
        };

        const startTime = Date.now();
        try {
            const res = await axios.post(this.apiUrl, payload, { headers, timeout: 25000 });
            const durationMs = Date.now() - startTime;

            if (res.data?.choices && res.data.choices.length > 0) {
                const rawContent = res.data.choices[0].message.content;
                const parsed = this.parseJsonSafe(rawContent, girlName);

                return {
                    success: true,
                    ...parsed,
                    durationMs: durationMs,
                    tokens: res.data.usage || {}
                };
            }
            return {
                success: false,
                reply: '⚠️ Не удалось получить ответ от ИИ.',
                reason: 'Пустой ответ модели',
                durationMs: durationMs
            };
        } catch (err) {
            const durationMs = Date.now() - startTime;
            console.error('Emanuel AI Error:', err.response?.data || err.message);
            const errDetail = err.response?.data?.error?.message || err.message;
            return {
                success: false,
                reply: `⚠️ Ошибка ИИ (${err.response?.status || 'Network'}): ${errDetail}`,
                reason: errDetail,
                durationMs: durationMs
            };
        }
    }

    /**
     * Безопасный парсинг JSON ответа от модели
     */
    parseJsonSafe(rawContent, girlName) {
        let jsonStr = rawContent.trim();

        // Очистка от ```json ... ``` если модель завернула
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?\n?/, '').replace(/```$/, '').trim();
        }

        try {
            const obj = JSON.parse(jsonStr);
            const state = obj.state || 'BUILD';
            const stepsToTaboo = typeof obj.steps_to_taboo === 'number' ? obj.steps_to_taboo : (state === 'READY_FOR_TABU' ? 0 : 1);
            const nextAction = obj.next_action || (stepsToTaboo === 0 ? 'ASK_TABU' : 'BUILD_COMFORT');
            const reply = String(obj.reply || '').trim();
            const reason = String(obj.reason || '').trim();
            const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.85;

            return {
                state,
                stepsToTaboo,
                nextAction,
                reply,
                reason,
                confidence,
                rawJson: obj
            };
        } catch (e) {
            console.warn('Fallback JSON parse error:', e.message, 'Raw:', rawContent);
            // Fallback если JSON сбит
            const replyMatch = rawContent.match(/"reply"\s*:\s*"([^"]+)"/);
            const reply = replyMatch ? replyMatch[1] : rawContent.replace(/[{}"\\]/g, '').trim();

            return {
                state: 'BUILD',
                stepsToTaboo: 1,
                nextAction: 'BUILD_COMFORT',
                reply: reply,
                reason: 'Определено через fallback парсер',
                confidence: 0.7
            };
        }
    }

    /**
     * Анализ сессий для сводки «🧭 Веди меня» (Фокусный Топ-3)
     */
    async generateLeadMeAnalysis(sessionsSummary) {
        const apiKey = EMANUEL_CONFIG.OPENROUTER_KEY;
        if (!apiKey) throw new Error('OPENROUTER_KEY не настроен');

        const systemPrompt = EMANUEL_CONFIG.getLeadMePrompt();
        const userContent = `Мои активные диалоги:\n` + JSON.stringify(sessionsSummary, null, 2);

        const payload = {
            model: EMANUEL_CONFIG.AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: 0.5,
            max_tokens: 1000,
            response_format: { type: "json_object" }
        };

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aureliusclients.web.app',
            'X-Title': 'Emanuel Lead Me'
        };

        try {
            const res = await axios.post(this.apiUrl, payload, { headers, timeout: 20000 });
            if (res.data?.choices && res.data.choices.length > 0) {
                const raw = res.data.choices[0].message.content.trim();
                let clean = raw;
                if (clean.startsWith('```')) {
                    clean = clean.replace(/^```(json)?\n?/, '').replace(/```$/, '').trim();
                }
                const parsed = JSON.parse(clean);
                return { success: true, ...parsed };
            }
            return { success: false, items: [], summary: 'Нет данных' };
        } catch (e) {
            console.error('LeadMe AI error:', e.message);
            // Умный локальный fallback, если OpenRouter не ответил
            const items = sessionsSummary.slice(0, 3).map(s => ({
                sessionId: s.id,
                name: s.name,
                badge: s.stepsToTaboo === 0 ? '🔥' : (s.state === 'DATE_CLOSING' ? '🎯' : '🟡'),
                statusText: s.stepsToTaboo === 0 ? 'Можно переходить к вопросу о табу' : (s.state === 'DATE_CLOSING' ? 'Совместимость подтверждена! Закрывай на встречу' : 'Нужен небольшой разгон'),
                action: s.stepsToTaboo === 0 ? 'ASK_TABU' : (s.state === 'DATE_CLOSING' ? 'CLOSE_DATE' : 'BUILD')
            }));
            return {
                success: true,
                items: items,
                summary: 'Рекомендации сформированы на основе состояния диалогов.'
            };
        }
    }
}

module.exports = new EmanuelAI();
