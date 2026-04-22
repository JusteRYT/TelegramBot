/**
 * Service for calculating user ranks and progression.
 */
class RankService {
    /**
     * Finds the current rank based on games count.
     * @param {number} gamesCount 
     * @returns {Object} {name, emoji, minGames}
     */
    static calculateRank(gamesCount) {
        const count = parseInt(gamesCount) || 0;
        return [...CONFIG.RANKS].reverse().find(rank => count >= rank.minGames) || CONFIG.RANKS[0];
    }

    /**
     * Generates a clean progress section with a bar and label.
     * @param {number} gamesCount 
     * @returns {string}
     */
    static getProgressString(gamesCount) {
        const count = parseInt(gamesCount) || 0;
        const currentRank = this.calculateRank(count);
        const nextRank = CONFIG.RANKS.find(rank => rank.minGames > count);
        
        if (!nextRank) {
            return `✨ <b>Легендарный уровень</b>\n<code>[||||||||||] 100%</code>`;
        }

        const range = nextRank.minGames - currentRank.minGames;
        const currentProgress = count - currentRank.minGames;
        const percent = Math.floor((currentProgress / range) * 100);
        
        const progressBar = this._generateProgressBar(percent);

        return `<b>Прогресс до ранга ${nextRank.name}:</b>\n` +
               `${progressBar}  ${percent}%`;
    }

    /**
     * Creates a sleek progress bar using specific symbols.
     * @private
     */
    static _generateProgressBar(percent) {
        const size = 10; 
        const filledSize = Math.round((percent * size) / 100);
        const emptySize = size - filledSize;
        
        // Используем более "спокойные" квадраты
        const filled = "🟦".repeat(filledSize);
        const empty = "⬜️".repeat(emptySize);
        
        return `${filled}${empty}`;
    }
}