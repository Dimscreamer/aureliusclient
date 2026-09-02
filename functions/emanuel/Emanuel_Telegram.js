/**
 * 📱 Emanuel_Telegram.js — Взаимодействие с Telegram Bot API
 */
const axios = require('axios');
const { EMANUEL_CONFIG } = require('./Emanuel_Config');

class EmanuelTelegram {
    constructor() {
        this.token = EMANUEL_CONFIG.TELEGRAM_BOT_TOKEN;
        this.apiUrl = `https://api.telegram.org/bot${this.token}`;
    }

    /**
     * Экранирование и санитизация HTML для Telegram
     */
    formatHtml(text) {
        if (!text) return '';
        let s = String(text);

        // Переносы
        s = s.replace(/<br\s*\/?>/gi, '\n');

        // Преобразование Markdown в HTML если нейросеть прислала Markdown
        s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
        s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/^#{1,6}\s+(.*)$/gm, '<b>$1</b>');

        // Очищаем лишние пустые строки
        s = s.replace(/\n{3,}/g, '\n\n').trim();
        return s;
    }

    /**
     * Отправка сообщения
     */
    async sendMessage(chatId, text, options = {}) {
        if (!text) return null;
        const formatted = options.skipFormat ? text : this.formatHtml(text);

        const payload = {
            chat_id: String(chatId),
            text: formatted,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };

        if (options.replyMarkup) {
            payload.reply_markup = options.replyMarkup;
        }

        try {
            const res = await axios.post(`${this.apiUrl}/sendMessage`, payload, { timeout: 15000 });
            return res.data;
        } catch (err) {
            console.error('Emanuel TG Send Error (HTML):', err.response?.data || err.message);
            // Если ошибка парсинга HTML, шлем как обычный текст
            try {
                delete payload.parse_mode;
                payload.text = text;
                const retryRes = await axios.post(`${this.apiUrl}/sendMessage`, payload, { timeout: 15000 });
                return retryRes.data;
            } catch (retryErr) {
                console.error('Emanuel TG Send Error (Raw):', retryErr.response?.data || retryErr.message);
            }
        }
        return null;
    }

    /**
     * Индикатор действия
     */
    async sendChatAction(chatId, action = 'typing') {
        try {
            await axios.post(`${this.apiUrl}/sendChatAction`, {
                chat_id: String(chatId),
                action: action
            }, { timeout: 5000 });
        } catch (e) {}
    }

    /**
     * Ответ на callback query
     */
    async answerCallbackQuery(callbackQueryId, text = null) {
        try {
            await axios.post(`${this.apiUrl}/answerCallbackQuery`, {
                callback_query_id: callbackQueryId,
                text: text || undefined
            }, { timeout: 5000 });
        } catch (e) {}
    }

    /**
     * Скачать фото из Telegram и вернуть как data:image/jpeg;base64,...
     */
    async getFileAsBase64(fileId) {
        try {
            const getFileRes = await axios.get(`${this.apiUrl}/getFile?file_id=${fileId}`);
            if (!getFileRes.data?.ok || !getFileRes.data?.result?.file_path) {
                throw new Error('Could not get file path from Telegram');
            }
            const filePath = getFileRes.data.result.file_path;
            const downloadUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;

            const response = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 20000
            });

            const buffer = Buffer.from(response.data);
            const base64 = buffer.toString('base64');
            const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            return `data:${mimeType};base64,${base64}`;
        } catch (e) {
            console.error('Error downloading TG photo:', e.message);
            return null;
        }
    }
}

module.exports = new EmanuelTelegram();
