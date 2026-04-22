/**
 * Logic for converting game objects into human-readable strings.
 */
class GameFormatter {
    static get NUMBER_EMOJIS() {
        return ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    }

    /**
     * @param {Object} game
     * @return {string}
     */
    static formatAnnouncement(game) {
        const status = game['статус набора'];
        const participants = this.extractParticipants(game);
        const pList = this.buildParticipantsList(participants);
        const d = DateUtils.parse(game['дата'], game['время']);
        
        const dateStr = Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy");
        const timeStr = Utilities.formatDate(d, "GMT+3", "HH:mm");

        const section = this._getParticipantsSection(status, game['участники'], pList);

        return `🎮 <b>ПРИКЛЮЧЕНИЕ: ${game['Название']}</b>\n\n` +
               `📅 <b>Дата:</b> <code>${dateStr}</code>\n` +
               `⏰ <b>Время:</b> <code>${timeStr}</code> (МСК)\n` +
               `🧙‍♂️ <b>Мастер:</b> ${game['гм']}\n\n` +
               `${section}\n\n` +
               `📜 <b>О приключении:</b>\n<i>${game['описание']}</i>\n\n` +
               `📌 <b>Статус:</b> ${this.getStatusLabel(status)}`;
    }

    static formatReminder(game, timeLeftText, triggerType) {
        const emoji = triggerType === 24 ? "⏳" : "🔔";
        const players = this.extractParticipants(game).map(p => p.replace('✅', '').trim()).join(' ');
        const d = DateUtils.parse(game['дата'], game['время']);
        
        return `${emoji} <b>ВНИМАНИЕ, ГЕРОИ!</b> ${emoji}\n\n` +
               `До начала <b>«${game['Название']}»</b> осталось: ⏳ <b>${timeLeftText}</b>\n\n` +
               `📅 <b>Дата:</b> <code>${Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy")}</code>\n` +
               `⏰ <b>Время:</b> <code>${Utilities.formatDate(d, "GMT+3", "HH:mm")}</code>\n` +
               `⚔️ <b>Готовность:</b>\n${players || "<i>Пусто...</i>"}`;
    }

    /**
     * Safely extracts participant list from the game object.
     * Prevents "split is not a function" by forcing string conversion.
     * * @param {Object} game - The game entity.
     * @returns {string[]} Array of participant usernames.
     */
    static extractParticipants(game) {
        const rawData = game['зарегистрированные'];
        
        const playersString = String(rawData || "");
        
        if (!playersString.trim()) {
            return [];
        }

        return playersString.split(',').map(p => p.trim()).filter(p => p);
    }

    static buildParticipantsList(participants) {
        if (!participants.length) return "<i>Места пока вакантны</i>";
        return participants
            .map((n, i) => `${this.NUMBER_EMOJIS[i] || (i + 1 + '.')} ${n.trim()}`)
            .join('\n');
    }

    static getStatusLabel(status) {
        const labels = {
            [CONFIG.STATUS.OPEN]: '🔵 Идет набор героев',
            [CONFIG.STATUS.CLOSED]: '🟢 Группа сформирована',
            [CONFIG.STATUS.ARCHIVED]: '🏁 Приключение завершено',
            [CONFIG.STATUS.CANCELLED]: '❌ Игра отменена'
        };
        return labels[status] || '⚪️ Статус неизвестен';
    }

    static _getParticipantsSection(status, limit, list) {
        if (status === CONFIG.STATUS.CANCELLED) return `🚫 <b>Экспедиция не состоится.</b>`;
        if (status === CONFIG.STATUS.OPEN) return `👥 <b>Мест:</b> ${limit}\n📝 <b>Заявки:</b>\n${list}`;
        return `⚔️ <b>Состав отряда:</b>\n${list}`;
    }

    /**
     * Formats a high-priority message to signal the immediate start of the game.
     * Tags all approved players to ensure they are notified.
     * @param {Object} game - The game entity.
     * @returns {string} Formatted HTML string.
     */
    static formatStartMessage(game) {
        const players = this.extractParticipants(game)
            .map(p => p.replace('✅', '').trim()) // Убираем маркеры подтверждения для тега
            .filter(p => p.length > 0)
            .join(' ');

        return `⚔️ <b>ПОРА В ПУТЬ, ГЕРОИ!</b> ⚔️\n\n` +
               `Приключение <b>«${game['Название']}»</b> начинается прямо сейчас!\n\n` +
               `🧙‍♂️ <b>Мастер:</b> ${game['гм']}\n` +
               `👥 <b>Отряд:</b> ${players || "<i>Тишина в таверне...</i>"}\n\n` +
               `<i>Проверьте снаряжение и да пребудет с вами крит удача!</i>`;
    }

    /**
     * Generates a standard registration keyboard for the public announcement.
     * @param {Object} game
     * @returns {Array} InlineKeyboardMarkup
     */
    static getRegistrationKeyboard(game) {
        if (game['статус набора'] !== CONFIG.STATUS.OPEN) return [];

        return [[
            { text: "⚔️ Записаться", callback_data: `reg_${game.id}` },
            { text: "🏃 Покинуть", callback_data: `unreg_${game.id}` }
        ]];
    }

    /**
     * Formats a single game entry for the upcoming games list.
     * Decides link text based on the registration status.
     * @param {Object} game - The game entity.
     * @returns {string} Formatted snippet with a deep link.
     */
    static formatUpcomingSnippet(game) {
    const d = DateUtils.parse(game['дата'], game['время']);
    
    const fullDateStr = Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy 'г.' HH:mm");
    
    const participants = this.extractParticipants(game);

    const limit = this._parseParticipantLimit(game['участники']);
    const count = participants.length;
    const seatsInfo = (game['статус набора'] === CONFIG.STATUS.OPEN) 
        ? `\n👥 <b>Места:</b> ${count}/${limit}`
        : "";

    let linkSection = "";
    if (game.message_id) {
        const isRegistrationOpen = game['статус набора'] === CONFIG.STATUS.OPEN;
        const linkLabel = isRegistrationOpen ? "Записаться на игру" : "Посмотреть пост";
        
        linkSection = `\n👉 <a href="${CONFIG.CHANNEL_BASE_URL}/${game.message_id}?topic=${CONFIG.ANNOUNCEMENT_TOPIC_ID}">${linkLabel}</a>`;
    }

    return [
        `🔹 <b>${game['Название']}</b>`,
        `📅 ${fullDateStr} по МСК${seatsInfo}`,
        `🎭 Мастер: ${game['гм']}${linkSection}`,
        `──────────────────`
    ].join('\n');
  }

  /**
     * Extracts only digits from the "участники" field.
     * Use this to handle strings like "Нужно 12 чел." as the number 12.
     * @param {string|number} rawLimit
     * @returns {number}
     * @private
     */
    static _parseParticipantLimit(rawLimit) {
        if (typeof rawLimit === 'number') return rawLimit;
        // Регуляркой достаем только цифры
        const matches = String(rawLimit || "0").match(/\d+/);
        return matches ? parseInt(matches[0], 10) : 0;
    }
}