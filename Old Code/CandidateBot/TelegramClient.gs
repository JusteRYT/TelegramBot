/**
 * Client for interacting with the Telegram Bot API.
 */
class TelegramClient {
    /**
     * Sends a text message to a chat.
     * @param {number|string} chatId - Target chat ID.
     * @param {string} text - Message text.
     * @param {number|null} threadId - Target message thread ID (for topics).
     */
    sendMessage(chatId, text, threadId = null) {
        const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;
        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        };

        // Если threadId передан, добавляем его в payload
        if (threadId) {
            payload.message_thread_id = threadId;
        }
        
        UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload)
        });
    }
}