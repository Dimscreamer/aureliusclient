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

    // 2. Сохраняем уже существующий инлайн-код
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
    text = text.replace(/<code>([\s\S]*?)<\/code>/gi, (match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push('<code>' + code + '</code>');
        return 'XYZINLINECODE' + idx + 'XYZ';
    });

    // 3. Сохраняем ссылки (a href и raw URLs), чтобы не ломать цифры внутри адресов
    const links = [];
    text = text.replace(/<a\s+href="([^"]+)">([\s\S]*?)<\/a>/gi, (match, href, label) => {
        const idx = links.length;
        let finalHref = href;
        if (finalHref.includes('t.me/AureliusMarketingAI_bot')) {
            finalHref = finalHref.replace('t.me/AureliusMarketingAI_bot', 't.me/MyConversionsBotPpcDmitroBot');
        }
        links.push(`<a href="${finalHref}">${label}</a>`);
        return 'XYZLINK' + idx + 'XYZ';
    });
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (match, label, url) => {
        const idx = links.length;
        let finalUrl = url;
        if (finalUrl.includes('t.me/AureliusMarketingAI_bot')) {
            finalUrl = finalUrl.replace('t.me/AureliusMarketingAI_bot', 't.me/MyConversionsBotPpcDmitroBot');
        }
        links.push(`<a href="${finalUrl}">${label}</a>`);
        return 'XYZLINK' + idx + 'XYZ';
    });
    text = text.replace(/(https?:\/\/[^\s<]+)/g, (match, url) => {
        const idx = links.length;
        let finalUrl = url;
        if (finalUrl.includes('t.me/AureliusMarketingAI_bot')) {
            finalUrl = finalUrl.replace('t.me/AureliusMarketingAI_bot', 't.me/MyConversionsBotPpcDmitroBot');
        }
        links.push(`<a href="${finalUrl}">${finalUrl}</a>`);
        return 'XYZLINK' + idx + 'XYZ';
    });

    // 4. Заменяем амперсанды, не являющиеся HTML-сущностями
    text = text.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');

    // 5. Экранируем сырые < и >, поддерживая telegram-теги (включая <blockquote expandable> и <tg-spoiler>)
    const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tg-spoiler', 'blockquote', 'a'];
    text = text.replace(/<(\/?[a-zA-Z0-9-]+)(\s+[^>]*)?>/g, (match, tag, attrs) => {
        const cleanTag = tag.replace('/', '').toLowerCase();
        if (ALLOWED_TAGS.includes(cleanTag)) {
            if (cleanTag === 'blockquote') {
                if (attrs && /\bexpandable\b/i.test(attrs)) {
                    return `<blockquote expandable>`;
                }
                return tag.startsWith('/') ? `</blockquote>` : `<blockquote>`;
            }
            if (cleanTag === 'a') {
                const hrefMatch = attrs ? attrs.match(/\bhref="([^"]*)"/i) : null;
                if (hrefMatch) {
                    return `<a href="${hrefMatch[1]}">`;
                }
            }
            if (tag.startsWith('/')) {
                return `</${cleanTag}>`;
            }
            return `<${cleanTag}>`;
        }
        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });
    text = text.replace(/<(?![a-zA-Z0-9_\/])/g, '&lt;');
    text = text.replace(/(?<![a-zA-Z0-9_"']|\/|-)>/g, '&gt;');

    // 6. Преобразуем Markdown в HTML
    text = text.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_]+)__/g, '<b>$1</b>');

    // 7. Стилизация списков по стандарту Ares Nutrition (синие буллеты 🔹 или •)
    text = text.replace(/^[ \t]*[\*\-\+][ \t]+/gm, '• ');

    text = text.replace(/(^|\s)_([^_]+)_(\s|$|[.,!?:;])/g, '$1<i>$2</i>$3');
    text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');

    // 8. Очищаем мусорные теги (p, div, ul, ol, li, br)
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(p|div|ul|ol|li|span|h[1-6])[^>]*>/gi, '\n');

    // 9. Авто-оборачивание чисел, дат, процентов, валют и KPI в <code>...</code> (стиль синих цифр)
    function wrapAsCode(content) {
        const idx = inlineCodes.length;
        inlineCodes.push('<code>' + content.trim() + '</code>');
        return 'XYZINLINECODE' + idx + 'XYZ';
    }

    const lines = text.split('\n');
    const formattedLines = lines.map(line => {
        if (!line.trim()) return line;
        if (line.includes('XYZCODEBLOCK')) return line;

        let processed = line;

        // А. Время и календарные даты (например: 14:00, 2026-10-15, 15.10.2026)
        processed = processed.replace(/(<[^>]+>|XYZ[A-Z0-9]+XYZ)|(\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b|\b\d{1,2}:\d{2}\b)/gi, (match, tag, dt) => {
            if (tag) return tag;
            if (dt) return wrapAsCode(dt);
            return match;
        });

        // Б. Числовые значения параметров после двоеточия (• Клики: 150 или 🔹 Клики: 150)
        processed = processed.replace(/^([•🔹\-]\s*[^:\n]{1,40}:\s*)([\d+-][^<>\n]*)$/g, (match, prefix, val) => {
            const cleanVal = val.trim();
            if (cleanVal.includes('XYZINLINECODE')) return match;
            return prefix + wrapAsCode(cleanVal);
        });

        // В. Проценты: +15.2%, -5%, 93% (вне тегов и плейсхолдеров)
        processed = processed.replace(/(<[^>]+>|XYZ[A-Z0-9]+XYZ)|([+-]?\b\d+(?:[.,]\d+)?%)/g, (match, tag, pct) => {
            if (tag) return tag;
            if (pct) return wrapAsCode(pct);
            return match;
        });

        // Г. Валюты и суммы: $148.50, 540.50 EUR, 1500 грн, €100 (вне тегов и плейсхолдеров)
        processed = processed.replace(/(<[^>]+>|XYZ[A-Z0-9]+XYZ)|((?:[\$€₴])\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:EUR|USD|UAH|грн|\$|€)\b)/gi, (match, tag, cur) => {
            if (tag) return tag;
            if (cur) return wrapAsCode(cur);
            return match;
        });

        // Д. Отдельные изолированные числа (за 14 дней, до 200), исключая нумерацию списков (1., 2.)
        processed = processed.replace(/(<[^>]+>|XYZ[A-Z0-9]+XYZ)|(\b(?<![a-zA-Z0-9_#])\d+(?:[.,]\d+)?\b(?!\s*[:\/\-_a-zA-Z\.\)]))/g, (match, tag, num) => {
            if (tag) return tag;
            if (num) return wrapAsCode(num);
            return match;
        });

        return processed;
    });
    text = formattedLines.join('\n');

    // 10. Восстанавливаем сохраненные ссылки и код
    links.forEach((link, idx) => {
        text = text.replace('XYZLINK' + idx + 'XYZ', link);
    });
    inlineCodes.forEach((code, idx) => {
        text = text.replace('XYZINLINECODE' + idx + 'XYZ', code);
    });
    codeBlocks.forEach((code, idx) => {
        text = text.replace('XYZCODEBLOCK' + idx + 'XYZ', code);
    });

    // 11. Балансировка тегов (автоматически закрываем незакрытые теги)
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

    // 12. Форматирование абзацев (воздух \n\n):
    text = text.replace(/(<\/b>)\n([^\n•🔹<])/g, '$1\n\n$2');
    text = text.replace(/(<\/blockquote>)\n([^\n<])/g, '$1\n\n$2');
    // Сжимаем 3+ переноса строк до аккуратных 2 (абзацы)
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
            link_preview_options: { is_disabled: true },
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
        link_preview_options: { is_disabled: true },
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


async function sendTelegramPhoto(chatId, imageInput, caption = '') {
    let buffer;
    if (Buffer.isBuffer(imageInput)) {
        buffer = imageInput;
    } else {
        const b64 = String(imageInput).replace(/^data:image\/png;base64,/, "");
        buffer = Buffer.from(b64, 'base64');
    }
    const blob = new Blob([buffer], { type: 'image/png' });
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('photo', blob, 'dashboard.png');
    if (caption) {
        fd.append('caption', caption);
        fd.append('parse_mode', 'HTML');
    }

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

/**
 * Получить файл из Telegram по file_id и вернуть как base64 с метаданными.
 * Используется для загрузки голосовых сообщений (voice/audio).
 */
async function getTelegramFileAsBase64(fileId) {
    if (!fileId) return null;
    const getFileUrl = `https://api.telegram.org/bot${MARK_CONFIG.TELEGRAM_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
    const fileRes = await axios.get(getFileUrl, { timeout: 10000 });
    
    if (!fileRes.data || !fileRes.data.ok || !fileRes.data.result || !fileRes.data.result.file_path) {
        throw new Error(`Telegram getFile failed: ${JSON.stringify(fileRes.data)}`);
    }

    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${MARK_CONFIG.TELEGRAM_TOKEN}/${filePath}`;
    const fileData = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const base64 = Buffer.from(fileData.data).toString('base64');
    
    let format = 'ogg';
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'mp3' || ext === 'wav' || ext === 'm4a' || ext === 'ogg' || ext === 'oga') {
        format = (ext === 'oga') ? 'ogg' : ext;
    }

    return {
        base64,
        filePath,
        format,
        fileSize: fileRes.data.result.file_size
    };
}

module.exports = {
    sendTelegramPhoto,
    formatTelegramHtml,
    sendTelegramMessage,
    editTelegramMessage,
    sendChatAction,
    answerCallbackQuery,
    getTelegramFileAsBase64
};
