// ui.js — Отрисовка интерфейса и работа с DOM

window.toggleMobileMenu = function() {
    const menu = document.getElementById('mobile-menu');
    const backdrop = document.getElementById('mobile-backdrop');
    if (menu.classList.contains('-translate-x-full')) { menu.classList.remove('-translate-x-full'); backdrop.classList.remove('hidden'); }
    else { menu.classList.add('-translate-x-full'); backdrop.classList.add('hidden'); }
};

window.setSort = function(type) {
    currentSort = type;
    document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
    document.getElementById(`btn-sort-${type}`).classList.add('active');
    renderAllGrids();
}

window.renderAllGrids = function() {
    const sortData = (list) => {
        const cloned = [...list];
        if (currentSort === 'amount') return cloned.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
        else if (currentSort === 'date') return cloned.sort((a, b) => (a.date ? new Date(a.date).getTime() : Infinity) - (b.date ? new Date(b.date).getTime() : Infinity));
        else if (currentSort === 'cohort') return cloned.sort((a, b) => (COHORT_MAP[getClientLogic(a).cohort]?.weight || 10) - (COHORT_MAP[getClientLogic(b).cohort]?.weight || 10));
        return cloned.sort((a, b) => b.id - a.id);
    };
    renderClientsGrid(sortData(clientsData.filter(c => !c.archived)), 'clients-grid', false);
    renderClientsGrid(sortData(clientsData.filter(c => c.archived)), 'archive-grid', true);
};

window.renderClientsGrid = function(data, gridId, isArchive) {
    const grid = document.getElementById(gridId); if (!grid) return;
    grid.innerHTML = data.length === 0 ? `<div class="col-span-full py-20 text-center opacity-20 uppercase font-bold text-[10px]">Пусто</div>` : 
    data.map(c => {
        const logic = getClientLogic(c); const style = getStatusStyle(logic.color); const cohort = COHORT_MAP[logic.cohort];
        return `
        <div onclick="openClientProfile('${c.id}')" class="card-glow glass rounded-[2.5rem] p-6 pt-12 border cursor-pointer relative animate-fade-in ${logic.overdue ? 'overdue-pulse' : ''}" style="background: linear-gradient(180deg, ${style.bg} 0%, rgba(10, 10, 15, 0.98) 100%); border-color: ${style.border}88; box-shadow: 0 10px 30px -15px ${style.glow};">
            ${logic.churnRisk && !isArchive ? `<div class="risk-alert">РИСК УХОДА</div>` : ''}
            <div class="absolute top-4 right-4 flex gap-1.5 z-10">
                ${!isArchive ? `<button onclick="event.stopPropagation(); quickPayment('${c.id}')" class="quick-action-btn"><i data-lucide="check" class="w-3.5 h-3.5"></i></button><button onclick="event.stopPropagation(); quickPause('${c.id}')" class="quick-action-btn"><i data-lucide="pause" class="w-3.5 h-3.5"></i></button><button onclick="event.stopPropagation(); showDeleteModal('${c.id}', false)" class="quick-action-btn"><i data-lucide="archive" class="w-3.5 h-3.5"></i></button>` : `<button onclick="event.stopPropagation(); restoreClient('${c.id}')" class="quick-action-btn"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i></button><button onclick="event.stopPropagation(); showDeleteModal('${c.id}', true)" class="quick-action-btn"><i data-lucide="trash-2" class="w-3.5 h-3.5 text-red-500"></i></button>`}
            </div>
            <div class="flex flex-col items-center">
                <div class="relative mb-6 mt-2"><img src="${c.img || 'https://ui-avatars.com/api/?name=User&background=333&color=fff'}" class="w-24 h-24 rounded-full border-2 border-white/20 object-cover shadow-2xl"></div>
                <h4 class="text-white font-bold text-base text-center truncate w-full mb-0.5">${c.name}</h4>
                <span class="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2 block truncate w-full text-center opacity-80">${c.role || '—'}</span>
                <div class="cohort-badge ${cohort.color} mb-3">${cohort.label}</div>
                <div class="flex flex-col items-center gap-1"><span class="text-[9px] font-bold tracking-widest uppercase" style="color: ${style.border}">${logic.label}</span>${logic.nextDateStr !== '—' && logic.nextDateStr !== 'Проект' ? `<span class="text-[8px] text-white opacity-50 font-extrabold uppercase tracking-widest">След: ${logic.nextDateStr}</span>` : ''}</div>
                ${c.amount ? `<span class="text-[9px] text-gray-400 font-bold mt-2 opacity-60">$${c.amount} / мес</span>` : ''}
            </div>
        </div>`;
    }).join(''); lucide.createIcons();
};

window.updateAnalytics = function() {
    const now = new Date(); const currentMonthYear = now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalActualReceived = 0, totalOverdue = 0, forecastRevenue = 0; 
    let retainerTotal = 0, extraTotal = 0;
    let extraRevenueThisMonth = 0;
    let retainerRevenueThisMonth = 0;
    const flowHistory = {}; const topClients = [];
    
    clientsData.forEach(c => {
        const logic = getClientLogic(c); const amt = parseFloat(c.amount) || 0; let clientFactSum = 0;
        if (c.history) {
            c.history.forEach(h => {
                const dateParts = h.date.split(',')[0].split('.');
                if(dateParts.length === 3) {
                    const pDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[1])-1, parseInt(dateParts[0]));
                    const mKey = pDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
                    
                    const ext = h.text.match(/\$(\d+(?:\.\d+)?)/); 
                    const val = ext ? parseFloat(ext[1]) : amt;

                    if (h.text.includes('Платеж получен')) {
                        clientFactSum += val; 
                        totalActualReceived += val; 
                        flowHistory[mKey] = (flowHistory[mKey] || 0) + val;

                        if (h.text.includes('(Доп)')) {
                            extraTotal += val;
                        } else {
                            retainerTotal += val;
                        }
                    }

                    if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
                        if (h.text.includes('(Доп)')) {
                            extraRevenueThisMonth += val;
                        } else if (h.text.includes('Платеж получен')) {
                            retainerRevenueThisMonth += val;
                        }
                    }
                }
            });
        }
        topClients.push({ name: c.name, sum: clientFactSum });
        if (!c.archived && c.status === 'Активен') {
            if (logic.overdue) totalOverdue += amt;
            if (logic.dueDateObj && logic.dueDateObj.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }) === currentMonthYear && c.recurring !== false) forecastRevenue += amt;
        }
    });

    document.getElementById('stat-total-revenue').innerText = `$${totalActualReceived.toLocaleString()}`;
    const breakdownEl = document.getElementById('revenue-breakdown');
    if (breakdownEl) {
        breakdownEl.innerHTML = `
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-cyan-400"></div> <span>Ведение: $${retainerTotal.toLocaleString()}</span></div>
            <div class="flex items-center gap-2 text-purple-400"><div class="w-2 h-2 rounded-full bg-purple-400"></div> <span>Доп. услуги: $${extraTotal.toLocaleString()}</span></div>
        `;
    }

    document.getElementById('stat-forecast-revenue').innerText = `$${forecastRevenue.toLocaleString()}`;
    document.getElementById('stat-overdue-revenue').innerText = `$${totalOverdue.toLocaleString()}`;
    
    const activeCountEl = document.getElementById('stat-active-count');
    if (activeCountEl) {
        activeCountEl.innerText = clientsData.filter(c => !c.archived && c.status === 'Активен').length;
    }

    const monthlyTotalRevenue = retainerRevenueThisMonth + extraRevenueThisMonth;
    const upsellPower = monthlyTotalRevenue > 0 ? (extraRevenueThisMonth / monthlyTotalRevenue) * 100 : 0;
    
    const upsellPercentEl = document.getElementById('stat-upsell-percent');
    if (upsellPercentEl) upsellPercentEl.innerText = `${Math.round(upsellPower)}%`;

    const barRetainerEl = document.getElementById('bar-retainer');
    const barUpsellEl = document.getElementById('bar-upsell');
    if (barRetainerEl && barUpsellEl) {
        const retainerPct = monthlyTotalRevenue > 0 ? (retainerRevenueThisMonth / monthlyTotalRevenue) * 100 : 100;
        const upsellPct = monthlyTotalRevenue > 0 ? (extraRevenueThisMonth / monthlyTotalRevenue) * 100 : 0;
        barRetainerEl.style.width = `${retainerPct}%`;
        barUpsellEl.style.width = `${upsellPct}%`;
    }

    const upsellExtraSumEl = document.getElementById('stat-upsell-extra-sum');
    if (upsellExtraSumEl) {
        upsellExtraSumEl.innerText = `$${extraRevenueThisMonth.toLocaleString()} за доп. услуги в этом месяце`;
    }

    let activeClientsForecastSum = 0;
    clientsData.forEach(c => {
        if (!c.archived && c.status === 'Активен') {
            activeClientsForecastSum += parseFloat(c.amount) || 0;
        }
    });

    let maxConcentrationClient = null;
    let maxConcentrationPct = 0;
    let hasConcentrationRisk = false;

    if (activeClientsForecastSum > 0) {
        clientsData.forEach(c => {
            if (!c.archived && c.status === 'Активен') {
                const amt = parseFloat(c.amount) || 0;
                const pct = (amt / activeClientsForecastSum) * 100;
                if (pct > maxConcentrationPct) {
                    maxConcentrationPct = pct;
                    maxConcentrationClient = c;
                }
            }
        });
        if (maxConcentrationPct > 25) {
            hasConcentrationRisk = true;
        }
    }

    const riskContainer = document.getElementById('risk-insight-container');
    const riskText = document.getElementById('risk-insight-text');
    const riskIconContainer = document.getElementById('risk-insight-icon-container');
    
    if (riskContainer && riskText) {
        if (hasConcentrationRisk && maxConcentrationClient) {
            riskText.innerText = `⚠️ Высокая зависимость от клиента ${maxConcentrationClient.name}: ${maxConcentrationPct.toFixed(1)}%`;
            riskText.className = "text-xs font-bold uppercase tracking-wider text-red-400";
            riskContainer.className = "glass rounded-3xl p-5 border border-red-500/20 bg-red-500/5 flex items-center justify-between transition-all duration-300";
            if (riskIconContainer) {
                riskIconContainer.innerHTML = '<i data-lucide="shield-alert" class="w-5 h-5 text-red-400"></i>';
            }
        } else {
            riskText.innerText = "✅ Портфель диверсифицирован";
            riskText.className = "text-xs font-bold uppercase tracking-wider text-emerald-400";
            riskContainer.className = "glass rounded-3xl p-5 border border-white/5 flex items-center justify-between transition-all duration-300";
            if (riskIconContainer) {
                riskIconContainer.innerHTML = '<i data-lucide="shield-check" class="w-5 h-5 text-emerald-400"></i>';
            }
        }
        lucide.createIcons();
    }
    const ltvCont = document.getElementById('ltv-stats-container');
    if(ltvCont) ltvCont.innerHTML = topClients.sort((a,b) => b.sum - a.sum).slice(0, 5).map(item => `<div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"><span class="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[120px]">${item.name}</span><span class="text-cyan-400 font-bold">$${item.sum.toLocaleString()}</span></div>`).join('') || '<p class="text-gray-600 text-[10px] py-4 uppercase">Нет оплат</p>';
    const monthCont = document.getElementById('monthly-stats-container');
    if(monthCont) {
        const sorted = Object.keys(flowHistory).sort((a,b) => { const p = (s) => new Date(s.split(' ')[1], ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'].indexOf(s.split(' ')[0])); return p(b) - p(a); });
        monthCont.innerHTML = sorted.map(m => `<div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl"><span class="text-[11px] text-gray-400 font-bold uppercase">${m}</span><span class="text-white font-bold">$${flowHistory[m].toLocaleString()}</span></div>`).join('') || '<p class="text-gray-600 text-[10px] py-4 uppercase text-center">История пуста</p>';
    }
    
    processCohortData();
    renderRevenueTrendChart(activeClientsForecastSum);
};

window.processCohortData = function() {
    const container = document.getElementById('cohort-breakdown-container');
    if (!container) return;

    const getCohortKey = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const cohorts = {};

    clientsData.forEach(c => {
        let cohortDate = null;
        if (c.history && c.history.length > 0) {
            c.history.forEach(h => {
                const d = parseHistoryDate(h.date);
                if (d) {
                    if (!cohortDate || d < cohortDate) {
                        cohortDate = d;
                    }
                }
            });
        }
        if (!cohortDate || isNaN(cohortDate.getTime())) {
            cohortDate = new Date(parseInt(c.id));
        }
        if (!cohortDate || isNaN(cohortDate.getTime())) {
            cohortDate = new Date(); 
        }

        const cohortKey = getCohortKey(cohortDate);
        const cohortLabel = cohortDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

        if (!cohorts[cohortKey]) {
            cohorts[cohortKey] = {
                label: cohortLabel,
                key: cohortKey,
                clientsCount: 0,
                monthsPaid: {} 
            };
        }

        cohorts[cohortKey].clientsCount += 1;

        const paidMonthsSet = new Set();
        if (c.history) {
            c.history.forEach(h => {
                if (h.text.includes('Платеж получен')) {
                    const d = parseHistoryDate(h.date);
                    if (d) {
                        const diff = (d.getFullYear() - cohortDate.getFullYear()) * 12 + (d.getMonth() - cohortDate.getMonth());
                        if (diff >= 0) {
                            paidMonthsSet.add(diff);
                        }
                    }
                }
            });
        }

        paidMonthsSet.forEach(diff => {
            cohorts[cohortKey].monthsPaid[diff] = (cohorts[cohortKey].monthsPaid[diff] || 0) + 1;
        });
    });

    const sortedCohortKeys = Object.keys(cohorts).sort();

    if (sortedCohortKeys.length === 0) {
        container.innerHTML = `<p class="text-gray-600 text-[10px] py-4 uppercase text-center">Нет данных</p>`;
        return;
    }

    let tableHTML = `
        <div class="overflow-x-auto no-scrollbar -mx-2">
            <table class="w-full text-left border-collapse text-[9px] table-fixed min-w-[280px]">
                <thead>
                    <tr class="border-b border-white/5 text-gray-500 font-bold uppercase tracking-widest text-[8px]">
                        <th class="py-2 px-1 w-[80px]">Когорта</th>
                        <th class="py-2 px-1 text-center w-[45px]">Кол-во</th>
                        <th class="py-2 px-0.5 text-center">M0</th>
                        <th class="py-2 px-0.5 text-center">M1</th>
                        <th class="py-2 px-0.5 text-center">M2</th>
                        <th class="py-2 px-0.5 text-center">M3</th>
                        <th class="py-2 px-0.5 text-center">M4</th>
                        <th class="py-2 px-0.5 text-center">M5</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
    `;

    sortedCohortKeys.forEach(key => {
        const cohort = cohorts[key];
        const formattedLabel = cohort.label.charAt(0).toUpperCase() + cohort.label.slice(1).replace(' г.', '');
        
        tableHTML += `
            <tr class="hover:bg-white/5">
                <td class="py-2 px-1 font-bold text-white truncate max-w-[80px]">${formattedLabel}</td>
                <td class="py-2 px-1 text-center text-gray-400 font-bold">${cohort.clientsCount} чел.</td>
        `;

        for (let m = 0; m <= 5; m++) {
            const paidCount = cohort.monthsPaid[m] || 0;
            const pct = cohort.clientsCount > 0 ? (paidCount / cohort.clientsCount) * 100 : 0;
            const pctFormatted = pct > 0 ? `${Math.round(pct)}%` : '0%';
            
            const bgStyle = pct > 0 ? `background-color: rgba(6, 182, 212, ${(pct / 100) * 0.45});` : 'background-color: rgba(255,255,255,0.02);';
            const textStyle = pct > 0 ? 'color: #fff; font-weight: 800;' : 'color: rgba(255,255,255,0.15);';

            tableHTML += `
                <td class="py-2 px-0.5 text-center transition-all duration-300" style="${bgStyle} ${textStyle}">
                    ${pctFormatted}
                </td>
            `;
        }

        tableHTML += `</tr>`;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHTML;
}

window.renderRevenueTrendChart = function(activeClientsForecastSum) {
    const canvas = document.getElementById('revenue-trend-chart');
    if (!canvas) return;

    const last12Months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mKey = d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
        last12Months.push({
            key: mKey,
            month: d.getMonth(),
            year: d.getFullYear(),
            displayLabel: mKey.charAt(0).toUpperCase() + mKey.slice(1).replace(' г.', '')
        });
    }

    const chartData = last12Months.map(m => ({
        key: m.key,
        displayLabel: m.displayLabel,
        month: m.month,
        year: m.year,
        totalRevenue: 0,
        newClientsCount: 0,
        upsellSum: 0,
        topCheckAmount: 0,
        topCheckClient: '—',
        forecastRevenue: 0
    }));

    const clientFirstPaymentMonth = new Map();
    clientsData.forEach(c => {
        let firstDate = null;
        if (c.history && c.history.length > 0) {
            c.history.forEach(h => {
                if (h.text.includes('Платеж получен')) {
                    const d = parseHistoryDate(h.date);
                    if (d) {
                        if (!firstDate || d < firstDate) {
                            firstDate = d;
                        }
                    }
                }
            });
        }
        if (firstDate) {
            const mKey = firstDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
            clientFirstPaymentMonth.set(c.id, mKey);
        }
    });

    clientsData.forEach(c => {
        if (c.history) {
            c.history.forEach(h => {
                if (h.text.includes('Платеж получен')) {
                    const d = parseHistoryDate(h.date);
                    if (d) {
                        const mKey = d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
                        const targetMonth = chartData.find(cd => cd.key === mKey);
                        if (targetMonth) {
                            const ext = h.text.match(/\$(\d+(?:\.\d+)?)/); 
                            const val = ext ? parseFloat(ext[1]) : (parseFloat(c.amount) || 0);

                            targetMonth.totalRevenue += val;

                            if (h.text.includes('(Доп)')) {
                                targetMonth.upsellSum += val;
                            }

                            if (val > targetMonth.topCheckAmount) {
                                targetMonth.topCheckAmount = val;
                                targetMonth.topCheckClient = c.name || '—';
                            }
                        }
                    }
                }
            });
        }
    });

    chartData.forEach(cd => {
        let newCount = 0;
        clientFirstPaymentMonth.forEach((mKey) => {
            if (mKey === cd.key) {
                newCount++;
            }
        });
        cd.newClientsCount = newCount;

        let forecastSumForMonth = 0;
        clientsData.forEach(c => {
            if (getClientActiveStateAtMonth(c, cd.year, cd.month)) {
                forecastSumForMonth += parseFloat(c.amount) || 0;
            }
        });
        cd.forecastRevenue = forecastSumForMonth;
    });

    if (window.revenueTrendChartInstance) {
        window.revenueTrendChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 242, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 242, 255, 0.0)');

    const shadowPlugin = {
        id: 'shadowPlugin',
        beforeDatasetDraw: (chart, args) => {
            const { ctx } = chart;
            if (args.index === 0) {
                ctx.save();
                ctx.shadowColor = 'rgba(0, 242, 255, 0.8)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
        },
        afterDatasetDraw: (chart, args) => {
            const { ctx } = chart;
            if (args.index === 0) {
                ctx.restore();
            }
        }
    };

    window.revenueTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(cd => cd.displayLabel),
            datasets: [
                {
                    label: 'Факт (Платежи)',
                    data: chartData.map(cd => cd.totalRevenue),
                    borderColor: '#00f2ff',
                    borderWidth: 3.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#00f2ff',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#00f2ff',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                },
                {
                    label: 'Прогноз',
                    data: chartData.map(cd => cd.forecastRevenue),
                    borderColor: 'rgba(0, 242, 255, 0.35)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 9,
                            weight: 'bold'
                        },
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(10, 10, 15, 0.95)',
                    titleColor: '#ffffff',
                    titleFont: {
                        family: 'Plus Jakarta Sans',
                        size: 11,
                        weight: 'bold'
                    },
                    bodyColor: '#e4e4e7',
                    bodyFont: {
                        family: 'Plus Jakarta Sans',
                        size: 10
                    },
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 0) {
                                const index = context.dataIndex;
                                const data = chartData[index];
                                const isMobile = window.innerWidth < 768;
                                
                                if (isMobile) {
                                    return `💰 Выручка: $${data.totalRevenue.toLocaleString()}`;
                                } else {
                                    return [
                                        `💰 Общая выручка: $${data.totalRevenue.toLocaleString()}`,
                                        `🆕 Новые клиенты: ${data.newClientsCount} чел.`,
                                        `💎 Апсейлы (Допы): $${data.upsellSum.toLocaleString()}`,
                                        `🏆 Топ-чек: ${data.topCheckClient} ($${data.topCheckAmount.toLocaleString()})`
                                    ];
                                }
                            } else {
                                const index = context.dataIndex;
                                const data = chartData[index];
                                return `🔮 Прогноз: $${data.forecastRevenue.toLocaleString()}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        borderColor: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.45)',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 9
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        borderColor: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.45)',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 9
                        },
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        },
        plugins: [shadowPlugin]
    });
}

window.openClientProfile = function(id, silent = false) {
    currentClientId = id; const c = clientsData.find(x => x.id === id); if (!c) return;
    const logic = getClientLogic(c); const style = getStatusStyle(logic.color);
    const prof = document.getElementById('profile-card-container');
    prof.style.background = `linear-gradient(180deg, ${style.bg} 0%, rgba(10, 10, 15, 0.98) 100%)`; prof.style.borderColor = `${style.border}77`; prof.style.boxShadow = `0 10px 40px -10px ${style.glow}`;
    document.getElementById('detail-name-input').value = c.name || ""; document.getElementById('detail-role-input').value = c.role || "";
    document.getElementById('detail-img').src = c.img || 'https://ui-avatars.com/api/?name=User&background=333&color=fff';
    document.getElementById('field-amount').value = c.amount || ""; document.getElementById('field-date').value = c.date || "";
    document.getElementById('detail-status-select').value = c.status || 'Активен'; document.getElementById('detail-cohort-select').value = c.manualCohort || 'auto';
    document.getElementById('link-ads').value = c.links?.ads || ""; document.getElementById('link-ga').value = c.links?.ga || ""; document.getElementById('link-gtm').value = c.links?.gtm || ""; document.getElementById('link-site').value = c.links?.site || "";
    document.getElementById('detail-ai-analysis').value = c.ai_analysis || ""; document.getElementById('field-ads-id').value = c.adsId || "";
    
    const toggle = document.getElementById('recurring-toggle');
    if (c.recurring === false) toggle.classList.remove('active'); else toggle.classList.add('active');

    const count = document.getElementById('payment-countdown'); count.innerText = logic.label; count.style.backgroundColor = `${style.border}15`; count.style.color = style.border; count.style.borderColor = `${style.border}33`;
    const nxt = document.getElementById('next-payment-display'); nxt.innerText = logic.nextDateStr !== '—' && logic.nextDateStr !== 'Проект' ? `След. платеж: ${logic.nextDateStr}` : (logic.nextDateStr === 'Проект' ? 'Проектная работа' : 'Платеж не запланирован'); nxt.style.color = style.border;
    const log = document.getElementById('history-log'); log.innerHTML = (c.history || []).map((h, i) => `<div class="history-item"><div><span class="text-gray-600 mr-2 font-mono">${h.date}</span><span class="text-gray-300">${h.text}</span></div><button onclick="deleteHistoryItem(${i})" class="text-red-500/30 hover:text-red-500 px-2 transition-colors"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></div>`).join('') || '<p class="text-[9px] text-gray-700 uppercase italic p-4">История пуста</p>';
    renderExtraServices(c); renderAdsAnalytics(c); renderMonthlyHistory(c); if (!silent) switchView('details'); lucide.createIcons();
};


window.toggleRecurring = async () => {
    const c = clientsData.find(x => x.id === currentClientId); if (!c) return;
    c.recurring = c.recurring === undefined ? false : !c.recurring;
    document.getElementById('recurring-toggle').classList.toggle('active');
    await saveProfileChanges(); openClientProfile(currentClientId, true);
};

window.deleteHistoryItem = async (index) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (c && c.history) { 
        c.history.splice(index, 1); 
        await syncDataWithFirestore(); 
        openClientProfile(currentClientId, true); 
    } 
};

window.quickPayment = async (id) => { 
    currentClientId = id; 
    await confirmPayment(); 
};

window.quickPause = async (id) => { 
    const c = clientsData.find(x => x.id === id); if (!c) return; 
    c.status = 'Пауза'; addHistory(c, 'Статус изменен на Пауза'); 
    try { await syncDataWithFirestore(); } catch(e){}
    renderAllGrids();
};

window.handleStatusChange = async (val) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (c) { 
        c.status = val; 
        addHistory(c, `Статус: ${val}`); 
        await saveProfileChanges(); 
        openClientProfile(currentClientId, true); 
        renderAllGrids(); 
    } 
};

window.handleCohortOverride = async (val) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if(c) { 
        c.manualCohort = val; 
        await saveProfileChanges(); 
    } 
};

function addHistory(c, a) { 
    if (!c.history) c.history = []; 
    c.history.unshift({ 
        date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), 
        text: a 
    }); 
    c.history = c.history.slice(0, 30); 
}

window.switchView = (id) => { 
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); 
    document.getElementById(id + '-view')?.classList.add('active'); 
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active')); 
    document.getElementById('nav-' + (id === 'details' ? 'clients' : id))?.classList.add('active'); 
    if (typeof lucide !== 'undefined') lucide.createIcons(); 
};

window.navigateClient = (dir) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (!c) return; 
    const list = clientsData.filter(x => x.archived === c.archived); 
    const idx = list.findIndex(x => x.id === currentClientId); 
    if (list[idx + dir]) openClientProfile(list[idx + dir].id); 
};

window.renderExtraServices = (c) => { 
    const l = document.getElementById('extra-services-list'); 
    const invCont = document.getElementById('extra-invoice-container');
    const invBtn = document.getElementById('extra-invoice-btn');
    if (!l) return;
    
    if (!c.extra_services || c.extra_services.length === 0) { 
        l.innerHTML = ''; 
        if (invCont) invCont.classList.add('hidden');
        return; 
    } 
    
    const total = c.extra_services.reduce((sum, s) => sum + (parseFloat(s.amount)||0), 0);
    if (invCont) invCont.classList.remove('hidden');
    if (invBtn) invBtn.innerHTML = `<i data-lucide="receipt" class="w-3 h-3 inline mr-2"></i> Счет на доп. услуги ($${total})`;

    l.innerHTML = c.extra_services.map(s => `
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group">
            <span class="text-white font-bold text-xs">${s.name}</span>
            <div class="flex items-center gap-4">
                <span class="text-cyan-400 font-bold text-xs">$${s.amount}</span>
                <button onclick="deleteService('${s.id}')" class="text-red-500/30 hover:text-red-500 transition-colors opacity-100"><i data-lucide="x" class="w-3 h-3"></i></button>
            </div>
        </div>`).join(''); 
    if (typeof lucide !== 'undefined') lucide.createIcons(); 
};

window.addExtraService = () => document.getElementById('add-service-form')?.classList.toggle('hidden');

window.confirmAddService = async () => { 
    const n = document.getElementById('new-service-name').value; 
    const a = document.getElementById('new-service-amount').value; 
    if (!n || !a) return; 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (c) { 
        if (!c.extra_services) c.extra_services = []; 
        c.extra_services.push({ id: Date.now().toString(), name: n, amount: parseFloat(a) }); 
        addHistory(c, `Доп: ${n} ($${a})`); 
        await saveProfileChanges(); 
        document.getElementById('add-service-form').classList.add('hidden'); 
        renderExtraServices(c); 
    } 
};

window.deleteService = async (id) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (c) { 
        c.extra_services = c.extra_services.filter(s => s.id !== id); 
        await saveProfileChanges(); 
        renderExtraServices(c); 
    } 
};

window.addNewClient = async () => { 
    const id = Date.now().toString(); 
    clientsData.push({ 
        id, 
        name: "Новый контакт", 
        role: "", 
        status: "Активен", 
        archived: false, 
        history: [], 
        links: { ads: "", ga: "", gtm: "", site: "" }, 
        extra_services: [], 
        ai_analysis: "", 
        manualCohort: "auto", 
        amount: "", 
        date: "", 
        adsId: "", 
        recurring: true 
    }); 
    await syncDataWithFirestore(); 
    openClientProfile(id); 
};

window.restoreClient = async (id) => { 
    const c = clientsData.find(x => x.id === id); 
    if(c) { 
        c.archived = false; 
        addHistory(c, 'Восстановлен'); 
        await syncDataWithFirestore(); 
    } 
};

window.showDeleteModal = (id, isPerm) => { 
    const m = document.getElementById('delete-modal'); 
    const b = document.getElementById('confirm-delete-btn'); 
    if (!m || !b) return;
    m.classList.remove('hidden'); 
    if (isPerm) {
        b.onclick = async () => { 
            clientsData = clientsData.filter(c => c.id !== id); 
            await syncDataWithFirestore(); 
            m.classList.add('hidden'); 
        }; 
    } else {
        b.onclick = async () => { 
            const c = clientsData.find(x => x.id === id); 
            if(c) { 
                c.archived = true; 
                addHistory(c, 'В архив'); 
                await syncDataWithFirestore(); 
                m.classList.add('hidden'); 
            } 
        }; 
    }
};

window.closeDeleteModal = () => document.getElementById('delete-modal')?.classList.add('hidden');

window.handlePhotoUpload = (input) => { 
    const f = input.files[0]; 
    if (!f) return; 
    const r = new FileReader(); 
    r.onload = async (e) => { 
        const c = clientsData.find(x => x.id === currentClientId); 
        if (c) { 
            c.img = e.target.result; 
            document.getElementById('detail-img').src = c.img; 
            await saveProfileChanges(); 
        } 
    }; 
    r.readAsDataURL(f); 
};

window.openWorkspace = () => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (c?.links) [c.links.ads, c.links.ga, c.links.gtm, c.links.site].forEach(u => { 
        if(u) window.open(u.startsWith('http') ? u : 'https://' + u, '_blank'); 
    }); 
};

window.openLink = (t) => { 
    const c = clientsData.find(x => x.id === currentClientId); 
    if (!c?.links || !c.links[t]) return alert('Ссылка не задана'); 
    let u = c.links[t]; 
    window.open(u.startsWith('http') ? u : 'https://' + u, '_blank'); 
};

// =========================================================================
// 📊 GOOGLE ADS LIVE & TIME-SERIES ANALYTICS (v4.0)
// =========================================================================
window.currentAdsPeriod = 'LAST_30_DAYS';

window.switchAdsPeriod = function(period) {
    window.currentAdsPeriod = period;
    const periods = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS'];
    periods.forEach(p => {
        const btn = document.getElementById('btn-period-' + p);
        if (btn) {
            if (p === period) {
                btn.className = 'px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest text-black bg-cyan-400 font-black transition-all';
            } else {
                btn.className = 'px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest text-gray-400 hover:text-white transition-all';
            }
        }
    });

    const c = clientsData.find(x => x.id === currentClientId);
    if (c) renderAdsAnalytics(c);
};

window.renderAdsAnalytics = function(c) {
    const stats = c?.ads_stats || null;
    const periodKey = window.currentAdsPeriod || 'LAST_30_DAYS';
    const currency = c?.ads_currency || stats?.currency || 'EUR';

    // 1. Бейдж синхронизации и время
    const lastSyncEl = document.getElementById('ads-last-sync-text');
    const syncBadge = document.getElementById('ads-sync-badge');
    if (stats && stats.lastSync) {
        const d = new Date(stats.lastSync);
        const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        if (lastSyncEl) lastSyncEl.innerText = 'Синхронизация: ' + timeStr;
        if (syncBadge) {
            syncBadge.innerText = 'Online';
            syncBadge.className = 'px-2 py-0.5 rounded-full text-[8px] bg-cyan-500/20 text-cyan-400 font-extrabold uppercase border border-cyan-500/30';
        }
    } else {
        if (lastSyncEl) lastSyncEl.innerText = 'Синхронизация: нет данных';
        if (syncBadge) {
            syncBadge.innerText = 'Offline';
            syncBadge.className = 'px-2 py-0.5 rounded-full text-[8px] bg-white/5 text-gray-500 font-extrabold uppercase border border-white/10';
        }
    }

    // 2. Извлечение метрик периода
    let pData = stats?.periods?.[periodKey] || null;
    if (!pData && stats && periodKey === 'LAST_30_DAYS') {
        pData = {
            clicks: stats.cachedClicks || '0',
            cost: stats.cachedCost || '0.00',
            conversions: stats.cachedConvs || '0.0',
            costPerConv: stats.cachedCpa || '0.00',
            roas: stats.cachedRoas || '0.0',
            cpc: '0.00'
        };
    }

    const clicksEl = document.getElementById('ads-kpi-clicks');
    const costEl = document.getElementById('ads-kpi-cost');
    const convsEl = document.getElementById('ads-kpi-convs');
    const cpaEl = document.getElementById('ads-kpi-cpa');
    const roasEl = document.getElementById('ads-kpi-roas');
    const cpcEl = document.getElementById('ads-kpi-cpc');
    const aovEl = document.getElementById('ads-kpi-aov');
    const ctrEl = document.getElementById('ads-kpi-ctr');
    const crEl = document.getElementById('ads-kpi-cr');
    const searchIsEl = document.getElementById('ads-kpi-search-is');
    const lostIsBudgetEl = document.getElementById('ads-kpi-lost-is-budget');
    const lostIsRankEl = document.getElementById('ads-kpi-lost-is-rank');

    if (pData) {
        if (clicksEl) clicksEl.innerText = parseInt(pData.clicks || 0).toLocaleString();
        if (costEl) costEl.innerText = parseFloat(pData.cost || 0).toFixed(2) + ' ' + currency;
        if (convsEl) convsEl.innerText = parseFloat(pData.conversions || 0).toFixed(1);
        if (cpaEl) cpaEl.innerText = parseFloat(pData.costPerConv || pData.cpa || 0).toFixed(2) + ' ' + currency;
        if (roasEl) roasEl.innerText = parseFloat(pData.roas || 0).toFixed(1) + '%';
        if (cpcEl) cpcEl.innerText = parseFloat(pData.cpc || 0).toFixed(2) + ' ' + currency;
        if (aovEl) aovEl.innerText = parseFloat(pData.aov || 0).toFixed(2) + ' ' + currency;
        if (ctrEl) ctrEl.innerText = parseFloat(pData.ctr || 0).toFixed(2) + '%';
        if (crEl) crEl.innerText = parseFloat(pData.convRate || 0).toFixed(2) + '%';
        if (searchIsEl) searchIsEl.innerText = pData.searchImpressionShare || '--';
        if (lostIsBudgetEl) lostIsBudgetEl.innerText = pData.lostISBudget || '--';
        if (lostIsRankEl) lostIsRankEl.innerText = pData.lostISRank || '--';
    } else {
        if (clicksEl) clicksEl.innerText = '—';
        if (costEl) costEl.innerText = '—';
        if (convsEl) convsEl.innerText = '—';
        if (cpaEl) cpaEl.innerText = '—';
        if (roasEl) roasEl.innerText = '—';
        if (cpcEl) cpcEl.innerText = '—';
        if (aovEl) aovEl.innerText = '--';
        if (ctrEl) ctrEl.innerText = '--';
        if (crEl) crEl.innerText = '--';
        if (searchIsEl) searchIsEl.innerText = '--';
        if (lostIsBudgetEl) lostIsBudgetEl.innerText = '--';
        if (lostIsRankEl) lostIsRankEl.innerText = '--';
    }

    // 3. Кампании (фильтр по выбранному периоду)
    const campaignsListEl = document.getElementById('ads-campaigns-list');
    const campCountEl = document.getElementById('ads-camp-count');
    const rawCampaigns = stats?.campaigns || [];
    const filteredCampaigns = rawCampaigns.filter(c => !c.period || c.period === periodKey);

    if (campCountEl) campCountEl.innerText = filteredCampaigns.length;

    if (campaignsListEl) {
        if (filteredCampaigns.length > 0) {
            campaignsListEl.innerHTML = filteredCampaigns.map(cmp => `
                <div class="p-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <span class="text-white font-bold text-xs truncate block">${cmp.name}</span>
                        <span class="text-[9px] text-gray-500 font-mono">Клики: ${cmp.clicks} | Расход: ${cmp.cost} ${currency} | SearchIS: ${cmp.searchImpressionShare || '--'}</span>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="text-emerald-400 font-black text-xs font-mono block">🎯 ${cmp.conversions}</span>
                        <span class="text-purple-400 font-bold text-[9px] font-mono block">CPA: ${cmp.cpa || '—'}</span>
                    </div>
                </div>
            `).join('');
        } else {
            campaignsListEl.innerHTML = '<p class="text-gray-600 text-[10px] uppercase text-center py-4">Нет данных за этот период</p>';
        }
    }

    // 4. Цели конверсий (фильтр по выбранному периоду)
    const convListEl = document.getElementById('ads-conversions-list');
    const convCountEl = document.getElementById('ads-conv-count');
    const rawConvs = stats?.conversions || [];
    const filteredConvs = rawConvs.filter(g => !g.period || g.period === periodKey);

    if (convCountEl) convCountEl.innerText = filteredConvs.length;

    if (convListEl) {
        if (filteredConvs.length > 0) {
            convListEl.innerHTML = filteredConvs.map(g => `
                <div class="p-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                    <span class="text-gray-300 font-bold text-xs truncate max-w-[180px]">${g.name}</span>
                    <span class="text-cyan-400 font-black text-xs font-mono">${g.count}</span>
                </div>
            `).join('');
        } else {
            convListEl.innerHTML = '<p class="text-gray-600 text-[10px] uppercase text-center py-4">Нет данных за этот период</p>';
        }
    }

    // 5. Поисковые запросы (только принесшие конверсии)
    const queriesListEl = document.getElementById('ads-queries-list');
    const rawQueries = stats?.queries || [];
    const filteredQueries = rawQueries.filter(q => (!q.period || q.period === periodKey) && parseFloat(q.conversions || 0) > 0).sort((a,b) => parseFloat(b.conversions || 0) - parseFloat(a.conversions || 0));
    window.currentExportQueries = filteredQueries;

    if (queriesListEl) {
        if (filteredQueries.length > 0) {
            queriesListEl.innerHTML = filteredQueries.map(q => `
                <div class="p-2 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between gap-2">
                    <span class="text-gray-200 text-[11px] truncate flex-1 font-mono">"${q.query}"</span>
                    <div class="flex items-center gap-3 shrink-0 text-[10px] font-mono">
                        <span class="text-gray-400">🖱️ ${q.clicks}</span>
                        <span class="text-emerald-400 font-bold">🎯 ${q.conversions}</span>
                        <span class="text-cyan-400 font-bold">${q.cost} ${currency}</span>
                    </div>
                </div>
            `).join('');
        } else {
            queriesListEl.innerHTML = '<p class="text-gray-600 text-[10px] uppercase text-center py-4">Нет запросов с конверсиями за этот период</p>';
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
};

let monthlyChartInstance = null;

window.renderMonthlyHistory = function(c) {
    const list = document.getElementById('monthly-history-list');
    const emptyMsg = document.getElementById('monthly-history-empty');
    const chartContainer = document.getElementById('monthly-chart-container');
    
    if (!c.monthly_stats || c.monthly_stats.length === 0) {
        if (list && emptyMsg) {
            list.innerHTML = '';
            list.appendChild(emptyMsg);
        }
        if (chartContainer) chartContainer.classList.add('hidden');
        if (monthlyChartInstance) monthlyChartInstance.destroy();
        return;
    }
    
    // Render List
    if (list) {
        list.innerHTML = '';
        [...c.monthly_stats].reverse().forEach((s, idx, arr) => {
            const prev = arr[idx + 1]; 
            let cpaTrend = '';
            let convTrend = '';
            
            if (prev) {
                const cpaDiff = prev.cpa > 0 ? ((s.cpa - prev.cpa) / prev.cpa * 100).toFixed(1) : 0;
                const convDiff = prev.conversions > 0 ? ((s.conversions - prev.conversions) / prev.conversions * 100).toFixed(1) : 0;
                
                cpaTrend = cpaDiff > 0 ? `<span class="text-red-400 text-[8px]"><i data-lucide="arrow-up" class="w-2 h-2 inline"></i>${cpaDiff}%</span>` : `<span class="text-green-400 text-[8px]"><i data-lucide="arrow-down" class="w-2 h-2 inline"></i>${Math.abs(cpaDiff)}%</span>`;
                convTrend = convDiff > 0 ? `<span class="text-green-400 text-[8px]"><i data-lucide="arrow-up" class="w-2 h-2 inline"></i>${convDiff}%</span>` : `<span class="text-red-400 text-[8px]"><i data-lucide="arrow-down" class="w-2 h-2 inline"></i>${Math.abs(convDiff)}%</span>`;
            }

            list.innerHTML += `
                <div class="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5">
                    <div class="w-1/4">
                        <span class="text-[10px] font-bold text-white block">${s.month}</span>
                        <span class="text-[8px] text-gray-500 uppercase font-mono">${s.clicks} кликов</span>
                    </div>
                    <div class="w-1/4 text-center">
                        <span class="text-[10px] font-bold text-emerald-400 block">${s.conversions}</span>
                        ${convTrend || '<span class="text-[8px] text-gray-500">—</span>'}
                    </div>
                    <div class="w-1/4 text-center">
                        <span class="text-[10px] font-bold text-purple-400 block">$${s.cpa}</span>
                        ${cpaTrend || '<span class="text-[8px] text-gray-500">—</span>'}
                    </div>
                    <div class="w-1/4 text-right">
                        <span class="text-[10px] font-bold text-cyan-400 block">$${s.cost}</span>
                        <span class="text-[8px] text-gray-500 uppercase font-mono">Расход</span>
                    </div>
                </div>
            `;
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    // Render Chart
    if (chartContainer) {
        chartContainer.classList.remove('hidden');
        const ctx = document.getElementById('monthly-trend-chart');
        
        if (monthlyChartInstance) monthlyChartInstance.destroy();
        
        if (ctx) {
            const labels = c.monthly_stats.map(s => s.month);
            const convData = c.monthly_stats.map(s => s.conversions);
            const cpaData = c.monthly_stats.map(s => s.cpa);
            
            monthlyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Конверсии',
                            data: convData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            yAxisID: 'y',
                            tension: 0.3,
                            fill: true
                        },
                        {
                            label: 'CPA ($)',
                            data: cpaData,
                            borderColor: '#c084fc',
                            borderDash: [5, 5],
                            yAxisID: 'y1',
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#10b981', font: { size: 9 } }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            ticks: { color: '#c084fc', font: { size: 9 } }
                        },
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 9 } }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: '#fff', font: { size: 10 } }
                        }
                    }
                }
            });
        }
    }
};

window.exportDashboardToChat = async function() {
    const c = clientsData.find(x => x.id === currentClientId);
    if (!c || !c.telegramChatId) {
        alert('Группа Telegram не подключена у этого клиента!');
        return;
    }

    const btn = document.getElementById('export-dash-btn');
    const originalText = btn ? btn.innerHTML : 'В чат';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Экспорт...';
        btn.disabled = true;
    }

    try {
        const target = document.getElementById('ads-dashboard-export');
        if (!target) throw new Error('Дашборд не найден');
        
        // Populate watermark
        const clientNameEl = document.getElementById('export-client-name');
        const periodNameEl = document.getElementById('export-period-name');
        if (clientNameEl) clientNameEl.innerText = c.name;
        if (periodNameEl) {
            const pk = window.currentAdsPeriod || 'LAST_30_DAYS';
            const periodNames = { 'TODAY': 'Сегодня', 'YESTERDAY': 'Вчера', 'LAST_7_DAYS': 'За 7 дней', 'LAST_30_DAYS': 'За 30 дней' };
            periodNameEl.innerText = periodNames[pk] || pk;
        }

        const clone = target.cloneNode(true);
        clone.id = 'ads-dashboard-export-clone';
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.width = '700px';
        clone.style.padding = '30px';
        clone.style.background = '#050505';
        
        const cloneWatermark = clone.querySelector('#export-watermark');
        const cloneFooter = clone.querySelector('#export-footer');
        if (cloneWatermark) cloneWatermark.classList.remove('hidden');
        if (cloneFooter) cloneFooter.classList.remove('hidden');

        // 1. Hide the interactive top header ('GOOGLE ADS LIVE ANALYTICS' and buttons) to remove empty space
        const kpiGrid = clone.querySelector('#ads-kpi-grid');
        if (kpiGrid && kpiGrid.previousElementSibling && kpiGrid.previousElementSibling.id !== 'export-watermark') {
            kpiGrid.previousElementSibling.style.display = 'none';
        }

        // 2. Format KPI grid
        if (kpiGrid) {
            kpiGrid.className = 'grid grid-cols-3 gap-4 mb-6';
            kpiGrid.querySelectorAll('div > span:first-child').forEach(el => {
                el.className = 'text-xs text-gray-400 font-bold uppercase tracking-widest block mb-1';
            });
            kpiGrid.querySelectorAll('div > span:last-child').forEach(el => {
                el.className = 'text-3xl font-black font-mono ' + (el.className.includes('text-') ? (el.className.match(/text-[a-z]+-[0-9]+/)?.[0] || 'text-white') : 'text-white');
            });
        }

        // 3. Re-render Campaigns List completely for the image
        const campaignsWidget = clone.querySelector('#ads-campaigns-list')?.closest('.bg-black\\/40') || clone.querySelector('#ads-campaigns-list')?.parentElement;
        const conversionsWidget = clone.querySelector('#ads-conversions-list')?.closest('.bg-black\\/40') || clone.querySelector('#ads-conversions-list')?.parentElement;
        const gridWrapper = campaignsWidget?.parentElement;

        if (conversionsWidget) {
            conversionsWidget.remove(); // Remove conversions widget completely
        }
        
        if (gridWrapper) {
            gridWrapper.className = 'flex flex-col gap-6 w-full mt-4';
        }

        if (campaignsWidget) {
            const listEl = campaignsWidget.querySelector('#ads-campaigns-list');
            const pk = window.currentAdsPeriod || 'LAST_30_DAYS';
            const st = c.ads_analytics || c.ads_stats || c.adsStats || {};
            const rawCampaigns = st.campaigns || [];
            const filteredCampaigns = rawCampaigns.filter(cmp => !cmp.period || cmp.period === pk);
            
            // Re-render Campaigns with large fonts and badged metrics
            if (filteredCampaigns.length > 0 && listEl) {
                listEl.innerHTML = filteredCampaigns.map(cmp => {
                    const ctr = cmp.ctr || '--';
                    const roas = cmp.roas || '--';
                    const searchIs = cmp.searchImpressionShare || '--';
                    const currency = st.currency || c.currency || 'UAH';
                    return `
                    <div class="p-5 bg-white/5 rounded-2xl border border-white/10 flex flex-col gap-4 mb-4">
                        <div class="flex justify-between items-start gap-4">
                            <span class="text-2xl font-black text-white break-words">${cmp.name}</span>
                            <div class="text-right shrink-0">
                                <span class="text-4xl text-emerald-400 font-black block">🎯 ${cmp.conversions}</span>
                                <span class="text-lg text-pink-400 font-bold mt-1 block">CPA: ${cmp.cpa || '—'}</span>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2 items-center text-sm font-mono mt-2">
                            <span class="text-cyan-400 font-bold bg-cyan-950/80 border border-cyan-800/80 px-3 py-1.5 rounded-lg">🖱 Кліки: ${cmp.clicks}</span>
                            <span class="text-purple-400 font-bold bg-purple-950/80 border border-purple-800/80 px-3 py-1.5 rounded-lg">💰 Расход: ${cmp.cost} ${currency}</span>
                            <span class="text-blue-400 font-bold bg-blue-950/80 border border-blue-800/80 px-3 py-1.5 rounded-lg">📈 CTR: ${ctr}</span>
                            <span class="text-yellow-400 font-bold bg-yellow-950/80 border border-yellow-800/80 px-3 py-1.5 rounded-lg">🔥 ROAS: ${roas}</span>
                            <span class="text-orange-400 font-bold bg-orange-950/80 border border-orange-800/80 px-3 py-1.5 rounded-lg">🔎 Search IS: ${searchIs}</span>
                        </div>
                    </div>
                    `;
                }).join('');
            }
        }

        // 5. Remove Search Queries block entirely from image
        const queriesList = clone.querySelector('#ads-queries-list');
        if (queriesList && queriesList.parentElement) {
            queriesList.parentElement.remove();
        }

        // 6. Remove max-height and overflow classes everywhere in the clone
        clone.querySelectorAll('.max-h-48, .max-h-44, .overflow-y-auto, .custom-scrollbar').forEach(el => {
            el.className = el.className.replace(/max-h-\d+|overflow-y-auto|custom-scrollbar/g, '');
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
        });
        
        // Remove truncate
        clone.querySelectorAll('.truncate').forEach(el => {
            el.classList.remove('truncate');
            el.classList.add('break-words', 'whitespace-normal');
        });

        document.body.appendChild(clone);
        await new Promise(r => setTimeout(r, 400));

        const canvas = await html2canvas(clone, {
            backgroundColor: '#050505', 
            scale: 2, 
            logging: false,
            useCORS: true,
            windowWidth: 700
        });

        document.body.removeChild(clone);

        const base64image = canvas.toDataURL('image/png');

        // Extract queries with fallback
        let queriesForExport = window.currentExportQueries;
        if (!queriesForExport || queriesForExport.length === 0) {
            const pk = window.currentAdsPeriod || 'LAST_30_DAYS';
            const st = c.ads_analytics || c.ads_stats || c.adsStats || {};
            const rq = st.queries || [];
            queriesForExport = rq.filter(q => (!q.period || q.period === pk) && parseFloat(q.conversions || 0) > 0).sort((a,b) => parseFloat(b.conversions || 0) - parseFloat(a.conversions || 0));
        }

        const st = c.ads_analytics || c.ads_stats || c.adsStats || {};
        const currency = st.currency || c.currency || c.ads_currency || 'UAH';
        const queriesText = (queriesForExport && queriesForExport.length > 0)
            ? queriesForExport.slice(0, 10).map(q => '• ' + q.query + ' — ' + q.conversions + ' конв. (CPA: ' + q.cost + ' ' + currency + ')').join('\n')
            : '';

        const res = await fetch('https://api-lzh3pje5pa-uc.a.run.app/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'sendDashboardPhoto',
                chatId: c.telegramChatId,
                image: base64image,
                clientName: c.name,
                period: periodNameEl ? periodNameEl.innerText : '',
                queriesText: queriesText
            })
        });

        if (res.ok) {
            if (btn) btn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Отправлено';
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
                if(window.lucide) window.lucide.createIcons();
            }, 3000);
        } else {
            throw new Error('Ошибка сервера при отправке');
        }

    } catch (e) {
        console.error(e);
        alert('Ошибка при экспорте дашборда: ' + e.message);
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        if(window.lucide) window.lucide.createIcons();
    }
};
