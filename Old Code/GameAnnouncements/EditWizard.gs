/**
 * Wizard for editing existing game properties with validation and context.
 */
class EditWizard {
    constructor(message, state) {
        this.message = message;
        this.state = state;
        this.client = new TelegramClient();
        this.service = new GameService();
        this.chatId = message.chat.id;
        this.userId = message.from.id;
    }

    process() {
    const step = this.state.step;
    
    if (step === 'EDIT_INPUT_VALUE' && this.message.photo) {
        const photos = this.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        this._applyChange(fileId);
        return;
    }

    const text = this.message.text;
    switch (step) {
        case 'EDIT_CHOOSE_FIELD':
            this._sendFieldSelection();
            break;
        case 'EDIT_INPUT_VALUE':
            this._applyChange(text);
            break;
    }
}

    /** @private */
_sendFieldSelection() {
    const game = this.state.gameData;
    const isClosed = (game['статус набора'] === CONFIG.STATUS.CLOSED);

    // 1. Форматируем дату и время. 
    // Используем парсинг через твой DateUtils, чтобы гарантировать объект Date
    const d = DateUtils.parse(game['дата'], game['время']);
    const formattedDateTime = Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy HH:mm");

    const keyboard = [
        [{ text: "📝 Название", callback_data: `edit_field_Название_${game.id}` }],
        [{ text: "🧙‍♂️ Мастер (ГМ)", callback_data: `edit_field_гм_${game.id}` }],
        [{ text: "📅 Дата и время", callback_data: `edit_field_datetime_${game.id}` }],
        [{ text: "📜 Описание", callback_data: `edit_field_описание_${game.id}` }],
        [{ text: "🖼 Изменить картинку", callback_data: `edit_field_картинка_file_id_${game.id}` }]
    ];

    if (!isClosed) {
        keyboard.push([{ text: "👥 Кол-во мест", callback_data: `edit_field_участники_${game.id}` }]);
    }
    keyboard.push([{ text: "⚔️ Список игроков", callback_data: `edit_field_зарегистрированные_${game.id}` }]);

    const info = `🛠 <b>Редактирование игры #${game.id}</b>\n` +
                 `────────────────────\n` +
                 `🔹 <b>Название:</b> <code>${game['Название']}</code>\n` +
                 `🔹 <b>Мастер:</b> <code>${game['гм']}</code>\n` +
                 `🔹 <b>Дата/Время:</b> <code>${formattedDateTime}</code>\n` +
                 `🔹 <b>Места:</b> <code>${game['участники']}</code>\n` +
                 `🔹 <b>Игроки:</b> <code>${game['зарегистрированные'] || "пусто"}</code>\n` +
                 `────────────────────\n` +
                 `Что именно вы хотите изменить?`;

    this.client.sendMessage(this.chatId, info, {
        message_thread_id: this.state.threadId,
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
    });
}
    /**
 * Applies the changes to the game entity based on user input.
 * Implements field-specific validation and formatting.
 * @param {string} newValue - The raw input from the user (text or file_id).
 * @private
 */
_applyChange(newValue) {
    const field = this.state.targetField;
    const game = this.service.repo.findById(this.state.gameId);
    
    if (!game) {
        return this.client.sendMessage(this.chatId, "❌ Ошибка: Игра не найдена в базе.");
    }

    let displayFieldName = field;

    // 1. Валидация и обработка спец-полей (Strategy-like pattern)
    
    // СЛУЧАЙ: Изображение
    if (field === 'картинка_file_id') {
        if (!newValue) {
            return this.client.sendMessage(this.chatId, "❌ Ошибка! Чтобы обновить картинку, пришлите <b>ФОТО</b> (не файл).", { 
                parse_mode: 'HTML', 
                message_thread_id: this.state.threadId 
            });
        }
        game['картинка_file_id'] = newValue;
        displayFieldName = "Изображение";
    } 
    
    // СЛУЧАЙ: Дата и время
    else if (field === 'datetime') {
        const input = (newValue || "").trim();
        const currentYear = new Date().getFullYear();

        if (/^\d{1,2}[:.]\d{2}$/.test(input)) {
            // Только время
            game['время'] = input.replace('.', ':');
        } else if (/^\d{1,2}\.\d{1,2}\s+\d{1,2}[:.]\d{2}$/.test(input)) {
            // Дата + время
            const [datePart, timePart] = input.split(/\s+/);
            game['дата'] = `${datePart}.${currentYear}`; 
            game['время'] = timePart.replace('.', ':');
        } else {
            return this.client.sendMessage(this.chatId, "❌ Ошибка! Используйте формат:\n`ДД.ММ ЧЧ:ММ` или просто `ЧЧ:ММ`", { 
                parse_mode: 'Markdown',
                message_thread_id: this.state.threadId 
            });
        }
        displayFieldName = "Дата и время";
    }

    // СЛУЧАЙ: Количество мест
    else if (field === 'участники') {
        const count = newValue.replace(/\D/g, '');
        if (!count) return this.client.sendMessage(this.chatId, "❌ Введите число мест.");
        game['участники'] = `Нужно ${count} чел.`;
        displayFieldName = "Кол-во мест";
    }

    // СЛУЧАЙ: Список игроков
    else if (field === 'зарегистрированные') {
        // Гарантируем, что работаем со строкой перед split
        const input = String(newValue || "");
        game[field] = input.split(/[,;\n]+/).map(s => s.trim()).filter(s => s).join(',');
        displayFieldName = "Список игроков";
    }

    // СЛУЧАЙ: Все остальные текстовые поля (Название, Описание, ГМ)
    else {
        game[field] = newValue;
    }

    // 2. Persistence layer: Сохраняем и обновляем анонс
    this.service.repo.update(game);
    this.service.refreshAnnouncement(game);

    // 3. UI Layer: Уведомление об успехе
    this.client.sendMessage(this.chatId, `✅ <b>Поле "${displayFieldName}" обновлено!</b>\nАнонс в канале актуализирован.`, {
        message_thread_id: this.state.threadId,
        parse_mode: 'HTML'
    });

    // Очищаем стейт (как завершение транзакции)
    StateManager.clearState(this.userId);
}
}