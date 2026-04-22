/**
 * Concrete wizard for Mafia game announcements.
 * @extends AbstractCreationWizard
 */
class MafiaCreationWizard extends AbstractCreationWizard {
    process() {
        if (this.message.text && this.message.text.startsWith('/')) {
            return this.client.sendMessage(this.chatId, "⚠️ Прервано. Начните заново через /create.", { message_thread_id: this.threadId });
        }

        const steps = {
            'TITLE': () => this._handleTitle(),
            'DATE': () => this._handleDate(),
            'TIME': () => this._handleTime(),
            'PARTICIPANTS': () => this._handleParticipants(),
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
        this.state.gameData['гм'] = "@" + (this.message.from.username || this.message.from.first_name); 
        this.state.gameData['статус набора'] = CONFIG.STATUS.OPEN;
        
        this.state.step = 'DATE';
        this._nextStep("📅 <b>Шаг 2: Дата</b>\nКогда собираемся? (ДД.ММ):");
    }

    _handleDate() {
        const input = this.message.text.trim();
        if (!/^\d{1,2}\.\d{1,2}$/.test(input)) {
            return this.client.sendMessage(this.chatId, "❌ Формат ДД.ММ (напр. 25.12):", { message_thread_id: this.threadId });
        }
        this.state.gameData['дата'] = input;
        this.state.step = 'TIME';
        this._nextStep("⏰ <b>Шаг 3: Время</b>\nВо сколько старт? (напр. 19:00):");
    }

    _handleTime() {
        this.state.gameData['время'] = this.message.text.trim();
        this.state.step = 'PARTICIPANTS';
        this._nextStep("👥 <b>Шаг 4: Вместимость</b>\nСколько мест доступно? (например: 10):");
    }

    _handleParticipants() {
        const input = this.message.text.trim();
        if (!/^\d+$/.test(input)) {
            return this.client.sendMessage(this.chatId, "❌ Введите число (например 10):", { message_thread_id: this.threadId });
        }
        this.state.gameData['участники'] = `Нужно ${input} чел.`;
        this.state.gameData['зарегистрированные'] = ""; 
        
        this.state.step = 'IMAGE';
        this._nextStep("🖼 <b>Шаг 5: Картинка</b>\nПришлите фото для анонса или напишите <b>-</b>");
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
        this._nextStep("📝 <b>Шаг 6: Описание</b>\nНапишите кратко правила или дресс-код:");
    }

    _handleDescription() {
        this.state.gameData['описание'] = this.message.text;
        
        this.service.publishGame(this.state.gameData);
        StateManager.clearState(this.userId);
        this.client.sendMessage(this.chatId, "✨ <b>Анонс Мафии опубликован!</b>", { 
            message_thread_id: this.threadId, 
            parse_mode: 'HTML' 
        });
    }
}