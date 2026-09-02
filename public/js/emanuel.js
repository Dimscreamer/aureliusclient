/**
 * 🔥 public/js/emanuel.js — Emanuel Dating OS Wingman Controller for CRM
 */

window.EmanuelOS = {
    slots: [],
    activeSlot: null,
    settings: {
        platform: 'Tinder',
        goal: 'hookup',
        tone: 'confident',
        escalation: 'optimal',
        model: 'google/gemini-2.5-flash'
    },
    history: [],
    uploadedImageBase64: null,

    async init() {
        console.log('[EmanuelOS] Initializing view...');
        await this.loadData();
        this.setupEventListeners();
    },

    async loadData() {
        const slotsContainer = document.getElementById('emanuel-slots-list');
        if (slotsContainer) {
            slotsContainer.innerHTML = '<div class="text-xs text-slate-500 p-4 text-center">Загрузка слотов девушек...</div>';
        }

        try {
            const res = await apiFetch({ action: 'emanuel_getSlots' });
            if (res && res.success) {
                this.slots = res.slots || [];
                this.activeSlot = res.activeSlot || this.slots[0];
                if (res.settings) this.settings = { ...this.settings, ...res.settings };

                this.renderSlots();
                this.renderSettings();
                await this.loadHistory();
            } else {
                showNotification('Ошибка загрузки Emanuel OS: ' + (res?.error || 'неизвестно'), 'error');
            }
        } catch (e) {
            console.error('[EmanuelOS] loadData error:', e);
            showNotification('Ошибка сети при загрузке данных Emanuel', 'error');
        }
    },

    renderSlots() {
        const container = document.getElementById('emanuel-slots-list');
        if (!container) return;

        container.innerHTML = this.slots.map(slot => {
            const isActive = this.activeSlot && String(this.activeSlot.id) === String(slot.id);
            const temp = slot.temperature || '3/10';

            return `
                <div onclick="window.EmanuelOS.switchSlot('${slot.id}')"
                     class="p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                         isActive 
                         ? 'bg-rose-500/10 border-rose-500/40 shadow-lg shadow-rose-500/5 ring-1 ring-rose-500/30' 
                         : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                     }">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                            isActive ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-slate-800 text-slate-400'
                        }">
                            ${slot.id}
                        </div>
                        <div class="min-w-0">
                            <div class="font-semibold text-sm text-slate-200 truncate flex items-center gap-2">
                                <span>${escapeHtml(slot.name)}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">${escapeHtml(slot.platform || 'Tinder')}</span>
                            </div>
                            <div class="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-2">
                                <span>🌡 ${escapeHtml(temp)}</span>
                                <span>•</span>
                                <span>💬 ${slot.turnsCount || 0} реплик</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                        <button onclick="window.EmanuelOS.renameSlotPrompt('${slot.id}', '${escapeHtml(slot.name)}')" 
                                class="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition" title="Переименовать">
                            <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="window.EmanuelOS.clearSlotPrompt('${slot.id}', '${escapeHtml(slot.name)}')" 
                                class="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition" title="Очистить память">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();

        // Обновляем заголовок текущей девушки
        const currentGirlTitle = document.getElementById('emanuel-current-girl-title');
        if (currentGirlTitle && this.activeSlot) {
            currentGirlTitle.textContent = `${this.activeSlot.name} (${this.activeSlot.platform || 'Tinder'})`;
        }
    },

    renderSettings() {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('emanuel-setting-goal', this.settings.goal || 'hookup');
        setVal('emanuel-setting-tone', this.settings.tone || 'confident');
        setVal('emanuel-setting-escalation', this.settings.escalation || 'optimal');
        setVal('emanuel-setting-platform', this.settings.platform || 'Tinder');
    },

    async saveSettings() {
        const getVal = (id) => document.getElementById(id)?.value;
        this.settings = {
            goal: getVal('emanuel-setting-goal') || 'hookup',
            tone: getVal('emanuel-setting-tone') || 'confident',
            escalation: getVal('emanuel-setting-escalation') || 'optimal',
            platform: getVal('emanuel-setting-platform') || 'Tinder',
            model: 'google/gemini-2.5-flash'
        };

        try {
            const res = await apiFetch({
                action: 'emanuel_saveSettings',
                settings: this.settings
            });
            if (res && res.success) {
                showNotification('Настройки Emanuel OS сохранены!', 'success');
            }
        } catch (e) {
            showNotification('Ошибка сохранения настроек', 'error');
        }
    },

    async switchSlot(slotId) {
        try {
            const res = await apiFetch({ action: 'emanuel_switchSlot', slotId });
            if (res && res.success) {
                this.activeSlot = res.slot;
                this.renderSlots();
                await this.loadHistory();
            }
        } catch (e) {
            showNotification('Ошибка переключения слота', 'error');
        }
    },

    async renameSlotPrompt(slotId, oldName) {
        const newName = prompt('Новое имя девушки / контекст диалога:', oldName);
        if (!newName || newName.trim() === oldName) return;

        try {
            const res = await apiFetch({ action: 'emanuel_renameSlot', slotId, name: newName.trim() });
            if (res && res.success) {
                showNotification('Диалог переименован!', 'success');
                await this.loadData();
            }
        } catch (e) {
            showNotification('Ошибка переименования', 'error');
        }
    },

    async clearSlotPrompt(slotId, name) {
        if (!confirm(`Точно очистить контекст переписки с «${name}»? Память бота для неё будет сброшена.`)) return;

        try {
            const res = await apiFetch({ action: 'emanuel_clearSlot', slotId });
            if (res && res.success) {
                showNotification('Память диалога очищена!', 'success');
                await this.loadData();
            }
        } catch (e) {
            showNotification('Ошибка очистки памяти', 'error');
        }
    },

    async loadHistory() {
        const container = document.getElementById('emanuel-chat-turns');
        if (!container || !this.activeSlot) return;

        container.innerHTML = '<div class="text-xs text-slate-500 py-3 text-center">Загрузка диалога...</div>';

        try {
            const res = await apiFetch({ action: 'emanuel_getHistory', slotId: this.activeSlot.id, limit: 20 });
            if (res && res.success) {
                this.history = res.history || [];
                this.renderHistory();
            }
        } catch (e) {
            container.innerHTML = '<div class="text-xs text-rose-500 py-3 text-center">Ошибка загрузки истории</div>';
        }
    },

    renderHistory() {
        const container = document.getElementById('emanuel-chat-turns');
        if (!container) return;

        if (this.history.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-slate-500 text-xs">
                    <div class="text-2xl mb-2">💬</div>
                    <div>История переписки пуста. Введи первую реплику девушки ниже или отправь скриншот!</div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.history.map(turn => `
            <div class="flex flex-col gap-2.5 mb-4">
                <!-- Девушка -->
                <div class="flex items-start gap-2.5 justify-start max-w-[85%]">
                    <div class="w-7 h-7 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        💃
                    </div>
                    <div class="bg-slate-800/80 border border-slate-700/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs text-slate-200">
                        <div class="font-semibold text-[10px] text-pink-400/80 mb-0.5 uppercase tracking-wider">Девушка:</div>
                        <div class="whitespace-pre-wrap">${escapeHtml(turn.girl)}</div>
                    </div>
                </div>

                <!-- Ответ Wingman -->
                <div class="flex items-start gap-2.5 justify-end max-w-[85%] self-end">
                    <div class="bg-rose-500/15 border border-rose-500/30 rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-xs text-slate-100">
                        <div class="font-semibold text-[10px] text-rose-400/90 mb-0.5 uppercase tracking-wider flex items-center justify-between gap-4">
                            <span>Твой ответ / Wingman:</span>
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(turn.wingman)}')" class="hover:text-white transition" title="Копировать">
                                📋
                            </button>
                        </div>
                        <div class="whitespace-pre-wrap">${escapeHtml(turn.wingman)}</div>
                    </div>
                    <div class="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        🔥
                    </div>
                </div>
            </div>
        `).join('');

        // Скроллим вниз
        container.scrollTop = container.scrollHeight;
    },

    setupEventListeners() {
        const fileInput = document.getElementById('emanuel-photo-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    this.uploadedImageBase64 = event.target.result;
                    const preview = document.getElementById('emanuel-photo-preview');
                    if (preview) {
                        preview.src = this.uploadedImageBase64;
                        document.getElementById('emanuel-photo-preview-wrap')?.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    },

    removeUploadedPhoto() {
        this.uploadedImageBase64 = null;
        const fileInput = document.getElementById('emanuel-photo-input');
        if (fileInput) fileInput.value = '';
        document.getElementById('emanuel-photo-preview-wrap')?.classList.add('hidden');
    },

    async generateAdvice() {
        const textInput = document.getElementById('emanuel-girl-text');
        const text = textInput ? textInput.value.trim() : '';

        if (!text && !this.uploadedImageBase64) {
            showNotification('Введи реплику девушки или прикрепи скриншот диалога!', 'warning');
            return;
        }

        const btn = document.getElementById('emanuel-generate-btn');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block mr-2">⚡</span> Нейросеть генерирует...`;

        const resultWrap = document.getElementById('emanuel-advice-result-wrap');
        const resultContainer = document.getElementById('emanuel-advice-result');

        if (resultWrap) resultWrap.classList.remove('hidden');
        if (resultContainer) {
            resultContainer.innerHTML = `
                <div class="p-6 text-center text-slate-400 text-xs animate-pulse">
                    🔥 Wingman анализирует подтекст, градус напряжения и подбирает 3 идеальные реплики...
                </div>
            `;
        }

        try {
            const res = await apiFetch({
                action: 'emanuel_generateAdvice',
                text: text,
                imageBase64: this.uploadedImageBase64,
                settings: this.settings,
                saveToHistory: true
            });

            if (res && res.success) {
                this.renderAdviceCard(res.content, res.durationMs);
                if (textInput) textInput.value = '';
                this.removeUploadedPhoto();
                await this.loadData();
            } else {
                if (resultContainer) {
                    resultContainer.innerHTML = `<div class="p-4 text-rose-400 text-xs">${escapeHtml(res?.content || res?.error || 'Ошибка генерации')}</div>`;
                }
            }
        } catch (e) {
            console.error('[EmanuelOS] generateAdvice error:', e);
            if (resultContainer) {
                resultContainer.innerHTML = `<div class="p-4 text-rose-400 text-xs">Ошибка соединения с сервером</div>`;
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    },

    renderAdviceCard(rawHtml, durationMs = 0) {
        const container = document.getElementById('emanuel-advice-result');
        if (!container) return;

        // Извлекаем варианты ответа в кавычках
        const quotes = [];
        const regex = /«([^»]+)»/g;
        let m;
        while ((m = regex.exec(rawHtml)) !== null) {
            quotes.push(m[1].trim());
        }

        const softReply = quotes[0] || '';
        const confReply = quotes[1] || '';
        const boldReply = quotes[2] || '';

        container.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-2">
                    <span class="font-semibold text-rose-400">⚡ Сгенерировано за ${(durationMs / 1000).toFixed(1)} сек</span>
                    <button onclick="window.EmanuelOS.copyRawAdvice()" class="text-[11px] hover:text-slate-200 text-slate-400 flex items-center gap-1 transition">
                        📋 Копировать весь разбор
                    </button>
                </div>

                <!-- Карточки вариантов -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <!-- 1. Мягкий -->
                    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 flex flex-col justify-between">
                        <div>
                            <div class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🟢 Мягкий / Игривый</span>
                            </div>
                            <div class="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                                «${escapeHtml(softReply || 'Вариант в разборе ниже')}»
                            </div>
                        </div>
                        ${softReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(softReply)}')" 
                                    class="w-full py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>

                    <!-- 2. Уверенный -->
                    <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex flex-col justify-between">
                        <div>
                            <div class="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🟡 Уверенный / Флирт</span>
                            </div>
                            <div class="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                                «${escapeHtml(confReply || 'Вариант в разборе ниже')}»
                            </div>
                        </div>
                        ${confReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(confReply)}')" 
                                    class="w-full py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>

                    <!-- 3. Дерзкий -->
                    <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 flex flex-col justify-between">
                        <div>
                            <div class="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🔴 Дерзкий / Табу</span>
                            </div>
                            <div class="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                                «${escapeHtml(boldReply || 'Вариант в разборе ниже')}»
                            </div>
                        </div>
                        ${boldReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(boldReply)}')" 
                                    class="w-full py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Полный разбор и совет -->
                <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2 font-sans">
                    <div class="font-semibold text-slate-200 text-xs mb-1">💡 Анализ и совет Wingman:</div>
                    <div class="leading-relaxed whitespace-pre-wrap">${rawHtml}</div>
                </div>
            </div>
        `;
        window._lastRawAdvice = rawHtml;
    },

    copyText(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Скопировано в буфер обмена! 🚀', 'success');
        }).catch(() => {
            showNotification('Не удалось скопировать', 'error');
        });
    },

    copyRawAdvice() {
        if (window._lastRawAdvice) {
            this.copyText(window._lastRawAdvice.replace(/<[^>]+>/g, ''));
        }
    }
};

window.initEmanuelView = function() {
    window.EmanuelOS.init();
};

// Hook into switchView
setTimeout(() => {
    const origSwitch = window.switchView;
    if (origSwitch) {
        window.switchView = (id) => {
            origSwitch(id);
            if (id === 'emanuel') {
                window.EmanuelOS.init();
            }
        };
    }
}, 1200);

