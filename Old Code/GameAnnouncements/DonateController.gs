/**
 * Controller responsible for handling donation flows and presenting payment information.
 */
class DonateController {
    
    /**
     * Constructs the DonateController with required dependencies.
     * * @param {TelegramClient} telegramClient - Client for sending messages to Telegram API.
     */
    constructor(telegramClient) {
        this.client = telegramClient;
        
        // Data source. Later can be moved to a Repository or Database.
        this.receivers = [
            { 
                id: 'akulenok', 
                name: '@AKULENOK_arrr', 
                card: '2202 2036 6461 2761', 
                bank: 'Сбер',
                message: 'на кубики и миниатюры 🎲'
            }
        ];
    }

    /**
     * Sends the initial selection menu to the user via Inline Keyboard.
     * * @param {number} chatId - Target Telegram chat identifier.
     */
    showDonationMenu(chatId, threadId = null) {
        const text = "💎 <b>Поддержка проекта</b>\n\nКому из мастеров вы хотите отправить чаевые?";
        
        const keyboard = this.receivers.map(receiver => [{ 
            text: `☕ ${receiver.name}`, 
            callback_data: `donate_select_${receiver.id}` 
        }]);

        this.client.sendMessage(chatId, text, threadId, {
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
    });
    }

    /**
     * Sends formatted payment details based on the selected receiver ID.
     * Triggered by callback query routing.
     * * @param {number} chatId - Target Telegram chat identifier.
     * @param {string} receiverId - The internal identifier of the receiver (e.g., 'akulenok').
     */
    processDonationSelection(chatId, receiverId) {
        const receiver = this.receivers.find(r => r.id === receiverId);
        
        if (!receiver) {
            return this.client.sendMessage(chatId, "❌ Мастер не найден.");
        }

        const text = `🎉 <b>Спасибо за желание поддержать ${receiver.name}!</b>\n\n` +
                     `Ваш донат пойдет ${receiver.message}\n\n` +
                     `💳 Перевод по номеру карты:\n` +
                     `<code>${receiver.card}</code>\n` +
                     `🏦 Банк: <b>${receiver.bank}</b>\n\n` +
                     `<i>💡 Нажмите на номер карты, чтобы быстро скопировать его.</i>`;

        this.client.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }
}