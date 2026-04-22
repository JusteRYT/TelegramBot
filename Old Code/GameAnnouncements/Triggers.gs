/**
 * Entry point for the daily reminder trigger.
 */
function runCharacterSheetReminders() {
    const service = new GameService();
    service.processDailySheetReminders();
}

/**
 * Utility to programmatically set up triggers.
 * Execute this once from the Apps Script editor.
 */
function setupTriggers() {
    const triggerName = 'runCharacterSheetReminders';
    const triggers = ScriptApp.getProjectTriggers();
    
    // Clear existing to avoid duplicates
    triggers.forEach(t => {
        if (t.getHandlerFunction() === triggerName) ScriptApp.deleteTrigger(t);
    });

    // Morning: 10:00 (MSK/UTC+3)
    ScriptApp.newTrigger(triggerName)
        .timeBased()
        .atHour(10)
        .everyDays(1)
        .inTimezone("Europe/Moscow")
        .create();

    // Evening: 20:00 (MSK/UTC+3)
    ScriptApp.newTrigger(triggerName)
        .timeBased()
        .atHour(20)
        .everyDays(1)
        .inTimezone("Europe/Moscow")
        .create();

    Logger.log("Triggers established for 10:00 and 20:00.");
}

function runSaturdayInactivityCheck() {
    const reminderService = new InactivityReminderService();
    reminderService.checkAndRemind();
}

function setupSaturdayTrigger() {
    const functionName = 'runSaturdayInactivityCheck';
    const triggers = ScriptApp.getProjectTriggers();
    
    triggers.forEach(t => {
        if (t.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(t);
    });

    // Настраиваем выполнение каждую субботу, например в 12:00
    ScriptApp.newTrigger(functionName)
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay.SATURDAY)
        .atHour(12)
        .inTimezone("Europe/Moscow")
        .create();
    
    Logger.log("Saturday trigger established.");
}

function setupLeaderboardTrigger() {
    const functionName = 'updateDailyLeaderboard';
    const triggers = ScriptApp.getProjectTriggers();
    
    // 1. Очистка существующих триггеров для этой функции, чтобы не было дублей
    triggers.forEach(t => {
        if (t.getHandlerFunction() === functionName) {
            ScriptApp.deleteTrigger(t);
        }
    });

    // 2. Создаем новый триггер на каждый день в 22:00 (10 вечера) по МСК
    ScriptApp.newTrigger(functionName)
        .timeBased()
        .atHour(22) // 10 вечера
        .nearMinute(0) // Пытаться запустить ближе к началу часа
        .everyDays(1)
        .inTimezone("Europe/Moscow")
        .create();
    
    Logger.log("✅ Триггер для обновления Лидерборда установлен на 22:00 MSK.");
}

/**
 * Daily task to refresh the leaderboard message.
 * Fetches data from Bot 1 via Web App URL.
 */
function updateDailyLeaderboard() {
    const client = new TelegramClient();
    
    // ВАЖНО: Убедись, что CONFIG.CORE_BOT_URL — это URL развернутого (Deploy) Бота 1
    const apiUrl = `${CONFIG.CANDIDATE_BOT_URL}?action=get_leaderboard_data`; 
    
    try {
        const response = UrlFetchApp.fetch(apiUrl);
        const allPlayers = JSON.parse(response.getContentText());

        if (!allPlayers || allPlayers.length === 0) {
            Logger.log("⚠️ Данные игроков не получены или таблица пуста.");
            return;
        }

        // LeaderboardService должен быть во втором боте (скопируй его туда)
        const leaderboardText = LeaderboardService.generateLeaderboard(allPlayers);

        const editResult = client.editMessageText(
            CONFIG.LEADERBOARD_CHAT_ID,
            CONFIG.LEADERBOARD_MSG_ID,
            leaderboardText
        );

        if (editResult && editResult.ok) {
            Logger.log("✅ Лидерборд успешно обновлен.");
        }
    } catch (e) {
        Logger.log("❌ Ошибка при обновлении лидерборда: " + e.message);
    }
}

function deleteAllProjectTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => ScriptApp.deleteTrigger(t));
    Logger.log("🗑️ Все триггеры проекта удалены.");
}