/**
 * 💋 Emanuel Dating OS Controller (State Machine & Single Best Move)
 */

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
    currentSessionId: null,
    currentSession: null,
    sessions: [],
    archivedSessions: [],
    showingArchive: false,
    attachedPhotoBase64: null,
    isGenerating: false,
    lastAdvice: null,

    async init() {
        console.log('🔞 Emanuel OS Initializing (Single Best Move Engine)...');
        this.bindEvents();
        await this.loadData();
    },

    bindEvents() {
        const fileInput = document.getElementById('emanuel-photo-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handlePhotoSelect(e));
        }

        const profileInput = document.getElementById('emanuel-profile-file-input');
        if (profileInput) {
            profileInput.addEventListener('change', (e) => this.handleProfilePhotoSelect(e));
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
            const res = await callEmanuelApi({ action: 'emanuel_getSessions' });

            if (res && res.success) {
                this.sessions = res.sessions || [];
                this.currentSession = res.activeSession || this.sessions[0] || null;
                this.currentSessionId = this.currentSession ? String(this.currentSession.id) : null;

                this.renderSessions();
                this.updateActiveSessionHeader(this.currentSession);
                this.updateDossierUI(this.currentSession);
                await this.loadHistory();
            }
        } catch (e) {
            console.error('Error loading Emanuel data:', e);
            if (window.showNotification) showNotification('Ошибка подключения: ' + e.message, 'error');
        }
    },

    updateDossierUI(session) {
        const wrap = document.getElementById('emanuel-dossier-wrap');
        if (!wrap) return;

        if (!session) {
            wrap.innerHTML = `<div class="text-slate-500 italic text-[11px]">Выберите диалог.</div>`;
            return;
        }

        const p = session.profile;
        const d = session.dossier;

        let html = '';

        if (p) {
            html += `
                <div class="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-1.5">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-purple-300 text-[11px] uppercase tracking-wider">Анкета (Tinder/Pure)</span>
                        <span class="text-[10px] text-slate-400">распознано</span>
                    </div>
                    ${p.statedGoal ? `<div class="text-[11px] text-white"><b class="text-purple-300">Цель:</b> «${escapeHtml(p.statedGoal)}»</div>` : ''}
                    ${p.psychotype ? `<div class="text-[11px] text-slate-300 italic"><b class="text-purple-300">Скрытый вайб:</b> ${escapeHtml(p.psychotype)}</div>` : ''}
                    ${p.bioText ? `<div class="text-[10px] text-slate-400"><b class="text-slate-300">Био:</b> ${escapeHtml(p.bioText)}</div>` : ''}
                    ${Array.isArray(p.interests) && p.interests.length ? `<div class="text-[10px] text-purple-300 font-medium">✨ ${p.interests.map(escapeHtml).join(', ')}</div>` : ''}
                </div>
            `;
        }

        const taboos = d?.taboos?.length ? d.taboos.join(', ') : 'пока не выявлены';
        const greenFlags = d?.greenFlags?.length ? d.greenFlags.join(', ') : 'пока не выявлены';

        html += `
            <div class="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
                <div class="font-bold text-rose-300 text-[11px] uppercase tracking-wider">Сексуальная совместимость</div>
                <div class="text-[11px]"><b class="text-slate-400">Табу:</b> <span class="text-white">${escapeHtml(taboos)}</span></div>
                <div class="text-[11px]"><b class="text-slate-400">Триггеры:</b> <span class="text-white">${escapeHtml(greenFlags)}</span></div>
                ${d?.dateStyle ? `<div class="text-[11px]"><b class="text-slate-400">Формат встречи:</b> <span class="text-white">${escapeHtml(d.dateStyle)}</span></div>` : ''}
            </div>
        `;

        wrap.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    updateActiveSessionHeader(active) {
        const titleEl = document.getElementById('emanuel-current-girl-title');
        if (titleEl && active) {
            titleEl.textContent = `${active.name}`;
        }
        this.updateStepsUI(active?.stepsToTaboo, active?.state);
    },

    updateStepsUI(steps, state) {
        const stepsBadge = document.getElementById('emanuel-steps-badge');
        const stepsText = document.getElementById('emanuel-steps-text');
        const tacticText = document.getElementById('emanuel-tactic-text');

        if (!stepsBadge || !stepsText) return;

        const s = typeof steps === 'number' ? steps : 1;

        if (state === 'DATE_CLOSING') {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = '🎯 Совместимость подтверждена (Закрывай встречу)';
            if (tacticText) tacticText.innerHTML = 'CLOSE_DATE: Назначить конкретное время и место';
        } else if (s === 0 || state === 'READY_FOR_TABU') {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = '🔥 0 шагов — МОЖНО СПРАШИВАТЬ О ТАБУ';
            if (tacticText) tacticText.innerHTML = 'ASK_TABU: Прямой вопрос о сексуальных границах';
        } else if (state === 'INCOMPATIBLE') {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = '❄️ Стоп. Низкая совместимость';
            if (tacticText) tacticText.innerHTML = 'GRACEFUL_EXIT: Выходи красиво, не трать время';
        } else {
            stepsBadge.className = 'px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-sm flex items-center gap-2';
            stepsText.innerHTML = `⚡ Дистанция: ~${s} шага до табу`;
            if (tacticText) tacticText.innerHTML = 'BUILD_COMFORT: Разогрев комфорта и лёгкий мостик';
        }
    },

    renderSessions() {
        const container = document.getElementById('emanuel-slots-list');
        if (!container) return;

        const list = this.showingArchive ? this.archivedSessions : this.sessions;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="text-center py-6 text-xs text-slate-500">
                    ${this.showingArchive ? 'Архив пуст' : 'Нет активных диалогов.<br>Нажми «Добавить» выше.'}
                </div>
            `;
            return;
        }

        container.innerHTML = list.map((s, idx) => {
            const isActive = String(s.id) === String(this.currentSessionId) && !this.showingArchive;
            const activeBg = isActive 
                ? 'bg-rose-500/20 border-rose-500/50 shadow-md shadow-rose-500/10' 
                : 'bg-white/5 border-white/5 hover:bg-white/10';

            let badgeHtml = '';
            if (s.state === 'DATE_CLOSING') {
                badgeHtml = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">🎯 Встреча</span>`;
            } else if (s.stepsToTaboo === 0 || s.state === 'READY_FOR_TABU') {
                badgeHtml = `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">🔥 0 ш.</span>`;
            } else {
                badgeHtml = `<span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-bold">~${s.stepsToTaboo || 1} ш.</span>`;
            }

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
                                ${s.turnsCount || 0} реплик • <i>${escapeHtml(s.lastReply ? s.lastReply.substring(0, 35) + '...' : 'Новый диалог')}</i>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${badgeHtml}
                        <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
                            <button onclick="event.stopPropagation(); window.EmanuelOS.archiveSession('${s.id}')" 
                                    class="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition" title="В архив">
                                <i data-lucide="archive" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="event.stopPropagation(); window.EmanuelOS.deleteSession('${s.id}', '${escapeHtml(s.name)}')" 
                                    class="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition" title="Удалить">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    async toggleArchiveView() {
        this.showingArchive = !this.showingArchive;
        if (this.showingArchive) {
            try {
                const res = await callEmanuelApi({ action: 'emanuel_getSessions', statusFilter: 'archived' });
                this.archivedSessions = res.sessions || [];
            } catch (e) {
                console.error(e);
            }
        }
        this.renderSessions();
    },

    async promptNewGirl() {
        const name = prompt('Как зовут девушку?');
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
                this.currentSession = res.session || res.slot;
                this.updateActiveSessionHeader(this.currentSession);
                this.renderSessions();
                await this.loadHistory();
            }
        } catch (e) {
            console.error('Error switching session:', e);
        }
    },

    async archiveSession(sessionId) {
        try {
            await callEmanuelApi({ action: 'emanuel_archiveSession', sessionId });
            if (window.showNotification) showNotification('Диалог архивирован', 'info');
            await this.loadData();
        } catch (e) {
            console.error(e);
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
        await this.generateAdvice({ fastTrack: true });
    },

    async alternativeAdvice() {
        await this.generateAdvice({ isAlternative: true });
    },

    async generateAdvice(options = {}) {
        if (this.isGenerating) return;

        const textEl = document.getElementById('emanuel-girl-text');
        const text = textEl ? textEl.value.trim() : '';

        if (!text && !this.attachedPhotoBase64 && !options.isAlternative && !options.fastTrack) {
            if (window.showNotification) showNotification('Введи сообщение девушки или прикрепи скриншот!', 'warning');
            return;
        }

        const btn = document.getElementById('emanuel-generate-btn');
        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Анализ ситуации...</span>`;
            if (window.lucide) lucide.createIcons();
        }

        this.isGenerating = true;

        try {
            const res = await callEmanuelApi({
                action: 'emanuel_generateAdvice',
                sessionId: this.currentSessionId,
                text: text,
                imageBase64: this.attachedPhotoBase64,
                fastTrack: !!options.fastTrack,
                isAlternative: !!options.isAlternative,
                saveToHistory: true
            });

            if (res && res.success) {
                this.lastAdvice = res;
                this.renderSingleBestMove(res);
                this.updateStepsUI(res.stepsToTaboo, res.state);
                if (textEl && !options.isAlternative && !options.fastTrack) textEl.value = '';
                this.removeUploadedPhoto();
                await this.loadHistory();
                await this.loadData();
            } else {
                const errMsg = res?.reply || res?.error || 'Ошибка анализа ситуации';
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

    renderSingleBestMove(res) {
        const wrap = document.getElementById('emanuel-advice-result-wrap');
        const resultEl = document.getElementById('emanuel-advice-result');
        const radarBanner = document.getElementById('emanuel-radar-banner');
        if (!wrap || !resultEl) return;

        wrap.classList.remove('hidden');

        // Очищаем радар баннер (всё теперь встроено в единый ход)
        if (radarBanner) radarBanner.classList.add('hidden');

        let headline = '🔞 Следующий ход';
        let badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
        let borderColor = 'border-rose-500/40';

        if (res.state === 'DATE_CLOSING') {
            headline = '🎯 Закрытие на встречу';
            badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            borderColor = 'border-emerald-500/40';
        } else if (res.stepsToTaboo === 0 || res.state === 'READY_FOR_TABU') {
            headline = '🔥 Вопрос о сексуальных табу';
            badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
            borderColor = 'border-rose-500/50 shadow-rose-500/20';
        }

        let timingHtml = '';
        if (res.timingAdvice) {
            timingHtml = `
                <div class="flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    <i data-lucide="clock" class="w-3.5 h-3.5 flex-shrink-0"></i>
                    <span>${escapeHtml(res.timingAdvice)}</span>
                </div>
            `;
        }

        let redFlagHtml = '';
        if (res.redFlags) {
            redFlagHtml = `
                <div class="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-center gap-2.5 shadow-lg shadow-rose-950/40">
                    <span class="text-base flex-shrink-0">⚠️</span>
                    <div><b class="text-rose-400 uppercase tracking-wider">Red Flag / Манипуляция:</b> ${escapeHtml(res.redFlags)}</div>
                </div>
            `;
        }

        resultEl.innerHTML = `
            <div class="space-y-4">
                ${redFlagHtml}

                <!-- Главная карточка: Единственный лучший ход -->
                <div class="bg-gradient-to-b from-rose-950/40 via-slate-900/90 to-slate-900 border ${borderColor} rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                    <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <div class="flex items-center gap-2">
                            <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                            <span class="text-xs font-black uppercase tracking-widest text-white">${headline}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            ${timingHtml}
                            <span class="text-[10px] px-2.5 py-1 rounded-full ${badgeStyle} font-bold border">
                                ${res.stepsToTaboo === 0 ? '0 шагов' : `~${res.stepsToTaboo || 1} ш. до табу`}
                            </span>
                        </div>
                    </div>

                    <!-- Текст хода (клик копирует чистый текст) -->
                    <div onclick="window.EmanuelOS.copyCurrentAdvice()" 
                         class="group relative text-base sm:text-lg text-white font-medium leading-relaxed font-sans mb-6 p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-rose-500/40 transition cursor-pointer" 
                         title="Нажми, чтобы скопировать">
                        <div class="select-all font-sans">${escapeHtml(res.reply)}</div>
                        <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 shadow">
                            <i data-lucide="copy" class="w-3 h-3"></i> Скопировать
                        </div>
                    </div>

                    <!-- Действия под ходом -->
                    <div class="flex items-center flex-wrap gap-2.5">
                        <button onclick="window.EmanuelOS.copyCurrentAdvice()" 
                                class="px-5 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs uppercase tracking-wider transition flex items-center gap-2 shadow-lg shadow-rose-500/25 active:scale-95">
                            <i data-lucide="copy" class="w-4 h-4"></i>
                            <span>Скопировать ход</span>
                        </button>
                        <button onclick="window.EmanuelOS.alternativeAdvice()" 
                                class="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs uppercase tracking-wider transition flex items-center gap-1.5 active:scale-95" title="Предложить альтернативу">
                            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                            <span>Другой вариант</span>
                        </button>
                        <button onclick="window.EmanuelOS.fastTrackAdvice()" 
                                class="px-4 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs uppercase tracking-wider transition flex items-center gap-1.5 active:scale-95" title="Срезать путь прямо сейчас">
                            <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                            <span>Быстрее</span>
                        </button>
                    </div>

                    <!-- Обоснование хода (отделено от текста) -->
                    <div class="mt-5 pt-4 border-t border-white/10 flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed font-sans">
                        <div class="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                            💡
                        </div>
                        <div>
                            <span class="font-bold text-rose-300">Почему этот ход:</span> ${escapeHtml(res.reason || 'Оптимальный шаг для сокращения дистанции до проверки табу.')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    },

    async handleProfilePhotoSelect(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            if (window.showNotification) showNotification('Сканирую анкету девушки...', 'info');

            try {
                const res = await callEmanuelApi({
                    action: 'emanuel_analyzeProfile',
                    sessionId: this.currentSessionId,
                    imageBase64: base64,
                    girlName: this.currentSession?.name || 'Девушка'
                });

                if (res && res.success && res.profile) {
                    if (!this.currentSession.profile) this.currentSession.profile = {};
                    Object.assign(this.currentSession.profile, res.profile);
                    this.updateDossierUI(this.currentSession);
                    if (window.showNotification) showNotification('Анкета распознана и сохранена в досье! ✨', 'success');
                } else {
                    if (window.showNotification) showNotification('Не удалось распознать анкету', 'error');
                }
            } catch (err) {
                console.error('Profile photo error:', err);
                if (window.showNotification) showNotification('Сбой анализа анкеты', 'error');
            }
        };
        reader.readAsDataURL(file);
    },

    copyCurrentAdvice() {
        if (!this.lastAdvice?.reply) return;
        this.copyText(this.lastAdvice.reply);
    },

    async openLeadMeModal() {
        const modal = document.getElementById('emanuel-leadme-modal');
        const content = document.getElementById('emanuel-leadme-content');
        if (!modal || !content) return;

        modal.classList.remove('hidden');
        content.innerHTML = `<div class="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin text-rose-500"></i> Сканирую активные диалоги...</div>`;
        if (window.lucide) lucide.createIcons();

        try {
            const res = await callEmanuelApi({ action: 'emanuel_leadMe' });
            if (res && res.success && Array.isArray(res.items)) {
                content.innerHTML = `
                    <div class="space-y-4 font-sans">
                        <div class="text-xs text-slate-300 italic mb-2">
                            ${escapeHtml(res.summary || 'Рекомендации Emanuel на сегодня:')}
                        </div>
                        <div class="space-y-2.5">
                            ${res.items.map(item => `
                                <div class="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-rose-500/30 transition flex items-center justify-between gap-4">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <span class="text-xl">${item.badge || '🔥'}</span>
                                        <div class="min-w-0">
                                            <div class="text-sm font-bold text-white">${escapeHtml(item.name)}</div>
                                            <div class="text-xs text-slate-400">${escapeHtml(item.statusText)}</div>
                                        </div>
                                    </div>
                                    <button onclick="window.EmanuelOS.switchSession('${item.sessionId}'); window.EmanuelOS.closeLeadMeModal();"
                                            class="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition flex-shrink-0">
                                        Открыть
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                content.innerHTML = `<p class="text-red-400 text-xs">Не удалось сформировать рекомендации.</p>`;
            }
        } catch (e) {
            content.innerHTML = `<p class="text-red-400 text-xs">Сбой запроса: ${e.message}</p>`;
        }
        if (window.lucide) lucide.createIcons();
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
                            История переписки пуста.<br>Вставь сообщение девушки выше.
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
                                        <span>Emanuel Ход</span>
                                        <span>${stepsLabel}</span>
                                    </div>
                                    <div>«${escapeHtml(turn.wingman)}»</div>
                                    ${turn.reason ? `<div class="text-[10px] text-slate-400 mt-1 italic">${escapeHtml(turn.reason)}</div>` : ''}
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
            if (window.showNotification) showNotification('Ход скопирован в буфер! 🚀', 'success');
        }).catch(() => {
            if (window.showNotification) showNotification('Не удалось скопировать', 'error');
        });
    }
};

window.initEmanuelView = function() {
    window.EmanuelOS.init();
};

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
