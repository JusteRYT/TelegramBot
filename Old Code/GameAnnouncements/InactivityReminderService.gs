/**
 * Service to handle inactivity checks and notifications.
 * Implements automated reminders for players who haven't played for > 3 weeks.
 */
class InactivityReminderService {
    /**
     * @constructor
     */
    constructor() {
        this.notificationService = new NotificationService();
        this.firstBotUrl = CONFIG.CANDIDATE_BOT_URL;
    }

    /**
     * Main logic to fetch and remind inactive players.
     * Invoked by time-based triggers.
     */
    checkAndRemind() {
        try {
            // 1. Fetch inactive users from Bot #1
            const response = UrlFetchApp.fetch(`${this.firstBotUrl}?action=get_inactive`);
            const inactiveUsers = JSON.parse(response.getContentText());

            if (!inactiveUsers || inactiveUsers.length === 0) {
                Logger.log("Inactivity Check: No users found to remind.");
                return;
            }

            // 2. Dispatch notifications
            inactiveUsers.forEach(user => {
                const message = this.buildReminderMessage(user.username);
                
                try {
                    // Send DM using Telegram ID from the first bot's response
                    this.notificationService.sendDirect(user.id, message);
                    
                    // Throttling to respect Telegram API limits (30 msgs/sec)
                    Utilities.sleep(50); 
                } catch (e) {
                    Logger.log(`Failed to send message to ${user.username} (ID: ${user.id}): ${e.message}`);
                }
            });

            Logger.log(`Inactivity Check: Processed ${inactiveUsers.length} users.`);

        } catch (error) {
            Logger.log("CRITICAL: Error in InactivityReminderService.checkAndRemind: " + error.message);
        }
    }

    /**
     * Creates a formatted warning message for the user.
     * @param {string} username - Telegram handle.
     * @returns {string} HTML-formatted message.
     * @private
     */
    buildReminderMessage(username) {
        return (
            `<b>Внимание, @${username}!</b> 👋\n\n` +
            `Мы заметили, что ты не проявлял активность в играх <b>более 3-х недель</b>. 🗓\n\n` +
            `Напоминаем, что наше сообщество ценит активных игроков. Согласно правилам, при длительном отсутствии записей на игры администрация может принять решение об <b>исключении из группы и блокировке (бан)</b> за неактивность. 🚫⚔️\n\n` +
            `Мы очень не хотим тебя терять! Заглядывай в канал с анонсами и записывайся на ближайшую игру, чтобы подтвердить свой статус игрока. 🎲✨`
        );
    }
}