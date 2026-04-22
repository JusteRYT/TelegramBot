/**
 * Low-level Telegram dispatcher.
 * Handles communication with Telegram API using specialized methods for text and media.
 */
class NotificationService {
    constructor() {
        this.client = new TelegramClient();
    }

    /**
     * Sends or edits a message based on game state.
     * @param {Object} game - Game entity containing current data.
     * @param {string} text - Message text or caption.
     * @param {Array|null} keyboard - Inline keyboard array.
     * @param {boolean} isForcedNew - If true, always sends a new message.
     * @param {number|null} targetTopicId - Specific topic ID for routing.
     * @param {number|null} overrideChatId - Direct Chat ID (DM), bypasses topics.
     * @returns {Object} Telegram API response.
     */
    dispatch(game, text, keyboard = null, isForcedNew = false, targetTopicId = null, overrideChatId = null) {
        const fileId = game['картинка_file_id'];
        const messageId = isForcedNew ? null : game.message_id;
        
        let chatId;
        let threadId = null;

        if (overrideChatId) {
            chatId = overrideChatId;
            threadId = null; 
        } else {
            threadId = targetTopicId || CONFIG.ANNOUNCEMENT_TOPIC_ID;
            chatId = (threadId === CONFIG.ADMIN_TOPIC_ID) 
                ? CONFIG.ADMIN_CHAT_ID 
                : CONFIG.MAIN_CHAT_ID;
        }

        const replyMarkup = keyboard ? JSON.stringify({ inline_keyboard: keyboard }) : undefined;

        // CASE 1: Send New Message
        if (!messageId) {
            const payload = {
                chat_id: chatId,
                message_thread_id: threadId,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            };

            if (fileId) {
                return this.client._request('sendPhoto', { ...payload, photo: fileId, caption: text });
            }
            return this.client._request('sendMessage', { ...payload, text: text });
        } 

        // CASE 2: Edit Existing Message
        const editBase = { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup };

        if (fileId) {
            return this.client._request('editMessageMedia', {
                ...editBase,
                media: JSON.stringify({
                    type: 'photo',
                    media: fileId,
                    caption: text,
                    parse_mode: 'HTML'
                })
            });
        }

        return this.client._request('editMessageText', {
            ...editBase,
            text: text,
            parse_mode: 'HTML'
        });
    }

    /**
     * Deletes a message from the main channel.
     * @param {number} messageId 
     */
    delete(messageId) {
        return this.client._request('deleteMessage', {
            chat_id: CONFIG.MAIN_CHAT_ID,
            message_id: messageId
        });
    }

    /**
     * Answers an inline callback query.
     * @param {string} queryId 
     * @param {string} text 
     * @param {boolean} showAlert 
     */
    answerCallback(queryId, text, showAlert = false) {
        return this.client._request('answerCallbackQuery', {
            callback_query_id: queryId,
            text: text,
            show_alert: showAlert
        });
    }

    /**
     * Sends a direct message to a user (Private Chat).
     * @param {number} userId - Telegram User ID.
     * @param {string} text - Message text.
     * @param {Array|null} keyboard - Optional inline keyboard.
     */
    sendDirect(userId, text, keyboard = null) {
        const payload = {
            chat_id: userId,
            text: text,
            parse_mode: 'HTML',
            reply_markup: keyboard ? JSON.stringify({ inline_keyboard: keyboard }) : undefined
        };
        return this.client._request('sendMessage', payload);
    }
}