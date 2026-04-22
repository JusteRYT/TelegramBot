/**
 * Data Access Object for Google Sheets.
 */
class SheetRepository {
    constructor() {
        this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        this.usersSheet = this.spreadsheet.getSheetByName(CONFIG.SHEET_USERS);
        this.warningsSheet = this.spreadsheet.getSheetByName(CONFIG.SHEET_WARNINGS);
        this.bansSheet = this.spreadsheet.getSheetByName(CONFIG.SHEET_BANS || "BANS_LOG");
    }

    /**
     * Finds a user row by their username.
     * @param {string} username - Target username.
     * @returns {number} 1-based row index, or -1 if not found.
     */
    findUserRowByUsername(username) {
        if (!username) return -1;
        const cleanName = username.replace('@', '').trim();
        const data = this.usersSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            if (data[i][1].toString().toLowerCase() === cleanName.toLowerCase()) return i + 1;
        }
        return -1;
    }

    /**
     * Updates Telegram ID, First Name and Last Name for a user.
     * @param {string} username - User's handle.
     * @param {number} telegramId - Numerical ID.
     * @param {string} fName - First Name from TG.
     * @param {string} lName - Last Name from TG.
     */
    updateTelegramDetails(username, telegramId, fName, lName) {
        const row = this.findUserRowByUsername(username);
        if (row !== -1) {
            this.usersSheet.getRange(row, 1).setValue(telegramId);
            this.usersSheet.getRange(row, 3).setValue(fName || '');
            this.usersSheet.getRange(row, 4).setValue(lName || '');
        }
    }

    /**
     * Fetches all warning reasons for a specific user.
     * @param {string} username - Target username.
     * @returns {string[]} Array of reasons.
     */
    getUserWarnings(username) {
        const cleanName = username.replace('@', '').trim().toLowerCase();
        const data = this.warningsSheet.getDataRange().getValues();
        
        if (data.length <= 1) return []; 

        return data
            .slice(1)
            .filter(row => {
                const nameInTable = row[1] ? row[1].toString().replace('@', '').trim().toLowerCase() : "";
                return nameInTable === cleanName;
            })
            .map(row => row[2].toString());
    }

    /**
     * Inserts a new user record.
     * @param {string} username - Target username.
     * @param {string} status - Initial user status.
     */
    addUser(username, status) {
        const cleanName = username.replace('@', '');
        this.usersSheet.appendRow(['', cleanName, '', '', status, new Date(), '-', 0, 0]);
    }

    /**
     * Inserts a new user record with all Telegram details at once.
     */
    addUserWithDetails(username, telegramId, fName, lName, status) {
        const cleanName = username.replace('@', '');
        // Порядок колонок: ID, Username, First Name, Last Name, Status, Date Added, Last Game, Warnings
        this.usersSheet.appendRow([
            telegramId, 
            cleanName, 
            fName || '', 
            lName || '', 
            status, 
            new Date(), 
            '-', 
            0,
            0
        ]);
    }

    /**
     * Updates the last game date AND increments the games counter.
     * Replaces the old updateLastGame method.
     * @param {number} rowIndex - User row index.
     * @returns {number} New total games count.
     */
    recordGamePlayed(rowIndex) {
        this.usersSheet.getRange(rowIndex, 7).setValue(new Date());
        
        const countRange = this.usersSheet.getRange(rowIndex, 9);
        const newCount = (parseInt(countRange.getValue()) || 0) + 1;
        countRange.setValue(newCount);
        
        return newCount;
    }

    /**
     * Updates a user's status.
     * @param {number} rowIndex - The row index.
     * @param {string} newStatus - The new status.
     */
    updateStatus(rowIndex, newStatus) {
        this.usersSheet.getRange(rowIndex, 5).setValue(newStatus); // E column
    }

    /**
     * Logs a warning to the history sheet.
     * @param {string} username - Target username.
     * @param {string} reason - Reason for warning.
     */
    logWarningHistory(username, reason) {
        const timestamp = new Date();
        const cleanName = username.replace('@', '').trim();
        this.warningsSheet.appendRow([timestamp, cleanName, reason]);
    }

    /**
     * Increments warning count and returns new value.
     * @param {number} rowIndex - User row index.
     * @returns {number} New warnings count.
     */
    incrementWarnings(rowIndex) {
        const range = this.usersSheet.getRange(rowIndex, 8); // Column H
        const newValue = (parseInt(range.getValue()) || 0) + 1;
        range.setValue(newValue);
        return newValue;
    }

    /**
     * Gets all users with a specific status.
     * @param {string} status - Status to filter by.
     * @returns {string[]} List of usernames.
     */
    getUsersByStatus(status) {
        const data = this.usersSheet.getDataRange().getValues();
        return data
            .filter(row => row[4] === status)
            .map(row => row[1]);
    }

    /**
     * Fetches all users and groups them by status with full details.
     * @returns {Object} { "Статус": [{username, firstName, lastName}, ...], ... }
     */
    getAllUsersWithStatuses() {
        const data = this.usersSheet.getDataRange().getValues();
        if (data.length <= 1) return {};

        const groups = {};
        
        data.slice(1).forEach(row => {
            const username = row[1];
            const firstName = row[2];
            const lastName = row[3];
            const status = row[4];
            
            if (username && status) {
                if (!groups[status]) groups[status] = [];
                groups[status].push({
                    username,
                    firstName: firstName || '-',
                    lastName: lastName || '-'
                });
            }
        });

        return groups;
    }

    /**
     * Formats user data for the /info command.
     */
    getUserData(rowIndex) {
        const row = this.usersSheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
        return {
            id: row[0] || '<i>Неизвестен (пусть нажмет /start)</i>',
            username: row[1],
            firstName: row[2] || '-',
            lastName: row[3] || '-',
            status: row[4],
            added: row[5],
            lastGame: row[6],
            warningsCount: row[7],
            gamesCount: row[8] || 0
        };
    }

    /**
     * Logs the user removal reason to the warnings sheet.
     * @param {string} username - Target username.
     * @param {string} reason - Reason for removal.
     */
    logRemovalHistory(username, reason) {
        const timestamp = new Date();
        const cleanName = username.replace('@', '').trim();
        // Используем лист нарушений для сохранения истории удалений
        this.warningsSheet.appendRow([timestamp, cleanName, `❌ УДАЛЕН: ${reason}`]);
    }

    /**
     * Deletes a user row completely from the sheet.
     * @param {number} rowIndex - The 1-based row index to delete.
     */
    deleteUserRow(rowIndex) {
        this.usersSheet.deleteRow(rowIndex);
    }

    /**
     * Records a ban entry into the dedicated ban sheet.
     * @param {string} username - Target username.
     * @param {string} reason - Detailed reason for the ban.
     */
    addBanRecord(username, reason) {
        const timestamp = new Date();
        const cleanName = username.replace('@', '').trim();
        this.bansSheet.appendRow([timestamp, cleanName, reason]);
    }

    /**
     * Retrieves the latest ban reason for a specific user.
     * @param {string} username - Target username.
     * @returns {string} The last recorded reason or "Not specified".
     */
    getLatestBanReason(username) {
        const cleanName = username.replace('@', '').trim().toLowerCase();
        const data = this.bansSheet.getDataRange().getValues();
        
        if (data.length <= 1) return "не указана";

        // Search from bottom to top to find the most recent entry
        for (let i = data.length - 1; i >= 1; i--) {
            if (data[i][1] && data[i][1].toString().toLowerCase() === cleanName) {
                return data[i][2];
            }
        }
        return "не указана";
    }

    /**
     * Finds users who haven't played for more than N weeks and match specific statuses.
    * @param {string[]} statuses - Array of statuses to check (e.g. ['Кандидат', 'На проверке']).
    * @param {number} weeksLimit - Number of weeks of inactivity.
    * @returns {Array<{id: number, username: string}>} List of inactive users.
    */
    getInactiveUsers(statuses, weeksLimit = 3) {
        const data = this.usersSheet.getDataRange().getValues();
        if (data.length <= 1) return [];

        const now = new Date();
        const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
        const inactiveUsers = [];

        data.slice(1).forEach(row => {
            const tgId = row[0];
            const username = row[1];
            const status = row[4];
            const lastGameVal = row[6]; // Column G

            // Проверяем статус
            if (statuses.includes(status) && tgId) {
                let lastGameDate;
            
                // Если даты нет или стоит прочерк, считаем от даты добавления (Column F - index 5)
                if (!lastGameVal || lastGameVal === '-') {
                    lastGameDate = new Date(row[5]);
                } else {
                    lastGameDate = new Date(lastGameVal);
                }

                const diffWeeks = (now - lastGameDate) / MS_PER_WEEK;

                if (diffWeeks >= weeksLimit) {
                    inactiveUsers.push({
                        id: tgId,
                        username: username
                    });
                }
            }
        });

        return inactiveUsers;
    }

    /**
     * Fetches all users from the sheet with their game counts.
     * @returns {Array<{username: string, gamesCount: number}>}
     */
    getAllPlayersForLeaderboard() {
        const data = this.usersSheet.getDataRange().getValues();
        if (data.length <= 1) return [];

        return data.slice(1).map(row => ({
            username: row[1] || 'Unknown',
            gamesCount: parseInt(row[8]) || 0,
            status: row[4]
        })).filter(p => p.status !== CONFIG.STATUSES.BANNED); // Исключаем забаненных из топа
    }
}