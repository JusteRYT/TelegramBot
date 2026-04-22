/**
 * Global configuration constants.
 */
const CONFIG = {
    BOT_TOKEN: '8656762728:AAHuX9duK0r_dVGTbldXZEAmYoaHCPQvOwM',
    WEBHOOK_URL: 'https://script.google.com/macros/s/AKfycby9ZX3-3U0BvE6znf_-QDsAF2dt4Om_hDSqsj4y2sqfrUOxY2tAJPSDzdtGnGfK5CIb/exec',
    SHEET_USERS: 'ALL_USERS',
    SHEET_WARNINGS: 'WARNINGS_LOG',
    MAX_WARNINGS: 2,
    ALLOWED_CHAT_ID: '-1003893720247', 
    ALLOWED_TOPIC_ID: 24,
    STATUSES: {
        CANDIDATE: 'Кандидат',
        ON_REVIEW: 'На проверке',
        APPROVED: 'Одобрен',
        BANNED: 'Бан'
    }
};

/**
 * Formats a Date object into a specific Russian string pattern.
 * Pattern: "21 марта 2026г. 18:06 по мск"
 * * @param {Date} date - The date object to format.
 * @returns {string} Formatted string.
 */
function getRussianDate(date = new Date()) {
    if (!(date instanceof Date) || isNaN(date)) return '—';

    const months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ];

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    // Форматируем время HH:mm через Utilities для надежности таймзоны
    const time = Utilities.formatDate(date, "GMT+3", "HH:mm");

    return `${day} ${month} ${year}г. ${time} по мск`;
}
