/**
 * 📨 Mark_Telegram.js — Telegram клиент с автоматической санитизацией HTML
 */
const axios = require('axios');
const { MARK_CONFIG } = require('./Mark_Config');

/**
 * Санитизация и преобразование Markdown / HTML для безопасного парсинга в Telegram
 */
function formatTelegramHtml(rawText) {
    if (!rawText) return '';
    let text = String(rawText);

    // 1. Сохраняем блоки кода
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const idx = codeBlocks.length;
        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        codeBlocks.push('<pre><code>' + escapedCode.trim() + '</code></pre>');
        return 'XYZCODEBLOCK' + idx + 'XYZ';
    });

    // 2. Сохраняем инлайн-код
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
        const idx = inlineCodes.length;
        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        inlineCodes.push('<code>' + escapedCode + '</code>');
        return 'XYZINLINECODE' + idx + 'XYZ';
    });

    // 3. Заменяем амперсанды, не являющиеся HTML-сущностями
    text = text.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');

    // 4. Экранируем сырые < и >, если они не образуют разрешенные теги
    const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tg-spoiler', 'blockquote', 'a'];
    
    text = text.replace(/<(\/?[a-zA-Z0-9-]+)(\s+href="[^"]*")?\s*\/?>/g, (match, tag) => {
        const cleanTag = tag.replace('/', '').toLowerCase();
        if (ALLOWED_TAGS.includes(cleanTag)) {
            return match;
        }
        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    text = text.replace(/<(?![a-zA-Z0-9_\/])/g, '&lt;');
    text = text.replace(/(?<![a-zA-Z0-9_"']|\/|-)>/g, '&gt;');

    // 5. Преобразуем Markdown в HTML
    text = text.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
    text = text.replace(/^[ \t]*[\*\-\+][ \t]+/gm, '• ');
    text = text.replace(/(^|\s)_([^_]+)_(\s|$|[.,!?:;])/g, '$1<i>$2</i>$3');
    text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2">$1</a>');

    // 6. Очищаем мусорные теги (p, div, ul, ol, li, br)
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(p|div|ul|ol|li|span|h[1-6])[^>]*>/gi, '\n');

    // 7. Восстанавливаем сохраненные блоки кода
    inlineCodes.forEach((code, idx) => {
        text = text.replace('XYZINLINECODE' + idx + 'XYZ', code);
    });
    codeBlocks.forEach((code, idx) => {
        text = text.replace('XYZCODEBLOCK' + idx + 'XYZ', code);
    });

    // 8. Балансировка тегов (автоматически закрываем незакрытые теги)
    const tagRegex = /<\/?([a-zA-Z0-9-]+)(\s+[^>]*)?>/g;
    const stack = [];
    const selfClosing = ['br', 'img', 'hr'];
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullTag.startsWith('</');

        if (selfClosing.includes(tagName)) continue;

        if (!isClosing) {
            stack.push(tagName);
        } else {
            const idx = stack.lastIndexOf(tagName);
            if (idx !== -1) {
                stack.splice(idx, 1);
            }
        }
    }

    while (stack.length > 0) {
        const unclosed = stack.pop();
        text += '</' + unclosed + '>';
    }

    // 9. Сжимаем чрезмерные пустые строки
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
}

async function sendTelegramMessage(chatId, text, replyToMsgId = null, replyMarkup = null) {
    if (!text) return null;
    let formattedText = formatTelegramHtml(text);
    
    // Разбивка на части если больше 4000 символов (лимит телеги 4096)
    const MAX_LEN = 4000;
    const parts = [];
    while (formattedText.length > 0) {
        if (formattedText.length <= MAX_LEN) {
            parts.push(formattedText);
            break;
        }
        let splitAt = formattedText.lastIndexOf('\n\n', MAX_LEN);
        if (splitAt === -1) splitAt = formattedText.lastIndexOf('\n', MAX_LEN);
        if (splitAt === -1) splitAt = MAX_LEN;
        
        parts.push(formattedText.substring(0, splitAt));
        formattedText = formattedText.substring(splitAt).trim();
    }

    const url = `https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    let lastData = null;

    for (let i = 0; i < parts.length; i++) {
        const payload = {
            chat_id: String(chatId),
            text: parts[i],
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };
        // Reply только к первому сообщению, остальные идут следом
        if (replyToMsgId && i === 0) {
            payload.reply_to_message_id = replyToMsgId;
        }
        // Кнопки только на последнем сообщении
        if (replyMarkup && i === parts.length - 1) {
            payload.reply_markup = replyMarkup;
        }

        try {
            const res = await axios.post(url, payload, { timeout: 10000 });
            lastData = res.data;
        } catch (err) {
            console.error('sendTelegramMessage error:', err.response?.data || err.message);
            try {
                delete payload.parse_mode;
                const res2 = await axios.post(url, payload, { timeout: 10000 });
                lastData = res2.data;
            } catch (e2) {
                console.error('sendTelegramMessage fallback error:', e2.message);
            }
        }
    }
    return lastData;
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
    if (!text) return null;
    const formattedText = formatTelegramHtml(text);
    const url = `https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/editMessageText`;
    const payload = {
        chat_id: String(chatId),
        message_id: messageId,
        text: formattedText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    try {
        const res = await axios.post(url, payload, { timeout: 10000 });
        return res.data;
    } catch (err) {
        console.error('editTelegramMessage error:', err.response?.data || err.message);
        try {
            delete payload.parse_mode;
            const res2 = await axios.post(url, payload, { timeout: 10000 });
            return res2.data;
        } catch (e2) {
            return null;
        }
    }
}

async function sendChatAction(chatId, action = 'typing') {
    try {
        await axios.post(`https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/sendChatAction`, {
            chat_id: chatId,
            action: action
        }, { timeout: 3000 });
    } catch(e) {}
}

async function answerCallbackQuery(callbackQueryId, text = '') {
    try {
        await axios.post(`https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text: text
        }, { timeout: 5000 });
    } catch(e) {}
}


async function sendTelegramPhoto(chatId, base64Image, caption = '') {
    const b64 = base64Image.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(b64, 'base64');
    const blob = new Blob([buffer], { type: 'image/png' });
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('photo', blob, 'dashboard.png');
    if (caption) fd.append('caption', caption);

    const url = `https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/sendPhoto`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            body: fd
        });
        return await res.json();
    } catch (e) {
        console.error('sendTelegramPhoto error:', e);
        return null;
    }
}

module.exports = {
    sendTelegramPhoto,
    formatTelegramHtml,
    sendTelegramMessage,
    editTelegramMessage,
    sendChatAction,
    answerCallbackQuery
};
