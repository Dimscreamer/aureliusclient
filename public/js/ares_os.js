/**
 * ares_os.js — Frontend контроллер Ares OS в Aurelius CRM
 */

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let aresIntentsData = [];
let aresModulesData = [];
let aresSettingsData = { model: "google/gemini-2.5-flash-lite", debug: false };
let currentAresSubView = 'hub';
let activeIntentFilter = 'all';

// ==========================================
// 1. Инициализация Ares OS
// ==========================================
let aresInitialized = false;
window.initAresOS = async function() {
    if (!aresInitialized) {
        aresInitialized = true;
        if (!currentAresSubView || currentAresSubView === 'hub') {
            switchAresSubView('hub');
        }
        await Promise.all([loadAresSettings(), loadAresModules(), loadAresIntents()]);
    }
};

// ==========================================
// 2. Переключение подразделов Ares OS
// ==========================================
window.switchAresSubView = function(subId) {
    currentAresSubView = subId;
    
    // Скрываем все подразделы
    document.querySelectorAll('.ares-subview').forEach(el => el.classList.add('hidden'));
    
    // Показываем нужный
    const target = document.getElementById(`ares-sub-${subId}`);
    if (target) target.classList.remove('hidden');

    // Обновляем активные кнопки в верхней панели
    document.querySelectorAll('.ares-subnav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`ares-btn-${subId}`)?.classList.add('active');

    // Рендерим нужный контент
    if (subId === 'calendar') renderAresCalendar();
    if (subId === 'intents') renderAresIntents();
    if (subId === 'modules') renderAresModules();
    if (subId === 'settings') renderAresSettings();
    if (subId === 'lab') renderAresLab();

    if (window.lucide) lucide.createIcons();
};

// ==========================================
// 3. Загрузка данных с сервера
// ==========================================
async function loadAresIntents() {
    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_getIntents' })
        });
        const data = await res.json();
        if (data.success && data.intents) {
            aresIntentsData = data.intents;
        }
    } catch(e) {
        console.error("loadAresIntents error:", e);
    }
}

async function loadAresModules() {
    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_getModules' })
        });
        const data = await res.json();
        if (data.success && data.modules) {
            aresModulesData = data.modules;
        }
    } catch(e) {
        console.error("loadAresModules error:", e);
    }
}

async function loadAresSettings() {
    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_getSettings' })
        });
        const data = await res.json();
        if (data.success && data.settings) {
            aresSettingsData = data.settings;
        }
    } catch(e) {
        console.error("loadAresSettings error:", e);
    }
}

// ==========================================
// 4. 📅 GOOGLE CALENDAR CONTROLLER
// ==========================================
let aresCalCurrentDate = new Date();
let aresCalSelectedDate = new Date();
let aresCalMonthDatesWithEvents = new Set();
let aresCalDayEvents = [];
const aresCalMonthCache = new Map();

const ARES_CAL_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const ARES_CAL_MONTHS_GENITIVE = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];

function formatAresCalDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateAresCalLabels() {
    const monthLabel = document.getElementById('ares-cal-month-label');
    if (monthLabel) {
        monthLabel.innerText = `${ARES_CAL_MONTHS[aresCalCurrentDate.getMonth()]} ${aresCalCurrentDate.getFullYear()}`;
    }

    const selLabel = document.getElementById('ares-cal-selected-date-label');
    if (selLabel) {
        selLabel.innerText = `${aresCalSelectedDate.getDate()} ${ARES_CAL_MONTHS_GENITIVE[aresCalSelectedDate.getMonth()]} ${aresCalSelectedDate.getFullYear()}`;
    }
}

window.renderAresCalendar = async function() {
    updateAresCalLabels();
    renderAresCalGrid();
    await fetchAresMonthEvents();
    renderAresCalGrid();
    await fetchAresDayEvents(formatAresCalDate(aresCalSelectedDate));
};

window.changeAresCalMonth = async function(delta) {
    // 🛡️ Фикс бага JS Date: установка 1 числа предотвращает перескок месяцев (например с 31 августа на октябрь)
    const currentYear = aresCalCurrentDate.getFullYear();
    const currentMonth = aresCalCurrentDate.getMonth();
    aresCalCurrentDate = new Date(currentYear, currentMonth + delta, 1);
    
    // Если переключились на текущий месяц — выбираем сегодня, иначе 1-е число
    const today = new Date();
    if (today.getFullYear() === aresCalCurrentDate.getFullYear() && today.getMonth() === aresCalCurrentDate.getMonth()) {
        aresCalSelectedDate = new Date(today);
    } else {
        aresCalSelectedDate = new Date(aresCalCurrentDate.getFullYear(), aresCalCurrentDate.getMonth(), 1);
    }

    // Мгновенный отклик UI (0ms задержки)
    updateAresCalLabels();
    
    // Если есть в кэше — сразу показываем точки событий
    const cacheKey = `${aresCalCurrentDate.getFullYear()}-${aresCalCurrentDate.getMonth()}`;
    if (aresCalMonthCache.has(cacheKey)) {
        aresCalMonthDatesWithEvents = aresCalMonthCache.get(cacheKey);
    }
    renderAresCalGrid();

    // Загрузка в фоне
    await Promise.all([
        fetchAresMonthEvents(),
        fetchAresDayEvents(formatAresCalDate(aresCalSelectedDate))
    ]);
    renderAresCalGrid();
};

async function fetchAresMonthEvents() {
    const year = aresCalCurrentDate.getFullYear();
    const month = aresCalCurrentDate.getMonth();
    const cacheKey = `${year}-${month}`;

    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ares_getCalendarMonth',
                year: year,
                month: month
            })
        });
        const data = await res.json();
        aresCalMonthDatesWithEvents = new Set(data.dates || []);
        aresCalMonthCache.set(cacheKey, aresCalMonthDatesWithEvents);
    } catch(e) {
        console.error("fetchAresMonthEvents error:", e);
    }
}

function renderAresCalGrid() {
    const grid = document.getElementById('ares-cal-days-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const year = aresCalCurrentDate.getFullYear();
    const month = aresCalCurrentDate.getMonth();

    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const todayStr = formatAresCalDate(new Date());
    const selectedStr = formatAresCalDate(aresCalSelectedDate);

    // Prev month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const cell = document.createElement('div');
        cell.className = 'h-8 sm:h-9 md:h-10 rounded-lg md:rounded-xl flex flex-col items-center justify-center text-[11px] md:text-xs text-gray-600 font-medium cursor-pointer hover:bg-white/5 transition-all select-none';
        cell.innerText = d;
        cell.onclick = () => {
            changeAresCalMonth(-1);
        };
        grid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = formatAresCalDate(dateObj);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedStr;
        const hasEvents = aresCalMonthDatesWithEvents.has(dateStr);

        const cell = document.createElement('div');
        let classes = 'h-8 sm:h-9 md:h-10 rounded-lg md:rounded-xl flex flex-col items-center justify-center text-[11px] md:text-xs font-bold relative cursor-pointer transition-all select-none ';
        
        if (isSelected) {
            classes += 'bg-cyan-500 text-black font-black shadow-md shadow-cyan-500/25 scale-[1.03]';
        } else if (isToday) {
            classes += 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25';
        } else {
            classes += 'bg-white/[0.02] border border-white/5 text-gray-300 hover:bg-white/10 hover:text-white';
        }

        cell.className = classes;
        cell.innerHTML = `
            <span>${d}</span>
            ${hasEvents ? `<span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-black' : 'bg-cyan-400'} absolute bottom-1"></span>` : ''}
        `;

        cell.onclick = () => {
            aresCalSelectedDate = dateObj;
            renderAresCalGrid();
            updateAresCalLabels();
            fetchAresDayEvents(dateStr);
        };

        grid.appendChild(cell);
    }
}

async function fetchAresDayEvents(dateStr) {
    const list = document.getElementById('ares-cal-events-list');
    if (!list) return;

    list.innerHTML = `<div class="p-6 text-center text-gray-500 text-xs font-mono"><i data-lucide="loader" class="w-3.5 h-3.5 inline animate-spin mr-1.5 text-cyan-400"></i>Загрузка событий...</div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_getCalendarDay', date: dateStr })
        });
        const data = await res.json();
        aresCalDayEvents = data.events || [];
        renderAresDayEventsList();
    } catch(e) {
        list.innerHTML = `<div class="p-4 text-center text-red-400 text-xs">Ошибка загрузки: ${e.message}</div>`;
    }
}

function renderAresDayEventsList() {
    const list = document.getElementById('ares-cal-events-list');
    if (!list) return;

    if (aresCalDayEvents.length === 0) {
        list.innerHTML = `
            <div class="p-6 text-center text-gray-500 rounded-xl border border-dashed border-white/10 space-y-1.5">
                <i data-lucide="calendar-x" class="w-5 h-5 mx-auto opacity-40"></i>
                <div class="text-xs font-bold uppercase tracking-wider text-gray-400">Нет событий</div>
                <div class="text-[10px] text-gray-600">Свободное время в расписании</div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    list.innerHTML = aresCalDayEvents.map(ev => `
        <div onclick="openAresEventModal('${encodeURIComponent(JSON.stringify(ev))}')" class="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-cyan-500/30 cursor-pointer transition-all flex items-center justify-between group">
            <div class="flex items-center gap-2.5">
                <div class="w-11 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-center font-mono text-[10px] font-bold shrink-0">
                    ${ev.start || '09:00'}
                </div>
                <div class="min-w-0">
                    <h5 class="text-white font-bold text-xs group-hover:text-cyan-400 transition-colors truncate">${escapeHtml(ev.title)}</h5>
                    <span class="text-[10px] text-gray-500 font-mono block">${ev.start || ''} — ${ev.end || ''}</span>
                </div>
            </div>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-gray-600 group-hover:text-white transition-colors shrink-0"></i>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

// Modal handling
window.openAresEventModal = function(encodedEv) {
    const modal = document.getElementById('ares-event-modal');
    if (!modal) return;

    const delBtn = document.getElementById('modal-event-delete-btn');
    const titleHeader = document.getElementById('modal-event-title');

    if (encodedEv) {
        const ev = JSON.parse(decodeURIComponent(encodedEv));
        document.getElementById('modal-event-id').value = ev.id || '';
        document.getElementById('modal-event-name').value = ev.title || '';
        document.getElementById('modal-event-start').value = ev.start || '10:00';
        document.getElementById('modal-event-end').value = ev.end || '11:00';
        if (delBtn) delBtn.classList.remove('hidden');
        if (titleHeader) titleHeader.innerText = 'Редактировать событие';
    } else {
        document.getElementById('modal-event-id').value = '';
        document.getElementById('modal-event-name').value = '';
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        const end = new Date(now);
        end.setHours(end.getHours() + 1);
        document.getElementById('modal-event-start').value = String(now.getHours()).padStart(2, '0') + ':00';
        document.getElementById('modal-event-end').value = String(end.getHours()).padStart(2, '0') + ':00';
        if (delBtn) delBtn.classList.add('hidden');
        if (titleHeader) titleHeader.innerText = 'Новое событие';
    }

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.closeAresEventModal = function() {
    document.getElementById('ares-event-modal')?.classList.add('hidden');
};

window.saveAresEventModal = async function() {
    const id = document.getElementById('modal-event-id')?.value;
    const title = document.getElementById('modal-event-name')?.value.trim();
    const start = document.getElementById('modal-event-start')?.value;
    const end = document.getElementById('modal-event-end')?.value;
    const dateStr = formatAresCalDate(aresCalSelectedDate);

    if (!title) return alert('Введите название события');

    try {
        await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ares_saveCalendarEvent',
                id: id || undefined,
                title,
                start: `${dateStr}T${start}:00`,
                end: `${dateStr}T${end}:00`,
                date: dateStr
            })
        });
        closeAresEventModal();
        await renderAresCalendar();
    } catch(e) {
        alert('Ошибка сохранения события: ' + e.message);
    }
};

window.deleteAresEventModal = async function() {
    const id = document.getElementById('modal-event-id')?.value;
    if (!id) return;
    if (!confirm('Удалить это событие из Google Календаря?')) return;

    // Оптимистичное удаление из UI для мгновенного отклика (чтобы не казалось, что нужно 2 клика из-за задержки API)
    aresCalDayEvents = aresCalDayEvents.filter(ev => ev.id !== id);
    renderAresDayEventsList();
    closeAresEventModal();

    try {
        await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_deleteCalendarEvent', id })
        });
        aresCalMonthCache.clear();
        await renderAresCalendar();
        
        // Повторно очищаем локальный массив на случай если Google Calendar API отдал кэшированный старый результат
        aresCalDayEvents = aresCalDayEvents.filter(ev => ev.id !== id);
        renderAresDayEventsList();
    } catch(e) {
        alert('Ошибка удаления: ' + e.message);
    }
};

// ==========================================
// 5. Отрисовка Центра Интентов
// ==========================================
window.renderAresIntents = function() {
    const container = document.getElementById('ares-intents-list');
    if (!container) return;

    const query = (document.getElementById('ares-intent-search')?.value || '').toLowerCase().trim();
    
    // Фильтрация
    let filtered = aresIntentsData;
    if (activeIntentFilter !== 'all') {
        filtered = filtered.filter(i => (i.module || '').toLowerCase() === activeIntentFilter.toLowerCase());
    }
    if (query) {
        filtered = filtered.filter(i => 
            (i.function || '').toLowerCase().includes(query) ||
            (i.exact || '').toLowerCase().includes(query) ||
            (i.instruction || '').toLowerCase().includes(query) ||
            (i.module || '').toLowerCase().includes(query)
        );
    }

    // Группировка по модулям
    const grouped = {};
    filtered.forEach(item => {
        const mod = item.module || 'other';
        if (!grouped[mod]) grouped[mod] = [];
        grouped[mod].push(item);
    });

    if (Object.keys(grouped).length === 0) {
        container.innerHTML = `<div class="p-12 text-center text-gray-500 font-bold uppercase tracking-widest text-xs">Интенты не найдены</div>`;
        return;
    }

    container.innerHTML = Object.keys(grouped).map(mod => {
        const items = grouped[mod];
        return `
            <div class="glass rounded-2xl border border-white/5 overflow-hidden mb-4">
                <div class="px-6 py-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-3 rounded-full bg-cyan-400"></span>
                        <h4 class="text-white font-bold text-sm uppercase tracking-wider">${mod}</h4>
                        <span class="text-[10px] text-gray-500 font-mono">(${items.length})</span>
                    </div>
                </div>
                <div class="divide-y divide-white/5">
                    ${items.map(item => `
                        <div class="p-5 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div class="space-y-1.5 flex-1">
                                <div class="flex items-center gap-2">
                                    <code class="text-cyan-400 font-bold text-xs bg-cyan-500/10 px-2 py-0.5 rounded">${item.function}</code>
                                    ${item.enabled !== false ? '<span class="text-[9px] text-green-400 font-bold uppercase tracking-widest">Active</span>' : '<span class="text-[9px] text-red-400 font-bold uppercase tracking-widest">Disabled</span>'}
                                </div>
                                <div class="text-gray-300 text-xs font-mono">
                                    <b>Точные фразы:</b> <span class="text-gray-400">${item.exact || '—'}</span>
                                </div>
                                ${item.instruction ? `<div class="text-gray-500 text-[11px]"><b>Инструкция ИИ:</b> ${item.instruction}</div>` : ''}
                            </div>
                            <button onclick="openAresIntentModal('${encodeURIComponent(item.function)}')" class="px-4 py-2 bg-white/5 hover:bg-cyan-500 hover:text-black text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border border-white/10 shrink-0">
                                Изменить
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
};

window.setAresIntentFilter = function(mod) {
    activeIntentFilter = mod;
    document.querySelectorAll('.intent-filter-chip').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter-chip-${mod}`)?.classList.add('active');
    renderAresIntents();
};

// ==========================================
// 6. Модальное окно редактирования интента
// ==========================================
let currentEditingIntentFunction = null;

window.openAresIntentModal = function(encodedFn) {
    const fn = decodeURIComponent(encodedFn);
    const intent = aresIntentsData.find(i => i.function === fn);
    if (!intent) return;

    currentEditingIntentFunction = fn;
    document.getElementById('modal-intent-fn-title').innerText = intent.function;
    document.getElementById('modal-intent-module').value = intent.module || '';
    document.getElementById('modal-intent-exact').value = intent.exact || '';
    document.getElementById('modal-intent-instruction').value = intent.instruction || '';
    document.getElementById('modal-intent-json').value = intent.json_format || '';
    document.getElementById('modal-intent-enabled').checked = intent.enabled !== false;

    document.getElementById('ares-intent-modal').classList.remove('hidden');
};

window.closeAresIntentModal = function() {
    document.getElementById('ares-intent-modal').classList.add('hidden');
    currentEditingIntentFunction = null;
};

window.saveAresIntentModal = async function() {
    if (!currentEditingIntentFunction) return;

    const updatedIntent = {
        function: currentEditingIntentFunction,
        module: document.getElementById('modal-intent-module').value,
        exact: document.getElementById('modal-intent-exact').value,
        instruction: document.getElementById('modal-intent-instruction').value,
        json_format: document.getElementById('modal-intent-json').value,
        enabled: document.getElementById('modal-intent-enabled').checked
    };

    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_saveIntent', intent: updatedIntent })
        });
        const data = await res.json();
        if (data.success && data.intents) {
            aresIntentsData = data.intents;
            closeAresIntentModal();
            renderAresIntents();
        }
    } catch(e) {
        alert('Ошибка сохранения интента: ' + e.message);
    }
};

window.syncAllAresIntents = async function() {
    try {
        const btn = document.getElementById('ares-sync-intents-btn');
        if (btn) btn.innerText = 'Синхронизация...';
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_syncIntents' })
        });
        const data = await res.json();
        if (btn) btn.innerText = '🔄 Синхронизировать Интенты';
        alert(`✅ Успешно синхронизировано ${data.count || aresIntentsData.length} интентов с кэшем!`);
    } catch(e) {
        alert('Ошибка синхронизации: ' + e.message);
    }
};

// ==========================================
// 7. Отрисовка Модулей
// ==========================================
window.renderAresModules = function() {
    const container = document.getElementById('ares-modules-grid');
    if (!container) return;

    container.innerHTML = aresModulesData.map(mod => `
        <div class="glass rounded-[2rem] p-6 border border-white/5 flex flex-col justify-between relative group hover:border-cyan-500/30 transition-all">
            <div>
                <div class="flex items-center justify-between mb-4">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center border" style="background: ${mod.color}15; border-color: ${mod.color}33; color: ${mod.color};">
                        <i data-lucide="${mod.icon || 'cpu'}" class="w-5 h-5"></i>
                    </div>
                    <label class="toggle-switch relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" onchange="toggleAresModule('${mod.name}', this.checked)" ${mod.enabled ? 'checked' : ''} class="sr-only peer">
                        <div class="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${mod.title}</h4>
                <p class="text-gray-400 text-xs leading-relaxed mb-4">${mod.desc || 'Модуль системы Ares OS'}</p>
            </div>
            <div class="pt-4 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-500 uppercase font-mono">
                <span>Приоритет: <b>${mod.priority || 50}</b></span>
                <span>Таймаут: <b>${mod.sessionTimeout || 10}м</b></span>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
};

window.toggleAresModule = async function(moduleName, isEnabled) {
    const mod = aresModulesData.find(m => m.name === moduleName);
    if (mod) mod.enabled = isEnabled;

    try {
        await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ares_saveModuleConfig',
                moduleName: moduleName,
                config: { enabled: isEnabled }
            })
        });
    } catch(e) {
        console.error("toggleAresModule error:", e);
    }
};

// ==========================================
// 8. Отрисовка Настроек
// ==========================================
window.renderAresSettings = function() {
    const modelInput = document.getElementById('ares-setting-model');
    const debugToggle = document.getElementById('ares-setting-debug');
    if (modelInput) modelInput.value = aresSettingsData.model || 'google/gemini-2.5-flash-lite';
    if (debugToggle) debugToggle.checked = !!aresSettingsData.debug;
};

window.saveAresSettingsUI = async function() {
    const model = document.getElementById('ares-setting-model')?.value || 'google/gemini-2.5-flash-lite';
    const debug = document.getElementById('ares-setting-debug')?.checked || false;

    aresSettingsData = { model, debug };

    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_saveSettings', settings: aresSettingsData })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Системные настройки Ареса сохранены!');
        }
    } catch(e) {
        alert('Ошибка сохранения настроек: ' + e.message);
    }
};

// ==========================================
// 9. Когнитивная Лаборатория
// ==========================================
window.renderAresLab = function() {
    // Вкладка памяти и логов
};

// ==========================================
// 10. Live Консоль
// ==========================================
window.sendAresConsolePrompt = async function() {
    const input = document.getElementById('ares-console-input');
    const outputContainer = document.getElementById('ares-console-output');
    if (!input || !outputContainer) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    outputContainer.innerHTML += `
        <div class="flex gap-3 justify-end items-start animate-fade-in">
            <div class="p-4 rounded-2xl bg-cyan-500 text-black font-bold text-xs max-w-lg shadow-lg shadow-cyan-500/10">
                ${escapeHtml(text)}
            </div>
            <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                <i data-lucide="user" class="w-4 h-4 text-white"></i>
            </div>
        </div>
    `;
    outputContainer.scrollTop = outputContainer.scrollHeight;

    const loaderId = 'console-loader-' + Date.now();
    outputContainer.innerHTML += `
        <div id="${loaderId}" class="flex gap-3 items-start animate-fade-in">
            <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/40 text-cyan-400">
                <i data-lucide="cpu" class="w-4 h-4 animate-spin"></i>
            </div>
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10 text-gray-400 text-xs">
                Арес анализирует контекст и выполняет протоколы...
            </div>
        </div>
    `;
    outputContainer.scrollTop = outputContainer.scrollHeight;
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ares_testPrompt', prompt: text })
        });
        const data = await res.json();
        
        document.getElementById(loaderId)?.remove();

        const replyHtml = data.reply || "⚠️ Ответ не получен";
        const duration = data.duration || 0;

        outputContainer.innerHTML += `
            <div class="flex gap-3 items-start animate-fade-in">
                <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/40 text-cyan-400">
                    <i data-lucide="cpu" class="w-4 h-4"></i>
                </div>
                <div class="space-y-2 max-w-xl">
                    <div class="p-5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs leading-relaxed space-y-2 shadow-xl">
                        ${replyHtml}
                    </div>
                    <div class="flex items-center gap-3 text-[9px] text-gray-500 font-mono px-2">
                        <span>⚡ ${duration} ms</span>
                        <span>🤖 ${aresSettingsData.model || 'Gemini 2.5 Flash Lite'}</span>
                    </div>
                </div>
            </div>
        `;
        outputContainer.scrollTop = outputContainer.scrollHeight;
        if (window.lucide) lucide.createIcons();

    } catch(e) {
        document.getElementById(loaderId)?.remove();
        outputContainer.innerHTML += `
            <div class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                ❌ Ошибка выполнения: ${e.message}
            </div>
        `;
    }
};
