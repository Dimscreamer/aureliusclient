/**
 * 🎯 Module_Freelancehunt.js — Модуль ставок и коммуникации на бирже Freelancehunt
 * 
 * Архитектура: Конструктор смысловых блоков на базе 2-этапной обработки (Analysis -> Generation).
 * ПРАВИЛО ЯЗЫКА: Все отклики генерируются строго на том языке, на котором было написано ТЗ/задача.
 */
const axios = require('axios');
const { callMarkLLM } = require('../core/Mark_AI_Bridge');

const FREELANCE_ANALYSIS_PROMPT = `Ты — старший PPC-стратег и менеджер по продажам агентства Aurelius Ads.
Твоя задача — проанализировать ТЗ проекта с биржи Freelancehunt и сформировать структурированный JSON-анализ для конструктора ставок.

КРИТЕРИИ И ПРАВИЛА АНАЛИЗА:

1. ЯЗЫК (language):
   - Определи язык текста ТЗ ("uk" для украинского, "ru" для русского, "en" для английского).
   - ВСЕГДА генерируй отклик строго на том языке, на котором написано ТЗ!

2. ИМЯ КЛИЕНТА (client_name):
   - Если в ТЗ/тексте есть имя заказчика — укажи его в полном уважительном виде ("Александр", "Елена", "Дмитрий"). Избегай уменьшительных форм ("Саша", "Дима").
   - Если имени нет — установи null.

3. БЛОК 1: ЗАЦЕПКА (hook):
   - Сформулируй 2-4 предложения исключительно по конкретной ситуации заказчика.
   - СТРОГО ЗАПРЕЩЕНО использовать клише: "Вижу, что вы ищете...", "По задаче всё понятно...", "Вам требуется настройка...".
   - Покажи, что ты действительно прочитал проект (например: посмотри на категорию товаров, особенности аналитики или специфику рекламы).

4. БЛОК 2: МИНИ-АУДИТ / НАБЛЮДЕНИЕ (site_observation):
   - Если передана телеметрия сайта И найдено 1 реальное точечное наблюдение по конверсии (например: "на мобилке не закреплена кнопка связи") — укажи его (1 предложение).
   - Если сайта нет, ссылка не открылась или нет реальных замечаний — СТРОГО установи null.
   - ЗАПРЕЩЕНО выдумывать проблемы ради галочки!

5. БЛОК 3: ЧТО БЫ Я СДЕЛАЛ (proposed_approach):
   - 2-3 предложения с твоим подходом к решению: "Я бы начал с... после чего...". Покажи КАК ты будешь делать.

6. БЛОК 4 И 5: СОСТОЯНИЕ РЕКЛАМЫ (ads_status) И СЛЕДУЮЩИЙ ШАГ (cta):
   - "active": если из ТЗ понятно, что реклама уже запущены. CTA: предложение бесплатно посмотреть аккаунт и показать точки слива.
   - "none": если из ТЗ понятно, что рекламы еще не было. CTA: предложение структуры кампаний и логики бюджета.
   - "unknown": если непонятно. CTA: 1 конкретный вопрос ("Кстати, подскажите, Google Ads у вас уже запущен или рекламу планируете запускать с нуля?").

7. ОДОБРЕННЫЕ БЛОКИ (blocks_to_include):
   - Сформируй массив из элементов ["hook", "site_observation", "approach", "ads_status", "cta", "utp"].
   - Не вставляй блок, если он не увеличивает вероятность ответа заказчика!

СТРОГИЙ СТИЛЬ JSON СО СВЕРХРАЗУМОМ (JSON Chain of Thought):
Первым символом ответа ДОЛЖЕН быть '{'. Обязательно укажи поле "_thought" для рассуждений.

Пример структуры ответа:
{
  "_thought": "ТЗ на украинском языке. Речь идет про GTM и GA4...",
  "language": "uk",
  "client_name": "Олександр",
  "client_situation": "Налаштування GTM та GA4 для e-commerce",
  "ads_status": "unknown",
  "site_observation": null,
  "proposed_approach": "Спочатку перевірю поточний GTM...",
  "hook": "Подивився вашу задачу по налаштуванню GTM...",
  "cta": "До речі, підкажіть, Google Ads у вас вже запущений чи плануєте з нуля?",
  "blocks_to_include": ["hook", "approach", "ads_status", "cta", "utp"]
}`;

const FREELANCE_GENERATION_PROMPT = `Ты — топовый Senior PPC Specialist (Aurelius Ads), работающий на бирже Freelancehunt.
Твоя задача — сгенерировать идеальный отклик (ставку) на проект на основе JSON-анализа.

СТРОГИЕ ПРАВИЛА ГЕНЕРАЦИИ:
1. ЯЗЫК: Генерируй текст СТРОГО на языке анализа ({language}):
   - "uk" -> Украинский язык
   - "ru" -> Русский язык
   - "en" -> Английский язык
   СТРОГО ЗАПРЕЩЕНО отвечать на русском, если ТЗ было на украинском!

2. СТИЛЬ: Живой, экспертный, уверенный, лаконичный. Выглядит так, словно занятой Senior специалист написал его с телефона за 30 секунд. Без воды и машинного стиля.

3. ЗАПРЕЩЕННЫЕ КЛИШЕ:
   ❌ "Вижу, что вы ищете..." / "Вижу, ищете специалиста..."
   ❌ "Понял задачу..." / "По задаче всё понятно..."
   ❌ "Вам требуется настройка..."
   ❌ "Частая история..."
   ❌ "Буду рад сотрудничеству" / "Готов обсудить" / "Обращайтесь"
   ❌ Мини-учебники и лекции по GTM/GA4/Ads.

4. ПРИВЕТСТВИЕ:
   - Если есть client_name -> Обратись по имени (UK: "Доброго дня, [client_name]!", RU: "Добрый день, [client_name]!", EN: "Hello [client_name]!").
   - Если нет client_name -> (UK: "Доброго дня!", RU: "Добрый день!", EN: "Hello!").

5. БЛОКИ:
   Генерируй ТОЛЬКО те блоки, которые включены в blocks_to_include.

6. СТАЦИОНАРНЫЙ БЛОК УТП (если utp включен в blocks_to_include):
   Размести маркированный список в самом низу отклика:

   Для UK (language = "uk"):
   • 12 років досвіду в Google Ads
   • Сертифікований Google Partner
   • Працюю особисто — без агентства та акаунт-менеджерів
   • Орієнтуюся на окупність та прибуток, а не на кількість кліків

   Для RU (language = "ru"):
   • 12 лет опыта в Google Ads
   • Сертифицированный Google Partner
   • Работаю лично — без агентства и аккаунт-менеджеров
   • Ориентируюсь на окупаемость и прибыль, а не на количество кликов

   Для EN (language = "en"):
   • 12 years of Google Ads experience
   • Certified Google Partner
   • Working personally — no agency or account managers
   • Focus on ROI and profit, not empty clicks

7. ВЫВОД: Выводи ТОЛЬКО готовый текст отклика. Без кавычек, префиксов и мета-пояснений.`;

const FREELANCE_CHAT_PROMPT = `Ты — Senior PPC Specialist агентства Aurelius Ads.
Отвечай на сообщение заказчика в чате биржи Freelancehunt.

ПРАВИЛА:
1. ЯЗЫК: Отвечай СТРОГО на том языке, на котором написано сообщение клиента (Украинский / Русский / Английский).
2. ДЛИНА: Коротко, 2-4 предложения в разговорно-экспертном стиле.
3. ОБРАЩЕНИЕ: По имени, если известно.
4. Выводи ТОЛЬКО текст ответа.`;

const freelanceSessionsMemory = new Map();

function extractUrlFromText(text) {
    if (!text) return null;
    const cleanText = text.replace(/https?:\/\/(?:www\.)?freelancehunt\.com\/[^\s]+/gi, '');
    const match = cleanText.match(/https?:\/\/[^\s\)\>\]]+/i) || cleanText.match(/\bwww\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s\)\>\]]*)?/i);
    if (!match) return null;
    let url = match[0].trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

async function fetchSiteQuickAnalysis(url) {
    if (!url) return null;
    try {
        const res = await axios.get(url, {
            timeout: 6000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 3
        });

        const html = typeof res.data === 'string' ? res.data : '';
        if (!html) return { url, error: 'Empty HTML' };

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        const desc = descMatch ? descMatch[1].trim() : '';

        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const h1 = h1Match ? h1Match[1].trim() : '';

        const hasFloatingButtons = /floating|fixed-bottom|fixed bottom|call-btn|btn-fixed|sticky-bottom/i.test(html);
        const hasMessengers = /telegram|viber|whatsapp|t\.me|wa\.me/i.test(html);
        const hasPhoneCall = /href=["']tel:/i.test(html);
        const hasForm = /<form/i.test(html);

        return {
            url,
            title,
            desc,
            h1,
            hasFloatingButtons,
            hasMessengers,
            hasPhoneCall,
            hasForm
        };
    } catch (e) {
        console.log(`Site quick fetch skipped for ${url}:`, e.message);
        return { url, error: e.message };
    }
}

function parseJsonFromLLM(text) {
    if (!text) return null;
    try {
        const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (err) {
                return null;
            }
        }
        return null;
    }
}

async function analyzeFreelanceProject(promptText, siteAnalysis = null) {
    let userPrompt = `[ТЗ ПРОЕКТА FREELANCEHUNT]:\n${promptText}\n`;
    if (siteAnalysis && !siteAnalysis.error) {
        userPrompt += `\n[ТЕЛЕМЕТРИЯ САЙТА ЗАКАЗЧИКА (${siteAnalysis.url})]:\n` +
            `— Title: ${siteAnalysis.title || '—'}\n` +
            `— Description: ${siteAnalysis.desc || '—'}\n` +
            `— H1: ${siteAnalysis.h1 || '—'}\n` +
            `— Закрепленная кнопка связи (floating CTA): ${siteAnalysis.hasFloatingButtons ? 'Есть' : 'НЕТ'}\n` +
            `— Мессенджеры на сайте: ${siteAnalysis.hasMessengers ? 'Есть' : 'НЕТ'}\n` +
            `— Форма заявки: ${siteAnalysis.hasForm ? 'Есть' : 'НЕТ'}\n`;
    } else {
        userPrompt += `\n[ИНФОРМАЦИЯ]: Ссылка на сайт отсутствует. site_observation строго null.\n`;
    }

    const aiRes = await callMarkLLM({
        systemPrompt: FREELANCE_ANALYSIS_PROMPT,
        userPrompt: userPrompt,
        senderName: '',
        temperature: 0.2,
        maxTokens: 800
    });

    const parsed = parseJsonFromLLM(aiRes.reply);
    if (parsed) {
        return parsed;
    }

    // Fallback if AI JSON parsing failed
    const isUk = /[іїєґ]/i.test(promptText);
    return {
        _thought: "Fallback parsing used",
        language: isUk ? "uk" : "ru",
        client_name: null,
        client_situation: promptText.slice(0, 100),
        ads_status: "unknown",
        site_observation: null,
        proposed_approach: isUk ? "Пропоную почати з аналізу ваших поточних кампаній та перевірки налаштувань." : "Предлагаю начать с анализа ваших текущих кампаний и проверки настроек.",
        hook: promptText.slice(0, 150),
        cta: isUk ? "Підкажіть, Google Ads у вас вже запущений чи плануєте з нуля?" : "Подскажите, Google Ads у вас уже запущен или планируете с нуля?",
        blocks_to_include: ["hook", "approach", "ads_status", "cta", "utp"]
    };
}

async function assembleFreelanceProposal(promptText, analysis, siteAnalysis = null, modifier = null) {
    let userPrompt = `[СТРУКТУРИРОВАННЫЙ JSON АНАЛИЗ ПРОЕКТА]:\n${JSON.stringify(analysis, null, 2)}\n\n[ИСХОДНОЕ ТЗ]:\n${promptText}\n`;

    if (modifier) {
        if (modifier === 'short') {
            userPrompt += `\n[МОДИФИКАТОР]: Сделай отклик максимально коротким и лаконичным (2-3 коротких абзаца).`;
        } else if (modifier === 'audit') {
            userPrompt += `\n[МОДИФИКАТОР]: Сделай упор на экспресс-аудит, конверсию и точки слива бюджета.`;
        } else if (modifier === 'casual') {
            userPrompt += `\n[МОДИФИКАТОР]: Сделай тон максимально разговорным, простым и дружелюбным (casual expert).`;
        } else if (modifier === 'regen') {
            userPrompt += `\n[МОДИФИКАТОР]: Сгенерируй другой вариант зацепки и подачи.`;
        }
    }

    const systemPromptWithLang = FREELANCE_GENERATION_PROMPT.replace('{language}', analysis.language || 'ru');

    const aiRes = await callMarkLLM({
        systemPrompt: systemPromptWithLang,
        userPrompt: userPrompt,
        senderName: '',
        temperature: 0.3,
        maxTokens: 1000
    });

    return aiRes.reply;
}

async function generateFreelancehuntResponse(promptText, mode = 'bid', siteAnalysis = null, modifier = null, session = null) {
    if (mode === 'chat') {
        const aiRes = await callMarkLLM({
            systemPrompt: FREELANCE_CHAT_PROMPT,
            userPrompt: `[СООБЩЕНИЕ КЛИЕНТА]:\n${promptText}`,
            senderName: '',
            temperature: 0.3,
            maxTokens: 500
        });
        return aiRes.reply;
    }

    // MODE: BID (2-Stage Pipeline)
    let analysis = session ? session.analysis : null;
    if (!analysis || modifier === 'regen') {
        analysis = await analyzeFreelanceProject(promptText, siteAnalysis);
    }

    const proposalText = await assembleFreelanceProposal(promptText, analysis, siteAnalysis, modifier);

    if (session) {
        session.analysis = analysis;
    }

    return proposalText;
}

function createFreelanceKeyboard(token, mode = 'bid') {
    if (mode === 'chat') {
        return {
            inline_keyboard: [
                [
                    { text: '✂️ Короче', callback_data: `fl:short:${token}` },
                    { text: '💬 Больше casual', callback_data: `fl:casual:${token}` }
                ],
                [
                    { text: '🔄 Другой вариант', callback_data: `fl:regen:${token}` }
                ]
            ]
        };
    }

    return {
        inline_keyboard: [
            [
                { text: '✂️ Короче', callback_data: `fl:short:${token}` },
                { text: '🔍 Упор на аудит', callback_data: `fl:audit:${token}` }
            ],
            [
                { text: '💬 Больше casual', callback_data: `fl:casual:${token}` },
                { text: '🔄 Другой вариант', callback_data: `fl:regen:${token}` }
            ]
        ]
    };
}

const Module_Freelancehunt = {
    key: 'freelancehunt',
    name: 'Freelancehunt (Alpha-Freelance)',
    description: 'Генератор ставок, анализ проектов, ответы заказчикам и аудит сайтов',

    exactTriggers: [
        '/fl',
        '/fl_chat',
        'фл',
        'фрилансхант'
    ],

    broadTriggers: [
        'freelancehunt.com',
        'ставка на фрилансе',
        'отклик на проект',
        'напиши отклик',
        'ответ заказчику на бирже',
        'клиент на бирже пишет'
    ],

    extractUrlFromText,
    fetchSiteQuickAnalysis,
    analyzeFreelanceProject,
    assembleFreelanceProposal,
    generateFreelancehuntResponse,
    createFreelanceKeyboard,
    freelanceSessionsMemory
};

module.exports = { Module_Freelancehunt };
