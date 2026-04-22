/**
 * Utility class for date and time manipulations.
 */
class DateUtils {
    /**
     * Parses date and time from Google Sheets values.
     * @param {Object|string} dateVal
     * @param {Object|string} timeVal
     * @return {Date}
     */
    static parse(dateVal, timeVal) {
        let dateObj = (dateVal instanceof Date) ? new Date(dateVal) : this._parseDateString(dateVal);
        return this._applyTimeToDate(dateObj, timeVal);
    }

    /**
     * Formats minutes into a human-readable relative string.
     * @param {number} totalMinutes
     * @return {string}
     */
    static formatRelativeTime(totalMinutes) {
        if (totalMinutes <= 0) return "вот-вот начнется!";
        
        if (totalMinutes < 60) {
            return `${totalMinutes} мин.`;
        }
        
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        
        return mins === 0 ? `${hours} ч.` : `${hours} ч. ${mins} мин.`;
    }

    /**
     * Calculates difference in minutes between two dates.
     * @param {Date} targetDate
     * @param {Date} now
     * @return {number}
     */
    static getDiffInMinutes(targetDate, now = new Date()) {
        return Math.round((targetDate.getTime() - now.getTime()) / (1000 * 60));
    }

    /** @private */
    static _parseDateString(dateStr) {
        const s = String(dateStr || "").trim();
        if (s.includes('.')) {
            const parts = s.split('.');
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parts.length > 2 ? parseInt(parts[2], 10) : new Date().getFullYear();
            return new Date(year, month, day);
        }
        return new Date(dateStr);
    }

    /** @private */
    static _applyTimeToDate(dateObj, timeVal) {
        const d = new Date(dateObj); // Avoid mutating the original date
        if (timeVal instanceof Date) {
            d.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
        } else {
            const match = String(timeVal || "").match(/^(\d{1,2})[:.](\d{2})/);
            if (match) d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
            else d.setHours(0, 0, 0, 0);
        }
        return d;
    }

    /**
 * Formats field values for the admin editing interface.
 * @param {Object} game 
 * @param {string} field 
 * @returns {string}
 */
static formatValueForEdit(game, field) {
    const val = game[field];
    if (!val && field !== 'datetime') return "пусто";

    if (field === 'datetime') {
        const d = DateUtils.parse(game['дата'], game['время']);
        // Форматируем в понятный вид: 22.03.2026 19:00
        const dateStr = Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy");
        const timeStr = Utilities.formatDate(d, "GMT+3", "HH:mm");
        return `${dateStr} ${timeStr}`;
    }

    return String(val);
}
}