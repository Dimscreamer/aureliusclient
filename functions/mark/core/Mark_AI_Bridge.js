/**
 * 🌉 Mark_AI_Bridge.js — Мост к OpenRouter с телеметрией и подсчетом стоимости
 */
const axios = require('axios');
const { MARK_CONFIG } = require('./Mark_Config');

async function callMarkLLM({ systemPrompt, messages = [], userPrompt, senderName = 'Клиент', temperature = 0.3, maxTokens = 1000 }) {
    const startTime = Date.now();
    const finalMessages = [];

    if (systemPrompt) {
        finalMessages.push({ role: 'system', content: systemPrompt });
    }

    if (messages && messages.length > 0) {
        messages.forEach(m => finalMessages.push(m));
    }

    if (userPrompt) {
        finalMessages.push({ role: 'user', content: senderName ? `${senderName}: ${userPrompt}` : userPrompt });
    }

    const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const res = await axios.post(openRouterUrl, {
        model: MARK_CONFIG.OPENROUTER_MODEL,
        messages: finalMessages,
        temperature: temperature,
        max_tokens: maxTokens
    }, {
        headers: {
            'Authorization': `Bearer ${MARK_CONFIG.OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://aurelius.marketing',
            'X-Title': 'Aurelius Marketing Bot',
            'Content-Type': 'application/json'
        },
        timeout: 25000
    });

    const latencyMs = Date.now() - startTime;
    const choice = res.data.choices?.[0]?.message;
    const replyText = choice?.content || '';
    const thoughtText = choice?.reasoning || '(none)';
    const usage = res.data.usage || {};

    const tokensIn = usage.prompt_tokens || 0;
    const tokensOut = usage.completion_tokens || 0;
    const costUSD = (tokensIn * MARK_CONFIG.PRICING.input) + (tokensOut * MARK_CONFIG.PRICING.output);

    return {
        reply: replyText,
        thought: thoughtText,
        tokensIn: tokensIn,
        tokensOut: tokensOut,
        latencyMs: latencyMs,
        costUSD: costUSD,
        model: MARK_CONFIG.OPENROUTER_MODEL
    };
}

/**
 * Расшифровка голосового сообщения через OpenRouter (Google Gemini 2.5 Flash input_audio)
 * @param {string} base64Audio — аудио в base64
 * @param {string} format — формат ('ogg', 'mp3', 'wav', 'm4a')
 * @returns {Promise<string>} — чистый текст расшифровки
 */
async function transcribeVoiceAudio(base64Audio, format = 'ogg') {
    if (!base64Audio) return '';

    const payload = {
        model: 'google/gemini-2.5-flash',
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: 'Расшифруй это голосовое/аудио сообщение максимально точно на языке оригинала (украинский или русский). Верни ТОЛЬКО чистый текст расшифровки без каких-либо комментариев, префиксов, кавычек или пояснений.'
                },
                {
                    type: 'input_audio',
                    input_audio: {
                        data: base64Audio,
                        format: format || 'ogg'
                    }
                }
            ]
        }],
        temperature: 0.0
    };

    try {
        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${MARK_CONFIG.OPENROUTER_KEY}`,
                'HTTP-Referer': 'https://aurelius.marketing',
                'X-Title': 'Aurelius Marketing Bot',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const choice = res.data.choices?.[0]?.message;
        const text = choice?.content?.trim() || '';
        return text;
    } catch (err) {
        console.error('[Mark_AI_Bridge] transcribeVoiceAudio error:', err.response?.data || err.message);
        return '';
    }
}

module.exports = { callMarkLLM, transcribeVoiceAudio };
