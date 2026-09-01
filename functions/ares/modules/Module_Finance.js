/**
 * ==============================================================================
 * 💸 MODULE FINANCE v1.2 (Monobank Integration)
 * Модуль контроля бюджета, Pacing-аналитики и перехвата вебхуков Monobank.
 * Поддержка v10 Архитектуры (promptFn, handler, contextFn).
 * ==============================================================================
 */

// ==============================================================================
// 🔗 БЛОК 1: MONOBANK WEBHOOK HANDLER
// ==============================================================================
function _isTransactionProcessed(id) {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return false;
  const ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('finance', 'logSheet', 'Finance_Log');
  let sheet = ss.getSheetByName(logSheetName);
  if (!sheet) return false;
  
  var data = sheet.getDataRange().getValues();
  var colId = colToIdx(getModuleSetting('finance', 'col_id', 'G'), 6);
  for (var i = 1; i < data.length; i++) {
    if (data[i][colId] == id) return true;
  }
  return false;
}

function handleMonobankWebhook(monoData) {
  if (monoData.type !== 'StatementItem') return;
  
  var item = monoData.data.statementItem;
  if (_isTransactionProcessed(item.id)) {
    if (typeof sysLog !== 'undefined') sysLog("Дубликат транзакции: " + item.id, MY_ID);
    return;
  }
  
  // Сумма в копейках. Отрицательная - трата, положительная - пополнение.
  var amountUAH = item.amount / 100;
  
  var isExpense = amountUAH < 0;
  
  // Date conversion
  var dateObj = new Date(item.time * 1000);
  var dateStr = Utilities.formatDate(dateObj, TIME_ZONE, "dd.MM.yyyy HH:mm");
  
  var description = item.description || "Без описания";
  var balanceUAH = item.balance / 100;
  var mcc = item.mcc || "";
  
  var category = _guessCategoryByMCC(mcc, description);
  
  // Записываем в таблицу
  _writeToFinanceLog({
    date: dateStr,
    amount: amountUAH,
    category: category,
    description: description,
    balance: balanceUAH,
    mcc: mcc,
    id: item.id
  });
  
  // Отправляем уведомление
  if (typeof sysLog !== 'undefined') {
    sysLog("💳 [MONOBANK] " + description + ": " + amountUAH + " грн. Баланс: " + balanceUAH + " грн.", MY_ID);
  }
  
  if (isExpense) {
    var budget = _getFinanceBudget();
    var spentByCategory = _getSpentThisMonthByCategory();
    
    var limit = budget.limits[category] || budget.limits["Разное"] || 0;
    var spent = spentByCategory[category] || 0;
    var left = limit - spent; // spent уже включает эту транзакцию
    
    var daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
    var daysLeft = daysInMonth - dateObj.getDate() + 1;
    var dailySafe = left > 0 ? Math.floor(left / daysLeft) : 0;
    var msg = "🏦 <b>БАЛАНС СЧЕТА:</b> " + balanceUAH.toFixed(2) + " грн\n";
    msg += "───\n";
    if (limit > 0) {
      msg += "📊 <b>ЛИМИТ:</b> " + category + "\n";
      msg += "Потрачено: " + spent.toFixed(2) + " из " + limit.toFixed(2) + " грн\n";
      msg += "Остаток: " + left.toFixed(2) + " грн\n";
      msg += "📆 <b>На день:</b> " + dailySafe + " грн (до конца месяца: " + daysLeft + " дн.)\n";
    } else {
      msg += "💡 <i>Лимит для категории не задан. Настройте Finance_Budget.</i>\n";
    }
    msg += "───\n";
    msg += "💸 <b>Покупка:</b> " + description + "\n";
    msg += "Сумма: " + Math.abs(amountUAH).toFixed(2) + " грн\n";
    msg += "Категория: " + category + " <i>(MCC: " + mcc + ")</i>\n";
    
    sendText(MY_ID, msg);
  } else {
    var msg = "💰 <b>ПОПОЛНЕНИЕ:</b> " + description + "\n";
    msg += "Сумма: +" + amountUAH.toFixed(2) + " грн\n";
    msg += "🏦 <b>Новый баланс:</b> " + balanceUAH.toFixed(2) + " грн";
    sendText(MY_ID, msg);
  }
}
function _guessCategoryByMCC(mcc, description) {
  var descLower = (description || '').toLowerCase();
  
  // Сначала проверяем пользовательский маппинг
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (targetSheetId) {
    try {
      var ss = SpreadsheetApp.openById(targetSheetId);
      var mccSheetName = getModuleSetting('finance', 'mccSheet', 'Finance_MCC_Mapping');
      var mappingSheet = ss.getSheetByName(mccSheetName);
      if (mappingSheet) {
        var data = mappingSheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var key = data[i][0].toString().toLowerCase().trim();
          var category = data[i][1];
          if (!key) continue;
          
          // Если ключ - это точный MCC код
          if (/^\d+$/.test(key) && key === mcc.toString()) {
            return category;
          }
          // Если ключ - это строка, ищем подстроку в описании транзакции
          else if (!/^\d+$/.test(key) && descLower.includes(key)) {
            return category;
          }
        }
      }
    } catch(e) {}
  }

  // Дефолтные правила
  if (descLower.includes('сільпо') || descLower.includes('atb') || descLower.includes('апельмон') || descLower.includes('продукты') || mcc == 5411) return 'Продукты';
  if (descLower.includes('taxi') || descLower.includes('uber') || descLower.includes('uklon') || mcc == 4121) return 'Транспорт';
  if (descLower.includes('netfl') || descLower.includes('spotify') || descLower.includes('youtube')) return 'Развлечения';
  return 'Разное';
}

function _writeToFinanceLog(payload) {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return;
  const ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('finance', 'logSheet', 'Finance_Log');
  let sheet = ss.getSheetByName(logSheetName);
  if (sheet) {
    var row = [];
    row[colToIdx(getModuleSetting('finance', 'col_date', 'A'), 0)] = payload.date;
    row[colToIdx(getModuleSetting('finance', 'col_amount', 'B'), 1)] = payload.amount;
    row[colToIdx(getModuleSetting('finance', 'col_cat', 'C'), 2)] = payload.category;
    row[colToIdx(getModuleSetting('finance', 'col_desc', 'D'), 3)] = payload.description;
    row[colToIdx(getModuleSetting('finance', 'col_bal', 'E'), 4)] = payload.balance;
    row[colToIdx(getModuleSetting('finance', 'col_mcc', 'F'), 5)] = payload.mcc;
    row[colToIdx(getModuleSetting('finance', 'col_id', 'G'), 6)] = payload.id;
    
    for (var i = 0; i < row.length; i++) {
      if (row[i] === undefined) row[i] = "";
    }
    sheet.appendRow(row);
    if (typeof sysLog !== 'undefined') sysLog("💵 [FINANCE] Транзакция записана: " + payload.mcc + " (" + payload.balance + " грн)");
    
    if (typeof emitEvent === 'function') {
      emitEvent('FINANCE_ADD', payload);
    }
  }
}

// ==============================================================================
// 📊 БЛОК 2: АНАЛИТИКА И ПЛАНИРОВАНИЕ (БЮДЖЕТ)
// ==============================================================================

function _getCurrentBalance() {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return 0;
  var ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('finance', 'logSheet', 'Finance_Log');
  var sheet = ss.getSheetByName(logSheetName);
  if (!sheet) return 0;
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  
  var colBalIdx = colToIdx(getModuleSetting('finance', 'col_bal', 'E'), 4);
  var balance = sheet.getRange(lastRow, colBalIdx + 1).getValue();
  return parseFloat(balance) || 0;
}

function _getFinanceBudget() {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return { limits: {}, mandatory: [] };
  const ss = SpreadsheetApp.openById(targetSheetId);
  
  var budgetSheetName = getModuleSetting('finance', 'budgetSheet', 'Finance_Budget');
  let sheet = ss.getSheetByName(budgetSheetName);
  var limits = {};
  var mandatory = [];
  
  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][4] === 'yes' || data[i][4] === 'да' || data[i][4] === true) {
        var item = data[i][0];
        var amount = parseFloat(data[i][1]) || 0;
        var type = data[i][2];
        var day = parseInt(data[i][3]) || 1;
        
        if (type === 'Limit' || type === 'Лимит') {
          limits[item] = amount;
        } else if (type === 'Mandatory' || type === 'Обязательный') {
          mandatory.push({ desc: item, amount: amount, day: day });
        }
      }
    }
  } else {
     // Фолбэк для старых таблиц (если юзер еще не обновил Setup)
     let limSheet = ss.getSheetByName('Finance_Limits');
     if (limSheet) {
       var ld = limSheet.getDataRange().getValues();
       for (var j = 1; j < ld.length; j++) { if (ld[j][0]) limits[ld[j][0]] = parseFloat(ld[j][1]); }
     }
     let manSheet = ss.getSheetByName('Finance_Mandatory');
     if (manSheet) {
       var md = manSheet.getDataRange().getValues();
       for (var k = 1; k < md.length; k++) { 
         if (md[k][3] === 'yes' || md[k][3] === 'да') mandatory.push({ desc: md[k][0], amount: parseFloat(md[k][1]), day: parseInt(md[k][2]) }); 
       }
     }
  }
  return { limits: limits, mandatory: mandatory };
}

function _getSpentThisMonthByCategory() {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return {};
  const ss = SpreadsheetApp.openById(targetSheetId);
  var logSheetName = getModuleSetting('finance', 'logSheet', 'Finance_Log');
  let sheet = ss.getSheetByName(logSheetName);
  if (!sheet) return {};
  
  var data = sheet.getDataRange().getValues();
  var spent = {};
  
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  
  var colDate = colToIdx(getModuleSetting('finance', 'col_date', 'A'), 0);
  var colAmount = colToIdx(getModuleSetting('finance', 'col_amount', 'B'), 1);
  var colCat = colToIdx(getModuleSetting('finance', 'col_cat', 'C'), 2);

  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][colDate]; // format: dd.MM.yyyy HH:mm
    if (!rawDate) continue;
    
    var txDate;
    if (rawDate instanceof Date) {
      var sheetTz = ss.getSpreadsheetTimeZone();
      var formatted = Utilities.formatDate(rawDate, sheetTz, "yyyy-MM-dd");
      var parts = formatted.split('-');
      txDate = new Date(parts[0], parts[1]-1, parts[2]);
    } else {
      // Parse Date (dd.MM.yyyy HH:mm)
      var parts = rawDate.toString().split(' ');
      if (parts.length < 1) continue;
      var dParts = parts[0].split('.');
      if (dParts.length < 3) continue;
      txDate = new Date(dParts[2], dParts[1] - 1, dParts[0]);
    }
    
    if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
      var amount = parseFloat(data[i][colAmount]);
      var cat = data[i][colCat];
      
      if (amount < 0) { // Только траты
        if (!spent[cat]) spent[cat] = 0;
        spent[cat] += Math.abs(amount);
      }
    }
  }
  return spent;
}

function _getExpectedIncome() {
  var targetSheetId = getModuleSetting('finance', 'sheetId', '') || (typeof ADS_DATA_SHEET_ID !== 'undefined' ? ADS_DATA_SHEET_ID : null);
  if (!targetSheetId) return { thisMonth: 0, nextMonth: 0, total: 0 };
  var ss = SpreadsheetApp.openById(targetSheetId);
  var sheet = ss.getSheetByName('Finance_Expected');
  if (!sheet) return { thisMonth: 0, nextMonth: 0, total: 0 };
  
  var data = sheet.getDataRange().getValues();
  var thisMonthSum = 0;
  var nextMonthSum = 0;
  var totalSum = 0;
  
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  
  var nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  var nextMonth = nextMonthDate.getMonth();
  var nextMonthYear = nextMonthDate.getFullYear();
  
  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][2]; // Expected Date
    if (!rawDate) continue;
    
    var expectedDate;
    if (typeof rawDate === 'string' && rawDate.indexOf('.') !== -1) {
      var parts = String(rawDate).split('.');
      if (parts.length >= 3) expectedDate = new Date(parts[2], parts[1]-1, parts[0]);
    } else {
      expectedDate = new Date(rawDate);
    }
    
    if (!isNaN(expectedDate.getTime())) {
      var uahAmount = parseFloat(data[i][4]) || 0;
      var status = data[i][5] ? String(data[i][5]).trim().toLowerCase() : '';
      if (status !== 'активен') continue;
      
      // Доход от активных клиентов регулярный (раз в месяц)
      var incDay = expectedDate.getDate();
      var dateThisMonth = new Date(currentYear, currentMonth, incDay);
      if (dateThisMonth.getTime() >= expectedDate.getTime() && dateThisMonth >= new Date(currentYear, currentMonth, now.getDate() - 1)) {
        thisMonthSum += uahAmount;
        totalSum += uahAmount;
      }
      
      var dateNextMonth = new Date(nextMonthYear, nextMonth, incDay);
      if (dateNextMonth.getTime() >= expectedDate.getTime()) {
        nextMonthSum += uahAmount;
        totalSum += uahAmount;
      }
    }
  }
  
  return { thisMonth: thisMonthSum, nextMonth: nextMonthSum, total: totalSum };
}

function _calculateFreeMoney(budget, spent) {
  var currentBalance = _getCurrentBalance();
  var now = new Date();
  var today = now.getDate();
  
  var upcomingMandatorySum = 0;
  budget.mandatory.forEach(function(m) {
    if (m.day >= today) upcomingMandatorySum += m.amount;
  });
  
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var daysLeft = daysInMonth - today + 1; // включая сегодняшний день
  
  var remainingLimitsSum = 0;
  for (var cat in budget.limits) {
    var lim = budget.limits[cat];
    var sp = spent[cat] || 0;
    
    // Ежедневный бюджет
    var dailyLimit = lim / daysInMonth;
    // Бюджет на оставшиеся дни пропорционально
    var proratedRemaining = dailyLimit * daysLeft;
    // Фактический неиспользованный остаток бюджета
    var actualRemaining = lim - sp;
    
    // Резервируем только пропорциональный остаток, но не больше, чем реально осталось
    var toReserve = Math.min(proratedRemaining, actualRemaining > 0 ? actualRemaining : 0);
    remainingLimitsSum += toReserve;
  }
  
  return currentBalance - upcomingMandatorySum - remainingLimitsSum;
}

function _simulateCashFlow(budget, spent, currentBalance, purchaseAmount) {
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  var daysInThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  var daysLeftThisMonth = daysInThisMonth - now.getDate() + 1;
  
  var nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  var nextMonth = nextMonthDate.getMonth();
  var nextMonthYear = nextMonthDate.getFullYear();
  var daysInNextMonth = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
  
  var fullLimitsSum = 0;
  for (var cat in budget.limits) {
    fullLimitsSum += budget.limits[cat];
  }
  var dailyBurnThisMonth = fullLimitsSum / daysInThisMonth;
  
  // Next month we will get FULL limits again
  var fullLimitsSum = 0;
  for (var cat in budget.limits) {
    fullLimitsSum += budget.limits[cat];
  }
  var dailyBurnNextMonth = fullLimitsSum / daysInNextMonth;
  
  // Load expected income array
  var expectedIncomeArr = [];
  if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
    var ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    var sheet = ss.getSheetByName('Finance_Expected');
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var rawDate = data[i][2];
        if (!rawDate) continue;
        var expectedDate = new Date(rawDate);
        if (isNaN(expectedDate.getTime())) {
          var parts = String(rawDate).split('.');
          if (parts.length === 3) expectedDate = new Date(parts[2], parts[1]-1, parts[0]);
        }
        if (!isNaN(expectedDate.getTime())) {
           var uahAmount = parseFloat(data[i][4]) || 0;
           var status = data[i][5] ? String(data[i][5]).trim().toLowerCase() : '';
           if (uahAmount > 0 && status === 'активен') {
             expectedIncomeArr.push({ date: expectedDate, amount: uahAmount, client: data[i][1] });
           }
        }
      }
    }
  }
  
  var simBalance = currentBalance - purchaseAmount;
  var hasGap = false;
  var gapDetails = null;
  var totalBurnedBeforeGap = 0;
  var mandsBeforeGap = [];
  
  var checkpoints = [];
  var periodIncomes = [];
  var periodMands = [];
  if (purchaseAmount > 0) {
    periodMands.push({ desc: "Покупка", amount: purchaseAmount });
  }
  
  // Simulation loop: from today until end of next month
  var simDate = new Date(currentYear, currentMonth, now.getDate());
  var endDate = new Date(nextMonthYear, nextMonth, daysInNextMonth);
  
  while (simDate <= endDate) {
    var d = simDate.getDate();
    var m = simDate.getMonth();
    var y = simDate.getFullYear();
    
    // Daily burn
    var burn = (m === currentMonth) ? dailyBurnThisMonth : dailyBurnNextMonth;
    simBalance -= burn;
    if (!hasGap) totalBurnedBeforeGap += burn;
    
    // Mandatory payments
    budget.mandatory.forEach(function(item) {
      if (item.day === d) {
        simBalance -= item.amount;
        if (!hasGap) mandsBeforeGap.push({ desc: item.desc, amount: item.amount });
        periodMands.push({ desc: item.desc, amount: item.amount });
      }
    });
    
    // Expected Incomes
    var incomeToday = 0;
    var incomeSources = [];
    expectedIncomeArr.forEach(function(inc) {
      if (inc.date.getDate() === d && inc.date.getMonth() === m && inc.date.getFullYear() === y) {
        incomeToday += inc.amount;
        incomeSources.push(inc.client);
        periodIncomes.push({ desc: inc.client, amount: inc.amount });
      }
    });
    simBalance += incomeToday;
    
    // Check for cash gap
    if (simBalance < 0 && !hasGap) {
      hasGap = true;
      var gapDateStr = ("0" + d).slice(-2) + "." + ("0" + (m + 1)).slice(-2);
      gapDetails = {
        date: new Date(simDate),
        dateStr: gapDateStr,
        deficit: Math.abs(simBalance),
        totalBurned: totalBurnedBeforeGap,
        mands: mandsBeforeGap.slice(),
        nextIncomeDate: null,
        nextIncomeDateStr: "",
        nextIncomeAmount: 0,
        nextIncomeClient: ""
      };
    }
    
    // If we are in a gap, look for the next salvation (income)
    if (hasGap && gapDetails.nextIncomeDate === null && incomeToday > 0) {
      // If income arrives but doesn't fully cover the gap, simBalance is still < 0, 
      // but it's still a salvation event (maybe partial). Let's just track the first income after gap.
      gapDetails.nextIncomeDate = new Date(simDate);
      gapDetails.nextIncomeDateStr = ("0" + d).slice(-2) + "." + ("0" + (m + 1)).slice(-2);
      gapDetails.nextIncomeAmount = incomeToday;
      gapDetails.nextIncomeClient = incomeSources.join(", ");
    }
    
    // Checkpoints
    var daysInSimMonth = new Date(y, m + 1, 0).getDate();
    if (d === 10 || d === 20 || d === daysInSimMonth) {
      checkpoints.push({
        dateStr: ("0" + d).slice(-2) + "." + ("0" + (m + 1)).slice(-2),
        balance: simBalance,
        incomes: periodIncomes.slice(),
        mands: periodMands.slice()
      });
      periodIncomes = [];
      periodMands = [];
    }
    
    // Move to next day
    simDate.setDate(simDate.getDate() + 1);
  }
  
  return {
    hasGap: hasGap,
    gapDetails: gapDetails,
    finalBalance: simBalance,
    checkpoints: checkpoints
  };
}

function generateFinanceMorningSummary() {
  var budget = _getFinanceBudget();
  var spent = _getSpentThisMonthByCategory();
  var currentBalance = _getCurrentBalance();
  
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var daysLeft = daysInMonth - now.getDate() + 1;
  
  var freeMoney = _calculateFreeMoney(budget, spent);
  var income = _getExpectedIncome();
  var forecast = freeMoney + income.thisMonth;
  
  var body = "";
  body += "💳 Текущий баланс: <code>" + currentBalance.toFixed(0) + " грн</code>\n";
  if (freeMoney < 0) {
    body += "📉 Дефицит текущего баланса: <code>" + freeMoney.toFixed(0) + " грн</code> <i>(без учета будущих доходов)</i>\n";
  } else {
    body += "💰 Свободно на карте: <code>" + freeMoney.toFixed(0) + " грн</code>\n";
  }
  
  if (income.total > 0) {
    body += "\n<b>ОЖИДАЕМЫЕ ПОСТУПЛЕНИЯ:</b>\n";
    if (income.thisMonth > 0) body += "В этом месяце: <code>+" + income.thisMonth.toFixed(0) + " грн</code>\n";
    if (income.nextMonth > 0) body += "В следующем месяце: <code>+" + income.nextMonth.toFixed(0) + " грн</code>\n";
  }
  
  body += "\n<b>СВОБОДНЫЕ ДЕНЬГИ (ПРОГНОЗ ДО КОНЦА МЕСЯЦА): " + forecast.toFixed(0) + " грн</b>\n\n";
  
  var allGood = true;
  for (var cat in budget.limits) {
    var lim = budget.limits[cat];
    var sp = spent[cat] || 0;
    var left = lim - sp;
    
    var dailySafe = left > 0 ? Math.floor(left / daysLeft) : 0;
    var percentage = Math.floor((sp / lim) * 100);
    
    var status = "🟢";
    if (percentage > 80) status = "🟡";
    if (percentage >= 100) { status = "🔴"; allGood = false; }
    
    body += status + " <b>" + cat + "</b>: <code>" + sp.toFixed(0) + " / " + lim + " (" + percentage + "%)</code>\n";
    if (left > 0) body += "   Остаток: <code>" + left.toFixed(0) + " грн</code> | В день: <code>" + dailySafe + " грн</code>\n";
    else body += "   <i>Лимит превышен!</i>\n";
  }
  
  if (Object.keys(budget.limits).length === 0) {
    body += "⚠️ <i>Лимиты не заданы. Заполните вкладку Finance_Budget.</i>\n";
  }
  
  // Проверка обязательных платежей
  var upcomingMandatory = [];
  budget.mandatory.forEach(function(item) {
    if (item.day >= now.getDate() && item.day <= now.getDate() + 5) {
      upcomingMandatory.push(item);
    }
  });
  
  if (upcomingMandatory.length > 0) {
    body += "\n⚠️ <b>Ближайшие обязательные платежи:</b>\n";
    upcomingMandatory.forEach(function(item) {
      body += "🔹 " + item.desc + ": " + item.amount + " грн (" + item.day + "-го числа)\n";
    });
  }
  
  var footer = null;
  if (forecast < 0) {
    footer = "🚨 ТРЕВОГА! Прогноз свободных денег меньше нуля. Тебе не хватит ожидаемых доходов, чтобы покрыть все обязательства и лимиты!";
  } else if (freeMoney < 0 && income.thisMonth > 0) {
    footer = "⚠️ Внимание: Сейчас на карте дефицит, нужно дождаться поступлений для безопасных трат.";
  } else if (!allGood) {
    footer = "❌ Внимание! Есть пробитые лимиты. Включай режим экономии.";
  }
  
  if (typeof aresFormatMessage === 'function') {
    return aresFormatMessage("ФИНАНСОВАЯ СВОДКА", "📊", body, footer);
  } else {
    return "📊 <b>ФИНАНСОВАЯ СВОДКА</b>\n\n" + body + (footer ? "\n\n<i>" + footer + "</i>" : "");
  }
}

function _generatePurchaseAdvice(itemName, cost) {
  var budget = _getFinanceBudget();
  var spent = _getSpentThisMonthByCategory();
  var currentBalance = _getCurrentBalance();
  
  var CUSHION = 3000;
  var requiredAmount = cost + CUSHION;
  
  // Создаем базовый прогноз без покупки
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  var daysInThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  var fullLimitsSum = 0;
  for (var cat in budget.limits) {
    fullLimitsSum += budget.limits[cat];
  }
  var dailyBurnThisMonth = fullLimitsSum / daysInThisMonth;
  
  var nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  var nextMonth = nextMonthDate.getMonth();
  var nextMonthYear = nextMonthDate.getFullYear();
  var daysInNextMonth = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
  var dailyBurnNextMonth = fullLimitsSum / daysInNextMonth;

  // Load expected income array
  var expectedIncomeArr = [];
  if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
    var ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    var sheet = ss.getSheetByName('Finance_Expected');
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var rawDate = data[i][2];
        if (!rawDate) continue;
        var expectedDate;
        if (typeof rawDate === 'string' && rawDate.indexOf('.') !== -1) {
          var parts = String(rawDate).split('.');
          if (parts.length >= 3) expectedDate = new Date(parts[2], parts[1]-1, parts[0]);
        } else {
          expectedDate = new Date(rawDate);
        }
        if (!isNaN(expectedDate.getTime())) {
           var uahAmount = parseFloat(data[i][4]) || 0;
           var status = data[i][5] ? String(data[i][5]).trim().toLowerCase() : '';
           if (uahAmount > 0 && status === 'активен') {
             expectedIncomeArr.push({ date: expectedDate, amount: uahAmount, client: data[i][1] });
           }
        }
      }
    }
  }

  // Baseline array
  var dailyBalances = [];
  var simBalance = currentBalance;
  var simDate = new Date(currentYear, currentMonth, now.getDate());
  var endDate = new Date(currentYear + 1, currentMonth, 0); // Прогноз на 12 месяцев вперед
  
  while (simDate <= endDate) {
    var d = simDate.getDate();
    var m = simDate.getMonth();
    var y = simDate.getFullYear();
    
    // Daily burn
    var burn = (m === currentMonth) ? dailyBurnThisMonth : dailyBurnNextMonth;
    simBalance -= burn;
    
    // Mandatory payments
    budget.mandatory.forEach(function(item) {
      if (item.day === d) {
        simBalance -= item.amount;
      }
    });
    
    // Expected Incomes (recurring)
    expectedIncomeArr.forEach(function(inc) {
      if (inc.date.getDate() === d && simDate.getTime() >= new Date(inc.date.getFullYear(), inc.date.getMonth(), inc.date.getDate()).getTime()) {
        simBalance += inc.amount;
      }
    });
    
    dailyBalances.push({ date: new Date(simDate), balance: simBalance });
    simDate.setDate(simDate.getDate() + 1);
  }
  
  var safeDate = null;
  for (var i = 0; i < dailyBalances.length; i++) {
    var isSafe = true;
    var maxLookahead = Math.min(dailyBalances.length, i + 15); // Смотрим на 14 дней вперед от даты покупки
    for (var j = i; j < maxLookahead; j++) {
      if ((dailyBalances[j].balance - cost) < CUSHION) {
        isSafe = false;
        break;
      }
    }
    if (isSafe) {
      safeDate = dailyBalances[i].date;
      break;
    }
  }

  var body = "";
  body += "💰 Текущий баланс: <code>" + currentBalance.toFixed(0) + " грн</code>\n";
  body += "🏷 Стоимость: <code>" + cost + " грн</code>\n\n";

  var footer = null;

  if (safeDate) {
    var isToday = (safeDate.getDate() === now.getDate() && safeDate.getMonth() === now.getMonth() && safeDate.getFullYear() === now.getFullYear());
    if (isToday) {
      body += "🟢 <b>МОЖЕШЬ БРАТЬ ПРЯМО СЕЙЧАС</b>\n";
      body += "После покупки у тебя останется безопасный запас средств, и кассовых разрывов в будущем не предвидится.";
    } else {
      var safeDateStr = ("0" + safeDate.getDate()).slice(-2) + "." + ("0" + (safeDate.getMonth() + 1)).slice(-2);
      body += "⏳ <b>ПОКУПКУ ЛУЧШЕ ОТЛОЖИТЬ</b>\n";
      body += "Безопасная дата покупки: <code>" + safeDateStr + "</code>\n";
      body += "К этому моменту на карте накопится достаточно средств для комфортной покупки без риска остаться на мели.";
    }
  } else {
    body += "❌ <b>ПОКА ПОКУПКА НЕ БЕЗОПАСНА</b>\n";
    body += "Даже в ближайшие 12 месяцев у тебя не накопится достаточно средств, чтобы сделать эту покупку и сохранить финансовую подушку. Требуется доп. заработок!";
  }

  if (typeof aresFormatMessage === 'function') {
    return aresFormatMessage("АНАЛИЗ ПОКУПКИ: " + String(itemName).toUpperCase(), "🤔", body, footer);
  } else {
    return "🤔 <b>АНАЛИЗ ПОКУПКИ: " + String(itemName).toUpperCase() + "</b>\n\n" + body;
  }
}

function _forecastBalanceOnDate(targetDateStr) {
  var targetDate;
  var parts = String(targetDateStr).split('.');
  if (parts.length === 3) {
    targetDate = new Date(parts[2], parts[1]-1, parts[0]);
  } else {
    targetDate = new Date(targetDateStr);
  }
  
  if (isNaN(targetDate.getTime())) {
    return "❌ Ошибка парсинга даты: " + targetDateStr + ". Формат должен быть DD.MM.YYYY.";
  }

  var budget = _getFinanceBudget();
  var spent = _getSpentThisMonthByCategory();
  var currentBalance = _getCurrentBalance();
  
  var targetDateFormatted = ("0" + targetDate.getDate()).slice(-2) + "." + ("0" + (targetDate.getMonth() + 1)).slice(-2);
  
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  var daysInThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  var fullLimitsSum = 0;
  for (var cat in budget.limits) {
    fullLimitsSum += budget.limits[cat];
  }
  var dailyBurnThisMonth = fullLimitsSum / daysInThisMonth;
  
  var nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  var nextMonth = nextMonthDate.getMonth();
  var nextMonthYear = nextMonthDate.getFullYear();
  var daysInNextMonth = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
  var dailyBurnNextMonth = fullLimitsSum / daysInNextMonth;

  // Load expected income array
  var expectedIncomeArr = [];
  if (typeof ADS_DATA_SHEET_ID !== 'undefined') {
    var ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
    var sheet = ss.getSheetByName('Finance_Expected');
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var rawDate = data[i][2];
        if (!rawDate) continue;
        var expectedDate;
        if (typeof rawDate === 'string' && rawDate.indexOf('.') !== -1) {
          var parts = String(rawDate).split('.');
          if (parts.length >= 3) expectedDate = new Date(parts[2], parts[1]-1, parts[0]);
        } else {
          expectedDate = new Date(rawDate);
        }
        if (!isNaN(expectedDate.getTime())) {
           var uahAmount = parseFloat(data[i][4]) || 0;
           var status = data[i][5] ? String(data[i][5]).trim().toLowerCase() : '';
           if (uahAmount > 0 && status === 'активен') {
             expectedIncomeArr.push({ date: expectedDate, amount: uahAmount, client: data[i][1] });
           }
        }
      }
    }
  }

  var simBalance = currentBalance;
  var simDate = new Date(currentYear, currentMonth, now.getDate());
  
  if (targetDate < simDate) {
    return "❌ Эта дата в прошлом. Я могу прогнозировать только будущее.";
  }

  var periodIncomes = [];
  var periodMands = [];
  var totalBurn = 0;

  while (simDate <= targetDate) {
    var d = simDate.getDate();
    var m = simDate.getMonth();
    var y = simDate.getFullYear();
    
    // Daily burn
    var burn = (m === currentMonth) ? dailyBurnThisMonth : dailyBurnNextMonth;
    simBalance -= burn;
    totalBurn += burn;
    
    // Mandatory payments
    budget.mandatory.forEach(function(item) {
      if (item.day === d) {
        simBalance -= item.amount;
        periodMands.push({ desc: item.desc, amount: item.amount, dateStr: ("0" + d).slice(-2) + "." + ("0" + (m + 1)).slice(-2) });
      }
    });
    
    // Expected Incomes (recurring)
    expectedIncomeArr.forEach(function(inc) {
      if (inc.date.getDate() === d && simDate.getTime() >= new Date(inc.date.getFullYear(), inc.date.getMonth(), inc.date.getDate()).getTime()) {
        simBalance += inc.amount;
        periodIncomes.push({ desc: inc.client, amount: inc.amount, dateStr: ("0" + d).slice(-2) + "." + ("0" + (m + 1)).slice(-2) });
      }
    });
    
    simDate.setDate(simDate.getDate() + 1);
  }
  
  var body = "";
  body += "💰 Текущий баланс: <code>" + currentBalance.toFixed(0) + " грн</code>\n";
  body += "🔮 Ожидаемый баланс: <code>" + simBalance.toFixed(0) + " грн</code>\n\n";
  
  body += "📉 <b>БУДЕТ ПОТРАЧЕНО:</b>\n";
  body += "🔹 Ежедневные лимиты: <code>-" + totalBurn.toFixed(0) + " грн</code>\n";
  
  var groupedMands = {};
  periodMands.forEach(function(m) {
    if (!groupedMands[m.desc]) groupedMands[m.desc] = { count: 0, amount: 0, date: m.dateStr };
    groupedMands[m.desc].count++;
    groupedMands[m.desc].amount += m.amount;
  });
  for (var key in groupedMands) {
    var g = groupedMands[key];
    var label = g.count > 1 ? key + " (" + g.count + " раз)" : key + " (" + g.date + ")";
    body += "🔹 " + label + ": <code>-" + g.amount.toFixed(0) + " грн</code>\n";
  }
  
  if (periodIncomes.length > 0) {
    body += "\n📈 <b>ОЖИДАЕМЫЕ ДОХОДЫ:</b>\n";
    var groupedIncs = {};
    periodIncomes.forEach(function(inc) {
      if (!groupedIncs[inc.desc]) groupedIncs[inc.desc] = { count: 0, amount: 0, date: inc.dateStr };
      groupedIncs[inc.desc].count++;
      groupedIncs[inc.desc].amount += inc.amount;
    });
    for (var key in groupedIncs) {
      var g = groupedIncs[key];
      var label = g.count > 1 ? key + " (" + g.count + " раз)" : key + " (" + g.date + ")";
      body += "🔹 " + label + ": <code>+" + g.amount.toFixed(0) + " грн</code>\n";
    }
  }
  
  if (typeof aresFormatMessage === 'function') {
    return aresFormatMessage("ПРОГНОЗ БАЛАНСА НА " + targetDateFormatted, "📅", body);
  } else {
    return "📅 <b>ПРОГНОЗ БАЛАНСА НА " + targetDateFormatted + "</b>\n\n" + body;
  }
}

// ==============================================================================
// 🧠 БЛОК 3: ИНТЕРФЕЙС РОУТЕРА (LLM - v10 Architecture)
// ==============================================================================

function getFinanceIntent() {
  var custom = getModuleSetting('finance', 'customPrompt', '');
  if (custom && custom.length > 10) return custom;
  
  return `MODE: FINANCE MODULE (Финансы)
Ты Senior Financial Advisor Ареса.
Твоя задача — проанализировать финансовый запрос пользователя и отдать команду.`;
}

function getFinanceProtocols() {
  return `ОБЯЗАТЕЛЬНОЕ ПРАВИЛО (JSON Chain of Thought):
Ты должен отвечать СТРОГО одним JSON-тегом в самом начале ответа. Внутри JSON обязательно используй поле "_thought" для своих рассуждений. Никакого обычного текста вне тега!

ВАЖНО: Игнорируй формат предыдущих сообщений. Возвращай только один тег, начинающийся с [[ и заканчивающийся на ]].`;
}

function getFinanceContext(userText, history) {
  let lowerText = userText.toLowerCase();
  
  // Если пользователь явно просит сводку, мы обходим LLM и выдаем её мгновенно
  var isSummaryReq = (lowerText.includes('сводка') || lowerText.includes('бюджет') || lowerText.includes('мои финансы'));
  var isForecastReq = (lowerText.includes('какой') || lowerText.includes('когда') || lowerText.includes('будет'));
  
  if (isSummaryReq && !isForecastReq) {
    sysLog("🐛 [DEBUG]: [FINANCE] Хард-триггер сводки сработал.", MY_ID);
    return generateFinanceMorningSummary() + "\n\n[[HARD_RESPONSE]]";
  }
  
  return "";
}

function handleFinanceResponse(aresResponse, payload, input, parsedTags) {
  if (parsedTags && parsedTags.length > 0) {
    for (var i = 0; i < parsedTags.length; i++) {
      var tag = parsedTags[i];
      if (tag.name === 'FINANCE_SUMMARY') {
        return generateFinanceMorningSummary();
      } else if (tag.name === 'FINANCE_FORECAST') {
        return _forecastBalanceOnDate(tag.payload.date);
      } else if (tag.name === 'FINANCE_ADVICE') {
        var cost = parseFloat(tag.payload.cost);
        if (isNaN(cost) || cost <= 0) {
          return "🤔 Для оценки покупки мне нужно знать её цену. Напиши, например: «Могу ли я купить " + tag.payload.item + " за 1500 грн?»";
        }
        return _generatePurchaseAdvice(tag.payload.item, cost);
      } else if (tag.name === 'MONOBANK_SETUP') {
        var setupResult = setMonobankWebhook();
        sysLog('💳 [FINANCE] Пользователь запросил обновление вебхука Monobank.');
        return setupResult;
      } else if (tag.name === 'NO_ACTION') {
        // Fall through
      }
    }
  }

  // Fallback для старых форматов
  var summaryMatch = aresResponse.match(/\[\[FINANCE_SUMMARY:\s*(\{.*?\})\s*\]\]/is);
  if (summaryMatch || aresResponse.includes('[[FINANCE_SUMMARY')) {
    return generateFinanceMorningSummary();
  }

  var forecastMatch = aresResponse.match(/\[\[FINANCE_FORECAST:\s*(\{.*?\})\s*\]\]/is);
  if (forecastMatch) {
    try {
      var data = JSON.parse(forecastMatch[1]);
      return _forecastBalanceOnDate(data.date);
    } catch(e) {
      sysLog("⚠️ [WARNING]: [PARSE_ERROR] Ошибка парсинга FINANCE_FORECAST JSON.");
    }
  }

  var adviceMatch = aresResponse.match(/\[\[FINANCE_ADVICE:\s*(\{.*?\})\s*\]\]/is);
  if (adviceMatch) {
    try {
      var data = JSON.parse(adviceMatch[1]);
      var cost = parseFloat(data.cost);
      if (isNaN(cost) || cost <= 0) {
        return "🤔 Для оценки покупки мне нужно знать её цену. Напиши, например: «Могу ли я купить " + data.item + " за 1500 грн?»";
      }
      return _generatePurchaseAdvice(data.item, cost);
    } catch(e) {
      sysLog("⚠️ [WARNING]: [PARSE_ERROR] Ошибка парсинга FINANCE_ADVICE JSON.");
    }
  }

  var monobankMatch = aresResponse.match(/\[\[MONOBANK_SETUP/is);
  if (monobankMatch) {
    var setupResult = setMonobankWebhook();
    sysLog('💳 [FINANCE] Пользователь запросил обновление вебхука Monobank.');
    return setupResult;
  }

  var oldAdviceMatch = aresResponse.match(/\[\[FINANCE_ADVICE:\s*(.*?)\s*\|\s*([\d\.\s]*)[^\]]*\]\]/);
  if (oldAdviceMatch) {
    var item = oldAdviceMatch[1];
    var costStr = oldAdviceMatch[2] ? oldAdviceMatch[2].replace(/\s/g, '') : '';
    var cost = parseFloat(costStr);
    if (isNaN(cost) || cost <= 0) {
      return "🤔 Для оценки покупки мне нужно знать её цену. Напиши, например: «Могу ли я купить " + item + " за 1500 грн?»";
    }
    return _generatePurchaseAdvice(item, cost);
  }
  
  var oldForecastMatch = aresResponse.match(/\[\[FINANCE_FORECAST:\s*(.*?)\]\]/);
  if (oldForecastMatch) {
    return _forecastBalanceOnDate(oldForecastMatch[1].trim());
  }

  var cleanResponse = aresResponse.replace(/\[\[NO_ACTION.*?\]\]/gi, '').trim();
  return cleanResponse || "Финансовый модуль: Запрос не распознан. Спроси сводку или могу ли купить X за Y.";
}

// ==============================================================================
// 📥 БЛОК 3: WEBHOOKS И ИНТЕГРАЦИИ (CRM)
// ==============================================================================

function handleCRMWebhook(json) {
  if (typeof ADS_DATA_SHEET_ID === 'undefined') return;
  var ss = SpreadsheetApp.openById(ADS_DATA_SHEET_ID);
  var sheet = ss.getSheetByName('Finance_Expected');
  if (!sheet) {
    sysLog("Лист Finance_Expected не найден. Запустите Setup_Finance.");
    return;
  }
  
  var clientId = String(json.data.clientId);
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === clientId) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (json.type === 'CRM_ExpectedIncome_Delete') {
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
      if (typeof MY_ID !== 'undefined') {
        sendText(MY_ID, "❌ <b>CRM:</b> Ожидаемый доход от клиента <b>" + json.data.client + "</b> отменен/удален.", "HTML");
      }
    }
    return;
  }
  
  if (json.type === 'CRM_ExpectedIncome') {
    var rowData = [
      clientId,
      json.data.client || "Неизвестно",
      json.data.expectedDate || "",
      json.data.amountUSD || 0,
      json.data.amountUAH || 0,
      json.data.status || "",
      json.data.lastPaymentDate || ""
    ];
    
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, 7).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    
    if (typeof MY_ID !== 'undefined') {
      sendText(MY_ID, "💵 <b>CRM:</b> Ожидается оплата от <b>" + rowData[1] + "</b>\nСумма: <b>" + rowData[4] + " грн</b> ($" + rowData[3] + ")\nДата: " + rowData[2], "HTML");
    }
  }
}

// ==============================================================================
// 🛠 БЛОК 4: РЕГИСТРАЦИЯ
// ==============================================================================
if (typeof registerModule !== 'undefined') {
  registerModule({
    name:     'finance',
    installFn: 'ARES_INSTALL_FINANCE',
    enabled:  true,
    triggers: ['финансы', 'бюджет', 'деньги', 'баланс', 'траты', 'купить', 'куплю', 'покупк', 'монобанк', 'monobank'],
    priority: 85, 
    sessionTimeout: 3, 
    promptIntentFn: 'getFinanceIntent',
    promptProtocolsFn: 'getFinanceProtocols',
    contextFn: 'getFinanceContext',
    handler: 'handleFinanceResponse',
    allowedProtocols: ['[[FINANCE_ADVICE:', '[[FINANCE_FORECAST:', '[[FINANCE_SUMMARY:', '[[NO_ACTION:', '[[MONOBANK_SETUP:'],
    protocols: [
      { tag: '[[FINANCE_ADVICE:', handler: 'handleFinanceResponse', desc: 'Запрос на покупку: [[FINANCE_ADVICE: {"item": "название", "cost": 1000, "_thought": "рассуждения"}]]' },
      { tag: '[[FINANCE_FORECAST:', handler: 'handleFinanceResponse', desc: 'Прогноз баланса: [[FINANCE_FORECAST: {"date": "DD.MM.YYYY", "_thought": "рассуждения"}]]' },
      { tag: '[[FINANCE_SUMMARY:', handler: 'handleFinanceResponse', desc: 'Сводка финансов: [[FINANCE_SUMMARY: {"_thought": "рассуждения"}]]' },
      { tag: '[[MONOBANK_SETUP:', handler: 'handleFinanceResponse', desc: 'Пользователь просит починить или настроить вебхук монобанка: [[MONOBANK_SETUP: {"_thought": "рассуждения"}]]' },
      { tag: '[[NO_ACTION:', handler: 'handleFinanceResponse', desc: 'Просто болтовня: [[NO_ACTION: {"_thought": "рассуждения"}]]' }
    ],
    morningCard: 'generateFinanceMorningSummary',
    morningOrder: 40,
    intentsSchema: {
      '[[FINANCE_ADVICE:': {
        "item": "название",
        "cost": 0,
        "_thought": "расчёты"
      },
      '[[FINANCE_FORECAST:': {
        "date": "DD.MM.YYYY",
        "_thought": "расчёты"
      },
      '[[MONOBANK_SETUP:': {
        "_thought": "пользователь просит обновить монобанк"
      }
    },
    settings: [
      { key: 'customPrompt', label: 'Системный Промпт', type: 'textarea', default: '', group: 'Промпты' },
      { key: 'sheetId', label: 'ID таблицы Google Sheets (пусто = по умолчанию)', type: 'text', default: '', group: 'Основные Настройки' },
      { key: 'logSheet', label: 'Лист логов транзакций', type: 'text', default: 'Finance_Log', group: 'Основные Настройки' },
      { key: 'budgetSheet', label: 'Лист бюджета', type: 'text', default: 'Finance_Budget', group: 'Основные Настройки' },
      { key: 'mccSheet', label: 'Лист MCC-маппинга', type: 'text', default: 'Finance_MCC_Mapping', group: 'Основные Настройки' },
      { key: 'col_date', label: 'Колонка: Дата (буква)', type: 'text', default: 'A', group: 'Таблица: Логи транзакций' },
      { key: 'col_amount', label: 'Колонка: Сумма', type: 'text', default: 'B', group: 'Таблица: Логи транзакций' },
      { key: 'col_cat', label: 'Колонка: Категория', type: 'text', default: 'C', group: 'Таблица: Логи транзакций' },
      { key: 'col_desc', label: 'Колонка: Описание', type: 'text', default: 'D', group: 'Таблица: Логи транзакций' },
      { key: 'col_bal', label: 'Колонка: Баланс', type: 'text', default: 'E', group: 'Таблица: Логи транзакций' },
      { key: 'col_mcc', label: 'Колонка: MCC', type: 'text', default: 'F', group: 'Таблица: Логи транзакций' },
      { key: 'col_id', label: 'Колонка: ID', type: 'text', default: 'G', group: 'Таблица: Логи транзакций' },
      
      { key: 'col_budget_month', label: 'Колонка: Месяц', type: 'text', default: 'A', group: 'Таблица: Бюджет' },
      { key: 'col_budget_cat', label: 'Колонка: Категория', type: 'text', default: 'B', group: 'Таблица: Бюджет' },
      { key: 'col_budget_limit', label: 'Колонка: Лимит', type: 'text', default: 'C', group: 'Таблица: Бюджет' },
      { key: 'col_budget_spent', label: 'Колонка: Потрачено', type: 'text', default: 'D', group: 'Таблица: Бюджет' },
      { key: 'col_budget_rem', label: 'Колонка: Остаток', type: 'text', default: 'E', group: 'Таблица: Бюджет' },
      
      { key: 'col_map_mcc', label: 'Колонка: MCC Код', type: 'text', default: 'A', group: 'Таблица: MCC-маппинг' },
      { key: 'col_map_cat', label: 'Колонка: Категория', type: 'text', default: 'B', group: 'Таблица: MCC-маппинг' }
    ]
  });
}

// ==============================================================================
// 🚀 INSTALLER
// ==============================================================================

function ARES_INSTALL_FINANCE(ss) {
  Logger.log("🛠️ Установка таблиц модуля Финансов...");
  
  // 1. Finance_Log
  let logSheet = ss.getSheetByName('Finance_Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('Finance_Log');
    logSheet.appendRow(['Date', 'Amount', 'Category', 'Description', 'Balance', 'Raw_MCC']);
    logSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Finance_Log");
  } else {
    Logger.log("ℹ️ Лист Finance_Log уже существует.");
  }
  
  // 2. Finance_Budget
  let budgetSheet = ss.getSheetByName('Finance_Budget');
  if (!budgetSheet) {
    budgetSheet = ss.insertSheet('Finance_Budget');
    budgetSheet.appendRow(['Item', 'Amount', 'Type (Limit/Mandatory)', 'Day of Month', 'Is Active']);
    budgetSheet.appendRow(['Продукты', 15000, 'Limit', '', 'yes']);
    budgetSheet.appendRow(['Развлечения', 5000, 'Limit', '', 'yes']);
    budgetSheet.appendRow(['Транспорт', 3000, 'Limit', '', 'yes']);
    budgetSheet.appendRow(['Коммуналка', 1500, 'Mandatory', 10, 'yes']);
    budgetSheet.appendRow(['Spotify', 200, 'Mandatory', 15, 'yes']);
    budgetSheet.appendRow(['Алименты', 5000, 'Mandatory', 5, 'yes']);
    budgetSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Finance_Budget");
  } else {
    Logger.log("ℹ️ Лист Finance_Budget уже существует.");
  }
  
  // 3. Finance_MCC_Mapping
  let mccSheet = ss.getSheetByName('Finance_MCC_Mapping');
  if (!mccSheet) {
    mccSheet = ss.insertSheet('Finance_MCC_Mapping');
    mccSheet.appendRow(['Raw_MCC', 'Category']);
    mccSheet.appendRow(['4829', 'Переводы']);
    mccSheet.appendRow(['5411', 'Продукты']);
    mccSheet.appendRow(['4121', 'Транспорт']);
    mccSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Finance_MCC_Mapping");
  } else {
    Logger.log("ℹ️ Лист Finance_MCC_Mapping уже существует.");
  }
  
  // 4. Finance_Expected
  let expectedSheet = ss.getSheetByName('Finance_Expected');
  if (!expectedSheet) {
    expectedSheet = ss.insertSheet('Finance_Expected');
    expectedSheet.appendRow(['Client ID', 'Client Name', 'Expected Date', 'Amount USD', 'Amount UAH', 'Status', 'Last Payment Date']);
    expectedSheet.getRange("A1:G1").setFontWeight("bold").setBackground("#D3D3D3");
    Logger.log("✅ Создан лист: Finance_Expected");
  } else {
    Logger.log("ℹ️ Лист Finance_Expected уже существует.");
  }
}

/**
 * Функция для регистрации вебхука в Monobank
 */
function setMonobankWebhook() {
  const MONO_TOKEN = 'uj1yxHqWP-jU04JAa81lbyY8ALXFya_Era3UZ0E_d2bg';
  
  if (typeof WEB_APP_URL === 'undefined') {
    Logger.log("Ошибка: не найден WEB_APP_URL. Разверните веб-приложение и укажите URL.");
    return "❌ Ошибка: не найден WEB_APP_URL. Разверните веб-приложение и укажите URL.";
  }

  const payload = {
    "webHookUrl": WEB_APP_URL
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "X-Token": MONO_TOKEN
    },
    "payload": JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch("https://api.monobank.ua/personal/webhook", options);
    Logger.log("✅ Вебхук успешно установлен в Monobank: " + response.getContentText());
    return "✅ Вебхук успешно установлен!\nОтвет Monobank: " + response.getContentText();
  } catch (e) {
    Logger.log("❌ Ошибка установки вебхука: " + e.message);
    return "❌ Ошибка установки вебхука: " + e.message;
  }
}
