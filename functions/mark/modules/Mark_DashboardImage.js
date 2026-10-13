/**
 * 🎨 Mark_DashboardImage.js — Серверный генератор инфографики Google Ads Live Analytics
 * Создает раздельные HD PNG карточки строго единого формата 1080x1350px (4:5 Mobile-First для Telegram):
 * 1. Карточка «Ключевые показатели»: гигантские цифры 96px/68px/54px, брендинг Aurelius Marketing AI 34px bold
 * 2. Карточка «Кампании»: 1080x1350px, динамическое идеальное заполнение без пустот (515px для 2 кампаний, 340px для 3)
 * 3. Текстовая подпись с поисковыми запросами, принесшими конверсии
 */
const sharp = require('sharp');

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Векторная мишень конверсий (чистая геометрическая графика без смайликов и артефактов)
 */
function renderConversionIcon(x, y, size = 60, color = "#10b981") {
    const scale = size / 24;
    return `
    <g transform="translate(${x}, ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2" stroke-opacity="0.3"/>
      <circle cx="12" cy="12" r="6" stroke="${color}" stroke-width="2.2"/>
      <circle cx="12" cy="12" r="2.2" fill="${color}" stroke="none"/>
    </g>`;
}

/**
 * 1. Карточка ключевых показателей (KPI Overview)
 * 1200x1200px Wide Square формат для Telegram:
 * Идеально совпадает по ширине с текстовыми сообщениями Telegram (нет сужения portrait).
 */
function generateKpiSvg({ clientName, periodName, currency, kpi }) {
    const width = 1200;
    const height = 1200;
    const padding = 50;
    const cardW = width - padding * 2; // 1100px
    const halfW = (cardW - 24) / 2; // 538px

    const convVal = kpi.conversions || "0";
    let cpaVal = kpi.cpa;
    if ((!cpaVal || cpaVal === "—") && parseFloat(kpi.cost) > 0 && parseFloat(convVal) > 0) {
        cpaVal = (parseFloat(kpi.cost) / parseFloat(convVal)).toFixed(2);
    }
    const cpaText = cpaVal && cpaVal !== "—" ? `${cpaVal}` : "—";
    const costVal = `${kpi.cost || "0"}`;
    const clicksVal = kpi.clicks || "0";
    const ctrVal = kpi.ctr && kpi.ctr !== "--" ? (String(kpi.ctr).includes('%') ? kpi.ctr : `${kpi.ctr}%`) : "--";

    const showRoas = parseFloat(kpi.roas || 0) > 0;
    const stat4Label = showRoas ? "ROAS (ОКУПАЕМОСТЬ)" : "ПОКАЗЫ (ОХВАТ)";
    const rawImps = String(kpi.impressions || "0").replace(/\s/g, '');
    const numImps = parseFloat(rawImps.replace(/,/g, ''));
    const stat4Val = showRoas ? `${kpi.roas}%` : (!isNaN(numImps) ? numImps.toLocaleString('ru-RU') : (kpi.impressions || "0"));
    const stat4Sub = showRoas ? "Коэффициент возврата инвестиций" : "Общее количество просмотров объявлений";
    const stat4Color = showRoas ? "#10b981" : "#facc15";

    const safeClientName = clientName.length > 24 ? clientName.slice(0, 23) + '…' : clientName;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradKpi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0b10"/>
      <stop offset="40%" stop-color="#050608"/>
      <stop offset="100%" stop-color="#020204"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="heroCardGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(16, 185, 129, 0.12)"/>
      <stop offset="100%" stop-color="rgba(16, 185, 129, 0.02)"/>
    </linearGradient>
    <linearGradient id="costCardGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(0, 229, 255, 0.10)"/>
      <stop offset="100%" stop-color="rgba(0, 229, 255, 0.02)"/>
    </linearGradient>
    <linearGradient id="glowConvs" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGradKpi)"/>
  <circle cx="600" cy="280" r="400" fill="rgba(16, 185, 129, 0.04)"/>

  <!-- Top Header / Large Branding -->
  <g transform="translate(${padding}, 36)">
    <rect width="70" height="70" rx="20" fill="rgba(0, 229, 255, 0.12)" stroke="rgba(0, 229, 255, 0.40)" stroke-width="2.2"/>
    <text x="35" y="48" fill="#00e5ff" font-size="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" text-anchor="middle">A</text>
    
    <text x="92" y="32" fill="url(#brandGrad)" font-size="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="1">AURELIUS MARKETING AI</text>
    
    <text x="92" y="62" fill="#ffffff" font-size="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800">
      <tspan fill="#64748b" font-weight="600">Клиент:</tspan> ${escapeXml(safeClientName)}
      <tspan fill="#334155" dx="14">|</tspan>
      <tspan fill="#64748b" dx="14" font-weight="600">Период:</tspan> <tspan fill="#00e5ff">${escapeXml(periodName)}</tspan>
    </text>

    <!-- Verified Badge -->
    <rect x="${cardW - 220}" y="12" width="220" height="46" rx="14" fill="rgba(0, 229, 255, 0.10)" stroke="rgba(0, 229, 255, 0.35)" stroke-width="1.8"/>
    <circle cx="${cardW - 198}" cy="35" r="6" fill="#00e5ff"/>
    <text x="${cardW - 180}" y="41" fill="#00e5ff" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="1.2">OFFICIAL AI REPORT</text>
  </g>

  <!-- Divider -->
  <line x1="${padding}" y1="130" x2="${width - padding}" y2="130" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>

  <!-- 1. HERO CARD: КОНВЕРСИИ И CPA (Full Width 1100px, 250px tall) -->
  <g transform="translate(${padding}, 150)">
    <rect width="${cardW}" height="250" rx="26" fill="url(#heroCardGrad)" stroke="rgba(16, 185, 129, 0.35)" stroke-width="2"/>
    
    <text x="42" y="48" fill="#10b981" font-size="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="2">ЦЕЛЕВЫЕ ДЕЙСТВИЯ (КОНВЕРСИИ)</text>
    
    <!-- Bullseye Icon + Conversions Value -->
    ${renderConversionIcon(42, 74, 76, "#10b981")}
    <text x="134" y="142" fill="url(#glowConvs)" font-size="90" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-1">${escapeXml(convVal)}</text>
    
    <!-- CPA right aligned with balanced currency tag -->
    <g transform="translate(${cardW - 44}, 62)">
      <text x="0" y="24" fill="#94a3b8" font-size="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" letter-spacing="1" text-anchor="end">СРЕДНЯЯ СТОИМОСТЬ ЦЕЛИ (CPA)</text>
      <text x="0" y="80" fill="#f472b6" font-size="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" text-anchor="end">${escapeXml(cpaText)} <tspan font-size="32" font-weight="700" fill="#f472b6">${escapeXml(currency)}</tspan></text>
    </g>

    <text x="42" y="215" fill="#64748b" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600">Подтвержденные заявки, звонки и прямые обращения с рекламы</text>
  </g>

  <!-- 2. ROW 1: РАСХОД & КЛИКИ (Two large cards 538px wide, 270px tall) -->
  <g transform="translate(${padding}, 425)">
    <!-- Расход Card -->
    <g transform="translate(0, 0)">
      <rect width="${halfW}" height="270" rx="24" fill="url(#costCardGrad)" stroke="rgba(0, 229, 255, 0.25)" stroke-width="1.8"/>
      <text x="36" y="46" fill="#00e5ff" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="2">РАСХОД БЮДЖЕТА</text>
      <text x="36" y="132" fill="#00e5ff" font-size="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.8">${escapeXml(costVal)} <tspan font-size="36" font-weight="700" fill="#38bdf8">${escapeXml(currency)}</tspan></text>
      <text x="36" y="210" fill="#64748b" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600">Инвестиции в рекламные клики</text>
    </g>

    <!-- Клики Card -->
    <g transform="translate(${halfW + 24}, 0)">
      <rect width="${halfW}" height="270" rx="24" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.09)" stroke-width="1.8"/>
      <text x="36" y="46" fill="#94a3b8" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="2">КЛИКИ (ТРАФИК)</text>
      <text x="36" y="132" fill="#ffffff" font-size="62" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.8">${escapeXml(clicksVal)}</text>
      <text x="36" y="210" fill="#64748b" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600">Переходы потенциальных клиентов</text>
    </g>
  </g>

  <!-- 3. ROW 2: CTR & ROAS / ОХВАТ (Two large cards 538px wide, 270px tall) -->
  <g transform="translate(${padding}, 720)">
    <!-- CTR Card -->
    <g transform="translate(0, 0)">
      <rect width="${halfW}" height="270" rx="24" fill="rgba(59, 130, 246, 0.04)" stroke="rgba(59, 130, 246, 0.20)" stroke-width="1.8"/>
      <text x="36" y="46" fill="#60a5fa" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="2">CTR (КЛИКАБЕЛЬНОСТЬ)</text>
      <text x="36" y="132" fill="#60a5fa" font-size="62" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.8">${escapeXml(ctrVal)}</text>
      <text x="36" y="210" fill="#64748b" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600">Отношение кликов к показам</text>
    </g>

    <!-- ROAS / Impressions Card -->
    <g transform="translate(${halfW + 24}, 0)">
      <rect width="${halfW}" height="270" rx="24" fill="rgba(250, 204, 21, 0.04)" stroke="rgba(250, 204, 21, 0.20)" stroke-width="1.8"/>
      <text x="36" y="46" fill="${stat4Color}" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="2">${stat4Label}</text>
      <text x="36" y="132" fill="${stat4Color}" font-size="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.8">${escapeXml(stat4Val)}</text>
      <text x="36" y="210" fill="#64748b" font-size="15" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600">${stat4Sub}</text>
    </g>
  </g>

  <!-- Footer Banner -->
  <g transform="translate(${padding}, ${height - 55})">
    <line x1="0" y1="-20" x2="${cardW}" y2="-20" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
    <text x="0" y="8" fill="#475569" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1.5">AURELIUS MARKETING AI • CORE PERFORMANCE INTELLIGENCE</text>
    <text x="${cardW}" y="8" fill="#334155" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" text-anchor="end">КАРТОЧКА 1 ИЗ 2</text>
  </g>
</svg>`;

    return svg;
}

/**
 * 2. Карточка кампаний (Campaigns Breakdown)
 * Ширина 1200px (совпадает с шириной сообщений Telegram).
 * Динамический рост в высоту:
 * 1-2 кампании: 1200x1200px (1:1 квадрат).
 * 3+ кампаний: карточка пропорционально удлиняется вниз без сжатия шрифтов!
 */
function generateCampaignsSvg({ clientName, periodName, currency, campaigns }) {
    const width = 1200;
    const padding = 50;
    const cardW = width - padding * 2; // 1100px
    const safeClientName = clientName.length > 24 ? clientName.slice(0, 23) + '…' : clientName;

    // Сортируем кампании по конверсиям или расходу, берем все активные кампании (до 10)
    const allCamps = Array.isArray(campaigns) ? [...campaigns] : [];
    allCamps.sort((a, b) => parseFloat(b.conversions || 0) - parseFloat(a.conversions || 0));
    const campList = allCamps.slice(0, 10);
    const count = Math.max(1, campList.length);

    // ДИНАМИЧЕСКИЙ РОСТ КАРТОЧКИ В ДЛИНУ (ВЫСОТУ):
    let cardH = 340;
    let gap = 24;
    let height = 1200;

    if (count === 1) {
        cardH = 960;
        gap = 0;
        height = 1200;
    } else if (count === 2) {
        cardH = 465;
        gap = 26;
        height = 1200;
    } else {
        cardH = 340;
        gap = 24;
        height = 150 + (count * cardH) + ((count - 1) * gap) + 80;
    }

    const startY = 150;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradCmp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0b10"/>
      <stop offset="40%" stop-color="#050608"/>
      <stop offset="100%" stop-color="#020204"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="cardGradCmp" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255, 255, 255, 0.05)"/>
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.015)"/>
    </linearGradient>
    <linearGradient id="convGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <linearGradient id="costGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="nameTagGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0, 229, 255, 0.22)"/>
      <stop offset="100%" stop-color="rgba(192, 132, 252, 0.18)"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGradCmp)"/>
  <circle cx="600" cy="280" r="400" fill="rgba(0, 229, 255, 0.04)"/>

  <!-- Top Header / Large Branding (Exact twin of Card 1 with letter A) -->
  <g transform="translate(${padding}, 36)">
    <rect width="70" height="70" rx="20" fill="rgba(0, 229, 255, 0.12)" stroke="rgba(0, 229, 255, 0.40)" stroke-width="2.2"/>
    <text x="35" y="48" fill="#00e5ff" font-size="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" text-anchor="middle">A</text>
    
    <text x="92" y="32" fill="url(#brandGrad)" font-size="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="1">AURELIUS MARKETING AI</text>
    
    <text x="92" y="62" fill="#ffffff" font-size="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800">
      <tspan fill="#64748b" font-weight="600">Клиент:</tspan> ${escapeXml(safeClientName)}
      <tspan fill="#334155" dx="14">|</tspan>
      <tspan fill="#64748b" dx="14" font-weight="600">Период:</tspan> <tspan fill="#00e5ff">${escapeXml(periodName)}</tspan>
    </text>

    <!-- Count Badge -->
    <rect x="${cardW - 220}" y="12" width="220" height="46" rx="14" fill="rgba(0, 229, 255, 0.10)" stroke="rgba(0, 229, 255, 0.35)" stroke-width="1.8"/>
    <circle cx="${cardW - 198}" cy="35" r="6" fill="#00e5ff"/>
    <text x="${cardW - 180}" y="41" fill="#00e5ff" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="1.2">ТОП КАМПАНИИ (${count})</text>
  </g>

  <!-- Divider -->
  <line x1="${padding}" y1="130" x2="${width - padding}" y2="130" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>

  <!-- Campaigns List -->
  <g transform="translate(${padding}, ${startY})">
`;

    let campY = 0;
    const colW = 508;
    const colGap = 24;

    campList.forEach((c, idx) => {
        const rawName = c.name || `Кампания #${idx + 1}`;
        const safeCampName = rawName.length > 38 ? rawName.slice(0, 37) + '…' : rawName;
        const convsVal = c.conversions || "0";
        const cpaVal = c.cpa && c.cpa !== "—" ? `${c.cpa}` : "—";
        const clicksVal = c.clicks || "0";
        const costVal = `${c.cost || "0"}`;
        const ctrVal = c.ctr || "--";
        const isVal = c.searchImpressionShare || "--";

        const isSingle = count === 1;
        const isTwo = count === 2;

        const r1Y = isSingle ? 110 : (isTwo ? 85 : 68);
        const r1H = isSingle ? 360 : (isTwo ? 165 : 124);
        const r2Y = isSingle ? 500 : (isTwo ? 275 : 206);
        const r2H = isSingle ? 360 : (isTwo ? 165 : 106);

        const convFont = isSingle ? 92 : (isTwo ? 80 : 70);
        const costFont = isSingle ? 70 : (isTwo ? 58 : 50);
        const cpaFont = isSingle ? 60 : (isTwo ? 50 : 44);
        const statFont = isSingle ? 48 : (isTwo ? 38 : 30);

        svg += `
    <g transform="translate(0, ${campY})">
      <!-- Main Card Box (1100px wide) -->
      <rect width="${cardW}" height="${cardH}" rx="26" fill="url(#cardGradCmp)" stroke="rgba(255,255,255,0.12)" stroke-width="1.8"/>
      
      <!-- Left Glow Stripe -->
      <rect x="0" y="24" width="8" height="${cardH - 48}" rx="4" fill="#10b981"/>

      <!-- Campaign Header -->
      <g transform="translate(30, ${isSingle ? 40 : (isTwo ? 30 : 24)})">
        <rect x="0" y="0" width="${isSingle ? 155 : (isTwo ? 145 : 135)}" height="${isSingle ? 34 : (isTwo ? 30 : 28)}" rx="8" fill="url(#nameTagGrad)" stroke="rgba(0, 229, 255, 0.40)" stroke-width="1.2"/>
        <text x="${isSingle ? 77 : (isTwo ? 72 : 67)}" y="${isSingle ? 23 : (isTwo ? 21 : 19)}" fill="#00e5ff" font-size="${isSingle ? 14 : (isTwo ? 13 : 12.5)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="1.5" text-anchor="middle">КАМПАНИЯ #${idx + 1}</text>
        
        <text x="${isSingle ? 175 : (isTwo ? 165 : 150)}" y="${isSingle ? 26 : (isTwo ? 24 : 22)}" fill="#ffffff" font-size="${isSingle ? 34 : (isTwo ? 30 : 28)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.3">${escapeXml(safeCampName)}</text>
      </g>

      <!-- 2x2 METRIC GRID (508px columns) -->
      <!-- ROW 1 (Conversions & Spend) -->
      <g transform="translate(30, ${r1Y})">
        <!-- Box 1: КОНВЕРСИИ -->
        <g transform="translate(0, 0)">
          <rect width="${colW}" height="${r1H}" rx="20" fill="rgba(16, 185, 129, 0.09)" stroke="rgba(16, 185, 129, 0.35)" stroke-width="1.8"/>
          <text x="24" y="${isSingle ? 44 : (isTwo ? 36 : 30)}" fill="#10b981" font-size="${isSingle ? 16 : (isTwo ? 14.5 : 13)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1.5">🎯 КОНВЕРСИИ (ЛИДЫ)</text>
          
          <!-- Bullseye + Number -->
          ${renderConversionIcon(24, isSingle ? 85 : (isTwo ? 58 : 46), isSingle ? 85 : (isTwo ? 68 : 54), "#10b981")}
          <text x="${isSingle ? 124 : (isTwo ? 104 : 88)}" y="${isSingle ? 175 : (isTwo ? 132 : 102)}" fill="url(#convGrad)" font-size="${convFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-1">${escapeXml(convsVal)}</text>
        </g>

        <!-- Box 2: РАСХОД БЮДЖЕТА -->
        <g transform="translate(${colW + colGap}, 0)">
          <rect width="${colW}" height="${r1H}" rx="20" fill="rgba(0, 229, 255, 0.08)" stroke="rgba(0, 229, 255, 0.30)" stroke-width="1.8"/>
          <text x="24" y="${isSingle ? 44 : (isTwo ? 36 : 30)}" fill="#00e5ff" font-size="${isSingle ? 16 : (isTwo ? 14.5 : 13)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1.5">💰 РАСХОД БЮДЖЕТА</text>
          <!-- Number + Currency tspan (never overflows!) -->
          <text x="24" y="${isSingle ? 170 : (isTwo ? 128 : 100)}" fill="url(#costGrad)" font-size="${costFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.8">${escapeXml(costVal)} <tspan font-size="${Math.round(costFont * 0.6)}" font-weight="700" fill="#38bdf8">${escapeXml(currency)}</tspan></text>
        </g>
      </g>

      <!-- ROW 2 (CPA & Traffic) -->
      <g transform="translate(30, ${r2Y})">
        <!-- Box 3: CPA -->
        <g transform="translate(0, 0)">
          <rect width="${colW}" height="${r2H}" rx="18" fill="rgba(244, 114, 182, 0.08)" stroke="rgba(244, 114, 182, 0.28)" stroke-width="1.6"/>
          <text x="24" y="${isSingle ? 44 : (isTwo ? 36 : 30)}" fill="#f472b6" font-size="${isSingle ? 16 : (isTwo ? 14.5 : 13)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1.5">📉 ЦЕНА КОНВЕРСИИ (CPA)</text>
          <!-- Number + Currency tspan -->
          <text x="24" y="${isSingle ? 150 : (isTwo ? 116 : 82)}" fill="#f472b6" font-size="${cpaFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" letter-spacing="-0.5">${escapeXml(cpaVal)} <tspan font-size="${Math.round(cpaFont * 0.6)}" font-weight="700" fill="#f472b6">${escapeXml(currency)}</tspan></text>
        </g>

        <!-- Box 4: ТРАФИК (КЛИКИ, CTR, SEARCH IS - 3 generous columns inside 508px!) -->
        <g transform="translate(${colW + colGap}, 0)">
          <rect width="${colW}" height="${r2H}" rx="18" fill="rgba(255, 255, 255, 0.035)" stroke="rgba(255, 255, 255, 0.10)" stroke-width="1.6"/>
          
          <!-- Col 1: КЛИКИ -->
          <g transform="translate(20, ${isSingle ? 46 : (isTwo ? 36 : 28)})">
            <text x="0" y="0" fill="#94a3b8" font-size="${isSingle ? 14 : (isTwo ? 13 : 11.5)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1">КЛИКИ</text>
            <text x="0" y="${isSingle ? 75 : (isTwo ? 55 : 42)}" fill="#ffffff" font-size="${statFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900">${escapeXml(clicksVal)}</text>
          </g>

          <line x1="160" y1="${isSingle ? 30 : (isTwo ? 24 : 20)}" x2="160" y2="${isSingle ? 220 : (isTwo ? 135 : 86)}" stroke="rgba(255,255,255,0.08)" stroke-width="1.2"/>

          <!-- Col 2: CTR -->
          <g transform="translate(180, ${isSingle ? 46 : (isTwo ? 36 : 28)})">
            <text x="0" y="0" fill="#94a3b8" font-size="${isSingle ? 14 : (isTwo ? 13 : 11.5)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1">CTR</text>
            <text x="0" y="${isSingle ? 75 : (isTwo ? 55 : 42)}" fill="#60a5fa" font-size="${statFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900">${escapeXml(ctrVal)}</text>
          </g>

          <line x1="325" y1="${isSingle ? 30 : (isTwo ? 24 : 20)}" x2="325" y2="${isSingle ? 220 : (isTwo ? 135 : 86)}" stroke="rgba(255,255,255,0.08)" stroke-width="1.2"/>

          <!-- Col 3: SEARCH IS -->
          <g transform="translate(345, ${isSingle ? 46 : (isTwo ? 36 : 28)})">
            <text x="0" y="0" fill="#94a3b8" font-size="${isSingle ? 14 : (isTwo ? 13 : 11.5)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1">SEARCH IS</text>
            <text x="0" y="${isSingle ? 75 : (isTwo ? 55 : 42)}" fill="#fb923c" font-size="${statFont}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900">${escapeXml(isVal)}</text>
          </g>
        </g>
      </g>
    </g>`;
        campY += cardH + gap;
    });

    svg += `
  </g>

  <!-- Footer Banner (Exact twin of Card 1) -->
  <g transform="translate(${padding}, ${height - 50})">
    <line x1="0" y1="-20" x2="${cardW}" y2="-20" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
    <text x="0" y="8" fill="#475569" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" letter-spacing="1.5">AURELIUS MARKETING AI • CAMPAIGN LEVEL INTELLIGENCE</text>
    <text x="${cardW}" y="8" fill="#334155" font-size="14.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" text-anchor="end">КАРТОЧКА 2 ИЗ 2</text>
  </g>
</svg>`;

    return svg;
}

/**
 * Комплексный генератор пакета инфографики (KPI карточка + Кампании карточка + Подпись)
 */
async function generateAdsReportImages(client, stats, requestedPeriod = null) {
    const clientName = client.name || client.clientName || 'Клиент';
    const currency = stats.currency || client.ads_currency || client.currency || 'EUR';
    const periods = stats.periods || {};

    const periodNamesMap = {
        'TODAY': 'Сегодня',
        'YESTERDAY': 'Вчера',
        'LAST_7_DAYS': 'За последние 7 дней',
        'LAST_30_DAYS': 'За последние 30 дней'
    };

    // Если запрошен конкретный период (например, LAST_7_DAYS в еженедельном отчете) — СТРОГО фиксируем его!
    let pKey = requestedPeriod;
    if (!pKey) {
        if (periods.LAST_7_DAYS && (parseFloat(periods.LAST_7_DAYS.clicks || 0) > 0 || parseFloat(periods.LAST_7_DAYS.cost || 0) > 0)) {
            pKey = 'LAST_7_DAYS';
        } else if (periods.LAST_30_DAYS) {
            pKey = 'LAST_30_DAYS';
        } else {
            pKey = 'LAST_7_DAYS';
        }
    }

    const periodName = periodNamesMap[pKey] || (pKey ? `За ${pKey}` : 'За последние 7 дней');
    let pData = periods[pKey] || null;

    if (!pData) {
        pData = {
            clicks: (pKey === 'LAST_7_DAYS' ? stats.cachedClicks_7 : null) || stats.cachedClicks || client.clicks || '0',
            cost: (pKey === 'LAST_7_DAYS' ? stats.cachedCost_7 : null) || stats.cachedCost || client.cost || '0',
            conversions: (pKey === 'LAST_7_DAYS' ? stats.cachedConvs_7 : null) || stats.cachedConvs || client.convs || '0',
            cpa: (pKey === 'LAST_7_DAYS' ? stats.cachedCpa_7 : null) || stats.cachedCpa || client.cpa || '—',
            roas: (pKey === 'LAST_7_DAYS' ? stats.cachedRoas_7 : null) || stats.cachedRoas || client.roas || '0',
            ctr: (pKey === 'LAST_7_DAYS' ? stats.cachedCtr_7 : null) || stats.cachedCtr || '0',
            impressions: (pKey === 'LAST_7_DAYS' ? stats.cachedImpressions_7 : null) || stats.cachedImpressions || stats.impressions || client.impressions || '0'
        };
    }

    const kpi = {
        clicks: pData.clicks || '0',
        cost: pData.cost || '0',
        conversions: pData.conversions || pData.convs || '0',
        cpa: pData.costPerConv || pData.cpa || '—',
        roas: pData.roas || '—',
        ctr: pData.ctr || '—',
        impressions: pData.impressions || pData.imps || stats.cachedImpressions || stats.impressions || '0'
    };

    // Фильтруем кампании по выбранному периоду
    const allCamps = stats.campaigns || client.campaigns || [];
    let matchedCamps = allCamps.filter(c => c.period && c.period.toUpperCase() === pKey);
    if (matchedCamps.length === 0 && allCamps.length > 0) {
        matchedCamps = allCamps;
    }

    // Фильтруем поисковые запросы с конверсиями
    const allQueries = stats.queries || client.queries || [];
    let queriesWithConvs = allQueries
        .filter(q => (!q.period || q.period.toUpperCase() === pKey) && parseFloat(q.conversions || 0) > 0)
        .sort((a, b) => parseFloat(b.conversions || 0) - parseFloat(a.conversions || 0));

    if (queriesWithConvs.length === 0 && allQueries.length > 0) {
        queriesWithConvs = allQueries
            .filter(q => parseFloat(q.conversions || 0) > 0)
            .sort((a, b) => parseFloat(b.conversions || 0) - parseFloat(a.conversions || 0));
    }

    // Собираем красивую HTML-сводку с синим шрифтом (акцентные ссылки Telegram)
    const portalUrl = 'https://aureliusclients.web.app';
    const botUrl = 'https://t.me/AureliusMarketingBot';

    let caption = `📊 <b><a href="${portalUrl}">СВОДКА GOOGLE ADS LIVE</a></b>\n`;
    caption += `👤 Клиент: <b><a href="${portalUrl}">${escapeXml(clientName)}</a></b>\n`;
    caption += `📅 Период: <b><a href="${portalUrl}">${escapeXml(periodName)}</a></b>\n\n`;

    if (queriesWithConvs.length > 0) {
        caption += `🔍 <b><a href="${portalUrl}">Поисковые запросы с конверсиями:</a></b>\n`;
        const topQueries = queriesWithConvs.slice(0, 10);
        topQueries.forEach(q => {
            const safeQuery = escapeXml(q.query);
            const qConvs = q.conversions || "0";
            const qCost = q.cost || "0";
            caption += `• <code>${safeQuery}</code> → <b><a href="${portalUrl}">${qConvs} конв.</a></b> (CPA: <code>${qCost} ${currency}</code>)\n`;
        });
        caption += `\n`;
    }

    caption += `<blockquote>💡 <i>Все ключевые показатели и статистика кампаний представлены на инфографике выше 👆</i></blockquote>\n\n`;
    caption += `🤖 <i>Отчет подготовлен нейросетью <a href="${botUrl}">Aurelius Marketing AI</a></i>`;

    // 1. Рендерим KPI карточку (1080x1200)
    const kpiSvg = generateKpiSvg({ clientName, periodName, currency, kpi });
    const kpiBuffer = await sharp(Buffer.from(kpiSvg)).png().toBuffer();

    // 2. Рендерим Кампании карточку (1080x1200)
    let campaignsBuffer = null;
    if (matchedCamps.length > 0) {
        const campSvg = generateCampaignsSvg({ clientName, periodName, currency, campaigns: matchedCamps });
        campaignsBuffer = await sharp(Buffer.from(campSvg)).png().toBuffer();
    }

    return {
        kpiBuffer,
        campaignsBuffer,
        caption,
        periodName,
        clientName
    };
}

/**
 * Обратная совместимость для одного изображения (если требуется)
 */
async function generateWeeklyDashboardImage(client, stats) {
    const res = await generateAdsReportImages(client, stats, 'LAST_7_DAYS');
    return {
        imageBuffer: res.kpiBuffer,
        caption: res.caption,
        periodName: res.periodName,
        ...res
    };
}

module.exports = {
    renderConversionIcon,
    generateKpiSvg,
    generateCampaignsSvg,
    generateAdsReportImages,
    generateWeeklyDashboardImage
};
