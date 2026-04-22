/**
 * Entry point for all Telegram Webhook events.
 */
function doPost(e) {
    const client = new TelegramClient();
    try {
        const update = JSON.parse(e.postData.contents);
        const msg = update.message || update.callback_query?.message;
        if (msg && (Date.now() / 1000 - msg.date > 30)) {
            return HtmlService.createHtmlOutput("Ignore old update");
        }
        const service = new GameService();
        const user = update.callback_query?.from || update.message?.from;

        if (user) {
        UserService.saveRelation(user.username, user.id);
        }
        
        if (update.message) {
            new CommandRouter().route(update.message);
        } else if (update.callback_query) {
            handleCallback(update.callback_query, service, client);
        }
    } catch (err) {
        client.sendMessage(CONFIG.ADMIN_CHAT_ID, `🚨 <b>CRITICAL ERROR:</b>\n${err.message}`, {
            message_thread_id: CONFIG.ADMIN_TOPIC_ID,
            parse_mode: 'HTML'
        });
    }
    return HtmlService.createHtmlOutput("OK");
}

/**
 * Global handler for inline button interactions.
 */
function handleCallback(query, service, client) {
    const data = query.data;
    const userId = query.from.id;
    const rawUsername = query.from.username || query.from.first_name;
    const usernameWithTag = "@" + rawUsername;

    // --- 0. DONATION FLOW (Личные сообщения) ---
    if (data.startsWith('donate_select_')) {
        const receiverId = data.replace('donate_select_', '');
        
        // Instantiate the controller and process the selection
        const donateController = new DonateController(client);
        donateController.processDonationSelection(userId, receiverId);
        
        // Acknowledge the query to stop the loading animation on the user's button
        return service.notifications.answerCallback(query.id);
    }

    // 1. REGISTRATION FLOW (Публичный топик анонсов)
    if (data.startsWith('reg_') || data.startsWith('unreg_')) {
        const [action, gameId] = data.split('_');
        
        // Передаем usernameWithTag для записи в таблицу ИГРЫ, 
        // но ExternalValidator внутри registerPlayer будет использовать rawUsername
        const result = (action === 'reg') 
            ? service.registerPlayer(gameId, usernameWithTag, userId)
            : service.unregisterPlayer(gameId, usernameWithTag);

        return service.notifications.answerCallback(query.id, result, result.includes("⚠️"));
    }

    // 2. EDIT FLOW (Админский топик)
    if (data.startsWith('edit_field_')) {
    const parts = data.split('_');
    
    // 1. Извлекаем ID игры (всегда последний элемент)
    const gameId = parts.pop(); 
    
    // 2. Извлекаем поле (убираем "edit" и "field", соединяем остальное)
    // Из ["edit", "field", "картинка", "file", "id"] -> ["картинка", "file", "id"] -> "картинка_file_id"
    const field = parts.slice(2).join('_');

    const state = StateManager.getState(userId);

    // Сравниваем через == (так как в базе может быть число, а из кнопки пришла строка)
    if (!state || state.gameId != gameId) {
        return service.notifications.answerCallback(query.id, "⚠️ Сессия истекла. Используйте /edit снова.", true);
    }

    state.step = 'EDIT_INPUT_VALUE';
    state.targetField = field;
    StateManager.setState(userId, state);

    const game = service.repo.findById(gameId);
    // Для картинки текущее значение показывать нет смысла (это длинный хеш)
    const currentVal = (field === 'картинка_file_id') ? "Текущее фото" : DateUtils.formatValueForEdit(game, field);

    let promptText = `📝 <b>Редактирование: ${field}</b>\n` +
                     `Текущее значение: <code>${currentVal}</code>\n\n`;

    if (field === 'картинка_file_id') {
        promptText += `🖼 <b>Пришлите новое ФОТО для игры.</b>\n` +
                      `Пожалуйста, отправляйте именно как фотографию, а не файл.`;
    } else if (field === 'datetime') {
        promptText += `💡 <b>Как вводить:</b>\n` +
                      `• <code>19:00</code>\n` +
                      `• <code>25.03 20:00</code>`;
    } else {
        promptText += `Введите новое значение:`;
    }

    service.notifications.dispatch(
        { ...game, message_id: null },
        promptText, 
        null,
        true,
        CONFIG.ADMIN_TOPIC_ID
    );

    return service.notifications.answerCallback(query.id, "Ожидаю ввод...");
    }

    if (data.startsWith('guide_')) {
        return _handleGuideCallback(query, service);
    }
}

/**
 * Internal handler for Guide-related callbacks.
 * Routes responses strictly to Private Messages.
 * @private
 */
function _handleGuideCallback(query, service) {
    const data = query.data;
    const userId = query.from.id;

    let responseText = "";
    
    if (data === 'guide_template') {
        responseText = `📋 <b>Шаблон анкеты:</b>\n\n${GuideService.getCharacterTemplate()}`;
    } else {
        responseText = GuideService.getContent(data);
    }

    service.notifications.sendDirect(userId, responseText);

    return service.notifications.answerCallback(
        query.id, 
        "Отправил информацию в личные сообщения 📥"
    );
}

/**
 * Cron job.
 */
function checkAndStartScheduledGames() {
    const service = new GameService();
    try {
        const now = new Date();
        const activeGames = service.repo.findAll().filter(g => 
            [CONFIG.STATUS.OPEN, CONFIG.STATUS.CLOSED].includes(g['статус набора'])
        );

        activeGames.forEach(game => {
            const gameDate = DateUtils.parse(game['дата'], game['время']);
            const timeDiffMin = DateUtils.getDiffInMinutes(gameDate, now);
            const timeDiffHours = timeDiffMin / 60;

            let reminders = {};
            try { reminders = JSON.parse(game['напоминания'] || "{}"); } catch (e) {}

            let isUpdated = false;

            // Обработка напоминания за 24 часа
            if (timeDiffHours <= 24 && timeDiffHours > 1 && !reminders['24h']) {
                const res = service.sendReminder(game, 24);
                if (res && res.ok) {
                    // Сохраняем ID сообщения вместо булева значения
                    reminders['24h'] = res.result.message_id;
                    isUpdated = true;
                }
            }
            
            // Обработка напоминания за 1 час
            if (timeDiffHours <= 1 && timeDiffHours > 0 && !reminders['1h']) {
                const res = service.sendReminder(game, 1);
                if (res && res.ok) {
                    reminders['1h'] = res.result.message_id;
                    isUpdated = true;
                }
            }

            if (timeDiffHours <= 0) {
                service.startGameNow(game.id);
            } else if (isUpdated) {
                game['напоминания'] = JSON.stringify(reminders);
                service.repo.update(game);
            }
        });
    } catch (err) {
        new TelegramClient().sendMessage(CONFIG.ADMIN_CHAT_ID, `🚨 <b>CRON ERROR:</b>\n${err.message}`, {
            message_thread_id: CONFIG.ADMIN_TOPIC_ID,
            parse_mode: 'HTML'
        });
    }
}