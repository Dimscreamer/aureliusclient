/**
 * =========================================================================
 * AURELIUS INTELLIGENCE | UNIVERSAL MCC HARVESTER v4.0 (FIRESTORE EDITION)
 * =========================================================================
 * Данный скрипт собирает данные по всем аккаунтам MCC и передает их
 * напрямую в Firebase Firestore (Aurelius CRM + Mark AI Brain).
 * 
 * Периоды сбора: TODAY, YESTERDAY, LAST_7_DAYS, LAST_30_DAYS
 * =========================================================================
 */

const CONFIG = {
  CRM_API_URL: 'https://api-lzh3pje5pa-uc.a.run.app/api',
  PERIODS: ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS'],
  MAX_QUERIES_PER_PERIOD: 50 // топ запросов для каждого периода
};

function log(msg) {
  Logger.log(msg);
  console.log(msg);
}

function main() {
  log("🚀 ЗАПУСК UNIVERSAL HARVESTER v4.0 (FIRESTORE EDITION)");

  const accountIterator = AdsManagerApp.accounts().get();
  const accounts = [];
  while (accountIterator.hasNext()) {
    accounts.push(accountIterator.next());
  }

  log(`📋 Найдено аккаунтов в MCC: ${accounts.length}`);

  for (let idx = 0; idx < accounts.length; idx++) {
    const account = accounts[idx];
    const name = account.getName();
    const adsId = account.getCustomerId().replace(/-/g, '').trim();
    const cur = account.getCurrencyCode();

    log(`\n▶ [${idx + 1}/${accounts.length}] Обработка: ${name} (${adsId}) [${cur}]`);

    try {
      AdsManagerApp.select(account);
    } catch (selErr) {
      log(`   ⚠️ Не удалось выбрать аккаунт ${name}: ${selErr.toString()}`);
      continue;
    }

    const payload = {
      action: "adsReport",
      adsId: adsId,
      accountName: name,
      currency: cur,
      periods: {},
      campaigns: [],
      queries: [],
      conversions: []
    };

    for (let pIdx = 0; pIdx < CONFIG.PERIODS.length; pIdx++) {
      const period = CONFIG.PERIODS[pIdx];
      log(`   ⏳ Период: ${period}`);

      // 1. Метрики аккаунта
      try {
        const accQuery = `SELECT Clicks, Cost, Impressions, Conversions, ConversionValue ` +
                         `FROM ACCOUNT_PERFORMANCE_REPORT ` +
                         `DURING ${period}`;
        const accRep = AdsApp.report(accQuery).rows();

        if (accRep.hasNext()) {
          const r = accRep.next();
          const cl = parseInt(r['Clicks'] || 0);
          const co = parseFloat((r['Cost'] || "0").replace(/,/g, ''));
          const im = parseInt(r['Impressions'] || 0);
          const cn = parseFloat(r['Conversions'] || 0);
          const cv = parseFloat((r['ConversionValue'] || "0").replace(/,/g, ''));

          const ctr = im > 0 ? (cl / im * 100).toFixed(2) : "0.00";
          const cpc = cl > 0 ? (co / cl).toFixed(2) : "0.00";
          const cpa = cn > 0 ? (co / cn).toFixed(2) : "0.00";
          const roas = co > 0 ? ((cv / co) * 100).toFixed(1) : "0.0";
          const aov = cn > 0 ? (cv / cn).toFixed(2) : "0.00";

          payload.periods[period] = {
            clicks: cl,
            cost: co.toFixed(2),
            impressions: im,
            conversions: cn.toFixed(1),
            conversionValue: cv.toFixed(2),
            ctr: ctr,
            cpc: cpc,
            costPerConv: cpa,
            roas: roas,
            aov: aov
          };
          log(`      ✓ Аккаунт (${period}): Клики=${cl}, Расход=${co.toFixed(2)} ${cur}, Конв=${cn}, CPA=${cpa}, ROAS=${roas}%`);
        }
      } catch (accErr) {
        log(`      ❌ Ошибка отчета аккаунта: ${accErr.toString()}`);
      }

      // 2. Кампании
      try {
        const campQuery = `SELECT CampaignName, AdvertisingChannelType, Clicks, Cost, Conversions, ConversionValue ` +
                          `FROM CAMPAIGN_PERFORMANCE_REPORT ` +
                          `WHERE CampaignStatus = "ENABLED" ` +
                          `DURING ${period}`;
        const cRep = AdsApp.report(campQuery).rows();

        while (cRep.hasNext()) {
          const c = cRep.next();
          const cCl = parseInt(c['Clicks'] || 0);
          const cCo = parseFloat((c['Cost'] || "0").replace(/,/g, ''));
          const cCn = parseFloat(c['Conversions'] || 0);
          const cCv = parseFloat((c['ConversionValue'] || "0").replace(/,/g, ''));

          if (cCl > 0 || cCo > 0 || cCn > 0) {
            const cCpa = cCn > 0 ? (cCo / cCn).toFixed(2) : "0.00";
            const cRoas = cCo > 0 ? ((cCv / cCo) * 100).toFixed(1) : "0.0";

            payload.campaigns.push({
              name: c['CampaignName'],
              type: c['AdvertisingChannelType'],
              period: period,
              clicks: cCl,
              cost: cCo.toFixed(2),
              conversions: cCn.toFixed(1),
              conversionValue: cCv.toFixed(2),
              cpa: cCpa,
              roas: cRoas
            });
          }
        }
      } catch (cErr) {
        log(`      ❌ Ошибка кампаний: ${cErr.toString()}`);
      }

      // 3. Поисковые запросы
      try {
        const qQuery = `SELECT Query, Clicks, Impressions, Cost, Conversions ` +
                       `FROM SEARCH_QUERY_PERFORMANCE_REPORT ` +
                       `WHERE Clicks > 0 ` +
                       `DURING ${period}`;
        const qRep = AdsApp.report(qQuery).rows();

        let qCount = 0;
        while (qRep.hasNext() && qCount < CONFIG.MAX_QUERIES_PER_PERIOD) {
          const q = qRep.next();
          if (q['Query'] && q['Query'].trim() !== "") {
            payload.queries.push({
              query: q['Query'].trim(),
              period: period,
              clicks: parseInt(q['Clicks'] || 0),
              impressions: parseInt(q['Impressions'] || 0),
              cost: parseFloat((q['Cost'] || "0").replace(/,/g, '')).toFixed(2),
              conversions: parseFloat(q['Conversions'] || 0).toFixed(1)
            });
            qCount++;
          }
        }
      } catch (qErr) {
        log(`      ❌ Ошибка поисковых запросов: ${qErr.toString()}`);
      }

      // 4. Цели конверсий
      try {
        const convQuery = `SELECT ConversionTypeName, Conversions ` +
                          `FROM ACCOUNT_PERFORMANCE_REPORT ` +
                          `WHERE Conversions > 0 ` +
                          `DURING ${period}`;
        const convRep = AdsApp.report(convQuery).rows();

        let convMap = {};
        while (convRep.hasNext()) {
          const row = convRep.next();
          const typeName = row['ConversionTypeName'];
          const convCount = parseFloat((row['Conversions'] || "0").replace(/,/g, '')) || 0;
          if (typeName && convCount > 0) {
            convMap[typeName] = (convMap[typeName] || 0) + convCount;
          }
        }

        for (let t in convMap) {
          payload.conversions.push({
            name: t,
            period: period,
            count: convMap[t].toFixed(1)
          });
        }
      } catch (cvErr) {
        log(`      ❌ Ошибка целей конверсий: ${cvErr.toString()}`);
      }
    }

    // 5. Отправка полного слепка в Aurelius CRM / Firestore
    try {
      log(`   📡 Отправка слепка в Aurelius CRM...`);
      const response = UrlFetchApp.fetch(CONFIG.CRM_API_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      log(`   ✅ Ответ сервера: HTTP ${response.getResponseCode()} - ${response.getContentText()}`);
    } catch (crmErr) {
      log(`   ❌ Ошибка отправки в CRM: ${crmErr.toString()}`);
    }
  }

  log("\n🏁 СИНХРОНИЗАЦИЯ С FIRESTORE УСПЕШНО ЗАВЕРШЕНА!");
}
