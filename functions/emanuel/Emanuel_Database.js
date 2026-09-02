/**
 * 🗄️ Emanuel_Database.js — Firestore Хранилище для Emanuel Dating OS
 */
const admin = require('firebase-admin');

const DEFAULT_SLOTS = [
    { id: '1', name: 'Аня (Tinder)', platform: 'Tinder', active: true, temperature: '3/10', turnsCount: 0 },
    { id: '2', name: 'Катя (Pure)', platform: 'Pure', active: false, temperature: '6/10', turnsCount: 0 },
    { id: '3', name: 'Лера (Bumble)', platform: 'Bumble', active: false, temperature: '4/10', turnsCount: 0 },
    { id: '4', name: 'Девушка #4', platform: 'Tinder', active: false, temperature: '2/10', turnsCount: 0 },
    { id: '5', name: 'Девушка #5', platform: 'Telegram', active: false, temperature: '1/10', turnsCount: 0 }
];

const DEFAULT_SETTINGS = {
    goal: 'hookup',
    tone: 'confident',
    escalation: 'optimal',
    platform: 'Tinder',
    model: 'google/gemini-2.5-flash'
};

class EmanuelDatabase {
    /**
     * Получить настройки пользователя
     */
    async getUserSettings(db, userId) {
        const uId = String(userId || '451682370');
        try {
            const doc = await db.collection('emanuel_users').doc(uId).get();
            if (doc.exists && doc.data().settings) {
                return { ...DEFAULT_SETTINGS, ...doc.data().settings };
            }
        } catch (e) {
            console.error('Error fetching user settings:', e);
        }
        return DEFAULT_SETTINGS;
    }

    /**
     * Сохранить настройки пользователя
     */
    async setUserSettings(db, userId, settings) {
        const uId = String(userId || '451682370');
        try {
            await db.collection('emanuel_users').doc(uId).set({
                settings: settings,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (e) {
            console.error('Error saving user settings:', e);
            return false;
        }
    }

    /**
     * Получить слоты пользователя
     */
    async getSlots(db, userId) {
        const uId = String(userId || '451682370');
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId).collection('slots').orderBy('id').get();
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => doc.data());
            }

            // Если слотов нет — инициализируем 5 базовых слотов
            const batch = db.batch();
            DEFAULT_SLOTS.forEach(slot => {
                const ref = db.collection('emanuel_users').doc(uId).collection('slots').doc(slot.id);
                batch.set(ref, {
                    ...slot,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            return DEFAULT_SLOTS;
        } catch (e) {
            console.error('Error getting slots:', e);
            return DEFAULT_SLOTS;
        }
    }

    /**
     * Получить активный слот
     */
    async getActiveSlot(db, userId) {
        const slots = await this.getSlots(db, userId);
        let active = slots.find(s => s.active);
        if (!active) {
            active = slots[0];
            await this.switchSlot(db, userId, active.id);
        }
        return active;
    }

    /**
     * Переключить активный слот
     */
    async switchSlot(db, userId, slotId) {
        const uId = String(userId || '451682370');
        const slots = await this.getSlots(db, userId);
        const sId = String(slotId);
        let chosen = null;

        const batch = db.batch();
        slots.forEach(slot => {
            const ref = db.collection('emanuel_users').doc(uId).collection('slots').doc(slot.id);
            const isActive = (slot.id === sId);
            if (isActive) chosen = { ...slot, active: true };
            batch.update(ref, { active: isActive });
        });

        // Сохраняем activeSlotId на уровне пользователя
        batch.set(db.collection('emanuel_users').doc(uId), {
            activeSlotId: sId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return chosen || slots[0];
    }

    /**
     * Переименовать активный слот
     */
    async renameActiveSlot(db, userId, newName, platform = null) {
        const uId = String(userId || '451682370');
        const active = await this.getActiveSlot(db, userId);
        const cleanName = String(newName || '').trim().substring(0, 35);
        if (!cleanName) return active;

        const updateData = { name: cleanName, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (platform) updateData.platform = platform;

        await db.collection('emanuel_users').doc(uId).collection('slots').doc(active.id).update(updateData);
        active.name = cleanName;
        if (platform) active.platform = platform;
        return active;
    }

    /**
     * Получить историю диалога конкретной девушки
     */
    async getHistory(db, userId, slotId, maxTurns = 8) {
        const uId = String(userId || '451682370');
        const sId = String(slotId || '1');
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId)
                .collection('slots').doc(sId)
                .collection('turns').orderBy('timestamp', 'asc').limitToLast(maxTurns).get();

            return snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.error('Error getting history:', e);
            return [];
        }
    }

    /**
     * Добавить шаг в диалог (реплика девушки + ответ Wingman)
     */
    async addTurn(db, userId, slotId, girlText, fullAdvice, gist, temperature = null) {
        const uId = String(userId || '451682370');
        const sId = String(slotId || '1');
        try {
            const turnsRef = db.collection('emanuel_users').doc(uId)
                .collection('slots').doc(sId).collection('turns');

            await turnsRef.add({
                girl: String(girlText || '').substring(0, 500),
                wingman: String(gist || '').substring(0, 300),
                fullAdvice: fullAdvice || '',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Обновляем метаданные слота
            const slotUpdate = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastGist: String(gist || '').substring(0, 100),
                turnsCount: admin.firestore.FieldValue.increment(1)
            };
            if (temperature) slotUpdate.temperature = temperature;

            await db.collection('emanuel_users').doc(uId).collection('slots').doc(sId).set(slotUpdate, { merge: true });
        } catch (e) {
            console.error('Error adding turn:', e);
        }
    }

    /**
     * Очистить историю слота
     */
    async clearSlotHistory(db, userId, slotId) {
        const uId = String(userId || '451682370');
        const sId = String(slotId || '1');
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId)
                .collection('slots').doc(sId).collection('turns').get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            batch.update(db.collection('emanuel_users').doc(uId).collection('slots').doc(sId), {
                turnsCount: 0,
                lastGist: '',
                temperature: '1/10',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await batch.commit();
            return true;
        } catch (e) {
            console.error('Error clearing slot history:', e);
            return false;
        }
    }

    /**
     * Логирование операций
     */
    async logAction(db, userId, type, input, output, durationMs = 0) {
        try {
            await db.collection('emanuel_logs').add({
                userId: String(userId || '451682370'),
                type: type || 'TEXT',
                input: typeof input === 'string' ? input.substring(0, 300) : '[MEDIA]',
                output: typeof output === 'string' ? output.substring(0, 300) : '',
                durationMs: durationMs,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {}
    }
}

module.exports = new EmanuelDatabase();
