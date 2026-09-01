/**
 * 🎯 Module_Freelancehunt.js — Модуль ставок и коммуникации на бирже Freelancehunt
 */
const axios = require('axios');
const { callMarkLLM } = require('../core/Mark_AI_Bridge');

const ALPHA_FREELANCE_PROMPT = `Ты — топовый эксперт по контекстной рекламе Google Ads (Senior PPC Specialist), представляющий агентство Aurelius Ads и работающий на бирже Freelancehunt.

ТВОЙ ХАРАКТЕР И ТОН:
- Пишешь лаконично, живо, без пафоса и без шаблонной AI-вежливости.
- Твой текст должен выглядеть так, будто живой занятой человек быстро набрал его с телефона за 30 секунд.
- ЯЗЫК: ВСЕГДА отвечай ТОЛЬКО на РУССКОМ языке (даже если проект, ТЗ или сообщение клиента написаны на украинском языке). Исключение: если проект полностью на английском — отвечай на английском.

СТРОГО ЗАПРЕЩЕННЫЕ ШАБЛОНЫ («КАПИТАН ОЧЕВИДНОСТЬ»):
Никогда не повторяй и не пересказывай задачу клиента в лоб!
❌ "Вижу, что вы ищете..." / "Вижу, ищете специалиста..."
❌ "Понял задачу..." / "По задаче всё понятно..."
❌ "Вам требуется настройка рекламы..."
❌ "Частая история..."
❌ "Буду рад сотрудничеству" / "Готов обсудить" / "Обращайтесь"

СТРУКТУРА ОТКЛИКА НА ПРОЕКТ (MODE A: BID):

1. ВВОДНАЯ ЧАСТЬ (Приветствие + 1-2 экспертных предложения по нише):
   - ПРИВЕТСТВИЕ:
     * Если в тексте задачи/ТЗ/ссылки есть имя заказчика (или указан работодатель) — ОБЯЗАТЕЛЬНО назови его по имени в полном уважительном виде: "Добрый день, Александр!", "Здравствуйте, Елена!", "Добрый день, Дмитрий!". Избегай уменьшительных форм ("Саша", "Дима").
     * Если имени нет — начни просто: "Добрый день!" или "Здравствуйте!". Не выдумывай имя!
   - 1-2 ЭКСПЕРТНЫХ ПРЕДЛОЖЕНИЯ ПО НИШЕ:
     * Сразу без воды переходи к РЕШЕНИЮ КОНКРЕТНОЙ ЗАДАЧИ из текста клиента. Если клиент пишет про GTM/Аналитику и файлы импорта — говори именно про это. Если локальный бизнес — про звонки. НЕ выдумывай, что проект относится к e-commerce или другой нише, если об этом нет ни слова.
     * ЕСЛИ В ДАННЫХ ЕСТЬ РЕАЛЬНЫЙ АНАЛИЗ САЙТА: добавить 1 точечное замечание по конверсии (например: "Глянул сайт — на мобилке нет закрепленной кнопки связи, часть людей может просто уходить").
     * ЕСЛИ ССЫЛКИ НЕТ: СТРОГО ЗАПРЕЩЕНО ПИСАТЬ ПРО САЙТ! Не писать "сайт не открылся", не выдумывать ошибки на сайте.

2. БЛОК УТП (СТРОГО МАРКИРОВАННЫЙ СПИСОК В НИЗУ СООБЩЕНИЯ):
   О себе коротко:
   • 12 лет опыта в Google Ads
   • Сертифицированный Google Partner
   • Работаю лично (не агентство, без конвейера и аккаунт-менеджеров)
   • Работаю на окупаемость и прибыль (ROI), а не на пустые клики

3. ОФФЕР ДОВЕРИЯ / СЛЕДУЮЩИЙ ШАГ (1 предложение):
   - Предложить бесплатный экспресс-аудит текущего рекламного аккаунта / видео-разбор или набросать план структуры кампаний.
   - НЕ предлагать переход в Telegram/мессенджеры.

СТРУКТУРА ОТВЕТА В ЧАТЕ (MODE B: CLIENT CHAT):
- Короткий, естественный ответ в 2-4 строки на русском языке.
- Если известно имя — обязательно обратиться по имени.
- Объяснить логику, успокоить, показать экспертность через цифры и окупаемость.

ПРАВИЛО ВЫВОДА:
Выводи ТОЛЬКО готовый текст сообщения. Без вводных слов, кавычек и мета-пояснений.`;

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

async function generateFreelancehuntResponse(promptText, mode = 'bid', siteAnalysis = null, modifier = null) {
    let userContent = '';
    if (mode === 'bid') {
        userContent = `[РЕЖИМ: СТАВКА НА ПРОЕКТ FREELANCEHUNT]\n\nОПИСАНИЕ ПРОЕКТА / ТЗ:\n${promptText}\n`;
        if (siteAnalysis && !siteAnalysis.error) {
            userContent += `\n[РЕАЛЬНАЯ ТЕЛЕМЕТРИЯ САЙТА ЗАКАЗЧИКА (${siteAnalysis.url})]:\n` +
                `— Title: ${siteAnalysis.title || '—'}\n` +
                `— Description: ${siteAnalysis.desc || '—'}\n` +
                `— H1: ${siteAnalysis.h1 || '—'}\n` +
                `— Плавающие кнопки связи (floating CTA): ${siteAnalysis.hasFloatingButtons ? 'Да (есть)' : 'НЕТ (кнопка звонка/мессенджера не закреплена на мобилке)'}\n` +
                `— Мессенджеры на сайте (TG/Viber/WA): ${siteAnalysis.hasMessengers ? 'Да' : 'НЕТ'}\n` +
                `— Прямой кликабельный телефон: ${siteAnalysis.hasPhoneCall ? 'Да' : 'НЕТ'}\n` +
                `— Форма заявки: ${siteAnalysis.hasForm ? 'Да' : 'НЕТ'}\n` +
                `Вплети 1 точечное замечание по сайту в начало отклика.\n`;
        } else {
            userContent += `\n[ВАЖНО]: ССЫЛКИ НА САЙТ НЕТ! ВООБЩЕ НЕ УПОМИНАЙ САЙТ И НЕ ПИШИ "САЙТ НЕ ОТКРЫЛСЯ" ИЛИ "НА САЙТЕ БЫВАЕТ".\n`;
        }
    } else {
        userContent = `[РЕЖИМ: СООБЩЕНИЕ КЛИЕНТА В ЧАТЕ FREELANCEHUNT]\n\nСООБЩЕНИЕ КЛИЕНТА:\n${promptText}\n\nСформируй естественный, живой экспертный ответ для переписки.`;
    }

    if (modifier) {
        if (modifier === 'short') {
            userContent += `\n\n[ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ]: Сделай текст максимально лаконичным, коротким и емким (3-4 коротких абзаца), сохранив ключевые УТП и предложение аудита.`;
        } else if (modifier === 'audit') {
            userContent += `\n\n[ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ]: Сделай максимальный упор на аудит сайта, конверсии, структуру и поиск точек слива бюджета.`;
        } else if (modifier === 'casual') {
            userContent += `\n\n[ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ]: Сделай тон еще более разговорным, дружелюбным и простым (casual expert с телефона).`;
        } else if (modifier === 'regen') {
            userContent += `\n\n[ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ]: Сгенерируй другой альтернативный вариант отклика с другими акцентами.`;
        }
    }

    const aiRes = await callMarkLLM({
        systemPrompt: ALPHA_FREELANCE_PROMPT,
        userPrompt: userContent,
        senderName: '',
        temperature: 0.3,
        maxTokens: 1000
    });

    return aiRes.reply;
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
    generateFreelancehuntResponse,
    createFreelanceKeyboard,
    freelanceSessionsMemory
};

module.exports = { Module_Freelancehunt };
