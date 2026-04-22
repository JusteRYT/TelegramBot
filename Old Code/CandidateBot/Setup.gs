/**
 * Initializes the spreadsheet environment.
 * Creates sheets, sets up Russian headers, and applies QUERY formulas.
 * Run this once to prepare the database structure.
 */
function setupEnvironment() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Настройка основного листа ALL_USERS
    let usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
    if (!usersSheet) {
        usersSheet = ss.insertSheet(CONFIG.SHEET_USERS);
    }
    
    // Убрали 'Notes' (Заметки), заголовки теперь на русском для удобства админов
    const userHeaders = [
        'Telegram ID', 
        'Username', 
        'Имя', 
        'Фамилия', 
        'Статус', 
        'Дата добавления', 
        'Последняя игра', 
        'Предупреждения',
        'Количество игр' 
    ];
    
    usersSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
    usersSheet.getRange(1, 1, 1, userHeaders.length)
              .setFontWeight("bold")
              .setBackground("#f3f3f3"); // Серый фон для заголовков
    usersSheet.setFrozenRows(1); // Закрепляем первую строку

    // 2. Настройка листа логов WARNINGS_LOG
    let warningsSheet = ss.getSheetByName(CONFIG.SHEET_WARNINGS);
    if (!warningsSheet) {
        warningsSheet = ss.insertSheet(CONFIG.SHEET_WARNINGS);
    }
    const warningHeaders = ['Дата и время', 'Username', 'Причина'];
    warningsSheet.getRange(1, 1, 1, warningHeaders.length).setValues([warningHeaders]);
    warningsSheet.getRange(1, 1, 1, warningHeaders.length).setFontWeight("bold");
    warningsSheet.setFrozenRows(1);

    // 3. Настройка динамических листов через QUERY
    // Маппинг: Статус -> Красивое название листа
    const sheetMapping = [
        { status: CONFIG.STATUSES.CANDIDATE, name: 'КАНДИДАТЫ' },
        { status: CONFIG.STATUSES.ON_REVIEW, name: 'НА_ПРОВЕРКЕ' },
        { status: CONFIG.STATUSES.APPROVED, name: 'ОДОБРЕННЫЕ' },
        { status: CONFIG.STATUSES.BANNED,   name: 'ЧЕРНЫЙ_СПИСОК' }
    ];

    // 4. Настройка листа BANS_LOG
    let bansSheet = ss.getSheetByName(CONFIG.SHEET_BANS || "BANS_LOG");
    if (!bansSheet) {
        bansSheet = ss.insertSheet(CONFIG.SHEET_BANS || "BANS_LOG");
    }
    const banHeaders = ['Дата бана', 'Username', 'Причина'];
    bansSheet.getRange(1, 1, 1, banHeaders.length).setValues([banHeaders]);
    bansSheet.getRange(1, 1, 1, banHeaders.length).setFontWeight("bold").setBackground("#ffebee"); // Светло-красный фон
    bansSheet.setFrozenRows(1);

    sheetMapping.forEach(item => {
        let sheet = ss.getSheetByName(item.name);
        if (!sheet) {
            sheet = ss.insertSheet(item.name);
        } else {
            sheet.clear(); // Очищаем старые данные/формулы
        }
        
        // QUERY формула: выбираем все колонки (A:H), где колонка E (Статус) совпадает
        // Важно: в QUERY Google Таблиц используется точка с запятой или запятая в зависимости от локали. 
        // Но GAS (API) обычно понимает стандарт с точкой с запятой в строке формулы.
        const formula = `=QUERY('${CONFIG.SHEET_USERS}'!A:I; "SELECT * WHERE E = '${item.status}'"; 1)`;
        sheet.getRange('A1').setFormula(formula);
        
        // Немного красоты для дочерних листов
        sheet.getRange(1, 1, 1, userHeaders.length).setFontWeight("bold");
    });

    Logger.log("Окружение успешно настроено. Листы созданы.");
}