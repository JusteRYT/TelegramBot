/**
 * Formats a Date object into a readable Russian string.
 * Example: "25 марта 2026г. 20:00 по мск"
 * * @param {Date} date - The date to format.
 * @returns {string} Human-friendly date string.
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
    
    // GMT+3 ensures MSK timezone regardless of script settings
    const time = Utilities.formatDate(date, "GMT+3", "HH:mm");

    return `${day} ${month} ${year}г. ${time} по мск`;
}