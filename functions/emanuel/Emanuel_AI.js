/**
 * 🧠 Emanuel_AI.js — OpenRouter & Gemini Integration с JSON-контрактом, Vision Batching и Profile Analysis
 */
const axios = require('axios');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

// Регулярное выражение для очистки эмодзи из реплики мужчины
const EMOJI_REGEX = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

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
        const profile = params.profile || null;
        const dossier = params.dossier || null;

        const systemPrompt = EMANUEL_CONFIG.getSystemPrompt({
            girlName,
            sessionId,
            currentState,
            fastTrack,
            isAlternative,
            profile,
            dossier
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
            promptPrefix += `[Скриншот(ы) переписки девушки]`;
        }

        currentContent.push({ type: 'text', text: promptPrefix });

        // Поддержка нескольких скриншотов одновременно (Multi-image vision)
        if (params.images && Array.isArray(params.images)) {
            params.images.forEach(img => {
                if (img) {
                    currentContent.push({
                        type: 'image_url',
                        image_url: { url: img }
                    });
                }
            });
        } else if (params.imageBase64) {
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
                reply: 'Не удалось получить ответ от ИИ.',
                reason: 'Пустой ответ модели',
                durationMs: durationMs
            };
        } catch (err) {
            const durationMs = Date.now() - startTime;
            console.error('Emanuel AI Error:', err.response?.data || err.message);
            const errDetail = err.response?.data?.error?.message || err.message;
            return {
                success: false,
                reply: `Ошибка ИИ (${err.response?.status || 'Network'}): ${errDetail}`,
                reason: errDetail,
                durationMs: durationMs
            };
        }
    }

    /**
     * Анализ скриншотов анкеты/профиля девушки (Tinder/Twinby/Pure/Instagram)
     */
    async analyzeProfileScreenshots(imageUrls, girlName) {
        const apiKey = EMANUEL_CONFIG.OPENROUTER_KEY;
        if (!apiKey) throw new Error('OPENROUTER_KEY не настроен');

        const systemPrompt = EMANUEL_CONFIG.getProfileAnalysisPrompt(girlName);
        const userContent = [{ type: 'text', text: `Анализ профиля/анкеты девушки «${girlName}» по прикрепленным скриншотам:` }];

        const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        images.forEach(img => {
            if (img) userContent.push({ type: 'image_url', image_url: { url: img } });
        });

        const payload = {
            model: EMANUEL_CONFIG.AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: 0.4,
            max_tokens: 1200,
            response_format: { type: "json_object" }
        };

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aureliusclients.web.app',
            'X-Title': 'Emanuel Profile Vision'
        };

        try {
            const res = await axios.post(this.apiUrl, payload, { headers, timeout: 25000 });
            if (res.data?.choices && res.data.choices.length > 0) {
                let raw = res.data.choices[0].message.content.trim();
                if (raw.startsWith('```')) {
                    raw = raw.replace(/^```(json)?\n?/, '').replace(/```$/, '').trim();
                }
                const parsed = JSON.parse(raw);
                return { success: true, profile: parsed };
            }
            return { success: false, error: 'Пустой ответ модели' };
        } catch (e) {
            console.error('Error analyzing profile:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Безопасный парсинг JSON ответа от модели с фильтрацией эмодзи
     */
    parseJsonSafe(rawContent, girlName) {
        let jsonStr = rawContent.trim();

        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?\n?/, '').replace(/```$/, '').trim();
        }

        try {
            const obj = JSON.parse(jsonStr);
            const state = obj.state || 'BUILD';
            const stepsToTaboo = typeof obj.steps_to_taboo === 'number' ? obj.steps_to_taboo : (state === 'READY_FOR_TABU' ? 0 : 1);
            const nextAction = obj.next_action || (stepsToTaboo === 0 ? 'ASK_TABU' : 'BUILD_COMFORT');
            
            // Фильтруем эмодзи из реплики мужчины
            let rawReply = String(obj.reply || '').trim();
            let cleanReply = rawReply.replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();

            const reason = String(obj.reason || '').trim();
            const timingAdvice = obj.timing_advice ? String(obj.timing_advice).trim() : 'Пауза: 25-40 минут, держи баланс значимости';
            const redFlags = obj.red_flags ? String(obj.red_flags).trim() : null;
            const dossierUpdates = obj.dossier_updates || { taboos: [], green_flags: [], date_style: null };
            const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.85;

            return {
                state,
                stepsToTaboo,
                nextAction,
                reply: cleanReply,
                reason,
                timingAdvice,
                redFlags,
                dossierUpdates,
                confidence,
                rawJson: obj
            };
        } catch (e) {
            console.warn('Fallback JSON parse error:', e.message, 'Raw:', rawContent);
            const replyMatch = rawContent.match(/"reply"\s*:\s*"([^"]+)"/);
            let reply = replyMatch ? replyMatch[1] : rawContent.replace(/[{}"\\]/g, '').trim();
            reply = reply.replace(EMOJI_REGEX, '').trim();

            return {
                state: 'BUILD',
                stepsToTaboo: 1,
                nextAction: 'BUILD_COMFORT',
                reply: reply,
                reason: 'Определено через fallback парсер',
                timingAdvice: 'Пауза: 30 минут',
                redFlags: null,
                dossierUpdates: { taboos: [], green_flags: [], date_style: null },
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
