/**
 * 📊 Module_GoogleAds.js — Модуль аналитики рекламы Google Ads (Firestore v4.0)
 */
const axios = require('axios');
const { MARK_CONFIG } = require('../core/Mark_Config');

async function fetchAdvStatsFromGAS(adsId, clientName) {
    try {
        const res = await axios.post(MARK_CONFIG.GAS_URL, {
            action: 'getAdvStats',
            adsId: adsId || '',
            clientName: clientName || ''
        }, { timeout: 8000 });
        return res.data?.advStats || '';
    } catch (e) {
        return '';
    }
}

const Module_GoogleAds = {
    key: 'google_ads',
    name: 'Google Ads & Лиды',
    description: 'Анализ кликов, расхода, конверсий, CPA, ROAS, поисковых фраз и CRM-отчетов',

    // L0: Точные соответствия
    exactTriggers: [
        '/stats',
        'статистика',
        'стата',
        'отчет по рекламе',
        'сводка рекламы',
        'сводка адс',
        'ads overview',
        'что по рекламе',
        'как дела',
        'как у нас дела',
        'что там по проекту',
        'что по проекту',
        'что там',
        'какие результаты',
        'дай сводку',
        'сделай срез',
        'сделай сводку',
        'как успехи за неделю',
        'как успехи за месяц'
    ],

    // L1: Широкие соответствия
    broadTriggers: [
        'реклам',
        'клики',
        'конверси',
        'лид',
        'расход',
        'бюджет',
        'cpa',
        'roas',
        'поисковые запросы',
        'кампани',
        'гугл адс',
        'google ads',
        'почему нет заявок',
        'как дела с рекламой',
        'как дела по проекту',
        'как дела',
        'что там',
        'какие результаты',
        'дай сводку',
        'что по рекламе',
        'что там по проекту',
        'сводка по проекту',
        'срез по проекту',
        'сводк',
        'сколько заявок',
        'какая цена заявки'
    ],

    /**
     * Сборка контекста из Firestore (Поддержка TODAY, YESTERDAY, LAST_7_DAYS, LAST_30_DAYS)
     */
    async buildContext(client, text) {
        const curr = client?.currency || 'EUR';
        const periods = client?.periods || {};

        let periodsSummary = '';
        if (periods && Object.keys(periods).length > 0) {
            periodsSummary = '\nСВОДКА ПО ПЕРИОДАМ ИЗ FIRESTORE:\n';
            if (periods.TODAY) {
                const p = periods.TODAY;
                periodsSummary += `• СЕГОДНЯ (TODAY): Клики: ${p.clicks}, Расход: ${p.cost} ${curr}, Конверсии: ${p.conversions}, CPA: ${p.costPerConv || p.cpa} ${curr}, ROAS: ${p.roas}% (CTR: ${p.ctr || '0'}%, CR: ${p.convRate || '0'}%, SearchIS: ${p.searchImpressionShare || '--'}, Потеряно из-за бюджета: ${p.lostISBudget || '--'})\n`;
            }
            if (periods.YESTERDAY) {
                const p = periods.YESTERDAY;
                periodsSummary += `• ВЧЕРА (YESTERDAY): Клики: ${p.clicks}, Расход: ${p.cost} ${curr}, Конверсии: ${p.conversions}, CPA: ${p.costPerConv || p.cpa} ${curr}, ROAS: ${p.roas}% (CTR: ${p.ctr || '0'}%, CR: ${p.convRate || '0'}%, SearchIS: ${p.searchImpressionShare || '--'}, Потеряно из-за бюджета: ${p.lostISBudget || '--'})\n`;
            }
            if (periods.LAST_7_DAYS) {
                const p = periods.LAST_7_DAYS;
                periodsSummary += `• ПОСЛЕДНИЕ 7 ДНЕЙ (LAST_7_DAYS): Клики: ${p.clicks}, Расход: ${p.cost} ${curr}, Конверсии: ${p.conversions}, CPA: ${p.costPerConv || p.cpa} ${curr}, ROAS: ${p.roas}% (CTR: ${p.ctr || '0'}%, CR: ${p.convRate || '0'}%, SearchIS: ${p.searchImpressionShare || '--'}, Потеряно из-за бюджета: ${p.lostISBudget || '--'})\n`;
            }
            if (periods.LAST_30_DAYS) {
                const p = periods.LAST_30_DAYS;
                periodsSummary += `• ПОСЛЕДНИЕ 30 ДНЕЙ (LAST_30_DAYS): Клики: ${p.clicks}, Расход: ${p.cost} ${curr}, Конверсии: ${p.conversions}, CPA: ${p.costPerConv || p.cpa} ${curr}, ROAS: ${p.roas}% (CTR: ${p.ctr || '0'}%, CR: ${p.convRate || '0'}%, SearchIS: ${p.searchImpressionShare || '--'}, Потеряно из-за бюджета: ${p.lostISBudget || '--'}, Потеряно из-за рейтинга: ${p.lostISRank || '--'})\n`;
            }
        } else {
            // Фолбэк на плоские поля за 30 дней
            periodsSummary = `\nСВОДКА ЗА 30 ДНЕЙ:\nКлики: ${client?.clicks || '0'}, Расход: ${client?.cost || '0'} ${curr}, Конверсии: ${client?.convs || '0'}, CPA: ${client?.cpa || '0'} ${curr}, ROAS: ${client?.cachedRoas || '0'}%\n`;
        }

        
        let monthlyStatsStr = '';
        if (client?.monthly_stats && client.monthly_stats.length > 0) {
            monthlyStatsStr = '\nИСТОРИЯ АККАУНТА (Тренды по месяцам):\n' + client.monthly_stats.map(s => 
                `• ${s.month}: Расход: ${s.cost} ${curr} | Клики: ${s.clicks} | Конв: ${s.conversions} | CPA: ${s.cpa} ${curr} | ROAS: ${s.roas || '0'}% | CR: ${s.convRate || '0'}%`
            ).join('\n') + '\n';
        }

        let campaignsList = '';
        if (client?.campaigns && client.campaigns.length > 0) {
            campaignsList = '\nКАМПАНИИ (Топ 10):\n' + client.campaigns.slice(0, 10).map(c => 
                `• ${c.name} [${c.period || '30d'}]: Клики: ${c.clicks}, Расход: ${c.cost} ${curr}, Конверсии: ${c.conversions}, CPA: ${c.cpa} ${curr}, ROAS: ${c.roas}%, SearchIS: ${c.searchImpressionShare || '--'}`
            ).join('\n') + '\n';
        }

        let queriesList = '';
        if (client?.queries && client.queries.length > 0) {
            queriesList = '\nПОИСКОВЫЕ ЗАПРОСЫ (Топ 20):\n' + client.queries.slice(0, 20).map(q => 
                `• [${q.period || '30d'}] "${q.query}": Клики: ${q.clicks}, Конверсии: ${q.conversions}, Расход: ${q.cost} ${curr}`
            ).join('\n') + '\n';
        }

        let goalsBreakdown = '';
        if (client?.conversions && client.conversions.length > 0) {
            goalsBreakdown = '\nДЕТАЛИЗАЦИЯ ЦЕЛЕЙ КОНВЕРСИЙ:\n' + client.conversions.map(g => `- ${g.name} [${g.period || '30d'}]: ${g.count}`).join('\n') + '\n';
        } else if (client?.cachedConvDetails) {
            try {
                const goals = typeof client.cachedConvDetails === 'string'
                    ? JSON.parse(client.cachedConvDetails)
                    : client.cachedConvDetails;
                if (Array.isArray(goals) && goals.length > 0) {
                    goalsBreakdown = '\nДЕТАЛИЗАЦИЯ ЦЕЛЕЙ КОНВЕРСИЙ:\n' +
                        goals.map(g => `- ${g.name}: ${g.count}`).join('\n') + '\n';
                }
            } catch(e) {}
        }

        // Если данных в Firestore еще нет, пробуем резерв из GAS
        const advStats = (!periodsSummary && client?.adsId) ? await fetchAdvStatsFromGAS(client.adsId, client.clientName) : '';

        const contextText = `
СИСТЕМНЫЕ ДАННЫЕ О КЛИЕНТЕ GOOGLE ADS:
Проект: ${client?.clientName || 'Неизвестен'}
Сайт: ${client?.siteUrl || 'Нет'}
Валюта аккаунта: ${curr}
${periodsSummary}
${monthlyStatsStr}
${campaignsList}
${goalsBreakdown}
${queriesList}
${advStats ? 'Дополнительно из GAS:\n' + advStats : ''}

РОЛЬ И ПОВЕДЕНИЕ (ВАЖНО):
Ты эксперт по Google Ads и бизнес-аналитик. Отвечай вежливо, профессионально и в разговорном формате (как живой человек-эксперт).
Если пользователь задает вопросы по маркетингу (как посчитать ROAS при марже Х%), или любые общие вопросы (даже про Николу Теслу или калории) — общайся свободно, помогай с расчетами и давай развернутые ответы.

ПРАВИЛА КОММУНИКАЦИИ И ПОДАЧИ РЕЗУЛЬТАТОВ (ДИПЛОМАТИЯ И АККАУНТИНГ):
1. Всегда отвечай на все вопросы прямо и честно, но используй позитивный профессиональный фрейминг: не сгущай краски и не акцентируй явные минусы.
2. Подсвечивай плюсы и сильные стороны динамики чуть выше среднего: (например, если объем конверсий на коротком отрезке кажется клиенту небольшим, покажи, что вырос ROAS, снизилась цена конверсии CPA, вырос средний чек или доля показов Search Impression Share).
3. Любые временные колебания или вопросы клиента ("почему мало?", "почему просело?") объясняй логично, спокойно и экспертно: обучение алгоритмов Smart Bidding после правок, специфика дня недели/сезона, отсечение нецелевого мусорного трафика для экономии бюджета.
4. СТРОГО БЕЗ ОТКРЫТОЙ ЛЕСТИ! Клиенты не любят фальшь и подобострастие. Только твёрдая логика перформанс-маркетинга, факты, цифры и конструктивный план действий.

ФОРМАТ ВЫВОДА СТАТИСТИКИ И АНАЛИТИКИ (ГИБРИД: НАРРАТИВ + ЭМОДЗИ-АКЦЕНТЫ):
1. Никогда не выводи сырой JSON или телетайпные сухие формуляры!
2. Заголовок и ID проекта: ВСЕГДА разделяй заголовок и строку с ID проекта одиночным переносом \n, а после проекта — строго \n\n!
   Пример:
   📊 <b>ШТАБ МАРКА | СВОДКА ПО ПРОЕКТУ</b>\nПроект: <code>#${client?.id || '55'}-${client?.clientName || 'Project'}</code> • <i>Аналитический срез</i>\n\n
3. Воздух: Ровно ДВОЙНОЙ перенос строки (\n\n) между каждым смысловым блоком. Между заголовком блока и списком — ровно один \n.

4. ПРАВИЛО ОФОРМЛЕНИЯ ПУБЛИЧНОЙ СВОДКИ (ЖИВОЙ НАРРАТИВ + ВЫСОКИЙ КОНТРАСТ):
   - Пиши живым связным текстом, а НЕ голыми формулярами (Используй: «За последние 7 дней мы разогнали...», «Вчерашний день отработали чётко по плану — закрыли...»). Клиент должен читать понятный рассказ эксперта с заботой и уверенностью.
   - Эмодзи-якоря в начале строк:
     * 📈 для блока побед («📈 <b>Как двигаемся по результатам:</b>») и «🔹» в начале каждого пункта побед.
     * ⚠️ для блока нюансов («⚠️ <b>На что обращаем внимание:</b>») и «🔸» в начале каждого пункта нюансов.
     * ⚙️ для плана действий («<blockquote>⚙️ <b>План действий:</b>...</blockquote>»).
   - Выделение опорных точек:
     * Периоды выделяй жирным: <b>30 дней</b>, <b>7 дней</b>.
     * Ключевые объёмы и динамику оформляй в <b><code>...</code></b> (например: <b><code>284 конверсии</code></b>, <b><code>+16.2%</code></b>, <b><code>11 заявок</code></b>).
     * Вторичные метрики, суммы и проценты оформляй жирным: <b>390%</b>, <b>$4.60</b>, <b>$4.15</b>, <b>100%</b>, <b>76%</b>.

5. ЭТАЛОННАЯ СТРУКТУРА СВОДКИ (СТРОГО ПО ШАБЛОНУ):
📊 <b>ШТАБ МАРКА | СВОДКА ПО ПРОЕКТУ</b>
Проект: <code>#${client?.id || '55'}-${client?.clientName || 'Project'}</code> • <i>Аналитический срез</i>

📈 <b>Как двигаемся по результатам:</b>
🔹 За последние <b>30 дней</b> суммарно привлекли <b><code>284 конверсии</code></b>, удержав ROAS на уверенной отметке <b>390%</b>.
🔹 На дистанции <b>7 дней</b> разогнали темп заявок на <b><code>+16.2%</code></b> при средней стоимости лида <b>$4.60</b>.
🔹 Вчерашний день отработали чётко по плану — закрыли <b><code>11 заявок</code></b> по <b>$4.15</b>.
🔹 Долю показов в целевом поиске стабильно держим выше <b>76%</b>.

⚠️ <b>На что обращаем внимание:</b>
🔸 В кампании <b>PMax</b> за последние трое суток CPA слегка подрос (<b><code>+11.5%</code></b>) из-за активности в мобильных сетях.
🔸 В понедельник утром аукцион локально перегревался, поэтому часть показов увели на более конверсионный вечер.

<blockquote>⚙️ <b>План действий:</b>
Экономика в полном порядке. Точечные корректировки ставок и фильтрация площадок уже зафиксированы в <a href="https://t.me/AureliusMarketingAI_bot?start=tasks_${client?.id || '55'}">задачи</a> спринта.</blockquote>

6. ПРАВИЛА ИНЛАЙН-РАЗМЕТКИ ДЛЯ TELEGRAM MOBILE (iOS & Android):
   - Тег <code>...</code> используется ТОЛЬКО для коротких значений (числа, %, динамика, ID).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вставлять символы перевода строки (\n) внутрь тега <code>.
   - Тег должен плотно облегать значение БЕЗ лишних пробелов: <b><code>+16.2%</code></b>, а не <code> +16.2% </code>.
   - Чистота кода: Строго закрывай все HTML-теги. Никакого Markdown (*, _, #) и неподдерживаемых тегов.
`;

        return {
            hasData: Boolean(client?.adsId || client?.clientName),
            contextText,
            advStats
        };
    }
};

module.exports = { Module_GoogleAds, fetchAdvStatsFromGAS };
