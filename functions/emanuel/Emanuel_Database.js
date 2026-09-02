/**
 * 🗄️ Emanuel_Database.js — Динамическое Firestore хранилище (N-сессий, без платформ)
 */
const admin = require('firebase-admin');

const DEFAULT_SESSIONS = [
    { id: 'session_1', name: 'Алина', mode: 'SEX', stepsToTaboo: 1, tactic: 'BUILD', active: true, turnsCount: 0 },
    { id: 'session_2', name: 'Катя', mode: 'SEX', stepsToTaboo: 2, tactic: 'BUILD', active: false, turnsCount: 0 },
    { id: 'session_3', name: 'Света', mode: 'SEX', stepsToTaboo: 0, tactic: 'DIRECT', active: false, turnsCount: 0 }
];

const DEFAULT_SETTINGS = {
    mode: 'SEX',
    style: {
        humor: 6,
        directness: 7,
        boldness: 6,
        length: 'optimal'
    },
    sex_mode: {
        speed: 'fast',
        directness: 'direct',
        auto_moment: true
    }
};

class EmanuelDatabase {
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

    async getSessions(db, userId) {
        const uId = String(userId || '451682370');
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId)
                .collection('sessions').orderBy('updatedAt', 'desc').get();

            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Миграция со старых слотов если они были
            const oldSlotsSnapshot = await db.collection('emanuel_users').doc(uId).collection('slots').get();
            if (!oldSlotsSnapshot.empty) {
                const batch = db.batch();
                const migrated = [];
                for (const oldDoc of oldSlotsSnapshot.docs) {
                    const data = oldDoc.data();
                    const sId = `session_${data.id || oldDoc.id}`;
                    const sessionData = {
                        id: sId,
                        name: data.name ? data.name.replace(/\s*\([^)]*\)/g, '').trim() : `Девушка #${oldDoc.id}`,
                        mode: data.mode || 'SEX',
                        stepsToTaboo: typeof data.stepsToTaboo === 'number' ? data.stepsToTaboo : 1,
                        tactic: data.tactic || 'BUILD',
                        active: !!data.active,
                        turnsCount: data.turnsCount || 0,
                        lastGist: data.lastGist || '',
                        compatibility: data.compatibility || null,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    };
                    batch.set(db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId), sessionData);
                    migrated.push(sessionData);
                }
                await batch.commit();
                return migrated;
            }

            // Инициализация дефолтных сессий
            const batch = db.batch();
            const created = [];
            DEFAULT_SESSIONS.forEach(s => {
                const ref = db.collection('emanuel_users').doc(uId).collection('sessions').doc(s.id);
                const sData = {
                    ...s,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                batch.set(ref, sData);
                created.push(sData);
            });
            await batch.commit();
            return created;
        } catch (e) {
            console.error('Error getting sessions:', e);
            return DEFAULT_SESSIONS;
        }
    }

    async getActiveSession(db, userId) {
        const sessions = await this.getSessions(db, userId);
        let active = sessions.find(s => s.active);
        if (!active && sessions.length > 0) {
            active = sessions[0];
            await this.switchSession(db, userId, active.id);
        }
        return active || DEFAULT_SESSIONS[0];
    }

    async createSession(db, userId, name) {
        const uId = String(userId || '451682370');
        const cleanName = String(name || 'Новая девушка').trim().substring(0, 35);
        const sId = `session_${Date.now()}`;

        // Деактивируем остальные
        const currentSessions = await this.getSessions(db, userId);
        const batch = db.batch();
        currentSessions.forEach(s => {
            const ref = db.collection('emanuel_users').doc(uId).collection('sessions').doc(s.id);
            batch.update(ref, { active: false });
        });

        const newSession = {
            id: sId,
            name: cleanName,
            mode: 'SEX',
            stepsToTaboo: 1,
            tactic: 'BUILD',
            active: true,
            turnsCount: 0,
            lastGist: '',
            compatibility: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.set(db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId), newSession);
        batch.set(db.collection('emanuel_users').doc(uId), {
            activeSessionId: sId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return newSession;
    }

    async switchSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sessions = await this.getSessions(db, userId);
        const sId = String(sessionId);
        let chosen = null;

        const batch = db.batch();
        sessions.forEach(s => {
            const ref = db.collection('emanuel_users').doc(uId).collection('sessions').doc(s.id);
            const isActive = (s.id === sId);
            if (isActive) chosen = { ...s, active: true };
            batch.update(ref, { active: isActive });
        });

        batch.set(db.collection('emanuel_users').doc(uId), {
            activeSessionId: sId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return chosen || sessions[0];
    }

    async setSessionMode(db, userId, sessionId, mode) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        const validModes = ['SEX', 'NORMAL', 'DATE'];
        const cleanMode = validModes.includes(mode) ? mode : 'SEX';

        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            mode: cleanMode,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return cleanMode;
    }

    async renameSession(db, userId, sessionId, newName) {
        const uId = String(userId || '451682370');
        const cleanName = String(newName || '').trim().substring(0, 35);
        if (!cleanName) return;

        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(String(sessionId)).update({
            name: cleanName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async deleteSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        try {
            // Удаляем подколлекцию turns
            const turnsSnap = await db.collection('emanuel_users').doc(uId)
                .collection('sessions').doc(sId).collection('turns').get();
            const batch = db.batch();
            turnsSnap.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId));
            await batch.commit();

            // Переключаемся на первую попавшуюся сессию, если удалили активную
            const remaining = await this.getSessions(db, userId);
            if (remaining.length > 0) {
                await this.switchSession(db, userId, remaining[0].id);
            }
            return true;
        } catch (e) {
            console.error('Error deleting session:', e);
            return false;
        }
    }

    async getHistory(db, userId, sessionId, maxTurns = 15) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId)
                .collection('sessions').doc(sId)
                .collection('turns').orderBy('timestamp', 'asc').limitToLast(maxTurns).get();

            return snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.error('Error getting history:', e);
            return [];
        }
    }

    async addTurn(db, userId, sessionId, girlText, fullAdvice, gist, extra = {}) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        try {
            const turnsRef = db.collection('emanuel_users').doc(uId)
                .collection('sessions').doc(sId).collection('turns');

            await turnsRef.add({
                girl: String(girlText || '').substring(0, 500),
                wingman: String(gist || '').substring(0, 350),
                fullAdvice: fullAdvice || '',
                stepsToTaboo: extra.stepsToTaboo ?? 1,
                tactic: extra.tactic || 'BUILD',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const sessionUpdate = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastGist: String(gist || '').substring(0, 140),
                turnsCount: admin.firestore.FieldValue.increment(1)
            };
            if (typeof extra.stepsToTaboo === 'number') sessionUpdate.stepsToTaboo = extra.stepsToTaboo;
            if (extra.tactic) sessionUpdate.tactic = extra.tactic;
            if (extra.compatibilityRadar) sessionUpdate.compatibility = extra.compatibilityRadar;

            await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set(sessionUpdate, { merge: true });
        } catch (e) {
            console.error('Error adding turn:', e);
        }
    }

    async clearSessionHistory(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        try {
            const snapshot = await db.collection('emanuel_users').doc(uId)
                .collection('sessions').doc(sId).collection('turns').get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            batch.update(db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId), {
                turnsCount: 0,
                lastGist: '',
                stepsToTaboo: 1,
                compatibility: null,
                mode: 'SEX',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await batch.commit();
            return true;
        } catch (e) {
            console.error('Error clearing session history:', e);
            return false;
        }
    }

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
