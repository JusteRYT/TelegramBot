/**
 * Core service handling game business rules.
 */
class GameService {
    constructor() {
        this.repo = new GameRepository();
        this.notifications = new NotificationService();
    }

    /**
     * Performs the initial publication of a game to the channel.
     * Captures and saves the message_id for future updates.
     * @param {Object} game - The game entity to publish.
     */
    publishGame(game) {
        const text = GameFormatter.formatAnnouncement(game);
        const kb = GameFormatter.getRegistrationKeyboard(game);
        
        const res = this.notifications.dispatch(game, text, kb);
        
        if (res?.ok && !game.message_id) {
            game.message_id = res.result.message_id;
            this.repo.save(game);
        }
    }

    /**
     * Registers a player for a specific game.
     * @param {string} gameId - The ID of the game.
     * @param {string} username - Player's telegram username.
     * @param {number} userId - Player's telegram ID.
     * @returns {string} Status message for the user.
     */
    registerPlayer(gameId, username, userId) {
        const game = this.repo.findById(gameId);
        if (!game || game['статус набора'] !== CONFIG.STATUS.OPEN) return "Набор закрыт.";

        const userStatus = ExternalValidator.getUserStatus(username, userId);
        // 1. Проверка: Зарегистрирован ли вообще?
        if (!userStatus.exists) {
            this._sendAuthInstruction(userId);
            return "⚠️ Инструкция отправлена вам в личные сообщения!";
        }

        // 2. Проверка: Находится ли в бане?
        if (userStatus.isBanned) {
            return "🚫 Вам не доступна регистрация на игры.";
        }

        // Применяем Type Safety для предотвращения ошибки .split
        const players = GameFormatter.extractParticipants(game);
        if (players.includes(username)) return "Вы уже записаны!";

        players.push(username);
        game['зарегистрированные'] = players.join(',');
        
        // 1. Обновляем публичный анонс через Edge (NotificationService)
        this.refreshAnnouncement(game);

        // 2. Уведомляем ГМа о новом игроке
        this._notifyMasterOfRegistration(game, username, true);

        return "Вы успешно записаны!";
    }

    unregisterPlayer(gameId, username) {
        const game = this.repo.findById(gameId);
        if (!game) return "Игра не найдена.";

        let players = GameFormatter.extractParticipants(game);
        const initialLen = players.length;
        players = players.filter(p => p.trim() !== username.trim());

        if (players.length === initialLen) return "Вы не были записаны.";

        game['зарегистрированные'] = players.join(',');
        
        this.refreshAnnouncement(game);

        // 3. Уведомляем ГМа о новом игроке
        this._notifyMasterOfRegistration(game, username, false);
        return "Вы вышли из состава.";
    }

    /**
     * Cancels the game and updates the announcement with a warning.
     * @param {string} gameId 
     * @returns {boolean} Success status.
     */
    cancelGame(gameId) {
        const game = this.repo.findById(gameId);
        if (!game) return false;

        game['статус набора'] = CONFIG.STATUS.CANCELLED;
        this.refreshAnnouncement(game, "⚠️ <b>Игра отменена мастером.</b>");
        return true;
    }

    /**
     * Deletes the game from the repository and removes all associated messages from Telegram.
     * @param {string} gameId - Unique identifier of the game.
     * @returns {boolean} Success status.
     */
    deleteGame(gameId) {
        const game = this.repo.findById(gameId);
        if (!game) return false;

        // 1. Удаление основного сообщения анонса
        if (game.message_id) {
            this.notifications.delete(game.message_id);
        }

        // 2. Удаление всех отправленных напоминаний
        try {
            const reminders = JSON.parse(game['напоминания'] || "{}");
            // Итерируемся по значениям в объекте {"24h": id1, "1h": id2}
            Object.values(reminders).forEach(msgId => {
                if (msgId && typeof msgId !== 'boolean') {
                    this.notifications.delete(msgId);
                }
            });
        } catch (e) {
            Logger.log(`Failed to delete reminders for game ${gameId}: ${e.message}`);
        }

        return this.repo.deleteById(gameId);
    }

    /**
     * Approves a specific set of players and closes the registration.
     * @param {string} gameId 
     * @param {number[]} selectedIndices 
     * @returns {boolean} Success status.
     */
    approveSelectedPlayers(gameId, selectedIndices) {
        const game = this.repo.findById(gameId);
        if (!game) return false;

        const allPlayers = GameFormatter.extractParticipants(game);
        const approved = allPlayers
            .filter((_, i) => selectedIndices.includes(i))
            .map(p => `${p.trim()} ✅`);

        game['зарегистрированные'] = approved.join(',');
        game['статус набора'] = CONFIG.STATUS.CLOSED;
        
        this.refreshAnnouncement(game);
        return true;
    }

    /**
     * Archives the current announcement and sends a fresh "Game Started" message.
     * Updates game statistics via ExternalValidator only for DnD sessions.
     * * @param {string} gameId - The unique identifier of the game.
     * @returns {boolean} Success status.
     */
    startGameNow(gameId) {
        const game = this.repo.findById(gameId);
        if (!game) return false;

        // 1. Стандартная процедура архивации объявления
        game['статус набора'] = CONFIG.STATUS.ARCHIVED;
        this.refreshAnnouncement(game);

        // 2. Логика обновления статистики (Log Game)
        this._handleExternalLogging(game);

        // 3. Отправка уведомления о старте в чат
        const startMsg = GameFormatter.formatStartMessage(game);
        this.notifications.dispatch({ ...game, message_id: null }, startMsg, null, true);
        
        return true;
    }

    sendReminder(game, triggerType) {
        const gameDate = DateUtils.parse(game['дата'], game['время']);
        const diffMinutes = DateUtils.getDiffInMinutes(gameDate);
        const timeLeftText = DateUtils.formatRelativeTime(diffMinutes);

        const msg = GameFormatter.formatReminder(game, timeLeftText, triggerType);
        
        return this.notifications.dispatch(
            { ...game, message_id: null }, 
            msg, 
            null, 
            true
        );
    }

    getAllGamesSummary() {
        const active = this.repo.findAll().filter(g => 
            [CONFIG.STATUS.OPEN, CONFIG.STATUS.CLOSED].includes(g['статус набора'])
        );

        if (!active.length) return "📭 Запланированных игр нет.";

        return active.map(g => {
            const d = DateUtils.parse(g['дата'], g['время']);
            const dateStr = Utilities.formatDate(d, "GMT+3", "dd.MM.yyyy");
            return `🔹 <b>ID: ${g.id}</b> — ${g['Название']}\n📅 ${dateStr} | ${g['статус набора']}\n───`;
        }).join('\n');
    }

    /**
    * Returns a formatted list of games for the next 10 days.
    * Accessible by all users.
    * @returns {string}
    */
    getUpcomingGamesList() {
        const now = new Date();
        const horizon = new Date();
        horizon.setDate(now.getDate() + 10);

        // 1. Получаем, фильтруем и сразу сортируем
        const upcoming = this.repo.findAll()
            .filter(g => {
                const isActive = [CONFIG.STATUS.OPEN, CONFIG.STATUS.CLOSED].includes(g['статус набора']);
                if (!isActive) return false;

                const gameDate = DateUtils.parse(g['дата'], g['время']);
                return gameDate >= now && gameDate <= horizon;
            })
            .sort((a, b) => DateUtils.parse(a['дата'], a['время']) - DateUtils.parse(b['дата'], b['время']));

        if (upcoming.length === 0) {
            return "🗓 <b>На ближайшие 10 дней игр не запланировано.</b>\nЗагляните позже!";
        }

        // 2. Маппинг данных через утилитарный класс
        const list = upcoming
            .map(game => GameFormatter.formatUpcomingSnippet(game))
            .join('\n\n');

        return `🗓 <b>Расписание игр на 10 дней:</b>\n\n${list}`;
    }

/**
 * Synchronizes game data with the storage and updates the Telegram post.
 * Uses NotificationService for smart dispatching (send/edit).
 * @param {Object} game - The game entity to sync.
 * @param {string} [extraText=""] - Optional text to append to the announcement.
 */
refreshAnnouncement(game, extraText = "") {
    // 1. Single Source of Truth update
    this.repo.update(game);
    
    // 2. Prepare content
    let text = GameFormatter.formatAnnouncement(game);
    if (extraText) {
        text += `\n\n${extraText}`;
    }
    
    const keyboard = GameFormatter.getRegistrationKeyboard(game);
    return this.notifications.dispatch(game, text, keyboard);
}

    /**
     * Sends a notification to the GM about registration OR unregistration.
     * @param {Object} game 
     * @param {string} playerUsername 
     * @param {boolean} isRegistration - Distinguishes between join and leave.
     * @private
     */
    _notifyMasterOfRegistration(game, playerUsername, isRegistration = true) {
        const gmHandle = game['гм'];
        const gmId = UserService.getIdByUsername(gmHandle);

        const header = isRegistration ? "🔔 <b>Новая регистрация!</b>" : "❌ <b>Игрок отменил запись</b>";
        
        const alertText = `${header}\n\n` +
                          `👤 Игрок: @${playerUsername.replace('@', '')}\n` +
                          `🎮 Игра: #${game.id} — ${game['Название']}\n` +
                          `👑 Мастер: ${gmHandle}`;

        if (gmId) {
            const res = this.notifications.dispatch(
                { ...game, message_id: null }, 
                alertText + `\n\n<i>Отправлено в ЛС.</i>`, 
                null, 
                true, 
                null, 
                gmId
            );
            if (res?.ok) return;
        }

        this.notifications.dispatch(
            { ...game, message_id: null }, 
            alertText + `\n\n⚠️ <i>ГМ не найден в кэше, тегаю тут: ${gmHandle}</i>`, 
            null, 
            true, 
            CONFIG.ADMIN_TOPIC_ID
        );
    }

/** @private */
    _sendAuthInstruction(userId) {
        const botName = CONFIG.CANDIDATE_BOT_NAME.replace('@', '');
        const authUrl = `https://t.me/${botName}?start=reg`;
        const text = `⚠️ <b>Вы не зарегистрированы в системе!</b>\n\n` +
                     `Для участия необходимо авторизоваться в главном боте.`;

        this.notifications.client.sendMessage(userId, text, {
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 Запустить регистрацию", url: authUrl }]]
            }
        });
    }

    /**
     * Updates the list of players who have submitted their sheets in the Origin (Repository).
     * @param {string} gameId - Target game ID.
     * @param {string[]} usernames - Array of usernames provided by GM.
     * @returns {string} Status message.
     */
    markSheetsSubmitted(gameId, usernames) {
        const game = this.repo.findById(gameId);
        if (!game) return "❌ Игра не найдена.";

        const cleanInput = usernames.map(u => u.replace('@', '').toLowerCase().trim());
        let currentList = (game['анкеты_сданы'] || "")
            .split(',')
            .map(u => u.trim().toLowerCase())
            .filter(Boolean);
        
        const updatedSet = new Set([...currentList, ...cleanInput]);
        game['анкеты_сданы'] = Array.from(updatedSet).join(',');

        this.repo.update(game);
        return `✅ Для игры #${gameId} отмечены: ${cleanInput.join(', ')}`;
    }

    /**
     * Gets a list of players who are registered but haven't submitted their sheets.
     * @param {string|number|Object} gameOrId - Game ID or the game object itself.
     * @returns {string[]|null} Array of usernames or null if game not found.
     */
    getPendingSheetPlayers(gameOrId) {
        // Защита от лишних запросов к БД, если передали весь объект
        const game = typeof gameOrId === 'object' ? gameOrId : this.repo.findById(gameOrId);
        if (!game) return null;

        const allPlayers = GameFormatter.extractParticipants(game)
            .map(p => p.replace('✅', '').trim());
            
        const submitted = (game['анкеты_сданы'] || "")
            .split(',')
            .map(u => u.trim().replace('@', '').toLowerCase())
            .filter(Boolean);

        return allPlayers.filter(p => {
            const cleanName = p.replace('@', '').toLowerCase();
            return cleanName && !submitted.includes(cleanName);
        });
    }

    /**
     * Processes and sends reminders to players who haven't submitted their character sheets.
     * Skips notification delivery if the game type is defined as MAFIA.
     * Generates a direct hyperlink to the game announcement for better UX.
     */
    processDailySheetReminders() {
        const activeGames = this.repo.findAll().filter(g => 
            [CONFIG.STATUS.OPEN, CONFIG.STATUS.CLOSED].includes(g['статус набора'])
        );

        activeGames.forEach(game => {
            // Теперь проверка работает строго по колонке из БД
            // CONFIG.GAME_TYPES.MAFIA должен быть 'MAFIA'
            if (game['Тип'] === CONFIG.GAME_TYPES.MAFIA) {
                return;
            }

            const pendingPlayers = this.getPendingSheetPlayers(game);
            if (!pendingPlayers || pendingPlayers.length === 0) return;

            const gmHandle = game['гм'].startsWith('@') ? game['гм'] : `@${game['гм']}`;
            const gameLink = game.message_id 
                ? `${CONFIG.CHANNEL_BASE_URL}/${game.message_id}`
                : null;

            const gameTitleHtml = gameLink 
                ? `<a href="${gameLink}"><b>"${game['Название']}"</b></a>`
                : `<b>"${game['Название']}"</b>`;

            pendingPlayers.forEach(username => {
                const userId = UserService.getIdByUsername(username);
                if (!userId) return;

                const reminderText = 
                    `📝 <b>Напоминание об анкете!</b>\n\n` +
                    `Вы записаны на игру: ${gameTitleHtml}\n` +
                    `Для участия мастеру необходима ваша анкета персонажа.\n\n` +
                    `👉 Пожалуйста, отправьте её ГМу: ${gmHandle}\n\n` +
                    `<i>Если вы уже отправили — мастер скоро отметит вас в системе.</i>`;

                this.notifications.sendDirect(userId, reminderText);
            });
        });
    }

    /**
     * Internal helper to handle external API notification.
     * Strictly limits logging to DnD game types to prevent unintended stat updates.
     * * @private
     * @param {Object} game - The game entity.
     */
    _handleExternalLogging(game) {
        // Проверяем тип игры по "белому списку" (только DND)
        if (game['тип игры'] !== CONFIG.GAME_TYPES.DND) {
            return; // Для всех остальных типов (Мафия и т.д.) ничего не делаем
        }

        const gm = game['гм'].startsWith('@') ? game['гм'] : `@${game['гм']}`;
        const players = GameFormatter.extractParticipants(game)
            .map(p => p.replace('✅', '').trim());
        
        const allParticipants = [gm, ...players];

        // Отправляем данные в Candidate Bot
        ExternalValidator.notifyGameStarted(allParticipants);
    }
}