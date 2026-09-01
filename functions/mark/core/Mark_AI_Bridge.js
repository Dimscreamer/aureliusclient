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

module.exports = { callMarkLLM };
