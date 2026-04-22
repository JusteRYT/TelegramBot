/**
 * External API entry point for the second bot.
 * Handles GET requests for user validation and game counting.
 */
function doGet(e) {
  const action = e.parameter.action;
  const userService = new UserService(CONFIG.ALLOWED_TOPIC_ID);

 if (action === 'check_user') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    
    const searchId = (e.parameter.userId || "").toString();
    const searchName = (e.parameter.username || "").replace('@', '').toLowerCase().trim();

    let userRow = null;
    let rowIndex = -1;

    // Ищем строку пользователя
    data.forEach((row, index) => {
        if ((searchId && row[0].toString() === searchId) || 
            (row[1] && row[1].toString().toLowerCase() === searchName)) {
            userRow = row;
            rowIndex = index;
        }
    });

    if (userRow) {
        // Если нашли по нику, но ID не было — привязываем ID
        if (!userRow[0] && searchId) {
            sheet.getRange(rowIndex + 1, 1).setValue(searchId);
        }

        return ContentService.createTextOutput(JSON.stringify({ 
            exists: true, 
            isBanned: userRow[4] === CONFIG.STATUSES.BANNED,
            gamesCount: userRow[8] || 0, // Колонка "Количество игр"
            status: userRow[4]           // Текущий статус игрока
        })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ exists: false }))
        .setMimeType(ContentService.MimeType.JSON);
}

  if (action === 'log_game') {
    const tagsString = e.parameter.tags || "";
    if (!tagsString) return ContentService.createTextOutput("No tags").setMimeType(ContentService.MimeType.TEXT);
    
    const tags = tagsString.split(','); 
    
    userService.updateGames(CONFIG.ALLOWED_TOPIC_ID, tags); 
    
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }

  if (action === 'get_inactive') {
    const repository = new SheetRepository();
    const inactiveList = repository.getInactiveUsers(
        [CONFIG.STATUSES.CANDIDATE, CONFIG.STATUSES.ON_REVIEW], 
        3
    );
    
    return ContentService.createTextOutput(JSON.stringify(inactiveList))
        .setMimeType(ContentService.MimeType.JSON);
}

// Внутри функции doGet(e) Бота 1:
if (action === 'get_leaderboard_data') {
    const repository = new SheetRepository();
    const players = repository.getAllPlayersForLeaderboard(); // Тот метод, что мы писали
    return ContentService.createTextOutput(JSON.stringify(players))
        .setMimeType(ContentService.MimeType.JSON);
}
}