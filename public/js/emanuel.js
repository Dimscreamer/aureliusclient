/**
 * 💋 Emanuel Dating OS Controller (Multi-Session & Lead Me Engine)
 * Платформы ПОЛНОСТЬЮ УДАЛЕНЫ. Фокус на TIME TO COMPATIBILITY и N-сессиях.
 */

// Автономный, надежный транспорт API вызовов (устраняет ошибку "TypeError: window.apiFetch is not a function")
async function callEmanuelApi(data) {
    const isHosted = typeof window !== 'undefined' && 
        (window.location.origin.includes('web.app') || window.location.origin.includes('firebaseapp.com'));
    const url = isHosted ? '/api' : 'https://api-lzh3pje5pa-uc.a.run.app';

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText || 'Сбой сервера'}`);
    }
    return await res.json();
}
window.apiFetch = callEmanuelApi;

window.EmanuelOS = {
    currentSessionId: 'session_1',
    sessions: [],
    settings: {
        mode: 'SEX'
    },
    attachedPhotoBase64: null,
    isGenerating: false,

    async init() {
        console.log('🔞 Emanuel OS Initializing (Multi-Session Architecture)...');
        this.bindEvents();
        await this.loadData();
    },

    bindEvents() {
        const fileInput = document.getElementById('emanuel-photo-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handlePhotoSelect(e));
        }

        const girlInput = document.getElementById('emanuel-girl-text');
        if (girlInput) {
            girlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.generateAdvice();
                }
            });
        }
    },

    async loadData() {
        try {
            const res = await callEmanuelApi({
                action: 'emanuel_getSessions'
            });

            if (res && res.success) {
                this.sessions = res.sessions || res.slots || [];
                const active = res.activeSession || res.activeSlot || this.sessions[0];
                this.currentSessionId = active ? String(active.id) : 'session_1';
                this.settings = res.settings || this.settings;

                this.renderSessions();
                this.updateActiveSessionHeader(active);
                await this.loadHistory();
            }
        } catch (e) {
            console.error('Error loading Emanuel data:', e);
            if (window.showNotification) showNotification('Ошибка подключения к Emanuel OS: ' + e.message, 'error');
        }
    },

    updateActiveSessionHeader(active) {
        const titleEl = document.getElementById('emanuel-current-girl-title');
        if (titleEl && active) {
            titleEl.textContent = `${active.name}`;
        }

        // Обновляем режим в кнопках шапки
        this.updateModeUI(active?.mode || 'SEX');

        // Обновляем индикатор шагов
        this.updateStepsUI(active?.stepsToTaboo, active?.tactic);
    },

    updateModeUI(mode) {
        const btnSex = document.getElementById('emanuel-btn-mode-sex');
        const btnNorm = document.getElementById('emanuel-btn-mode-normal');
        const btnDate = document.getElementById('emanuel-btn-mode-date');

        const activeClasses = ['bg-rose-500', 'text-white', 'shadow-sm'];
        const inactiveClasses = ['text-slate-400', 'hover:text-white'];

        [btnSex, btnNorm, btnDate].forEach(btn => {
            if (!btn) return;
            btn.classList.remove('bg-rose-500', 'bg-cyan-500', 'bg-emerald-500', 'text-white', 'shadow-sm', 'text-slate-400', 'hover:text-white');
        });

        if (mode === 'SEX' && btnSex) {
            btnSex.classList.add('bg-rose-500', 'text-white', 'shadow-sm');
            if (btnNorm) btnNorm.classList.add(...inactiveClasses);
            if (btnDate) btnDate.classList.add(...inactiveClasses);
        } else if (mode === 'NORMAL' && btnNorm) {
            btnNorm.classList.add('bg-cyan-500', 'text-white', 'shadow-sm');
            if (btnSex) btnSex.classList.add(...inactiveClasses);
            if (btnDate) btnDate.classList.add(...inactiveClasses);
        } else if (mode === 'DATE' && btnDate) {
            btnDate.classList.add('bg-emerald-500', 'text-white', 'shadow-sm');
            if (btnSex) btnSex.classList.add(...inactiveClasses);
            if (btnNorm) btnNorm.classList.add(...inactiveClasses);
        }
    },

    updateStepsUI(steps, tactic) {
        const stepsBadge = document.getElementById('emanuel-steps-badge');
        const stepsText = document.getElementById('emanuel-steps-text');
        const tacticText = document.getElementById('emanuel-tactic-text');

        if (!stepsBadge || !stepsText) return;

        const s = typeof steps === 'number' ? steps : 1;

        if (s === 0) {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = '🔥 0 шагов — МОЖНО СПРАШИВАТЬ';
        } else if (s === 1) {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = '⚡ Дистанция: ~1 шаг до табу';
        } else {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = `🧊 Дистанция: ~${s} шага до табу`;
        }

        if (tacticText) {
            if (tactic === 'DIRECT' || s === 0) {
                tacticText.innerHTML = '⚡ DIRECT (Прямой вопрос о табу и границах)';
            } else if (tactic === 'RESET') {
                tacticText.innerHTML = '🧊 RESET (Девушка закрылась, нужен откат)';
            } else {
                tacticText.innerHTML = '🔥 BUILD (Короткий мостик к теме)';
            }
        }
    },

    async setMode(mode) {
        try {
            this.updateModeUI(mode);
            await callEmanuelApi({
                action: 'emanuel_setSessionMode',
                sessionId: this.currentSessionId,
                mode: mode
            });
            if (window.showNotification) showNotification(`Режим переключен на ${mode} MODE`, 'info');
            await this.loadData();
        } catch (e) {
            console.error('Error setting mode:', e);
        }
    },

    renderSessions() {
        const container = document.getElementById('emanuel-slots-list');
        if (!container) return;

        container.innerHTML = this.sessions.map((s, idx) => {
            const isActive = String(s.id) === String(this.currentSessionId);
            const activeBg = isActive 
                ? 'bg-rose-500/20 border-rose-500/50 shadow-md shadow-rose-500/10' 
                : 'bg-white/5 border-white/5 hover:bg-white/10';

            const stepsBadge = s.stepsToTaboo === 0
                ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">0 шагов</span>`
                : `<span class="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold">~${s.stepsToTaboo || 1} ш.</span>`;

            return `
                <div class="p-3 rounded-xl border ${activeBg} transition flex items-center justify-between cursor-pointer group"
                     onclick="window.EmanuelOS.switchSession('${s.id}')">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-8 h-8 rounded-lg ${isActive ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-400'} flex items-center justify-center font-bold text-xs flex-shrink-0">
                            ${idx + 1}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-xs text-white truncate">${escapeHtml(s.name)}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 truncate mt-0.5">
                                Режим: <b class="text-rose-400">${s.mode || 'SEX'}</b> • ${s.turnsCount || 0} реплик
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${stepsBadge}
                        <button onclick="event.stopPropagation(); window.EmanuelOS.deleteSession('${s.id}', '${escapeHtml(s.name)}')" 
                                class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition" title="Удалить диалог">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    async promptNewGirl() {
        const name = prompt('Введи имя девушки для нового диалога:');
        if (!name || !name.trim()) return;

        try {
            const res = await callEmanuelApi({
                action: 'emanuel_createSession',
                name: name.trim()
            });
            if (res && res.success) {
                if (window.showNotification) showNotification(`Диалог с «${res.session.name}» создан!`, 'success');
                await this.loadData();
            }
        } catch (e) {
            console.error('Error creating session:', e);
            if (window.showNotification) showNotification('Ошибка создания диалога', 'error');
        }
    },

    async switchSession(sessionId) {
        if (String(sessionId) === String(this.currentSessionId)) return;
        this.currentSessionId = String(sessionId);
        try {
            const res = await callEmanuelApi({
                action: 'emanuel_switchSession',
                sessionId: this.currentSessionId
            });
            if (res && res.success) {
                const active = res.session || res.slot;
                this.updateActiveSessionHeader(active);
                this.renderSessions();
                await this.loadHistory();
            }
        } catch (e) {
            console.error('Error switching session:', e);
        }
    },

    async deleteSession(sessionId, name) {
        if (!confirm(`Удалить диалог с девушкой «${name}»?`)) return;
        try {
            await callEmanuelApi({
                action: 'emanuel_deleteSession',
                sessionId: sessionId
            });
            if (window.showNotification) showNotification('Диалог удален', 'success');
            await this.loadData();
        } catch (e) {
            console.error('Error deleting session:', e);
        }
    },

    async handlePhotoSelect(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.attachedPhotoBase64 = event.target.result;
            const previewWrap = document.getElementById('emanuel-photo-preview-wrap');
            const previewImg = document.getElementById('emanuel-photo-preview');
            if (previewImg) previewImg.src = this.attachedPhotoBase64;
            if (previewWrap) {
                previewWrap.classList.remove('hidden');
                previewWrap.classList.add('flex');
            }
        };
        reader.readAsDataURL(file);
    },

    removeUploadedPhoto() {
        this.attachedPhotoBase64 = null;
        const fileInput = document.getElementById('emanuel-photo-input');
        if (fileInput) fileInput.value = '';
        const previewWrap = document.getElementById('emanuel-photo-preview-wrap');
        if (previewWrap) {
            previewWrap.classList.add('hidden');
            previewWrap.classList.remove('flex');
        }
    },

    async fastTrackAdvice() {
        await this.generateAdvice(true);
    },

    async generateAdvice(fastTrack = false) {
        if (this.isGenerating) return;

        const textEl = document.getElementById('emanuel-girl-text');
        const text = textEl ? textEl.value.trim() : '';

        if (!text && !this.attachedPhotoBase64) {
            if (window.showNotification) showNotification('Введи сообщение девушки или прикрепи скриншот!', 'warning');
            return;
        }

        const btn = document.getElementById('emanuel-generate-btn');
        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Анализ...</span>`;
            if (window.lucide) lucide.createIcons();
        }

        this.isGenerating = true;

        try {
            const activeSession = this.sessions.find(s => String(s.id) === String(this.currentSessionId));
            const mode = activeSession?.mode || 'SEX';

            const res = await callEmanuelApi({
                action: 'emanuel_generateAdvice',
                sessionId: this.currentSessionId,
                text: text,
                imageBase64: this.attachedPhotoBase64,
                mode: mode,
                fastTrack: fastTrack,
                saveToHistory: true,
                settings: this.settings
            });

            if (res && res.success) {
                this.renderAdviceResult(res);
                this.updateStepsUI(res.stepsToTaboo, res.tactic);
                if (textEl) textEl.value = '';
                this.removeUploadedPhoto();
                await this.loadHistory();
                await this.loadData();
            } else {
                const errMsg = res?.content || res?.error || 'Ошибка генерации через сервер';
                if (window.showNotification) showNotification(errMsg, 'error');
            }
        } catch (e) {
            console.error('Error in generateAdvice:', e);
            if (window.showNotification) showNotification('Сбой запроса: ' + e.message, 'error');
        } finally {
            this.isGenerating = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    renderAdviceResult(res) {
        const wrap = document.getElementById('emanuel-advice-result-wrap');
        const resultEl = document.getElementById('emanuel-advice-result');
        const radarBanner = document.getElementById('emanuel-radar-banner');
        if (!wrap || !resultEl) return;

        wrap.classList.remove('hidden');

        // Рендерим Compatibility Radar, если он есть
        if (res.compatibilityRadar && res.compatibilityRadar.active) {
            radarBanner.classList.remove('hidden');
            const isComp = res.compatibilityRadar.isCompatible;
            if (isComp) {
                radarBanner.innerHTML = `
                    <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 shadow-xl shadow-emerald-500/10 space-y-2">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                                <span class="font-extrabold text-xs uppercase tracking-wider text-emerald-400">🔥 COMPATIBILITY RADAR: СОВМЕСТИМЫ!</span>
                            </div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">Рейтинг: Высокая</span>
                        </div>
                        <div class="text-xs text-slate-200 font-medium leading-relaxed">
                            ${escapeHtml(res.compatibilityRadar.verdict)}
                        </div>
                        <div class="pt-2">
                            <button onclick="window.EmanuelOS.setMode('DATE')" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center gap-1.5">
                                <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                                <span>Включить DATE MODE (Закрывать на встречу)</span>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                radarBanner.innerHTML = `
                    <div class="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/80 to-slate-900 border border-cyan-500/40 shadow-xl shadow-cyan-500/10 space-y-2">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-base">❄️</span>
                                <span class="font-extrabold text-xs uppercase tracking-wider text-cyan-400">COMPATIBILITY RADAR: СТОП. НЕСОВМЕСТИМЫ.</span>
                            </div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">Рейтинг: Низкая</span>
                        </div>
                        <div class="text-xs text-slate-300 font-medium leading-relaxed">
                            ${escapeHtml(res.compatibilityRadar.verdict)}
                        </div>
                    </div>
                `;
            }
        } else {
            radarBanner.classList.add('hidden');
        }

        const mainReply = res.mainReply || '';
        const softerReply = res.softerReply || '';
        const bolderReply = res.bolderReply || '';

        resultEl.innerHTML = `
            <div class="space-y-4">
                <!-- Карточки 3 вариантов ответа -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <!-- 1. Основной / Рекомендуемый -->
                    <div class="bg-gradient-to-b from-rose-950/40 to-slate-900/90 border border-rose-500/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg shadow-rose-500/10">
                        <div>
                            <div class="text-[11px] font-extrabold text-rose-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🎯 Основной ответ</span>
                                <span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">Top Pick</span>
                            </div>
                            <div class="text-xs text-white leading-relaxed font-sans mb-3">
                                «${escapeHtml(mainReply || 'Смотри полный разбор')}»
                            </div>
                        </div>
                        ${mainReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(mainReply)}')" 
                                    class="w-full py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>

                    <!-- 2. Мягче -->
                    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
                        <div>
                            <div class="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🎩 Мягче</span>
                            </div>
                            <div class="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                                «${escapeHtml(softerReply || 'Смотри полный разбор')}»
                            </div>
                        </div>
                        ${softerReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(softerReply)}')" 
                                    class="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>

                    <!-- 3. Прямее / Смелее -->
                    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
                        <div>
                            <div class="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                <span>🔥 Прямее / Смелее</span>
                            </div>
                            <div class="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                                «${escapeHtml(bolderReply || 'Смотри полный разбор')}»
                            </div>
                        </div>
                        ${bolderReply ? `
                            <button onclick="window.EmanuelOS.copyText('${escapeHtml(bolderReply)}')" 
                                    class="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95">
                                📋 Скопировать
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Полный вывод стратегии -->
                <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans">
                    ${res.content.replace(/\n/g, '<br>')}
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    },

    async openLeadMeModal() {
        const modal = document.getElementById('emanuel-leadme-modal');
        const content = document.getElementById('emanuel-leadme-content');
        if (!modal || !content) return;

        modal.classList.remove('hidden');
        content.innerHTML = `<div class="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin text-rose-500"></i> Сканирую все активные диалоги...</div>`;
        if (window.lucide) lucide.createIcons();

        try {
            const res = await callEmanuelApi({ action: 'emanuel_leadMe' });
            if (res && res.success) {
                content.innerHTML = `
                    <div class="text-xs text-slate-200 leading-relaxed space-y-3 font-sans">
                        ${res.analysis.replace(/\n/g, '<br>')}
                    </div>
                `;
            } else {
                content.innerHTML = `<p class="text-red-400 text-xs">Не удалось загрузить сводку: ${res?.error || 'Ошибка'}</p>`;
            }
        } catch (e) {
            content.innerHTML = `<p class="text-red-400 text-xs">Сбой запроса: ${e.message}</p>`;
        }
    },

    closeLeadMeModal() {
        const modal = document.getElementById('emanuel-leadme-modal');
        if (modal) modal.classList.add('hidden');
    },

    async loadHistory() {
        const container = document.getElementById('emanuel-chat-turns');
        if (!container) return;

        try {
            const res = await callEmanuelApi({
                action: 'emanuel_getHistory',
                sessionId: this.currentSessionId
            });

            if (res && res.success && Array.isArray(res.history)) {
                if (res.history.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8 text-xs text-slate-500">
                            История диалога пуста.<br>Вставь первое сообщение девушки выше.
                        </div>
                    `;
                    return;
                }

                container.innerHTML = res.history.map(turn => {
                    const stepsLabel = turn.stepsToTaboo === 0 ? '🔥 0 шагов' : `~${turn.stepsToTaboo || 1} ш.`;
                    return `
                        <div class="space-y-2 mb-4">
                            <!-- Девушка -->
                            <div class="flex items-start gap-2.5 max-w-[85%]">
                                <div class="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    👩
                                </div>
                                <div class="p-3 rounded-2xl bg-slate-800 text-xs text-white leading-relaxed rounded-tl-sm border border-slate-700/50">
                                    ${escapeHtml(turn.girl)}
                                </div>
                            </div>

                            <!-- Wingman -->
                            <div class="flex items-start justify-end gap-2.5 max-w-[85%] ml-auto">
                                <div class="p-3 rounded-2xl bg-rose-950/40 text-xs text-slate-200 leading-relaxed rounded-tr-sm border border-rose-500/30">
                                    <div class="flex items-center justify-between gap-3 text-[10px] text-rose-400 font-bold mb-1 border-b border-rose-500/20 pb-1">
                                        <span>Emanuel Wingman</span>
                                        <span>${stepsLabel}</span>
                                    </div>
                                    <div>«${escapeHtml(turn.wingman)}»</div>
                                </div>
                                <div class="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    ⚡
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                container.scrollTop = container.scrollHeight;
            }
        } catch (e) {
            console.error('Error loading history:', e);
        }
    },

    copyText(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (window.showNotification) showNotification('Скопировано в буфер! 🚀', 'success');
        }).catch(() => {
            if (window.showNotification) showNotification('Не удалось скопировать', 'error');
        });
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
