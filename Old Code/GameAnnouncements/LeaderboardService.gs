/**
 * Service for generating a high-density, perfectly aligned leaderboard.
 */
class LeaderboardService {
    /**
     * Generates a 9-player leaderboard with headers and monospaced rows.
     * @param {Array<Object>} allPlayers
     * @returns {string}
     */
    static generateLeaderboard(allPlayers) {
        const sorted = [...allPlayers]
            .sort((a, b) => b.gamesCount - a.gamesCount)
            .slice(0, 9);

        let text = `⚔️ <b>ЗАЛ ВЕЛИКИХ ПОБЕД</b> 🏆\n\n`;
        
        // Отступ для шапки, чтобы компенсировать иконки места и ранга (обычно 5 пробелов)
        const headPad = "     "; 
        
        // Добавляем названия колонок
        text += `<code>${headPad} Герой          Ранг         Игры</code>\n`;

        if (sorted.length === 0) {
            text += "<i>💨 В Зале Славы пока пусто...</i>\n";
        }

        sorted.forEach((player, index) => {
            const position = index + 1;
            const rank = RankService.calculateRank(player.gamesCount);
            const posIcon = this._getPositionIcon(position);
            
            // Фиксированная ширина колонок (12 для ника, 10 для ранга)
            let username = (player.username ? `@${player.username}` : "Hero").slice(0, 12);
            const nameCol = username.padEnd(12, ' ');
            const rankName = rank.name.padEnd(10, ' ');
            const games = String(player.gamesCount).padStart(2, ' ');

            // Строка: [Медаль][Ранг] [Моноширинный текст с разделителями]
            const row = `${nameCol} │ ${rankName} │ ${games}\n`;
            
            text += `${posIcon}${rank.emoji} <code>${row}</code>`;
        });

        // Отделяем футер двойным переносом строки
        text += `\n\n📈 Чтобы узнать свой прогресс, напиши боту в ЛС: /rank\n\n`;
        
        const mskTime = Utilities.formatDate(new Date(), "GMT+3", "dd.MM.yyyy HH:mm");
        text += `🕒 <b>Обновлено:</b> <code>${mskTime} МСК</code>`;
        
        return text;
    }

    /** @private */
    static _getPositionIcon(pos) {
        const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
        if (medals[pos]) return medals[pos];
        const digits = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
        return digits[pos] || "🔹";
    }
}