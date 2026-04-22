/**
 * Orchestrates incoming Telegram messages and routes them to specific handlers.
 * Implements the Command pattern and delegates stateful logic to Wizards.
 */
class CommandRouter {
    constructor() {
        this.client = new TelegramClient();
        this.service = new GameService();
        this.donateController = new DonateController(this.client);
        this.commands = {
            '/create': (msg, waitId) => this._handleCreateCommand(msg, waitId),
            '/all': (msg, waitId) => this._handleAllGamesCommand(msg, waitId),
            '/delete': (msg, waitId) => this._handleDeleteCommand(msg, waitId),
            '/start_now': (msg, waitId) => this._handleStartNowCommand(msg, waitId),
            '/approve': (msg, waitId) => this._handleApproveCommand(msg, waitId),
            '/help': (msg, waitId) => this._handleHelpCommand(msg, waitId),
            '/id': (msg, waitId) => this._handleIdCommand(msg, waitId),
            '/start': (msg) => this._handleStartCommand(msg),
            '/cancel': (msg, waitId) => this._handleCancelCommand(msg, waitId),
            '/gamelist': (msg, waitId) => this._handleGameListCommand(msg, waitId),
            '/guide' : (msg, waitId) => this._handleGuideCommand(msg, waitId),
            '/edit': (msg, waitId) => this._handleEditCommand(msg, waitId),
            '/sheets': (msg, waitId) => this._handleSheetsCommand(msg, waitId),
            '/rank': (msg, waitId) => this._handleRankCommand(msg, waitId),
            '/donate': (msg, waitId) => this._handleDonateCommand(msg, waitId)
        };
    }

    /**
     * Main entry point for processing any text message.
     * Evaluates security rules, checks for commands, and delegates to FSM if needed.
     * @param {Object} message - Telegram message object.
     */
    route(message) {
        const userId = message.from.id;
        const text = (message.text || "").trim();
        const chatId = message.chat.id;
        const threadId = message.message_thread_id || null;
        const isPrivate = message.chat.type === 'private';
        
        const command = text.startsWith('/') ? text.split(' ')[0].split('@')[0].toLowerCase() : null;
        const state = StateManager.getState(userId);

        const isAdminContext = (chatId === CONFIG.ADMIN_CHAT_ID && threadId === CONFIG.ADMIN_TOPIC_ID);
        const isAnnouncementContext = (chatId === CONFIG.MAIN_CHAT_ID && threadId === CONFIG.ANNOUNCEMENT_TOPIC_ID);

        // 1. Обработка команд
        if (command && this.commands[command]) {
            const isPublic = ['/start', '/gamelist', '/guide', '/help', '/donate', '/rank', '/id'].includes(command);
            
            let isAllowed = false;

            if (isAdminContext) {
                isAllowed = true;
            } else if (isPublic && (isPrivate || isAnnouncementContext)) {
                isAllowed = true;
            }

            if (!isAllowed) return;

            // Отправляем заглушку и фиксируем её ID
            const waitResponse = this.client.sendMessage(chatId, "⏳ <i>Принял команду, связываюсь с базой данных...</i>", {
                parse_mode: 'HTML',
                message_thread_id: threadId
            });

            let waitMessageId = null;
            if (waitResponse && waitResponse.result) {
                waitMessageId = waitResponse.result.message_id;
            }

            StateManager.clearState(userId);
            
            // Прокидываем ID заглушки в обработчик
            this.commands[command](message, waitMessageId);
            return;
        }

        // 2. Если это НЕ команда, проверяем наличие активного стейта
        if (!state) return;

        // 3. Передаем управление визардам
        if (state.threadId !== undefined && state.threadId !== threadId) {
            Logger.log(`⚠️ Попытка ввода данных из другого топика (User: ${userId})`);
            return;
        }

        this._delegateToWizard(message, state);
    }

    /**
     * Helper to clean up the temporary loading message.
     * @param {number|string} chatId - Telegram chat identifier.
     * @param {number} waitMessageId - ID of the message to delete.
     * @private
     */
    _removeWaitMessage(chatId, waitMessageId) {
        if (!waitMessageId) return;
        try {
            this.client.deleteMessage(chatId, waitMessageId);
        } catch (e) {
            Logger.log(`Failed to delete wait message: ${e.message}`);
        }
    }

    /**
     * Separate delegation logic for better readability.
     * @private
     */
    _delegateToWizard(message, state) {
        if (state.step.startsWith('EDIT_')) {
            new EditWizard(message, state).process();
        } else if (state.step === 'APPROVE_PLAYERS') {
            this._handleApproveInput(message, state);
        } else if (state.step === 'SHEETS_PENDING_SELECTION') {
            this._handleSheetsInput(message, state);
        } else if (state.step === 'CHOOSE_GAME_TYPE') {
            this._handleGameTypeSelection(message, state);
        } else if (state.gameType === CONFIG.GAME_TYPES.MAFIA) {
            new MafiaCreationWizard(message, state).process();
        } else {
            new DndCreationWizard(message, state).process();
        }
    }

    /** @private */
    _handleGuideCommand(msg, waitId) {
        const isPrivate = msg.chat.type === 'private';
        this._removeWaitMessage(msg.chat.id, waitId);

        if (!isPrivate) {
            const botUsername = CONFIG.BOT_USERNAME; 
            const keyboard = [[{ 
                text: "📖 Открыть справочник в ЛС", 
                url: `https://t.me/${botUsername}?start=guide` 
            }]];

            return this.client.sendMessage(msg.chat.id, "📚 Справочник доступен только в личных сообщениях.", {
                reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
                message_thread_id: msg.message_thread_id
            });
        }

        // В ЛС отправляем меню выбора разделов
        const text = "📚 <b>Справочник искателя приключений</b>\n\nВыберите интересующий раздел:";
        const keyboard = GuideService.getGuideKeyboard();

        this.client.sendMessage(msg.chat.id, text, {
            parse_mode: 'HTML',
            reply_markup: JSON.stringify({ inline_keyboard: keyboard })
        });
    }

    /** @private */
    _handleCreateCommand(msg, waitId) {
        const nextId = new GameRepository().getNextId();
        this._removeWaitMessage(msg.chat.id, waitId);

        const state = {
            step: 'CHOOSE_GAME_TYPE', // Ask for type first
            gameData: { id: nextId },
            threadId: msg.message_thread_id
        };
        StateManager.setState(msg.from.id, state);
        
        const prompt = `🆕 <b>Создание анонса #${nextId}</b>\n\nВыберите тип игры:\n1 — 🐉 D&D\n2 — 🕴️ Мафия`;
        this.client.sendMessage(msg.chat.id, prompt, { 
            parse_mode: 'HTML', 
            message_thread_id: state.threadId 
        });
    }

    /** @private */
    _handleApproveCommand(msg, waitId) {
        const gameId = msg.text.split(' ')[1];
        const options = { parse_mode: 'HTML', message_thread_id: msg.message_thread_id };

        if (!gameId) {
            return this.client.sendMessage(msg.chat.id, "⚠️ Укажите ID: <code>/approve 5</code>", options);
        }

        const game = this.service.repo.findById(gameId);
        this._removeWaitMessage(msg.chat.id, waitId);

        if (!game || game['статус набора'] !== CONFIG.STATUS.OPEN) {
            return this.client.sendMessage(msg.chat.id, "❌ Набор закрыт или игра не найдена.", { message_thread_id: msg.message_thread_id });
        }

        const players = GameFormatter.extractParticipants(game);
        if (players.length === 0) {
            return this.client.sendMessage(msg.chat.id, "📭 Список пуст.", { message_thread_id: msg.message_thread_id });
        }

        StateManager.setState(msg.from.id, { step: 'APPROVE_PLAYERS', gameId, players });

        const list = players.map((p, i) => `${i + 1}. ${p}`).join('\n');
        this.client.sendMessage(msg.chat.id, `✅ <b>Выбор игроков (#${gameId})</b>\n\n${list}\n\nВведите номера через пробел:`, options);
    }

    /**
     * Processes the numeric input for player approval state.
     * @param {Object} msg - Telegram message object.
     * @param {Object} state - Current user state from FSM.
     * @private
     */
    _handleApproveInput(msg, state) {
        const indices = msg.text.split(/\s+/).map(v => parseInt(v, 10) - 1).filter(v => !isNaN(v));
        const options = { message_thread_id: msg.message_thread_id };
        
        if (indices.length === 0) {
            return this.client.sendMessage(msg.chat.id, "⚠️ Введите корректные номера (например: 1 2).", options);
        }

        const success = this.service.approveSelectedPlayers(state.gameId, indices);
        if (success) {
            this.client.sendMessage(msg.chat.id, "✅ Группа утверждена, анонс обновлен.", options);
            StateManager.clearState(msg.from.id);
        }
    }

    /** @private */
    _handleAllGamesCommand(msg, waitId) {
        const summary = this.service.getAllGamesSummary();
        this._removeWaitMessage(msg.chat.id, waitId);

        this.client.sendMessage(msg.chat.id, `📋 <b>Список игр:</b>\n\n${summary}`, { 
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id 
        });
    }

    /** @private */
    _handleDeleteCommand(msg, waitId) {
        const id = msg.text.split(' ')[1];
        const ok = id && this.service.deleteGame(id);
        this._removeWaitMessage(msg.chat.id, waitId);

        this.client.sendMessage(msg.chat.id, ok ? "✅ Удалено." : "❌ Ошибка ID.", {
            message_thread_id: msg.message_thread_id
        });
    }

    /** @private */
    _handleStartNowCommand(msg, waitId) {
        const id = msg.text.split(' ')[1];
        const ok = id && this.service.startGameNow(id);
        this._removeWaitMessage(msg.chat.id, waitId);

        this.client.sendMessage(msg.chat.id, ok ? "🚀 Поехали!" : "❌ Ошибка ID.", {
            message_thread_id: msg.message_thread_id
        });
    }

    /** @private */
    _handleCancelCommand(msg, waitId) {
        const id = msg.text.split(' ')[1];
        const ok = id && this.service.cancelGame(id);
        this._removeWaitMessage(msg.chat.id, waitId);

        this.client.sendMessage(msg.chat.id, ok ? "❌ Игра отменена." : "❌ Ошибка ID.", {
            message_thread_id: msg.message_thread_id
        });
    }

    /** @private */
    _handleEditCommand(msg, waitId) {
        const gameId = msg.text.split(' ')[1];
        const game = gameId ? this.service.repo.findById(gameId) : null;
        this._removeWaitMessage(msg.chat.id, waitId);
        
        if (!game) {
            return this.client.sendMessage(msg.chat.id, "❌ Игра не найдена.", { message_thread_id: msg.message_thread_id });
        }

        const state = { 
            step: 'EDIT_CHOOSE_FIELD', 
            gameId, 
            gameData: game, 
            threadId: msg.message_thread_id 
        };
        StateManager.setState(msg.from.id, state);
        
        // Pass the message to the specific wizard to handle the initial edit prompt
        new EditWizard(msg, state).process();
    }

    /** @private */
    _handleIdCommand(msg, waitId) {
        this._removeWaitMessage(msg.chat.id, waitId);
        const out = `📍 Chat: <code>${msg.chat.id}</code>\n🧵 Topic: <code>${msg.message_thread_id || 'Main'}</code>`;
        this.client.sendMessage(msg.chat.id, out, { 
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id 
        });
    }

    /** * Handles the /start command with access control check.
     * Welcomes the user OR notifies about the ban.
     * @private 
     */
    _handleStartCommand(msg) {
        const username = msg.from.username;
        const firstName = msg.from.first_name || "искатель приключений";
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id || null;

        // 1. Проверка на наличие Username (так как поиск в базе идет по нему)
        if (!username) {
            return this.client.sendMessage(chatId, 
                "⚠️ <b>Внимание:</b> Для работы с ботом у вас должен быть установлен <b>Username</b> в настройках Telegram.", 
                { parse_mode: 'HTML', message_thread_id: threadId }
            );
        }

        // 2. Обращаемся к первому боту (Origin) за статусом
        const userStatus = ExternalValidator.getUserStatus(username, msg.from.id);

        // 3. Выбираем поведение в зависимости от статуса
        if (userStatus.isBanned) {
            // СЦЕНАРИЙ: ПОЛЬЗОВАТЕЛЬ В БАНЕ
            const bannedText = GuideService.getBannedMessage();
            this.client.sendMessage(chatId, bannedText, {
                parse_mode: 'HTML',
                message_thread_id: threadId
            });
        } else {
            // СЦЕНАРИЙ: ПОЛЬЗОВАТЕЛЬ НЕ В БАНЕ (ИЛИ ЕГО НЕТ В БАЗЕ)
            const welcomeText = GuideService.getWelcomeMessage(firstName);
            const keyboard = GuideService.getStartKeyboard();

            this.client.sendMessage(chatId, welcomeText, {
                parse_mode: 'HTML',
                reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
                message_thread_id: threadId
            });
        }
    }

    /**
     * Provides a comprehensive guide based on the current context (Admin vs Public).
     * @param {Object} msg - Telegram message object.
     * @private
     */
    _handleHelpCommand(msg, waitId) {
        this._removeWaitMessage(msg.chat.id, waitId);
        const chatId = msg.chat.id;
        const threadId = msg.message_thread_id;
        
        let helpText = "";

        // Проверяем, находится ли пользователь в админ-топике
        if (chatId === CONFIG.ADMIN_CHAT_ID && threadId === CONFIG.ADMIN_TOPIC_ID) {
          helpText = "🧙‍♂️ <b>ПАНЕЛЬ МАСТЕРА (ADMIN)</b>\n\n" +
                     "✨ <b>Управление играми:</b>\n" +
                     "• <code>/create</code> — запустить мастер создания новой игры\n" +
                     "• <code>/edit ID</code> — изменить любое поле (дату, фото, описание)\n" +
                     "• <code>/all</code> — посмотреть краткий список всех активных игр\n\n" +
                    "✅ <b>Работа с составом:</b>\n" +
                    "• <code>/approve ID</code> — выбрать игроков из списка подавших заявки\n" +
                    "• <code>/sheets ID</code> — отметить тех, кто сдал анкеты персонажей\n" +
                    "• <code>/start_now ID</code> — мгновенно начать игру (тегнет всех участников)\n\n" +
                    "⚠️ <b>Критическое:</b>\n" +
                    "• <code>/cancel ID</code> — отменить игру (оставит пост в канале)\n" +
                    "• <code>/delete ID</code> — полностью удалить игру и все сообщения\n\n" +
                    "🛠 <b>Системное:</b>\n" +
                    "• <code>/id</code> — узнать ID текущего чата и топика";
        } else {
            // Public commands for players
            helpText = "🎮 <b>СПРАВОЧНИК ИГРОКА</b>\n\n" +
                       "📅 <code>/gamelist</code> — расписание ближайших игр\n" +
                       "📖 <code>/guide</code> — правила, лор и помощь\n" +
                       "🚀 <code>/start</code> — проверка работы бота\n\n" +
                       "🏅 <b>ЛИЧНЫЙ ПРОГРЕСС:</b>\n" +
                       "📊 <code>/rank</code> — твой ранг, опыт и прогресс до нового уровня\n" +
                       "🪙 <code>/donate</code> — поддержать мастеров монетой\n\n" +
                       "💡 <b>Как записаться?</b>\n" +
                       "В анонсе игры нажми кнопку <b>«⚔️ Записаться»</b>.\n\n" +
                       "<i>Проблемы с регистрацией? Напиши администратору.</i>";
        }

        this.client.sendMessage(chatId, helpText, { 
            parse_mode: 'HTML',
            message_thread_id: threadId 
        });
    }

    /**
     * Handles the public command to list upcoming games.
     * @param {Object} msg 
     * @private
     */
    _handleGameListCommand(msg, waitId) {
        const list = this.service.getUpcomingGamesList();
        this._removeWaitMessage(msg.chat.id, waitId);

        this.client.sendMessage(msg.chat.id, list, { 
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id 
        });
    }

    /**
     * Processes game type selection and initializes the specific creation flow.
     * Uses constants from CONFIG for database integrity.
     * @private
     */
    _handleGameTypeSelection(msg, state) {
        const choice = msg.text.trim();
        
        if (choice === '1') {
            state.gameType = CONFIG.GAME_TYPES.DND;
            state.gameData['Тип'] = CONFIG.GAME_TYPES.DND; 
            
            state.step = 'TITLE';
            StateManager.setState(msg.from.id, state);
            this.client.sendMessage(msg.chat.id, "🐉 <b>Создание D&D</b>\n\nВведите название приключения:", { 
                parse_mode: 'HTML', message_thread_id: state.threadId 
            });
        } else if (choice === '2') {
            state.gameType = CONFIG.GAME_TYPES.MAFIA;
            state.gameData['Тип'] = CONFIG.GAME_TYPES.MAFIA;
            
            state.step = 'TITLE';
            StateManager.setState(msg.from.id, state);
            this.client.sendMessage(msg.chat.id, "🕴️ <b>Создание Мафии</b>\n\nШаг 1: Введите тематику вечера (или просто 'Мафия'):", { 
                parse_mode: 'HTML', message_thread_id: state.threadId 
            });
        } else {
            this.client.sendMessage(msg.chat.id, "⚠️ Отправьте 1 (D&D) или 2 (Мафия).", { message_thread_id: state.threadId });
        }
    }

    /**
     * Handles the public /donate command.
     * Restricts execution to private chats to maintain group cleanliness.
     * * @param {Object} msg - Telegram message object.
     * @private
     */
    _handleDonateCommand(msg, waitId) {
        const isPrivate = msg.chat.type === 'private';
        this._removeWaitMessage(msg.chat.id, waitId);
        
        if (!isPrivate) {
            const botUsername = CONFIG.BOT_USERNAME; 
            const keyboard = [[{ 
                text: "☕ Поддержать проект в ЛС", 
                url: `https://t.me/${botUsername}`
            }]];

            return this.client.sendMessage(msg.chat.id, "💎 <b>Меню донатов</b> доступно только в личных сообщениях.", {
                parse_mode: 'HTML',
                reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
                message_thread_id: msg.message_thread_id
            });
        }

        // Delegate execution to the specialized controller
        this.donateController.showDonationMenu(msg.chat.id, msg.message_thread_id);
    }

    _handleSheetsCommand(msg, waitId) {
      const gameId = msg.text.split(' ')[1];
      const options = { parse_mode: 'HTML', message_thread_id: msg.message_thread_id };

      if (!gameId) {
        this._removeWaitMessage(msg.chat.id, waitId);
        return this.client.sendMessage(msg.chat.id, "⚠️ Укажите ID: <code>/sheets 4</code>", options);
      }

      const pendingPlayers = this.service.getPendingSheetPlayers(gameId);
      this._removeWaitMessage(msg.chat.id, waitId);
    
      if (pendingPlayers === null) {
          return this.client.sendMessage(msg.chat.id, "❌ Игра не найдена.", options);
      }

      if (pendingPlayers.length === 0) {
          return this.client.sendMessage(msg.chat.id, "🎉 Все игроки этой игры уже сдали анкеты!", options);
      }

      // Сохраняем состояние: ID игры и список людей, которых мы показали (чтобы индексы совпали)
      StateManager.setState(msg.from.id, { 
          step: 'SHEETS_PENDING_SELECTION', 
          gameId: gameId, 
          pendingPlayers: pendingPlayers 
      });

      const list = pendingPlayers.map((p, i) => `${i + 1}. ${p}`).join('\n');
      const prompt = `📝 <b>Кто сдал анкеты (#${gameId})?</b>\n\n${list}\n\nВведите номера через пробел:`;
    
      this.client.sendMessage(msg.chat.id, prompt, options);
  };

  _handleSheetsInput(msg, state) {
    const indices = msg.text.split(/\s+/)
        .map(v => parseInt(v, 10) - 1)
        .filter(v => !isNaN(v) && v >= 0 && v < state.pendingPlayers.length);
    
    const options = { message_thread_id: msg.message_thread_id };

    if (indices.length === 0) {
        return this.client.sendMessage(msg.chat.id, "⚠️ Введите корректные номера из списка выше.", options);
    }

    // Получаем юзернеймы по выбранным индексам
    const selectedUsernames = indices.map(i => state.pendingPlayers[i]);

    // Вызываем существующий метод сервиса для сохранения
    const result = this.service.markSheetsSubmitted(state.gameId, selectedUsernames);
    
    this.client.sendMessage(msg.chat.id, result, options);
    StateManager.clearState(msg.from.id);
  }

  /**
     * Handles the /rank command. Only works in private messages.
     * @private
     */
    _handleRankCommand(msg, waitId) {
        const isPrivate = msg.chat.type === 'private';
        const chatId = msg.chat.id;

        if (!isPrivate) {
          this._removeWaitMessage(msg.chat.id, waitId);
            const keyboard = [[{ 
                text: "🏆 Посмотреть мой ранг", 
                url: `https://t.me/${CONFIG.BOT_USERNAME}?start=rank` 
            }]];

            return this.client.sendMessage(chatId, "📊 Ваш ранг и прогресс можно посмотреть только в личных сообщениях.", {
                parse_mode: 'HTML',
                reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
                message_thread_id: msg.message_thread_id
            });
        }

        const stats = ExternalValidator.getUserStatus(msg.from.username, msg.from.id);
        this._removeWaitMessage(msg.chat.id, waitId);

        if (!stats.exists) {
            return this.client.sendMessage(chatId, "❌ Вы не найдены в базе. Пожалуйста, убедитесь, что вы авторизованы в системе управления.");
        }

        const text = 
            `👤 <b>ИГРОК:</b> @${msg.from.username}\n\n` +
            `🏆 <b>Ранг:</b> ${stats.rank.emoji} ${stats.rank.name}\n` +
            `🎮 <b>Игр пройдено:</b> <code>${stats.gamesCount}</code>\n\n` +
            `${stats.progress}`;

        this.client.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    }
}