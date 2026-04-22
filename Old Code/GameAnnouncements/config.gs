/**
 * Global configuration constants.
 */
const CONFIG = {
    /** Telegram Bot Token from BotFather */
    BOT_TOKEN: '8794022007:AAH8uwTovQbXX63UaS8YgtgK1RRAS0tIhFU',
    WEBHOOK_ID: 'AKfycbw9h7BaVvJkGygeJ1mma4gZ0UUDAu-aA5Rahj_aLLbbhw1oVqMaieNljJd3hrJdwpLP9w',
  
    
    /** * Chat and Topic IDs.  */
    ADMIN_CHAT_ID: -1003893720247,
    ADMIN_TOPIC_ID: 797,
    
    /** Tests MAIN_CHAT_ID:-1003893720247 || ANNOUNCEMENT_TOPIC_ID:1623. Original  MAIN_CHAT_ID:-1003838765221 || ANNOUNCEMENT_TOPIC_ID:4*/
    MAIN_CHAT_ID: -1003838765221,
    ANNOUNCEMENT_TOPIC_ID: 4,

    /** Google Sheets settings */
    SHEET_GAMES: 'ИГРЫ',
    
    /** Game statuses */
    STATUS: {
      OPEN: 'Идет набор',
      CLOSED: 'Группа собрана',
      ARCHIVED: 'Игра завершена',
      CANCELLED: 'Отменена'
    },
    GAME_TYPES: {
        DND: 'DND',
        MAFIA: 'MAFIA'
    },
    RANKS: [
        { name: "Новичок", emoji: "🐣", minGames: 0 },
        { name: "Странник", emoji: "🥾", minGames: 3 },
        { name: "Искатель", emoji: "🔍", minGames: 6 },
        { name: "Авантюрист", emoji: "🗺", minGames: 10 },
        { name: "Боец", emoji: "⚔️", minGames: 15 },
        { name: "Наемник", emoji: "💰", minGames: 21 },
        { name: "Страж", emoji: "🛡", minGames: 28 },
        { name: "Охотник", emoji: "🏹", minGames: 36 },
        { name: "Рыцарь", emoji: "🐴", minGames: 45 },
        { name: "Ветеран", emoji: "🎖", minGames: 55 },
        { name: "Мастер", emoji: "📜", minGames: 66 },
        { name: "Герой", emoji: "🌟", minGames: 78 },
        { name: "Воитель", emoji: "🔥", minGames: 91 },
        { name: "Завоеватель", emoji: "🦅", minGames: 105 },
        { name: "Легенда", emoji: "👑", minGames: 120 }
    ],
    BOT_USERNAME: 'vrodednd20_bot',
    CANDIDATE_BOT_NAME: '@vr_partyAdmin_bot',
    LEADERBOARD_CHAT_ID: -1003838765221,
    LEADERBOARD_THREAD_ID: 1661,
    LEADERBOARD_MSG_ID: 1666,

    /** * Computed Telegram API base URL.
     * @returns {string}
     */
    /**
     * @returns {string} The Web App URL for the current script.
     */
    get WEBHOOK_URL() {
        return `https://script.google.com/macros/s/${this.WEBHOOK_ID}/exec`;
    },

    /**
     * @returns {string} The target URL for candidate management.
     */
    get CANDIDATE_BOT_URL() {
        return `https://script.google.com/macros/s/${this.WEBHOOK_ID}/exec`;
    },

    /**
     * @returns {string} Computed Telegram API base URL.
     */
    get TELEGRAM_API_URL() {
        return `https://api.telegram.org/bot${this.BOT_TOKEN}/`;
    },

    /**
     * @returns {string} Formatted URL to the main channel.
     */
    get CHANNEL_BASE_URL() {
        const cleanId = String(this.MAIN_CHAT_ID).replace('-100', '');
        return `https://t.me/c/${cleanId}`;
    }
};