// helpers.js — Вспомогательные функции

function getStatusStyle(colorKey) {
    const map = {
        cyan: { bg: 'rgba(0, 242, 255, 0.15)', border: '#00f2ff', glow: '#00f2ff44' },
        warning: { bg: 'rgba(250, 204, 21, 0.35)', border: '#facc15', glow: '#facc1566' },
        danger: { bg: 'rgba(255, 62, 62, 0.45)', border: '#ff3e3e', glow: '#ff3e3e66' },
        paused: { bg: 'rgba(148, 163, 184, 0.35)', border: '#94a3b8', glow: '#94a3b844' }
    };
    return map[colorKey] || map.cyan;
}

function getClientLogic(client) {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const createdDate = new Date(parseInt(client.id)); const isNew = (now - createdDate) < 30 * 24 * 60 * 60 * 1000;
    const amt = parseFloat(client.amount) || 0;
    let info = { label: (client.status || 'АКТИВЕН').toUpperCase(), color: 'cyan', overdue: false, churnRisk: false, cohort: 'loyal', nextDateStr: '—', dueDateObj: null, priority: 2 };
    
    if (client.status === 'Пауза') { info.color = 'paused'; info.label = 'НА ПАУЗЕ'; info.churnRisk = true; info.cohort = 'problematic'; info.priority = 4; }
    else if (client.status === 'Ожидание') { info.color = 'warning'; info.label = 'ОЖИДАНИЕ'; info.priority = 1; }
    
    if (client.status !== 'Пауза' && client.date) {
        const inputDate = new Date(client.date); const compareDate = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
        info.dueDateObj = compareDate;
        
        const isRecurring = client.recurring !== false; 
        
        if (isRecurring) {
            info.nextDateStr = compareDate.toLocaleDateString('ru-RU');
            const diffDays = Math.floor((today - compareDate) / (1000 * 60 * 60 * 24));
            if (diffDays > 5) { info.label = `ДОЛГ: ${diffDays} ДН.`; info.color = 'danger'; info.overdue = true; info.churnRisk = true; info.priority = 0; }
            else if (diffDays >= 0 || Math.ceil((compareDate - today) / (1000 * 60 * 60 * 24)) <= 5) { info.label = 'ОЖИДАНИЕ'; info.color = 'warning'; info.priority = 1; }
        } else {
            info.nextDateStr = 'Проект'; 
            info.label = 'ПРОЕКТ';
            info.color = 'paused';
        }
    }
    if (amt > 1500) info.cohort = 'vip'; else if (isNew) info.cohort = 'new';
    if (client.manualCohort && client.manualCohort !== 'auto') info.cohort = client.manualCohort;
    return info;
}

function addHistory(c, a) {
    if (!c.history) c.history = [];
    c.history.unshift({
        date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        text: a
    });
    c.history = c.history.slice(0, 30);
}

function parseHistoryDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split(',')[0].split('.');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
}

function getClientActiveStateAtMonth(c, targetYear, targetMonthIndex) {
    let startDate = null;
    if (c.history && c.history.length > 0) {
        c.history.forEach(h => {
            const d = parseHistoryDate(h.date);
            if (d) {
                if (!startDate || d < startDate) {
                    startDate = d;
                }
            }
        });
    }
    if (!startDate || isNaN(startDate.getTime())) {
        startDate = new Date(parseInt(c.id));
    }
    
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    
    if (targetYear < startYear || (targetYear === startYear && targetMonthIndex < startMonth)) {
        return false;
    }
    
    let state = true; 
    
    if (c.history && c.history.length > 0) {
        const parsedHistory = c.history
            .map(h => ({
                date: parseHistoryDate(h.date),
                text: h.text
            }))
            .filter(h => h.date !== null)
            .sort((a, b) => a.date - b.date);
            
        parsedHistory.forEach(h => {
            const hy = h.date.getFullYear();
            const hm = h.date.getMonth();
            if (hy < targetYear || (hy === targetYear && hm <= targetMonthIndex)) {
                if (h.text.includes('В архив')) {
                    state = false;
                } else if (h.text.includes('Восстановлен')) {
                    state = true;
                }
            }
        });
    }
    
    const now = new Date();
    if (targetYear > now.getFullYear() || (targetYear === now.getFullYear() && targetMonthIndex >= now.getMonth())) {
        if (c.archived) {
            state = false;
        }
    }
    
    return state;
}
