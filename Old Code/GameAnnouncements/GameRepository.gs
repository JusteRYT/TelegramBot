/**
 * Repository for managing Game records in Google Sheets.
 * Abstracts data access logic.
 */
class GameRepository {
    constructor() {
        this.sheetName = CONFIG.SHEET_GAMES;
        this._dataCache = null;
    }

    /**
     * Gets the active sheet object.
     * @returns {GoogleAppsScript.Spreadsheet.Sheet}
     * @private
     */
    _getSheet() {
        return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.sheetName);
    }

    /**
     * Fetches all games from the database.
     * @returns {Array<Object>} List of game objects.
     */
    findAll() {
        // Возвращаем кэш, если уже читали таблицу в этом запросе
        if (this._dataCache) return this._dataCache; 

        const sheet = this._getSheet();
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) return [];

        const headers = data[0];
        const games = [];

        for (let i = 1; i < data.length; i++) {
            let row = data[i];
            let game = {};
            headers.forEach((header, index) => {
                game[header] = row[index];
            });
            game._rowIndex = i + 1; 
            games.push(game);
        }
        
        this._dataCache = games; // Сохраняем в кэш
        return games;
    }

    /**
    * Finds a game by its ID.
    * @param {string|number} id - The unique game identifier.
    * @returns {Object|null}
    */
    findById(id) {
        const games = this.findAll(); // Теперь это мгновенно, если кэш заполнен
        return games.find(game => String(game.id) === String(id)) || null;
    }

    /**
     * Saves a new game to the database.
     * @param {Object} game - The game object to save.
     */
    save(game) {
        const sheet = this._getSheet();
        const rowData = [
            game.id,
            game['Название'],
            game['дата'],
            game['время'],
            game['гм'],
            game['участники'],
            game['зарегистрированные'] || "",
            game['статус набора'] || "Открыт",
            game['описание'],
            game['картинка_file_id'] || "",
            game['message_id'] || "",
            new Date(),
            game['напоминания'] || "{}",
            game['анкеты_сданы'] || "",
            game['Тип'] || ""
        ];
        sheet.appendRow(rowData);
        this._dataCache = null;
    }

    /**
     * Updates an existing game record.
     * @param {Object} game - The game object with updated fields.
     */
    update(game) {
        if (!game._rowIndex) throw new Error("Row index missing for update");
        
        const sheet = this._getSheet();
        const rowData = [[
            game.id, 
            game['Название'], 
            game['дата'], 
            game['время'], 
            game['гм'],
            game['участники'], 
            game['зарегистрированные'], 
            game['статус набора'],
            game['описание'], 
            game['картинка_file_id'], 
            game['message_id'], 
            game['дата создания'], 
            game['напоминания'] || "{}",
            game['анкеты_сданы'] || "",
            game['Тип'] || ""
        ]];
        
        sheet.getRange(game._rowIndex, 1, 1, rowData[0].length).setValues(rowData);
        this._dataCache = null;
    }

    /**
     * Generates the next numeric ID based on the last row.
     * @returns {number}
     */
    getNextId() {
        const sheet = this._getSheet();
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) return 1;
        const lastId = sheet.getRange(lastRow, 1).getValue();
        return isNaN(lastId) ? 1 : Number(lastId) + 1;
    }

    /**
    * Deletes a game record by its ID.
    */
    deleteById(id) {
        const game = this.findById(id);
        if (!game) return false;
    
        const sheet = this._getSheet();
        sheet.deleteRow(game._rowIndex);
        this._dataCache = null;
        return true;
    }
}