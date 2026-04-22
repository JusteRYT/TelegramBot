/**
 * Orchestrates the game creation process step-by-step.
 */
class CreationWizard {
    constructor(message, state) {
        this.message = message;
        this.state = state;
        this.userId = message.from.id;
        this.chatId = message.chat.id;
        this.threadId = state.threadId || message.message_thread_id;
        
        this.client = new TelegramClient();
        this.service = new GameService();
    }

    process() {
        if (this.message.text && this.message.text.startsWith('/')) {
            return this.client.sendMessage(this.chatId, "⚠️ Прервано. Начните заново через /create.", { message_thread_id: this.threadId });
        }

        const steps = {
            'TITLE': () => this._handleTitle(),
            'GM_CHOICE': () => this._handleGM(),
            'TYPE': () => this._handleType(),
            'PARTICIPANTS': () => this._handleParticipants(),
            'DATE': () => this._handleDate(),
            'TIME': () => this._handleTime(),
            'IMAGE': () => this._handleImage(),
            'DESC': () => this._handleDescription()
        };

        try {
            const step = this.state.step;
            if (steps[step]) steps[step]();
        } catch (e) {
            this._reportError(e);
        }
    }

    _handleTitle() {
        this.state.gameData['Название'] = this.message.text;
        this.state.step = 'GM_CHOICE';
        this._nextStep("🧙‍♂️ <b>Шаг 2: Игровой мастер</b>\n\nКто ведет игру? Введите @username или имя.\n(Если ведете вы, просто напишите <code>я</code>)");
    }

    _handleGM() {
        let gm = this.message.text.trim();
        if (gm.toLowerCase() === 'я') {
            gm = "@" + (this.message.from.username || this.message.from.first_name);
        }
        this.state.gameData['гм'] = gm;
        this.state.step = 'TYPE';
        this._nextStep("🧩 <b>Шаг 3: Тип игры</b>\n\n1 — <b>Открытая</b> (набор игроков)\n2 — <b>Закрытая</b> (состав готов)");
    }

    _handleType() {
        const input = this.message.text.trim();
        if (input === '1') {
            this.state.gameData['статус набора'] = CONFIG.STATUS.OPEN;
            this.state.step = 'PARTICIPANTS';
            this._nextStep("👥 <b>Шаг 4: Вместимость</b>\nСколько мест доступно? (1-5):");
        } else if (input === '2') {
            this.state.gameData['статус набора'] = CONFIG.STATUS.CLOSED;
            this.state.step = 'PARTICIPANTS';
            this._nextStep("👥 <b>Шаг 4: Состав</b>\nПеречислите игроков через пробел:");
        } else {
            this.client.sendMessage(this.chatId, "🤔 Введите 1 или 2.", { message_thread_id: this.threadId });
        }
    }

    _handleParticipants() {
        const input = this.message.text.trim();
        if (this.state.gameData['статус набора'] === CONFIG.STATUS.OPEN) {
            if (!/^[1-5]$/.test(input)) return this.client.sendMessage(this.chatId, "❌ Число от 1 до 5:", { message_thread_id: this.threadId });
            this.state.gameData['участники'] = `Нужно ${input} чел.`;
            this.state.gameData['зарегистрированные'] = ""; 
        } else {
            const players = input.split(/[\s,\n]+/).filter(x => x.length > 1);
            this.state.gameData['зарегистрированные'] = players.join(',');
            this.state.gameData['участники'] = "Состав сформирован";
        }
        this.state.step = 'DATE';
        this._nextStep("📅 <b>Шаг 5: Дата</b>\nКогда играем? (ДД.ММ):");
    }

    _handleDate() {
        const input = this.message.text.trim();
        if (!/^\d{1,2}\.\d{1,2}$/.test(input)) {
            return this.client.sendMessage(this.chatId, "❌ Формат ДД.ММ (напр. 25.12):", { message_thread_id: this.threadId });
        }
        this.state.gameData['дата'] = input;
        this.state.step = 'TIME';
        this._nextStep("⏰ <b>Шаг 6: Время</b>\nВо сколько старт? (напр. 19:00):");
    }

    _handleTime() {
        this.state.gameData['время'] = this.message.text.trim();
        this.state.step = 'IMAGE';
        this._nextStep("🖼 <b>Шаг 7: Атмосфера</b>\nПришлите <b>картинку</b> или напишите <b>-</b>");
    }

    _handleImage() {
        if (this.message.photo) {
            this.state.gameData['картинка_file_id'] = this.message.photo.pop().file_id;
        } else if (this.message.text === '-') {
            this.state.gameData['картинка_file_id'] = "";
        } else {
            return this.client.sendMessage(this.chatId, "🖼 Жду фото или '-':", { message_thread_id: this.threadId });
        }
        this.state.step = 'DESC';
        this._nextStep("📝 <b>Шаг 8: Описание</b>\nО чем сюжет?");
    }

    _handleDescription() {
        this.state.gameData['описание'] = this.message.text;
        
        // Финальная публикация через Service
        this.service.publishGame(this.state.gameData);
        
        StateManager.clearState(this.userId);
        this.client.sendMessage(this.chatId, "✨ <b>Анонс опубликован!</b>", { 
            message_thread_id: this.threadId,
            parse_mode: 'HTML' 
        });
    }

    /** @private */
    _nextStep(text) {
        StateManager.setState(this.userId, this.state);
        this.client.sendMessage(this.chatId, text, { 
            message_thread_id: this.threadId, 
            parse_mode: 'HTML' 
        });
    }

    /** @private */
    _reportError(e) {
        this.client.sendMessage(this.chatId, `❌ <b>Ошибка:</b> ${e.message}`, { message_thread_id: this.threadId });
        StateManager.clearState(this.userId);
    }
}