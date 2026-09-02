/**
 * 🗄️ Emanuel_Database.js — Строгая модель состояния, activeSessionId и жизненный цикл сессий
 */
const admin = require('firebase-admin');

class EmanuelDatabase {
    async getUserDoc(db, userId) {
        const uId = String(userId || '451682370');
        const ref = db.collection('emanuel_users').doc(uId);
        const doc = await ref.get();
        if (doc.exists) {
            return { ref, data: doc.data() };
        }
        const initial = {
            activeSessionId: null,
            userState: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await ref.set(initial);
        return { ref, data: initial };
    }

    async getUserState(db, userId) {
        const { data } = await this.getUserDoc(db, userId);
        return data?.userState || null;
    }

    async setUserState(db, userId, state) {
        const uId = String(userId || '451682370');
        await db.collection('emanuel_users').doc(uId).set({
            userState: state || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    async getSessions(db, userId, statusFilter = 'active') {
        const uId = String(userId || '451682370');
        try {
            let query = db.collection('emanuel_users').doc(uId).collection('sessions');
            if (statusFilter) {
                query = query.where('status', '==', statusFilter);
            } else {
                query = query.where('status', '!=', 'deleted');
            }

            const snap = await query.get();
            if (!snap.empty) {
                const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Сортируем по updatedAt локально (избегая composite index требования в Firestore)
                sessions.sort((a, b) => {
                    const tA = a.updatedAt?._seconds || 0;
                    const tB = b.updatedAt?._seconds || 0;
                    return tB - tA;
                });
                return sessions;
            }

            // Если сессий нет вообще, инициализируем стартовую
            if (statusFilter === 'active') {
                const starter = await this.createSession(db, userId, 'Марина');
                return [starter];
            }
            return [];
        } catch (e) {
            console.error('Error in getSessions:', e);
            return [];
        }
    }

    async getActiveSession(db, userId) {
        const uId = String(userId || '451682370');
        const { data } = await this.getUserDoc(db, userId);
        const activeId = data?.activeSessionId;

        if (activeId) {
            const doc = await db.collection('emanuel_users').doc(uId).collection('sessions').doc(activeId).get();
            if (doc.exists && doc.data().status === 'active') {
                return { id: doc.id, ...doc.data() };
            }
        }

        // Если активной нет или удалена — берём первую попавшуюся активную
        const activeSessions = await this.getSessions(db, userId, 'active');
        if (activeSessions.length > 0) {
            const first = activeSessions[0];
            await this.switchSession(db, userId, first.id);
            return first;
        }

        // Если активных нет — создаём новую
        const created = await this.createSession(db, userId, 'Марина');
        return created;
    }

    async createSession(db, userId, name) {
        const uId = String(userId || '451682370');
        const cleanName = String(name || 'Девушка').trim().substring(0, 35) || 'Девушка';
        const sId = `session_${Date.now()}`;

        const newSession = {
            id: sId,
            name: cleanName,
            status: 'active', // 'active' | 'archived' | 'deleted'
            state: 'BUILD', // 'BUILD' | 'READY_FOR_TABU' | 'TABU_ASKED' | 'DATE_CLOSING' | 'INCOMPATIBLE'
            confidence: 0.85,
            stepsToTaboo: 1,
            nextAction: 'BUILD_COMFORT',
            lastReply: '',
            reason: '',
            lastTimingAdvice: null,
            lastRedFlags: null,
            profile: null,
            dossier: {
                taboos: [],
                greenFlags: [],
                dateStyle: null
            },
            turnsCount: 0,
            lastMessage: '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        batch.set(db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId), newSession);
        batch.set(db.collection('emanuel_users').doc(uId), {
            activeSessionId: sId,
            userState: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return newSession;
    }

    async updateSessionProfile(db, userId, sessionId, profileData) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            profile: profileData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    }

    async updateSessionDossier(db, userId, sessionId, dossierData) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            dossier: dossierData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    }

    async switchSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);

        const doc = await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).get();
        if (!doc.exists) {
            return await this.getActiveSession(db, userId);
        }

        await db.collection('emanuel_users').doc(uId).set({
            activeSessionId: sId,
            userState: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { id: doc.id, ...doc.data() };
    }

    async archiveSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);

        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            status: 'archived',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Если архивировали активную сессию — переключаем на следующую активную
        const { data } = await this.getUserDoc(db, userId);
        if (data?.activeSessionId === sId) {
            const remaining = await this.getSessions(db, userId, 'active');
            if (remaining.length > 0) {
                await this.switchSession(db, userId, remaining[0].id);
            }
        }
        return true;
    }

    async restoreSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);

        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await this.switchSession(db, userId, sId);
        return true;
    }

    async renameSession(db, userId, sessionId, newName) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);
        const cleanName = String(newName || '').trim().substring(0, 35);
        if (!cleanName) return;

        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).update({
            name: cleanName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async deleteSession(db, userId, sessionId) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);

        // Мягкое удаление (status: deleted)
        await db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId).set({
            status: 'deleted',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const { data } = await this.getUserDoc(db, userId);
        if (data?.activeSessionId === sId) {
            const remaining = await this.getSessions(db, userId, 'active');
            if (remaining.length > 0) {
                await this.switchSession(db, userId, remaining[0].id);
            }
        }
        return true;
    }

    async addTurn(db, userId, sessionId, girlText, wingmanReply, meta = {}) {
        const uId = String(userId || '451682370');
        const sId = String(sessionId);

        const turnsRef = db.collection('emanuel_users').doc(uId)
            .collection('sessions').doc(sId).collection('turns');

        await turnsRef.add({
            girl: String(girlText || '').substring(0, 500),
            wingman: String(wingmanReply || '').substring(0, 500),
            state: meta.state || 'BUILD',
            reason: meta.reason || '',
            stepsToTaboo: meta.stepsToTaboo ?? 1,
            nextAction: meta.nextAction || 'BUILD_COMFORT',
            timingAdvice: meta.timingAdvice || null,
            redFlags: meta.redFlags || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Получаем текущие данные для мерджа досье
        const sessionRef = db.collection('emanuel_users').doc(uId).collection('sessions').doc(sId);
        const currentDoc = await sessionRef.get();
        const currentData = currentDoc.exists ? currentDoc.data() : {};
        const curDossier = currentData.dossier || { taboos: [], greenFlags: [], dateStyle: null };

        // Мерджим обновления досье
        if (meta.dossierUpdates) {
            if (Array.isArray(meta.dossierUpdates.taboos) && meta.dossierUpdates.taboos.length) {
                curDossier.taboos = Array.from(new Set([...(curDossier.taboos || []), ...meta.dossierUpdates.taboos]));
            }
            if (Array.isArray(meta.dossierUpdates.green_flags) && meta.dossierUpdates.green_flags.length) {
                curDossier.greenFlags = Array.from(new Set([...(curDossier.greenFlags || []), ...meta.dossierUpdates.green_flags]));
            }
            if (meta.dossierUpdates.date_style) {
                curDossier.dateStyle = meta.dossierUpdates.date_style;
            }
        }

        const updateData = {
            lastMessage: String(girlText || '').substring(0, 100),
            lastReply: String(wingmanReply || '').substring(0, 100),
            state: meta.state || 'BUILD',
            stepsToTaboo: typeof meta.stepsToTaboo === 'number' ? meta.stepsToTaboo : 1,
            nextAction: meta.nextAction || 'BUILD_COMFORT',
            reason: meta.reason || '',
            lastTimingAdvice: meta.timingAdvice || null,
            lastRedFlags: meta.redFlags || null,
            dossier: curDossier,
            confidence: meta.confidence || 0.85,
            turnsCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await sessionRef.set(updateData, { merge: true });
    }

    async getHistory(db, userId, sessionId, maxTurns = 12) {
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

    async getUserSettings(db, userId) {
        const { data } = await this.getUserDoc(db, userId);
        return data?.settings || { mode: 'SEX' };
    }

    async setUserSettings(db, userId, settings) {
        const uId = String(userId || '451682370');
        await db.collection('emanuel_users').doc(uId).set({
            settings: settings,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
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
