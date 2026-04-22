/**
 * Initializes the Google Spreadsheet acting as the database.
 * Updates headers without overwriting existing game data.
 */
function setupDatabase() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = CONFIG.SHEET_GAMES; 
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
        sheet = spreadsheet.insertSheet(sheetName);
    }

    // Добавляем "Тип" в список необходимых заголовков
    const requiredHeaders = [
        "id", "Название", "дата", "время", "гм", "участники", 
        "зарегистрированные", "статус набора", "описание", 
        "картинка_file_id", "message_id", "дата создания", "напоминания",
        "анкеты_сданы", "Тип" 
    ];

    const lastCol = sheet.getLastColumn() || 1;
    const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(h => String(h).trim())
        .filter(Boolean);

    const missingHeaders = requiredHeaders.filter(h => !currentHeaders.includes(h));

    if (missingHeaders.length > 0) {
        const startCol = currentHeaders.length + 1;
        sheet.getRange(1, startCol, 1, missingHeaders.length)
             .setValues([missingHeaders])
             .setFontWeight("bold");
        
        sheet.setFrozenRows(1);
        Logger.log(`Добавлены новые колонки: ${missingHeaders.join(', ')}`);
    } else {
        Logger.log("Структура таблицы актуальна, изменений не требуется.");
    }
}

/**
 * Registers the Webhook with Telegram. 
 * Safely encodes parameters to avoid "Invalid argument" exception.
 */
function setWebhook() {
    // Basic validation to prevent empty URL errors
    if (!CONFIG.WEBHOOK_URL || CONFIG.WEBHOOK_URL.includes("...")) {
        Logger.log("❌ Error: Please provide a valid WEBHOOK_URL in CONFIG.");
        return;
    }

    const encodedWebhookUrl = encodeURIComponent(CONFIG.WEBHOOK_URL);
    const allowedUpdates = encodeURIComponent(JSON.stringify(["message", "callback_query"]));

    const url = `${CONFIG.TELEGRAM_API_URL}setWebhook?url=${encodedWebhookUrl}&allowed_updates=${allowedUpdates}`;
    
    try {
        const response = UrlFetchApp.fetch(url);
        const result = JSON.parse(response.getContentText());
        
        if (result.ok) {
            Logger.log("✅ Webhook successfully set!");
        } else {
            Logger.log("❌ Telegram API Error: " + result.description);
        }
    } catch (e) {
        Logger.log("❌ Request failed: " + e.toString());
    }
}

function createLeaderboardMessageInitial() {
    const client = new TelegramClient();
    
    // Передаем параметры правильно согласно новому sendMessage
    const response = client.sendMessage(
        CONFIG.LEADERBOARD_CHAT_ID, 
        "⏳ <b>Магия начинается...</b>\nСписок лучших игроков формируется.",
        CONFIG.LEADERBOARD_THREAD_ID
    );
    
    if (response && response.ok) {
        Logger.log("✅ СООБЩЕНИЕ СОЗДАНО!");
        Logger.log("Скопируй этот ID в CONFIG.LEADERBOARD_MSG_ID: " + response.result.message_id);
    } else {
        // Теперь здесь будет детальное описание ошибки от Telegram
        Logger.log("❌ ОШИБКА: " + (response.description || "Неизвестная ошибка"));
    }
}