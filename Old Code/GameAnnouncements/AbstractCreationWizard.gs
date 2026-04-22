/**
 * Abstract base class for all creation wizards.
 * Extracts common logic to adhere to DRY principle.
 * @abstract
 */
class AbstractCreationWizard {
    constructor(message, state) {
        if (new.target === AbstractCreationWizard) {
            throw new TypeError("Cannot construct Abstract instances directly");
        }
        this.message = message;
        this.state = state;
        this.userId = message.from.id;
        this.chatId = message.chat.id;
        this.threadId = state.threadId || message.message_thread_id;
        
        this.client = new TelegramClient();
        this.service = new GameService();
    }

    /**
     * @abstract
     */
    process() {
        throw new Error("Method 'process()' must be implemented.");
    }

    /** @protected */
    _nextStep(text) {
        StateManager.setState(this.userId, this.state);
        this.client.sendMessage(this.chatId, text, { 
            message_thread_id: this.threadId, 
            parse_mode: 'HTML' 
        });
    }

    /** @protected */
    _reportError(e) {
        this.client.sendMessage(this.chatId, `❌ <b>Ошибка:</b> ${e.message}`, { message_thread_id: this.threadId });
        StateManager.clearState(this.userId);
    }
}