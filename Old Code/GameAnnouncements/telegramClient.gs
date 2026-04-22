/**
 * A client wrapper for the Telegram Bot API.
 */
class TelegramClient {
    
    constructor() {
        this.apiUrl = CONFIG.TELEGRAM_API_URL;
    }

    /**
     * Executes a POST request to a specific Telegram Bot API method.
     * @param {string} method
     * @param {Object} payload
     * @return {Object}
     */
    _request(method, payload) {
        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(this.apiUrl + method, options);
        const result = JSON.parse(response.getContentText());

        if (!result.ok) {
            Logger.log(`⚠️ TG Error [${method}]: ${result.description}`);
        }
        
        return result;
    }

    /**
     * Sends a text message.
     * @param {number|string} chatId
     * @param {string} text
     * @param {number|null} threadId - ID of the topic.
     * @param {Object} extraOptions - Additional TG parameters.
     */
    sendMessage(chatId, text, threadId = null, extraOptions = {}) {
    // Защита: если третьим аргументом пришел объект, а не число
    if (typeof threadId === 'object' && threadId !== null) {
        extraOptions = threadId;
        threadId = extraOptions.message_thread_id || null;
    }

    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        message_thread_id: threadId,
        ...extraOptions
    };
    
    return this._request('sendMessage', payload);
}

    /**
     * Edits the text of a previously sent message.
     */
    editMessageText(chatId, messageId, text, options = {}) {
        const payload = {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
            ...options
        };
        return this._request('editMessageText', payload);
    }
}