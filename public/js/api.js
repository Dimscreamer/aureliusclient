// api.js — Запросы к API и синхронизация Firestore

async function syncDataWithFirestore() {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'artifacts', FIREBASE_CONFIG.projectId, 'public', 'data', 'clients_db', 'master');
    await setDoc(docRef, { clients: clientsData });
}

window.saveProfileChanges = async () => {
    const c = clientsData.find(x => x.id === currentClientId); if (!c) return;
    c.name = document.getElementById('detail-name-input').value || ""; c.role = document.getElementById('detail-role-input').value || "";
    c.amount = document.getElementById('field-amount').value || ""; c.date = document.getElementById('field-date').value || "";
    c.status = document.getElementById('detail-status-select').value || 'Активен'; c.manualCohort = document.getElementById('detail-cohort-select').value || 'auto';
    c.ai_analysis = document.getElementById('detail-ai-analysis').value || ""; c.adsId = document.getElementById('field-ads-id').value.replace(/\D/g, '') || "";
    c.links = { ads: document.getElementById('link-ads').value || "", ga: document.getElementById('link-ga').value || "", gtm: document.getElementById('link-gtm').value || "", site: document.getElementById('link-site').value || "" };
    
    if (c.date && c.amount && c.recurring !== false && c.status !== 'Пауза') {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    action: 'syncPayment', 
                    clientId: c.id, 
                    clientName: c.name, 
                    amount: c.amount, 
                    targetDate: c.date, 
                    adsId: c.adsId || "",
                    siteUrl: c.links?.site || "",
                    impressions: c.cachedImps || "",
                    clicks: c.cachedClicks || "",
                    convs: c.cachedConvs || "",
                    cost: c.cachedCost || "",
                    cpa: c.cachedCpa || c.cachedCPA || "",
                    status: c.status || "",
                    lastPaymentDate: (c.history && c.history.length > 0) ? c.history[0].date : "",
                    cachedConvDetails: c.cachedConvDetails || ""
                }) 
            });
        } catch(e) { console.error('syncPayment error:', e); }
    } else {
        try {
            await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ action: 'syncPayment', clientId: c.id, targetDate: "" }) 
            });
        } catch(e) { console.error('syncPayment error:', e); }
    }

    const ind = document.getElementById('autosave-indicator'); ind.classList.add('active');
    await syncDataWithFirestore(); setTimeout(() => ind.classList.remove('active'), 2000);
};

window.confirmPayment = async () => {
    const client = clientsData.find(c => c.id === currentClientId); if (!client) return;
    const amt = client.amount || 0; 
    const isRecurring = client.recurring !== false; 
    
    let logMsg = `Платеж получен: $${amt}.`;
    let nStr = client.date;

    if (isRecurring) {
        let anchorDate = client.date ? new Date(client.date) : new Date();
        anchorDate.setMonth(anchorDate.getMonth() + 1);
        
        let now = new Date();
        now.setHours(0,0,0,0);
        while (anchorDate < now) {
            anchorDate.setMonth(anchorDate.getMonth() + 1);
        }
        
        nStr = anchorDate.toISOString().split('T')[0];
        client.date = nStr;
        logMsg += ` След. оплата: ${nStr}`;
        
        try {
            await fetch(GOOGLE_SCRIPT_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    action: 'syncPayment', 
                    clientId: client.id, 
                    clientName: client.name, 
                    amount: client.amount, 
                    targetDate: nStr, 
                    adsId: client.adsId || "",
                    siteUrl: client.links?.site || "",
                    impressions: client.cachedImps || "",
                    clicks: client.cachedClicks || "",
                    convs: client.cachedConvs || "",
                    cost: client.cachedCost || "",
                    cpa: client.cachedCPA || "",
                    status: "Активен",
                    lastPaymentDate: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    cachedConvDetails: client.cachedConvDetails || ""
                }) 
            });
        } catch(e) { console.error('syncPayment error:', e); }
    } else {
        logMsg += ` (Разовый проект)`;
    }

    client.status = 'Активен';
    addHistory(client, logMsg);
    
    await syncDataWithFirestore(); openClientProfile(currentClientId, true);
    
    try { 
        await fetch(GOOGLE_SCRIPT_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ action: 'notifyManualPayment', clientName: client.name, amount: amt }) 
        }); 
    } catch (e) { console.error('notifyManualPayment error:', e); }
};

window.testTelegram = async () => {
    const c = clientsData.find(x => x.id === currentClientId);
    if (!c) return alert("Выберите клиента");
    const btn = document.getElementById('test-tg-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin mr-2"></i> Отправка...`;
    lucide.createIcons();

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'test',
                message: `🔔 Тест\nКлиент: ${c.name}\nAds ID: ${c.adsId}\nСумма: $${c.amount}`
            })
        });
        
        const responseText = await response.text();
        console.log("Ответ от Firebase:", responseText);
        
        setTimeout(() => alert("Сигнал отправлен!"), 500);
    } catch (e) {
        console.error("Ошибка при отправке в Firebase:", e);
        alert("Ошибка отправки! Откройте F12 (Консоль) для деталей.");
    } finally {
        btn.innerHTML = orig;
        lucide.createIcons();
    }
};

window.runDeepDiagnostic = async () => {
    const c = clientsData.find(x => x.id === currentClientId);
    if (!c) return alert("Выберите клиента");
    const btn = document.getElementById('run-diagnostic-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin mr-2"></i> Запуск...`;
    lucide.createIcons();

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'runDiagnostic',
                clientId: c.id,
                clientName: c.name,
                adsId: c.adsId
            })
        });
        setTimeout(() => alert("Диагностика запущена. Проверьте Telegram для результата."), 300);
    } catch (e) {
        console.error("Ошибка запуска диагностики:", e);
        alert("Ошибка запуска диагностики. Откройте F12 для деталей.");
    } finally {
        btn.innerHTML = orig;
        lucide.createIcons();
    }
};

window.sendManualInvoice = async () => {
    const c = clientsData.find(x => x.id === currentClientId);
    if (!c) return alert("Выберите клиента");
    const btn = document.getElementById('manual-invoice-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin mr-2"></i> Отправка...`;
    lucide.createIcons();

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'manualInvoice',
                clientName: c.name,
                amount: c.amount,
                clientId: c.id,
                adsId: c.adsId,
                telegramChatId: c.telegramChatId || "",
                siteUrl: c.links?.site || "",
                impressions: c.cachedImps || "",
                clicks: c.cachedClicks || "",
                convs: c.cachedConvs || "",
                cost: c.cachedCost || "",
                cpa: c.cachedCpa || c.cachedCPA || "",
                conversionValue: c.cachedConvValue || "",
                roas: c.cachedRoas || "",
                aov: c.cachedAov || "",
                currency: c.cachedCurr || "UAH",
                cachedConvDetails: c.cachedConvDetails || ""
            })
        });
        setTimeout(() => alert("Счет отправлен!"), 500);
    } catch (e) {
        console.error("Ошибка:", e);
        alert("Ошибка! Откройте F12 (Консоль).");
    } finally {
        btn.innerHTML = orig;
        lucide.createIcons();
    }
};

window.connectTelegramGroup = () => {
    const c = clientsData.find(x => x.id === currentClientId);
    if (!c) return alert("Выберите клиента");
    
    const botUsername = "MyConversionsBotPpcDmitroBot";
    const clientId = c.id.toString();
    const deepLink = `https://t.me/${botUsername}?startgroup=bind_${clientId}`;
    
    // Открываем Telegram с выбором группы для добавления бота
    window.open(deepLink, '_blank');
};

window.sendExtraInvoice = async () => {
    const c = clientsData.find(x => x.id === currentClientId); if (!c || !c.extra_services || c.extra_services.length === 0) return alert("Нет услуг для оплаты");
    const total = c.extra_services.reduce((sum, s) => sum + (parseFloat(s.amount)||0), 0);
    const btn = document.getElementById('extra-invoice-btn'); const orig = btn.innerHTML; btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin mr-2"></i> Отправка...`; lucide.createIcons();
    
    const extendedPayload = {
        action: 'manualInvoice',
        invoiceType: 'extra',
        clientName: c.name + " (Доп. услуги)",
        amount: total,
        clientId: c.id,
        adsId: c.adsId,
        executor: 'AureliusMarketingAI',
        servicesList: c.extra_services.map(s => s.name).join(', ')
    };

    try { 
        await fetch(GOOGLE_SCRIPT_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(extendedPayload) 
        }); 
        setTimeout(() => alert(`Счет на $${total} отправлен!`), 500); 
    } catch (e) {
        console.error("Ошибка:", e);
    } finally { 
        btn.innerHTML = orig; 
        lucide.createIcons(); 
    }
};

window.confirmExtraPayment = async () => {
    const c = clientsData.find(x => x.id === currentClientId); if (!c || !c.extra_services || c.extra_services.length === 0) return;
    const total = c.extra_services.reduce((sum, s) => sum + (parseFloat(s.amount)||0), 0);
    
    const serviceNames = c.extra_services.map(s => s.name).join(', ');
    addHistory(c, `Платеж получен (Доп): $${total}. Услуги: ${serviceNames}`);
    
    c.extra_services = [];
    
    await saveProfileChanges();
    renderExtraServices(c);
    openClientProfile(currentClientId, true); 
    
    try { 
        fetch(GOOGLE_SCRIPT_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ action: 'notifyManualPayment', clientName: c.name + " (Доп. услуги)", amount: total }) 
        }).catch(e => console.error(e)); 
    } catch (e) {}
};

// ============================
// ДИАГНОСТИЧЕСКИЕ ФУНКЦИИ
// ============================

function diagSetLog(text) {
    const el = document.getElementById('diag-log-output');
    if (el) { el.textContent = text; el.scrollTop = el.scrollHeight; }
}

function diagAppendLog(text) {
    const el = document.getElementById('diag-log-output');
    if (el) {
        if (el.querySelector('span')) el.innerHTML = '';
        el.textContent += text + '\n';
        el.scrollTop = el.scrollHeight;
    }
}

function diagSetBtnLoading(btnId, loading, originalText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
        btn.dataset.orig = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline mr-2 animate-spin"></i> Выполняется...`;
        btn.disabled = true;
        lucide.createIcons();
    } else {
        btn.innerHTML = btn.dataset.orig || originalText;
        btn.disabled = false;
        lucide.createIcons();
    }
}

window.diagTestTelegram = async () => {
    diagSetBtnLoading('diag-tg-btn', true);
    diagSetLog('⏳ Отправка тестового сообщения в Telegram...');
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test', message: '🔔 ДИАГНОСТИКА: Тест связи с CRM.' })
        });
        diagAppendLog('✅ Готово! Проверьте Telegram бота — должно было прийти сообщение.');
    } catch (e) {
        diagAppendLog(`❌ Ошибка: ${e.message}`);
    } finally {
        diagSetBtnLoading('diag-tg-btn', false);
    }
};

window.diagRunTestInvoice = async () => {
    diagSetBtnLoading('diag-invoice-btn', true);
    diagSetLog('⏳ Запускаем тест автоинвойса...\n');
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'triggerTestInvoice' })
        });
        const data = await resp.json();
        if (data.success) {
            diagAppendLog('--- ЛОГА С БЭКЕНДА ---');
            (data.logs || []).forEach(l => diagAppendLog(l));
            diagAppendLog(`\n✅ Тестовый документ ID: ${data.testDocId}`);
            diagAppendLog('📲 Подробный лог отправлен в Telegram бота.');
            // Обновляем очередь
            setTimeout(() => loadScheduledQueue(), 1500);
        } else {
            diagAppendLog('❌ Ошибка на сервере:');
            (data.logs || []).forEach(l => diagAppendLog(l));
        }
    } catch (e) {
        diagAppendLog(`❌ Ошибка запроса: ${e.message}`);
    } finally {
        diagSetBtnLoading('diag-invoice-btn', false);
    }
};

window.diagSetWebhook = async () => {
    diagSetBtnLoading('diag-webhook-btn', true);
    diagSetLog('⏳ Устанавливаем вебхук Monobank...');
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'setWebhook' })
        });
        const text = await resp.text();
        diagAppendLog(`✅ Ответ от Mono API: ${text}`);
        diagAppendLog('Вебхук установлен. Теперь запустите тест инвойса и оплатите счёт — должно прийти подтверждение.');
    } catch (e) {
        diagAppendLog(`❌ Ошибка: ${e.message}`);
    } finally {
        diagSetBtnLoading('diag-webhook-btn', false);
    }
};

window.loadScheduledQueue = async (silent = false) => {
    const container = document.getElementById('diag-queue-container');
    if (!container) return;
    if (!silent) container.innerHTML = `<p class="text-gray-500 text-[10px] py-4 text-center animate-pulse uppercase">Загрузка...</p>`;
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getScheduledQueue' })
        });
        const data = await resp.json();
        if (!data.success) throw new Error('Ошибка сервера');
        renderScheduledQueue(data.docs);
    } catch (e) {
        if (!silent) container.innerHTML = `<p class="text-red-400 text-[10px] py-4 text-center">❌ Ошибка загрузки: ${e.message}</p>`;
    }
};

function renderScheduledQueue(docs) {
    const container = document.getElementById('diag-queue-container');
    if (!container) return;
    if (!docs || docs.length === 0) {
        container.innerHTML = `<p class="text-gray-600 text-[10px] py-8 uppercase text-center">Очередь пуста — нет записей в scheduled_invoices</p>`;
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    const rows = docs.map(d => {
        const isDue = d.targetDate === today;
        const isOverdue = d.targetDate && d.targetDate < today;
        const isDiag = d.isDiagnostic;
        let rowClass = isDiag ? 'opacity-40' : '';
        let statusBadge = '';
        if (d.status === 'paid') statusBadge = `<span class="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-[8px] font-bold uppercase">ОПЛАЧЕН</span>`;
        else if (d.status === 'test-sent') statusBadge = `<span class="px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded-full text-[8px] font-bold uppercase">ТЕСТ</span>`;
        else if (isDue && !d.lastSentDate) statusBadge = `<span class="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-[8px] font-bold uppercase">⚡ СЕГОДНЯ</span>`;
        else if (d.lastSentDate === today) statusBadge = `<span class="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full text-[8px] font-bold uppercase">✓ ОТПРАВЛЕН</span>`;
        else if (isOverdue) statusBadge = `<span class="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[8px] font-bold uppercase">ПРОСРОЧЕН</span>`;
        else statusBadge = `<span class="px-2 py-0.5 bg-white/5 text-gray-500 rounded-full text-[8px] font-bold uppercase">Pending</span>`;

        return `
        <div class="flex items-center justify-between p-3 bg-white/3 rounded-2xl border border-white/5 gap-2 ${rowClass}">
            <div class="flex-1 min-w-0">
                <div class="text-white font-bold text-[11px] truncate">${d.clientName || d.clientId || '—'}${isDiag ? ' <span class="text-gray-600">[TEST]</span>' : ''}</div>
                <div class="text-gray-500 text-[9px] font-mono mt-0.5">ID: ${d.id}</div>
            </div>
            <div class="text-center shrink-0">
                <div class="text-white font-bold text-[11px]">$${d.amount || 0}</div>
                <div class="text-gray-600 text-[9px]">targetDate</div>
                <div class="text-cyan-400 font-bold text-[10px]">${d.targetDate || '—'}</div>
            </div>
            <div class="text-center shrink-0">
                <div class="text-gray-600 text-[9px]">lastSent</div>
                <div class="text-gray-400 font-bold text-[10px]">${d.lastSentDate || '—'}</div>
            </div>
            <div class="shrink-0">${statusBadge}</div>
        </div>`;
    });
    container.innerHTML = `
        <div class="text-gray-600 text-[10px] uppercase font-bold mb-3">${docs.length} записей в коллекции</div>
        <div class="space-y-2">${rows.join('')}</div>
    `;
}

window.loadSystemLogs = async (silent = false) => {
    const container = document.getElementById('diag-system-logs');
    if (!container) return;
    if (!silent) container.innerHTML = `<p class="text-gray-500 text-[10px] text-center animate-pulse uppercase">Загрузка...</p>`;
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getSystemLogs' })
        });
        const data = await resp.json();
        if (!data.success) throw new Error('Ошибка сервера');
        
        if (!data.logs || data.logs.length === 0) {
            container.innerHTML = `<p class="text-gray-600 text-[10px] uppercase text-center">Нет логов</p>`;
            return;
        }
        
        container.innerHTML = data.logs.map(l => {
            const date = new Date(l.createdAt?._seconds * 1000 || Date.now()).toLocaleString('ru-RU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let color = 'text-gray-400';
            if (l.type === 'webhook') color = 'text-purple-400';
            if (l.type === 'scheduler') color = 'text-orange-400';
            if (l.type === 'api') color = 'text-blue-400';
            return `<div class="mb-1"><span class="text-gray-600 mr-2">[${date}]</span><span class="${color}">${l.message}</span></div>`;
        }).join('');
    } catch (e) {
        if (!silent) container.innerHTML = `<p class="text-red-400 text-[10px] text-center">❌ Ошибка: ${e.message}</p>`;
    }
};

window.loadWebhookHistory = async (silent = false) => {
    const container = document.getElementById('diag-webhook-history');
    if (!container) return;
    if (!silent) container.innerHTML = `<p class="text-gray-500 text-[10px] py-4 text-center animate-pulse uppercase">Загрузка...</p>`;
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getWebhookHistory' })
        });
        const data = await resp.json();
        if (!data.success) throw new Error('Ошибка сервера');
        
        if (!data.history || data.history.length === 0) {
            container.innerHTML = `<p class="text-gray-600 text-[10px] py-4 uppercase text-center">Нет входящих транзакций</p>`;
            return;
        }
        
        container.innerHTML = data.history.map(h => {
            const date = new Date(h.receivedAt?._seconds * 1000 || Date.now()).toLocaleString('ru-RU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const item = h.item || {};
            const amount = (item.amount || 0) / 100;
            const isPos = amount > 0;
            return `
            <div class="p-3 bg-white/5 rounded-2xl border border-white/5">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] text-gray-500 font-mono">${date}</span>
                    <span class="text-[11px] font-bold ${isPos ? 'text-green-400' : 'text-red-400'}">${amount > 0 ? '+' : ''}${amount} грн</span>
                </div>
                <div class="text-[11px] text-gray-300 font-mono break-all">${item.description || item.comment || 'Без комментария'}</div>
            </div>`;
        }).join('');
    } catch (e) {
        if (!silent) container.innerHTML = `<p class="text-red-400 text-[10px] py-4 text-center">❌ Ошибка: ${e.message}</p>`;
    }
};

window.clearTestRecords = async () => {
    if (!confirm('Вы уверены, что хотите удалить все TEST записи из очереди?')) return;
    diagSetBtnLoading('diag-clear-btn', true);
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clearTestInvoices' })
        });
        const data = await resp.json();
        if (data.success) {
            alert(`Успешно удалено тестовых документов: ${data.deleted}`);
            loadScheduledQueue();
            loadSystemLogs();
        } else {
            alert(`Ошибка удаления`);
        }
    } catch (e) {
        alert(`Ошибка: ${e.message}`);
    } finally {
        diagSetBtnLoading('diag-clear-btn', false);
    }
};

let diagInterval = null;
setTimeout(() => {
    const origSwitchView = window.switchView;
    if (origSwitchView) {
        window.switchView = (id) => {
            origSwitchView(id);
            if (diagInterval) {
                clearInterval(diagInterval);
                diagInterval = null;
            }
            if (id === 'diagnostics') {
                loadScheduledQueue();
                loadSystemLogs();
                loadWebhookHistory();
                diagInterval = setInterval(() => {
                    loadScheduledQueue(true);
                    loadSystemLogs(true);
                    loadWebhookHistory(true);
                }, 10000);
            }
        };
    }
}, 1000); // Wait for ui.js to load and define switchView

window.syncAres = async () => {
    if (!confirm('Вы уверены, что хотите принудительно синхронизировать все ожидаемые доходы с Ares?')) return;
    const btn = document.getElementById('diag-ares-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="w-3 h-3 inline mr-2 animate-spin"></i> Синхронизация...`;
    btn.disabled = true;
    
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'syncAllExpectedIncomeToAres' })
        });
        const data = await resp.json();
        if (data.success) {
            alert(`✅ Синхронизация успешна! Выгружено клиентов: ${data.count}`);
            loadSystemLogs();
        } else {
            alert(`❌ Ошибка синхронизации: ${data.error || 'Неизвестная ошибка'}`);
        }
    } catch (e) {
        alert(`❌ Ошибка: ${e.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        // Re-init lucide icons if defined
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.syncAndCleanQueue = async () => {
    if (!confirm('Синхронизировать очередь с CRM?\n\nВсе удаленные/архивные клиенты и устаревшие призраки будут удалены из очереди, а актуальные клиенты CRM обновлены.')) return;
    const btn = document.getElementById('diag-sync-clean-btn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = `<i data-lucide="loader" class="w-3 h-3 inline mr-2 animate-spin"></i> Синхронизация...`;
        btn.disabled = true;
    }
    
    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'syncAndCleanScheduledInvoices' })
        });
        const data = await resp.json();
        if (data.success) {
            alert(`✅ Очередь успешно синхронизирована!\n\n🗑 Удалено призраков/сирот: ${data.deleted}\n🔄 Синхронизировано актуальных: ${data.synced}`);
            if (typeof loadScheduledQueue === 'function') loadScheduledQueue();
            if (typeof loadSystemLogs === 'function') loadSystemLogs();
        } else {
            alert(`❌ Ошибка: ${data.message || data.error || 'Неизвестная ошибка'}`);
        }
    } catch (e) {
        alert(`❌ Ошибка запроса: ${e.message}`);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.loadClientChatHistory = async (clientId) => {
    const container = document.getElementById('client-chat-history');
    const badge = document.getElementById('chat-messages-count');
    if (!container) return;

    container.innerHTML = `<div class="p-6 text-center text-gray-500 text-xs font-mono"><i data-lucide="loader-2" class="w-3.5 h-3.5 inline animate-spin mr-1.5 text-cyan-400"></i>Загрузка переписки...</div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getClientChatHistory', clientId: clientId.toString() })
        });
        const data = await resp.json();
        const messages = data.messages || [];
        if (badge) badge.innerText = `${messages.length} сообщ.`;

        if (messages.length === 0) {
            container.innerHTML = `<div class="text-center py-10 space-y-1"><p class="text-gray-600 text-[10px] uppercase font-bold">Нет сообщений за 90 дней</p><p class="text-gray-700 text-[9px]">Сообщения из чата появятся здесь автоматически</p></div>`;
            return;
        }

        container.innerHTML = messages.map(m => {
            const isMark = m.isMark;
            const isAdmin = m.isAdmin;
            
            let bgClass = 'bg-white/[0.04] border-white/10 text-gray-200 mr-3';
            let nameColor = 'text-emerald-400';
            let tag = m.senderName || 'Клиент';
            
            if (isMark) {
                bgClass = 'bg-cyan-950/30 border-cyan-500/30 text-cyan-100 ml-3';
                nameColor = 'text-cyan-300';
                tag = 'Марк AI';
            } else if (isAdmin) {
                bgClass = 'bg-purple-950/30 border-purple-500/30 text-purple-100 ml-3';
                nameColor = 'text-purple-400';
                tag = 'Агентство';
            }

            const cleanText = (m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const dateStr = m.date ? m.date.slice(5) : '';
            const timeStr = m.time || '';

            return `
            <div class="p-2.5 rounded-2xl border ${bgClass} text-xs space-y-1 transition-all">
                <div class="flex items-center justify-between text-[9px] font-mono">
                    <span class="font-bold ${nameColor}">${tag}</span>
                    <span class="text-gray-500 font-mono">${dateStr} ${timeStr}</span>
                </div>
                <div class="text-[11px] leading-relaxed break-words text-gray-300 font-sans">${cleanText}</div>
            </div>`;
        }).join('');

        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);

    } catch (e) {
        container.innerHTML = `<p class="text-red-400 text-[10px] text-center py-6">Ошибка загрузки: ${e.message}</p>`;
    }
};

window.generateClientPsychotype = async () => {
    if (!currentClientId) return alert("Выберите клиента");
    const btn = document.getElementById('generate-psychotype-btn');
    const textarea = document.getElementById('detail-ai-analysis');
    const originalBtnText = btn ? btn.innerHTML : '';

    if (btn) {
        btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin mr-1.5 text-cyan-400"></i> Анализ чата (90 дней)...`;
        btn.disabled = true;
    }
    if (window.lucide) lucide.createIcons();

    try {
        const resp = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generateClientPsychotype', clientId: currentClientId.toString() })
        });
        const data = await resp.json();
        if (data.success) {
            if (textarea) {
                textarea.value = data.ai_analysis;
                textarea.classList.add('!border-cyan-500', '!bg-cyan-500/10');
                setTimeout(() => textarea.classList.remove('!border-cyan-500', '!bg-cyan-500/10'), 2500);
            }
            const c = clientsData.find(x => x.id === currentClientId);
            if (c) c.ai_analysis = data.ai_analysis;
            alert(`✅ Психотип и срез болей успешно сгенерирован Марком на основе ${data.messagesCount || 'всех'} сообщений за 90 дней!`);
        } else {
            alert(`⚠️ ${data.error || 'Не удалось сгенерировать психотип'}`);
        }
    } catch (e) {
        alert(`❌ Ошибка запроса: ${e.message}`);
    } finally {
        if (btn) {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
        if (window.lucide) lucide.createIcons();
    }
};

